import { STATES, DEFAULT_STATE, DEFAULT_FILTER_STATE } from "./config";
import { apiFetch } from "./api";
import { DataCache } from "./cache";
import { bindRemote, mergeFromRemote, replaceFromCache, resetData } from "./store";
import { beginLoading, endLoading } from "../composables/useLoading";
import { useToast } from "../composables/useToast";
import { mapWithConcurrency, formatDate, normalizeMotivo } from "./utils";
import { buildRegionalLookup, SEM_REGIONAL } from "./regionais";

const FLUSH_DELAY_MS = 150;
const RETRY_DELAY_MS = 1200;

const MAX_CONCURRENT_REQUESTS = 28;
const MAX_FLUSH_RETRIES = 3;

function envTimestamp(localIso) {
  if (!localIso) return null;
  if (!/T/.test(localIso)) return localIso;
  if (/[zZ]$/.test(localIso) || /[+-]\d{2}:\d{2}$/.test(localIso)) return localIso;
  const date = new Date(localIso);
  if (isNaN(date.getTime())) return localIso;

  const offset = -date.getTimezoneOffset();
  const sign = offset >= 0 ? "+" : "-";
  const abs = Math.abs(offset);
  const pad = (n) => String(n).padStart(2, "0");
  return `${localIso}${sign}${pad(Math.floor(abs / 60))}:${pad(abs % 60)}`;
}

function stateTable(base, state) {
  const map = { RO: `${base}_ro`, AM: `${base}_am`, PA: `${base}_pa` };
  return map[state] || `${base}_ro`;
}

function diariaToRow(entry) {
  const meta = entry.meta || {};
  return {
    id: entry.id,
    nome_colaborador: meta.employeeName || "",
    funcao: meta.funcao || null,
    filial: meta.filial || null,
    lider_imediato: meta.liderImediato || null,
    motivo: meta.motivo || null,
    competencia: entry.date,
    valor: Number(entry.value) || 0,
    estado_sigla: meta.estado || null
  };
}

function treinamentoToRow(entry) {
  const meta = entry.meta || {};
  return {
    id: entry.id,
    nome_colaborador: meta.employeeName || "",
    cargo: meta.cargo || null,
    filial: meta.filial || null,
    gerente_regional: meta.gerenteRegional || null,
    tema: meta.tema || null,
    modalidade: meta.modalidade || null,
    competencia: entry.date,
    horas: Number(entry.value) || 0,
    estado_sigla: meta.estado || null
  };
}

function custoFolhaToRow(entry) {
  const meta = entry.meta || {};
  return {
    id: entry.id,
    codigo: meta.codigo || null,
    nome: meta.employeeName || "",
    banco: meta.banco || null,
    valor_total: Number(entry.value) || 0,
    data_pagto: meta.dataPagto || null,
    empresa: meta.empresa || null,
    filial: meta.filial || null,
    mes_referente: entry.date,
    estado_sigla: meta.estado || null
  };
}

function absenteismoToRow(entry) {
  const meta = entry.meta || {};
  return {
    id: entry.id,
    competencia: `${String(entry.date).slice(0, 7)}-01`,
    estado_sigla: meta.estado || null,
    colaborador: meta.colaborador || null,
    setor: meta.setor || null,
    filial: meta.filial || null,
    data: entry.date,
    motivo: meta.motivo || null,
    observacao: meta.observacao || null,
    advertencia: !!meta.advertencia,
    acidente_trabalho: !!meta.acidente,
    cid: meta.cid || null,
    dias_atestado: meta.diasAtestado ?? null,
    tipo_acidente: meta.tipoAcidente || null,
    abertura_cat: !!meta.aberturaCat
  };
}

function vacancyToRow(vacancy) {
  return {
    id: vacancy.id,
    nome: vacancy.name ?? "",
    aberta_em: envTimestamp(vacancy.openAt),
    fechada_em: envTimestamp(vacancy.closeAt),
    salario: vacancy.salario != null ? Number(vacancy.salario) : null,
    tipo_contratacao: vacancy.tipoContratacao || null,
    filial: vacancy.filial || null,
    estado_sigla: vacancy.estado || null,
    recrutador: vacancy.recrutador || null,
    motivo_contratacao: vacancy.motivoContratacao || null
  };
}

function headcountToRow(h) {
  return {
    id: h.id,
    codigo: h.codigo != null ? String(h.codigo) : null,
    colaborador: h.colaborador ?? "",
    funcao: h.funcao != null ? String(h.funcao) : null,
    data_admissao: h.dataAdmissao ? String(h.dataAdmissao).slice(0, 10) : null,
    genero: h.genero || null,
    data_desligamento: h.dataDesligamento ? String(h.dataDesligamento).slice(0, 10) : null,
    mes_referente: h.mesReferente ? `${String(h.mesReferente).slice(0, 7)}-01` : null,
    empresa: h.empresa || null,
    filial: h.filial || null,
    estado_sigla: h.estado || null
  };
}

function branchToRow(branch) {
  return {
    id: branch.id,
    cnpj: branch.cnpj ?? "",
    nome: branch.name ?? "",
    abreviado: branch.shortName ?? "",
    gerente: branch.manager || null,
    estado_sigla: branch.estado ?? null
  };
}

const _queue = {};
let _flushTimer = null;
let _flushRetries = 0;
let _flushChain = Promise.resolve();

let _epoch = 0;

function _opLabel(op) {
  const info = op.type === "upsert" ? { date: op.row.data, colaborador: op.row.colaborador } : op.label;
  if (!info || !info.colaborador) return null;
  const first = String(info.colaborador).trim().split(/\s+/)[0].toLowerCase();
  const name = first.charAt(0).toUpperCase() + first.slice(1);
  return `${formatDate(info.date)} — ${name}`;
}

function _enqueue(table, id, op) {
  if (!_queue[table]) _queue[table] = new Map();
  const pending = _queue[table].get(id);
  if (pending && pending.created && op.type === "upsert") op = { ...op, created: true, updated: false };
  _queue[table].set(id, op);
  _schedule();
  const cached =
    op.type === "upsert" ? DataCache.setItem(table, id, op.row) : (DataCache.removeItem(table, id), true);
  if (!cached) DataCache.resetAll();
  if (op.type === "upsert") {
    const { base } = splitTable(table);
    STATES.forEach((s) => {
      const other = `${base}_${s.toLowerCase()}`;
      if (other !== table) DataCache.removeItem(other, id);
    });
  }
}

function _schedule(delay = FLUSH_DELAY_MS) {
  warmApi();
  if (_flushTimer) return;
  _flushTimer = setTimeout(() => {
    _flushTimer = null;
    flush();
  }, delay);
}

function _isRetriable(err) {
  const status = err && err.status;
  return !status || status >= 500 || status === 429 || status === 408;
}

function _requeue(table, ops) {
  if (!_queue[table]) _queue[table] = new Map();
  ops.forEach((op, id) => {
    if (!_queue[table].has(id)) _queue[table].set(id, { ...op, retried: true });
  });
}

const KEEPALIVE_MAX_BYTES = 60000;

export function flush({ keepalive = false } = {}) {
  _flushChain = _flushChain.then(() => _flushNow(keepalive)).catch(() => {});
  return _flushChain;
}

async function _flushNow(keepalive) {
  const epoch = _epoch;
  const jobs = [];

  Object.keys(_queue).forEach((table) => {
    const map = _queue[table];
    if (!map || !map.size) return;
    const ops = new Map(map);
    map.clear();

    const upserts = [];
    const deletes = [];
    ops.forEach((op) => {
      if (op.type === "upsert") upserts.push(op.created && !op.retried ? { ...op.row, _new: true } : op.row);
      else deletes.push(op.id);
    });
    const body = { upserts, deletes };
    const useKeepalive = keepalive && JSON.stringify(body).length < KEEPALIVE_MAX_BYTES;
    jobs.push({ table, ops, body, useKeepalive });
  });

  if (!jobs.length) return;

  const errors = await mapWithConcurrency(jobs, MAX_CONCURRENT_REQUESTS, (job) =>
    apiFetch(`/api/data/${job.table}`, { method: "POST", body: job.body, keepalive: job.useKeepalive }).then(
      () => null,
      (err) => err
    )
  );

  let willRetry = false;
  let dropped = 0;
  const failedLaunches = [];
  errors.forEach((error, i) => {
    if (!error) return;
    const { table, ops } = jobs[i];
    const status = error.status || error.code;
    console.error(`[API] ${table}`, status ? `(${status}) ` : "", error.message || error);

    if (epoch === _epoch && _isRetriable(error) && _flushRetries < MAX_FLUSH_RETRIES) {
      _requeue(table, ops);
      willRetry = true;
    } else if (epoch === _epoch) {
      ops.forEach((op) => {
        const label = splitTable(table).base === "absenteismo" ? _opLabel(op) : null;
        if (label) failedLaunches.push(label);
        else dropped++;
      });
    }
  });

  if (willRetry) {
    _flushRetries += 1;
    _schedule(RETRY_DELAY_MS * 2 ** _flushRetries);
  } else {
    _flushRetries = 0;
  }
  if (dropped) {
    useToast().show(
      `Não foi possível salvar ${dropped} alteração(ões) no servidor. Recarregue os dados e refaça, se necessário.`
    );
  }

  failedLaunches.slice(0, 3).forEach((label) => {
    useToast().show(`Não foi possível gravar o lançamento de ${label}. Ele não foi salvo na planilha.`, "error");
  });
  if (failedLaunches.length > 3) {
    useToast().show(`E mais ${failedLaunches.length - 3} lançamentos não foram gravados na planilha.`, "error");
  }

  if (epoch === _epoch) {
    let saved = 0;
    let changed = 0;
    let removed = 0;
    jobs.forEach((job, i) => {
      if (errors[i] || splitTable(job.table).base !== "absenteismo") return;
      job.ops.forEach((op) => {
        if (op.type !== "upsert") removed++;
        else if (op.updated) changed++;
        else saved++;
      });
    });
    const toast = useToast();
    if (saved) toast.show(saved === 1 ? "Lançamento gravado na planilha." : `${saved} lançamentos gravados na planilha.`, "success");
    if (changed) toast.show(changed === 1 ? "Registro alterado na planilha." : `${changed} registros alterados na planilha.`, "success");
    if (removed) toast.show(removed === 1 ? "Lançamento removido da planilha." : `${removed} lançamentos removidos da planilha.`, "success");
  }
}

const ENTRY_TABLE_META = {
  custo_diaria: { table: "diarias", toRow: diariaToRow },
  treinamento: { table: "treinamentos", toRow: treinamentoToRow },
  custo_total: { table: "custo_folha", toRow: custoFolhaToRow },
  absenteismo: { table: "absenteismo", toRow: absenteismoToRow }
};

function entryTableMeta(indicatorId) {
  const meta = ENTRY_TABLE_META[indicatorId];
  if (!meta) throw new Error(`Indicador de lançamento desconhecido: "${indicatorId}".`);
  return meta;
}

export function registerRemote() {
  bindRemote({
    entryAdded(indicatorId, entry) {
      const { table, toRow } = entryTableMeta(indicatorId);
      const estado = entry.meta ? entry.meta.estado : null;
      _enqueue(stateTable(table, estado), entry.id, { type: "upsert", row: toRow(entry), created: true });
    },
    entryUpdated(indicatorId, entry) {
      const { table, toRow } = entryTableMeta(indicatorId);
      const estado = entry.meta ? entry.meta.estado : null;
      _enqueue(stateTable(table, estado), entry.id, { type: "upsert", row: toRow(entry), updated: true });
    },
    entriesRemoved(indicatorId, ids, estado, labels) {
      const { table } = entryTableMeta(indicatorId);
      const physicalTable = stateTable(table, estado);
      ids.forEach((id) => _enqueue(physicalTable, id, { type: "delete", id, label: labels ? labels[id] : undefined }));
    },
    vacancySaved(vacancy, isNew) {
      _enqueue(stateTable("vagas", vacancy.estado), vacancy.id, { type: "upsert", row: vacancyToRow(vacancy), created: !!isNew });
    },
    vacancyRemoved(id, estado) {
      _enqueue(stateTable("vagas", estado), id, { type: "delete", id });
    },
    headcountSaved(record, isNew) {
      _enqueue(stateTable("headcount", record.estado), record.id, { type: "upsert", row: headcountToRow(record), created: !!isNew });
    },
    headcountRemoved(id, estado) {
      _enqueue(stateTable("headcount", estado), id, { type: "delete", id });
    },
    branchSaved(branch, isNew) {
      _enqueue(stateTable("filiais", branch.estado), branch.id, { type: "upsert", row: branchToRow(branch), created: !!isNew });
    },
    branchRemoved(id, estado) {
      _enqueue(stateTable("filiais", estado), id, { type: "delete", id });
    }
  });
}

function up(v) {
  return v == null ? v : String(v).toUpperCase();
}

const SHEET_ERROR_RE = /^#(N\/A|REF!|VALUE!|NAME\?|DIV\/0!|NUM!|NULL!|ERROR!)/i;

function regionalText(v) {
  if (v != null && SHEET_ERROR_RE.test(String(v).trim())) return SEM_REGIONAL;
  return up(v) || null;
}

let _regionalLookup = null;

export function regionalDaFilial(filial, estado) {
  return _regionalLookup ? up(_regionalLookup.resolve(filial, estado)) || null : null;
}

function mapRemoteDiaria(row, impliedState) {
  return {
    id: row.id,
    date: row.competencia,
    value: Number(row.valor) || 0,
    meta: {
      employeeName: up(row.nome_colaborador) || "",
      funcao: up(row.funcao) || null,
      filial: up(row.filial) || null,
      liderImediato: up(row.lider_imediato) || null,
      regional: regionalDaFilial(row.filial, row.estado_sigla || impliedState),
      motivo: motivoKey(row.motivo),
      estado: row.estado_sigla || impliedState || null
    }
  };
}

function mapRemoteFerias(row, impliedState) {
  return {
    id: row.id,
    date: row.mes_referente ? String(row.mes_referente).slice(0, 10) : "",
    value: Number(row.valor_total) || 0,
    meta: {
      employeeName: up(row.nome) || "",
      codigo: row.codigo != null ? String(row.codigo) : null,
      banco: row.banco || null,
      dataPagto: row.data_pagto ? String(row.data_pagto).slice(0, 10) : null,
      filial: up(row.filial) || null,
      regional: regionalDaFilial(row.filial, row.estado_sigla || impliedState),
      estado: row.estado_sigla || impliedState || null
    }
  };
}

function mapRemoteBeneficios(row, impliedState) {
  return {
    id: row.id,
    date: row.mes_referente ? String(row.mes_referente).slice(0, 10) : "",
    value: Number(row.total_pagar) || 0,
    meta: {
      beneficio: up(row.beneficio) || "SEM BENEFÍCIO",
      vencimento: row.vencimento ? String(row.vencimento).slice(0, 10) : null,
      formaPagamento: row.forma_pagamento || null,
      nf: row.nf != null && row.nf !== "" ? String(row.nf) : null,
      fusionBig: up(row.fusion_big) || null,
      estado: row.estado_sigla || impliedState || null
    }
  };
}

function mapRemoteTreinamento(row, impliedState) {
  return {
    id: row.id,
    date: row.competencia,
    value: Number(row.horas) || 0,
    meta: {
      employeeName: up(row.nome_colaborador) || "",
      cargo: up(row.cargo) || null,
      filial: up(row.filial) || null,
      gerenteRegional: regionalText(row.gerente_regional),
      tema: up(row.tema) || null,
      modalidade: row.modalidade || null,
      estado: row.estado_sigla || impliedState || null
    }
  };
}

function mapRemoteCustoFolha(row, impliedState) {
  return {
    id: row.id,
    date: row.mes_referente ? String(row.mes_referente).slice(0, 10) : "",
    value: Number(row.valor_total) || 0,
    meta: {
      employeeName: up(row.nome) || "",
      codigo: row.codigo != null ? String(row.codigo) : null,
      banco: row.banco || null,
      dataPagto: row.data_pagto ? String(row.data_pagto).slice(0, 10) : null,
      empresa: up(row.empresa) || null,
      filial: up(row.filial) || null,
      regional: regionalDaFilial(row.filial, row.estado_sigla || impliedState),
      estado: row.estado_sigla || impliedState || null
    }
  };
}

function mapRemoteAbsenteismo(row, impliedState) {
  if (row.colaborador) {
    const truthy = (v) => v === true || /^(true|sim|s|1|x)$/i.test(String(v ?? "").trim());
    const motivo = normalizeMotivo(row.motivo);
    const legacyAdv = motivo === "Advertência";
    const legacyAci = motivo === "Acidente de Trabalho";
    const date = row.data ? String(row.data).slice(0, 10) : String(row.competencia || "").slice(0, 10);
    return {
      id: row.id,
      date,
      value: 0,
      meta: {
        estado: row.estado_sigla || impliedState || null,
        competencia: row.competencia ? String(row.competencia).slice(0, 7) : date.slice(0, 7),
        colaborador: String(up(row.colaborador)).replace(/\s+/g, " ").trim(),
        setor: up(row.setor) || null,
        filial: up(row.filial) || null,
        motivo: legacyAdv || legacyAci ? "Presente" : motivo,
        observacao: row.observacao || null,
        advertencia: truthy(row.advertencia) || legacyAdv,
        acidente: truthy(row.acidente_trabalho) || legacyAci,
        cid: row.cid || null,
        diasAtestado: row.dias_atestado === "" || row.dias_atestado == null ? null : Number(row.dias_atestado),
        tipoAcidente: row.tipo_acidente || null,
        aberturaCat: truthy(row.abertura_cat)
      }
    };
  }
  return {
    id: row.id,
    date: row.competencia,
    value: 0,
    meta: { estado: row.estado_sigla || impliedState || null }
  };
}

function mapRemoteVacancy(row, impliedState) {
  return {
    id: row.id,
    name: up(row.nome) ?? "",
    openAt: row.aberta_em,
    closeAt: row.fechada_em,
    salario: row.salario != null ? Number(row.salario) : null,
    tipoContratacao: row.tipo_contratacao ? String(row.tipo_contratacao).trim().toLowerCase() : null,
    filial: up(row.filial) || null,
    estado: row.estado_sigla || impliedState || null,
    recrutador: up(row.recrutador) || null,
    motivoContratacao: up(row.motivo_contratacao) || null
  };
}

function motivoKey(v) {
  if (v == null) return null;
  const t = String(v).normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/\s+/g, " ").trim().toUpperCase();
  return t || null;
}

function mapRemoteRescisao(row, impliedState) {
  const num = (v) => (v != null && Number.isFinite(Number(v)) ? Number(v) : 0);
  return {
    id: row.id,
    empresa: up(row.empresa) || null,
    estado: row.estado || impliedState || null,
    colaborador: up(row.colaborador) ?? "",
    filial: up(row.filial) || null,
    funcao: up(row.funcao) || null,
    admissao: row.admissao ? String(row.admissao).slice(0, 10) : null,
    gerenteImediato: up(row.gerente_imediato) || null,
    regional: regionalText(row.regional),
    regionalFilial: regionalDaFilial(row.filial, row.estado || impliedState),
    motivo: up(row.motivo) || null,
    justificativaApurada: up(row.justificativa_apurada) || null,
    ponderacoes: up(row.ponderacoes) || null,
    ultDiaAviso: row.ult_dia_aviso ? String(row.ult_dia_aviso).slice(0, 10) : null,
    valorRescisao: num(row.valor_rescisao),
    grrfConsig: num(row.grrf_consig),
    multa40: num(row.multa_40),
    mesReferencia: row.mes_referencia ? String(row.mes_referencia).slice(0, 10) : null
  };
}

function mapRemoteHeadcount(row, impliedState) {
  return {
    id: row.id,
    codigo: row.codigo != null ? String(row.codigo) : null,
    colaborador: up(row.colaborador) ?? "",
    funcao: row.funcao != null ? up(row.funcao) : null,
    dataAdmissao: row.data_admissao ? String(row.data_admissao).slice(0, 10) : null,
    genero: row.genero || null,
    dataDesligamento: row.data_desligamento ? String(row.data_desligamento).slice(0, 10) : null,
    mesReferente: row.mes_referente ? String(row.mes_referente).slice(0, 10) : null,
    empresa: row.empresa != null ? up(row.empresa) : null,
    filial: up(row.filial) || null,
    regional: regionalDaFilial(row.filial, row.estado_sigla || impliedState),
    estado: row.estado_sigla || impliedState || null
  };
}

function mapRemoteBranch(row, impliedState) {
  return {
    id: row.id,
    cnpj: row.cnpj ?? "",
    name: up(row.nome) ?? "",
    shortName: up(row.abreviado) ?? "",
    manager: up(row.gerente) || null,
    estado: row.estado_sigla || impliedState || null
  };
}

const TABLE_KINDS = {
  vagas: { key: "vacancies", map: mapRemoteVacancy },
  rescisoes: { key: "rescisoes", map: mapRemoteRescisao },
  headcount: { key: "headcounts", map: mapRemoteHeadcount },
  filiais: { key: "branches", map: mapRemoteBranch },
  diarias: { key: "diarias", map: mapRemoteDiaria },
  treinamentos: { key: "treinamentos", map: mapRemoteTreinamento },
  custo_folha: { key: "custoFolha", map: mapRemoteCustoFolha },
  ferias: { key: "ferias", map: mapRemoteFerias },
  beneficios: { key: "beneficios", map: mapRemoteBeneficios },
  absenteismo: { key: "absenteismo", map: mapRemoteAbsenteismo }
};
const DATA_TABLES = Object.keys(TABLE_KINDS);

function splitTable(tabela) {
  const i = tabela.lastIndexOf("_");
  return i > 0
    ? { base: tabela.slice(0, i), estado: tabela.slice(i + 1).toUpperCase() }
    : { base: tabela, estado: "" };
}

function emptyPayload() {
  return {
    vacancies: [],
    rescisoes: [],
    headcounts: [],
    branches: [],
    diarias: [],
    treinamentos: [],
    custoFolha: [],
    ferias: [],
    beneficios: [],
    absenteismo: []
  };
}

function statesOf(state) {
  return state === "todos" ? STATES.slice() : [state || DEFAULT_STATE];
}

function addRowToPayload(payload, tabela, row, estado) {
  const { base } = splitTable(tabela);
  const kind = TABLE_KINDS[base];
  if (kind) payload[kind.key].push(kind.map(row, estado));
}

const _loadedStates = {};

let _cacheDirty = false;

function persistRows(tabela, rows) {
  for (let i = 0; i < rows.length; i++) {
    if (!DataCache.setItem(tabela, rows[i].id, rows[i])) {
      _cacheDirty = true;
      return false;
    }
  }
  return true;
}

export async function hydrate(state) {
  const states = statesOf(state);
  if (states.every((s) => _loadedStates[s])) return true;
  beginLoading();
  try {
    return await _hydrateStates(states);
  } finally {
    endLoading();
  }
}

/* Separa linhas de uma aba consolidada (RO+AM+PA numa só) pelo estado de
   cada uma. Linha sem estado_sigla reconhecível cai no estado padrão em vez
   de ser perdida (não deveria acontecer, mas é mais seguro que sumir dado). */
function bucketByEstado(rows) {
  const buckets = { RO: [], AM: [], PA: [] };
  rows.forEach((row) => {
    const estado = String(row.estado_sigla || "").toUpperCase();
    (buckets[estado] || buckets[DEFAULT_STATE]).push(row);
  });
  return buckets;
}

const _tablesLoaded = new Set();

const MAX_TABLE_RETRIES = 2;

async function fetchTablesBatch(bases) {
  try {
    const res = await apiFetch(`/api/data/_batch?tables=${encodeURIComponent(bases.join(","))}`);
    const payload = res && res.data;
    if (!payload || typeof payload.tables !== "object") return null;
    return bases.map((base) =>
      payload.tables && Array.isArray(payload.tables[base])
        ? { base, data: payload.tables[base] }
        : { base, error: new Error((payload.errors && payload.errors[base]) || `Tabela ${base} ausente no lote.`) }
    );
  } catch (err) {
    console.warn("[API] Carga em lote indisponível — baixando tabela a tabela:", err);
    return null;
  }
}

async function fetchOneTable(base) {
  try {
    const res = await apiFetch(`/api/data/${base}`);
    return { base, data: (res && res.data) || [] };
  } catch (err) {
    console.error(`[API] Erro ao consultar ${base}:`, err);
    return { base, error: err };
  }
}

async function fetchRegionaisLookup() {
  try {
    const res = await apiFetch("/api/data/regionais");
    return buildRegionalLookup((res && res.data) || []);
  } catch (err) {
    console.warn("[API] Aba regionais indisponível — diárias ficarão sem regional:", err);
    return null;
  }
}

async function fetchTablesOnce(bases) {
  const epoch = _epoch;
  const [results, regionaisLookup] = await Promise.all([
    fetchTablesBatch(bases).then((r) => r || mapWithConcurrency(bases, MAX_CONCURRENT_REQUESTS, fetchOneTable)),
    _regionalLookup || fetchRegionaisLookup()
  ]);
  if (epoch !== _epoch) return { failed: bases };
  if (regionaisLookup) _regionalLookup = regionaisLookup;

  const payloads = { RO: emptyPayload(), AM: emptyPayload(), PA: emptyPayload() };
  const failed = [];
  let persisted = true;

  DataCache.removeTables(
    results.filter((r) => !r.error).flatMap(({ base }) => STATES.map((s) => `${base}_${s.toLowerCase()}`))
  );

  results.forEach(({ base, data, error }) => {
    if (error) {
      failed.push(base);
      return;
    }
    const kind = TABLE_KINDS[base];
    const buckets = bucketByEstado(data);
    STATES.forEach((s) => {
      const tabela = `${base}_${s.toLowerCase()}`;
      if (persisted) persisted = persistRows(tabela, buckets[s]);
      payloads[s][kind.key] = buckets[s].map((row) => kind.map(row, s));
    });
  });
  if (!persisted) _cacheDirty = true;

  STATES.forEach((s) => mergeFromRemote(payloads[s]));
  bases.forEach((base) => {
    if (!failed.includes(base)) _tablesLoaded.add(base);
  });

  return { failed };
}

let _hydrateAllPromise = null;

function hydrateAllTables() {
  if (_hydrateAllPromise) return _hydrateAllPromise;

  _hydrateAllPromise = (async () => {
    let pending = DATA_TABLES.filter((base) => !_tablesLoaded.has(base));
    let attempt = 0;
    while (pending.length && attempt <= MAX_TABLE_RETRIES) {
      if (attempt > 0) {
        console.warn(`[API] Tentando de novo (${attempt}/${MAX_TABLE_RETRIES}): ${pending.join(", ")}.`);
        await new Promise((resolve) => setTimeout(resolve, 600 * attempt));
      }
      const { failed } = await fetchTablesOnce(pending);
      pending = failed;
      attempt++;
    }
    if (pending.length) {
      console.error(`[API] Não foi possível carregar após ${MAX_TABLE_RETRIES + 1} tentativa(s): ${pending.join(", ")}.`);
    }
    return pending.length === 0;
  })().finally(() => {
    _hydrateAllPromise = null;
  });

  return _hydrateAllPromise;
}

/* Todo hydrate cai aqui: sempre baixa (ou reaproveita, se já em memória)
   TODAS as tabelas de uma vez — como os dados vêm em abas consolidadas por
   estado_sigla, não há ganho em pedir só o estado atual, e evita as
   chamadas por estado (ver hydrateAllTables). Ao terminar, marca carregados
   os estados pedidos que de fato têm tabelas completas em memória. */
async function _hydrateStates(states) {
  const pending = states.filter((s) => !_loadedStates[s]);
  if (!pending.length) return true;

  const ok = await hydrateAllTables();

  if (ok) {
    if (_cacheDirty) {
      DataCache.resetAll();
      _cacheDirty = false;
    }
    STATES.forEach((s) => {
      _loadedStates[s] = true;
    });
    console.info(`[API] Dados carregados: ${STATES.join(", ")}.`);
  }
  return ok;
}

const _hydrating = new Map();

export function hydrateState(next) {
  const pending = statesOf(next).filter((s) => !_loadedStates[s]);
  if (!pending.length) return Promise.resolve(true);

  const key = pending.join(",");
  const running = _hydrating.get(key);
  if (running) return running;

  beginLoading();
  const promise = _hydrateState(pending).finally(() => {
    _hydrating.delete(key);
    endLoading();
  });
  _hydrating.set(key, promise);
  return promise;
}

async function _hydrateState(pending) {
  DataCache.removeLegacy();
  return _hydrateStates(pending);
}

function loadLocalIntoMemory() {
  const keys = DataCache.keys();
  if (!keys.length) return false;

  const payload = emptyPayload();
  const tablesSeen = {};

  keys.forEach((key) => {
    const item = DataCache.readItem(key);
    if (!item || !item.id) return;
    const rest = key.slice("ggd:".length);
    const sep = rest.indexOf(":");
    if (sep < 0) return;
    const tabela = rest.slice(0, sep);
    tablesSeen[tabela] = true;
    const { estado } = splitTable(tabela);
    addRowToPayload(payload, tabela, item, estado);
  });

  replaceFromCache(payload);

  clearLoadedTracking();
  STATES.forEach((s) => {
    const suffix = s.toLowerCase();
    if (DATA_TABLES.some((base) => tablesSeen[`${base}_${suffix}`])) {
      _loadedStates[s] = true;
    }
  });
  DATA_TABLES.forEach((base) => {
    if (STATES.some((s) => tablesSeen[`${base}_${s.toLowerCase()}`])) {
      _tablesLoaded.add(base);
    }
  });
  return true;
}

function clearLoadedTracking() {
  Object.keys(_loadedStates).forEach((k) => delete _loadedStates[k]);
  _tablesLoaded.clear();
}

/* Boot: todo carregamento de página (F5 inclusive) baixa do servidor — que
   responde do cache do Worker, sem esperar a planilha. Antes a cópia local
   do sessionStorage era restaurada sem consultar o servidor, e um navegador
   continuava vendo os dados antigos depois de um refresh feito em outro. A
   cópia local fica só como reserva, se o download falhar. */
async function hydrateOnBoot(state) {
  DataCache.removeLegacy();
  clearLoadedTracking();

  const ok = await hydrate(state);
  if (ok) return true;

  if (loadLocalIntoMemory()) {
    console.warn("[API] Falha ao baixar os dados — usando a cópia local do sessionStorage.");
    return true;
  }
  return false;
}

export async function bootstrapData(authed) {
  registerRemote();
  if (!authed) {
    console.info("[API] Sem sessão ativa — dados serão carregados após o login.");
    return;
  }
  await hydrateOnBoot(DEFAULT_FILTER_STATE);
}

export function discardPendingWrites() {
  if (_flushTimer) {
    clearTimeout(_flushTimer);
    _flushTimer = null;
  }
  _flushRetries = 0;
  Object.keys(_queue).forEach((k) => _queue[k].clear());
}

export function resetLocalState() {
  _epoch += 1;
  _regionalLookup = null;
  discardPendingWrites();
  resetData();
  clearLoadedTracking();
  _cacheDirty = false;
  DataCache.resetAll();
}

export async function reloadData() {
  await flush();

  const previous = STATES.filter((s) => _loadedStates[s]);
  DataCache.removeLegacy();
  DataCache.resetAll();
  _cacheDirty = false;
  _regionalLookup = null;
  resetData();
  clearLoadedTracking();

  beginLoading();
  try {
    await _hydrateStates(previous.length ? previous : [DEFAULT_STATE]);
  } finally {
    endLoading();
  }
}

if (typeof window !== "undefined") {
  window.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") flush({ keepalive: true });
  });
  window.addEventListener("pagehide", () => flush({ keepalive: true }));
}

let _lastWarm = 0;
export function warmApi() {
  const now = Date.now();
  if (now - _lastWarm < 4 * 60 * 1000) return;
  _lastWarm = now;
  apiFetch("/api/data/_warm").catch(() => {});
}
