/* Camada de dados: cache por item (sessionStorage) + delta sync via API
   (Cloudflare Worker → CockroachDB), escritas em fila com debounce, sessão/
   purga via resetLocalState. */
import { STATES, DEFAULT_STATE, DEFAULT_FILTER_STATE } from "./config";
import { apiFetch } from "./api";
import { DataCache } from "./cache";
import {
  bindRemote,
  mergeFromRemote,
  replaceFromCache,
  resetData,
  upsertInList,
  useData
} from "./store";
import { sessionStore, compareDateAsc } from "./utils";
import { beginLoading, endLoading } from "../composables/useLoading";

const FLUSH_DELAY_MS = 1200; // agrupa escritas por até 1,2 s antes de enviar

/* Corrige timestamps "hora local" para o Postgres sem duplicar fuso.
   Valores que já vêm do banco com fuso (Z ou ±HH:MM) são preservados. */
function envTimestamp(localIso) {
  if (!localIso) return null;
  if (!/T/.test(localIso)) return localIso; // data simples (YYYY-MM-DD)
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

function entryToRow(indicatorId, entry) {
  return {
    id: entry.id,
    indicador_id: indicatorId,
    data: entry.date,
    valor: Number(entry.value),
    meta: entry.meta ?? null
  };
}

function employeeToRow(emp) {
  return {
    id: emp.id,
    nome: emp.name ?? "",
    setor: emp.sector ?? "",
    cargo: emp.cargo != null ? String(emp.cargo) : null,
    usuario: String(emp.user ?? ""),
    estado_sigla: emp.estado ?? null,
    salario: emp.salario != null ? Number(emp.salario) : null,
    entrada_em: emp.hiredAt ? String(emp.hiredAt).split("T")[0] : null,
    status: emp.status || "ativo",
    tipo: emp.type || "efetivado",
    department_id: emp.departmentId || null,
    filial_id: emp.filialId || null,
    lider_imediato: emp.liderImediato != null ? String(emp.liderImediato) : null,
    gerente_regional: emp.gerenteRegional != null ? String(emp.gerenteRegional) : null,
    vale_transporte: emp.valeTransporte != null ? Number(emp.valeTransporte) : null,
    vale_alimentacao: emp.valeAlimentacao != null ? Number(emp.valeAlimentacao) : null,
    inss: emp.inss != null ? Number(emp.inss) : null,
    fgts: emp.fgts != null ? Number(emp.fgts) : null,
    irrf: emp.irrf != null ? Number(emp.irrf) : null,
    premio_art_62: emp.premioArt62 != null ? Number(emp.premioArt62) : null,
    premio_loja: emp.premioLoja != null ? Number(emp.premioLoja) : null,
    comissao: emp.comissao != null ? Number(emp.comissao) : null,
    criado_em: envTimestamp(emp.createdAt) || new Date().toISOString(),
    atualizado_em: envTimestamp(emp.updatedAt),
    desligado_em: envTimestamp(emp.firedAt)
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
    filial_id: vacancy.filialId || null,
    estado_sigla: vacancy.estado || null
  };
}

function turnoverToRow(t) {
  return {
    id: t.id,
    filial_id: t.filialId || null,
    mes_referencia: t.mesReferencia ? `${String(t.mesReferencia).slice(0, 7)}-01` : null,
    admitidos: Number(t.admitidos) || 0,
    demitidos: Number(t.demitidos) || 0,
    ativos: Number(t.ativos) || 0,
    estado_sigla: t.estado || null
  };
}

function permanenciaToRow(p) {
  return {
    id: p.id,
    colaborador: p.colaborador ?? "",
    data_admissao: p.dataAdmissao ? String(p.dataAdmissao).slice(0, 10) : null,
    data_demissao: p.dataDemissao ? String(p.dataDemissao).slice(0, 10) : null,
    filial_id: p.filialId || null,
    estado_sigla: p.estado || null
  };
}

function headcountToRow(h) {
  return {
    id: h.id,
    codigo: h.codigo != null ? String(h.codigo) : null,
    colaborador: h.colaborador ?? "",
    funcao: h.funcao != null ? String(h.funcao) : null,
    remuneracao: h.remuneracao != null ? Number(h.remuneracao) : null,
    data_admissao: h.dataAdmissao ? String(h.dataAdmissao).slice(0, 10) : null,
    mes_referencia: h.mesReferencia ? `${String(h.mesReferencia).slice(0, 7)}-01` : null,
    status: h.status === "demitido" ? "demitido" : "ativo",
    demitido_mes: h.demitidoMes ? `${String(h.demitidoMes).slice(0, 7)}-01` : null,
    filial_id: h.filialId || null,
    estado_sigla: h.estado || null
  };
}

function branchToRow(branch) {
  return {
    id: branch.id,
    id_filial: branch.branchId ?? "",
    cnpj: branch.cnpj ?? "",
    nome: branch.name ?? "",
    abreviado: branch.shortName ?? "",
    gerente: branch.manager || null,
    estado_sigla: branch.estado ?? null,
    criado_em: envTimestamp(branch.createdAt) || new Date().toISOString(),
    atualizado_em: envTimestamp(branch.updatedAt)
  };
}

function departmentToRow(department) {
  return {
    id: department.id,
    nome: department.name ?? "",
    sigla: department.shortName ?? null,
    estado_sigla: department.estado ?? null,
    criado_em: envTimestamp(department.createdAt) || new Date().toISOString(),
    atualizado_em: envTimestamp(department.updatedAt)
  };
}

const _queue = {};
let _flushTimer = null;

function _enqueue(table, id, op) {
  if (!_queue[table]) _queue[table] = new Map();
  _queue[table].set(id, op);
  _schedule();
}

function _schedule() {
  if (_flushTimer) return;
  _flushTimer = setTimeout(() => {
    _flushTimer = null;
    flush();
  }, FLUSH_DELAY_MS);
}

export async function flush() {
  const jobs = [];

  Object.keys(_queue).forEach((table) => {
    const map = _queue[table];
    if (!map || !map.size) return;
    const upserts = [];
    const deletes = [];
    map.forEach((op) => {
      if (op.type === "upsert") upserts.push(op.row);
      else deletes.push(op.id);
    });
    map.clear();
    if (upserts.length || deletes.length) {
      jobs.push({
        table,
        promise: apiFetch(`/api/data/${table}`, { method: "POST", body: { upserts, deletes } })
      });
    }
  });

  if (!jobs.length) return;

  const results = await Promise.all(
    jobs.map((job) =>
      Promise.resolve(job.promise)
        .then(() => ({ table: job.table, error: null }))
        .catch((err) => ({ table: job.table, error: err }))
    )
  );
  results.forEach(({ table, error }) => {
    if (!error) return;
    const status = error.status || error.code;
    console.error(`[API] ${table}`, status ? `(${status}) ` : "", error.message || error);
  });
}

export function registerRemote() {
  bindRemote({
    entryAdded(indicatorId, entry) {
      const estado = entry.meta ? entry.meta.estado : null;
      _enqueue(stateTable("lancamentos", estado), entry.id, { type: "upsert", row: entryToRow(indicatorId, entry) });
    },
    entryUpdated(indicatorId, entry) {
      const estado = entry.meta ? entry.meta.estado : null;
      _enqueue(stateTable("lancamentos", estado), entry.id, { type: "upsert", row: entryToRow(indicatorId, entry) });
    },
    entriesRemoved(ids, estado) {
      const table = stateTable("lancamentos", estado);
      ids.forEach((id) => _enqueue(table, id, { type: "delete", id }));
    },
    employeeSaved(employee) {
      _enqueue(stateTable("colaboradores", employee.estado), employee.id, { type: "upsert", row: employeeToRow(employee) });
    },
    employeeRemoved(id, estado) {
      _enqueue(stateTable("colaboradores", estado), id, { type: "delete", id });
    },
    vacancySaved(vacancy) {
      _enqueue(stateTable("vagas", vacancy.estado), vacancy.id, { type: "upsert", row: vacancyToRow(vacancy) });
    },
    vacancyRemoved(id, estado) {
      _enqueue(stateTable("vagas", estado), id, { type: "delete", id });
    },
    turnoverSaved(turnover) {
      _enqueue(stateTable("turnover", turnover.estado), turnover.id, { type: "upsert", row: turnoverToRow(turnover) });
    },
    turnoverRemoved(id, estado) {
      _enqueue(stateTable("turnover", estado), id, { type: "delete", id });
    },
    permanenciaSaved(record) {
      _enqueue(stateTable("permanencia", record.estado), record.id, { type: "upsert", row: permanenciaToRow(record) });
    },
    permanenciaRemoved(id, estado) {
      _enqueue(stateTable("permanencia", estado), id, { type: "delete", id });
    },
    headcountSaved(record) {
      _enqueue(stateTable("headcount", record.estado), record.id, { type: "upsert", row: headcountToRow(record) });
    },
    headcountRemoved(id, estado) {
      _enqueue(stateTable("headcount", estado), id, { type: "delete", id });
    },
    branchSaved(branch) {
      _enqueue(stateTable("filiais", branch.estado), branch.id, { type: "upsert", row: branchToRow(branch) });
    },
    branchRemoved(id, estado) {
      _enqueue(stateTable("filiais", estado), id, { type: "delete", id });
    },
    departmentSaved(department) {
      _enqueue(stateTable("departamentos", department.estado), department.id, { type: "upsert", row: departmentToRow(department) });
    },
    departmentRemoved(id, estado) {
      _enqueue(stateTable("departamentos", estado), id, { type: "delete", id });
    }
  });
}

function mapRemoteEntries(rows) {
  const mapped = {};
  rows.forEach((row) => {
    if (!mapped[row.indicador_id]) mapped[row.indicador_id] = [];
    mapped[row.indicador_id].push({
      id: row.id,
      date: row.data,
      value: Number(row.valor),
      meta: row.meta || null
    });
  });
  return mapped;
}

function mapRemoteEmployee(row, impliedState) {
  return {
    id: row.id,
    name: row.nome ?? "",
    sector: row.setor ?? "",
    cargo: row.cargo != null ? String(row.cargo) : null,
    user: row.usuario != null ? String(row.usuario) : "",
    estado: row.estado_sigla || impliedState || null,
    salario: row.salario != null ? Number(row.salario) : null,
    hiredAt: row.entrada_em ? String(row.entrada_em).split("T")[0] + "T00:00:00" : null,
    status: row.status || "ativo",
    type: row.tipo || "efetivado",
    departmentId: row.department_id || null,
    filialId: row.filial_id || null,
    liderImediato: row.lider_imediato != null ? String(row.lider_imediato) : null,
    gerenteRegional: row.gerente_regional != null ? String(row.gerente_regional) : null,
    valeTransporte: row.vale_transporte != null ? Number(row.vale_transporte) : null,
    valeAlimentacao: row.vale_alimentacao != null ? Number(row.vale_alimentacao) : null,
    inss: row.inss != null ? Number(row.inss) : null,
    fgts: row.fgts != null ? Number(row.fgts) : null,
    irrf: row.irrf != null ? Number(row.irrf) : null,
    premioArt62: row.premio_art_62 != null ? Number(row.premio_art_62) : null,
    premioLoja: row.premio_loja != null ? Number(row.premio_loja) : null,
    comissao: row.comissao != null ? Number(row.comissao) : null,
    createdAt: row.criado_em,
    updatedAt: row.atualizado_em,
    firedAt: row.desligado_em
  };
}

function mapRemoteVacancy(row, impliedState) {
  return {
    id: row.id,
    name: row.nome ?? "",
    openAt: row.aberta_em,
    closeAt: row.fechada_em,
    salario: row.salario != null ? Number(row.salario) : null,
    tipoContratacao: row.tipo_contratacao || null,
    filialId: row.filial_id || null,
    estado: row.estado_sigla || impliedState || null
  };
}

function mapRemoteTurnover(row, impliedState) {
  return {
    id: row.id,
    filialId: row.filial_id || null,
    mesReferencia: row.mes_referencia ? String(row.mes_referencia).slice(0, 7) : null,
    admitidos: row.admitidos != null ? Number(row.admitidos) : 0,
    demitidos: row.demitidos != null ? Number(row.demitidos) : 0,
    ativos: row.ativos != null ? Number(row.ativos) : 0,
    estado: row.estado_sigla || impliedState || null
  };
}

function mapRemotePermanencia(row, impliedState) {
  return {
    id: row.id,
    colaborador: row.colaborador ?? "",
    dataAdmissao: row.data_admissao ? String(row.data_admissao).slice(0, 10) : null,
    dataDemissao: row.data_demissao ? String(row.data_demissao).slice(0, 10) : null,
    filialId: row.filial_id || null,
    estado: row.estado_sigla || impliedState || null
  };
}

function mapRemoteHeadcount(row, impliedState) {
  return {
    id: row.id,
    codigo: row.codigo != null ? String(row.codigo) : null,
    colaborador: row.colaborador ?? "",
    funcao: row.funcao != null ? String(row.funcao) : null,
    remuneracao: row.remuneracao != null ? Number(row.remuneracao) : null,
    dataAdmissao: row.data_admissao ? String(row.data_admissao).slice(0, 10) : null,
    mesReferencia: row.mes_referencia ? String(row.mes_referencia).slice(0, 7) : null,
    status: row.status === "demitido" ? "demitido" : "ativo",
    demitidoMes: row.demitido_mes ? String(row.demitido_mes).slice(0, 7) : null,
    filialId: row.filial_id || null,
    estado: row.estado_sigla || impliedState || null
  };
}

function mapRemoteBranch(row, impliedState) {
  return {
    id: row.id,
    branchId: row.id_filial ?? "",
    cnpj: row.cnpj ?? "",
    name: row.nome ?? "",
    shortName: row.abreviado ?? "",
    manager: row.gerente || null,
    estado: row.estado_sigla || impliedState || null,
    createdAt: row.criado_em,
    updatedAt: row.atualizado_em
  };
}

function mapRemoteDepartment(row, impliedState) {
  return {
    id: row.id,
    name: row.nome ?? "",
    shortName: row.sigla ?? "",
    estado: row.estado_sigla || impliedState || null,
    createdAt: row.criado_em,
    updatedAt: row.atualizado_em
  };
}

const _loadedStates = {};

export function loadedStates() {
  return _loadedStates;
}

/* Janela inicial de lançamentos: em vez de baixar o histórico inteiro de um
   estado (que só cresce com o tempo), a carga inicial traz só os últimos N
   meses via a rota paginada /api/lancamentos/:estado (que já suporta
   data_de/data_ate com índice dedicado no banco). Períodos mais antigos são
   buscados sob demanda quando o filtro de data do dashboard pedir por eles
   (ver ensureLancamentosSince). `_coveredSince[estado]`: string ISO = data
   mais antiga garantidamente carregada; `null` = já tem o histórico
   completo (fallback ou carga antiga); `undefined` = ainda não se sabe. */
const LANCAMENTOS_WINDOW_MONTHS = 24;
const LANCAMENTOS_PAGE_LIMIT = 500;
const _coveredSince = {};

function isoMonthsAgo(months) {
  const d = new Date();
  d.setDate(1); // evita overflow (ex.: dia 31 num mês sem dia 31) ao voltar meses
  d.setMonth(d.getMonth() - months);
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-01`;
}

function shiftDayISO(iso, deltaDays) {
  const d = new Date(`${iso}T00:00:00`);
  d.setDate(d.getDate() + deltaDays);
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/* Pagina a rota REST de lançamentos (limite 500/página) até completar o
   intervalo pedido. `dataAte` opcional (sem teto = até hoje). */
async function fetchLancamentosRange(state, dataDe, dataAte) {
  const suffix = state.toLowerCase();
  const rows = [];
  let page = 1;
  for (;;) {
    const params = new URLSearchParams({ limit: String(LANCAMENTOS_PAGE_LIMIT), page: String(page) });
    if (dataDe) params.set("data_de", dataDe);
    if (dataAte) params.set("data_ate", dataAte);
    const res = await apiFetch(`/api/lancamentos/${suffix}?${params.toString()}`);
    const pageRows = (res && res.data) || [];
    rows.push(...pageRows);
    const totalPages = (res && res.pagination && res.pagination.totalPages) || 0;
    if (!pageRows.length || page >= totalPages) break;
    page += 1;
  }
  return rows;
}

/* Busca as vagas de um estado abertas dentro do período informado (paginado,
   via /api/vagas/:estado?data_de=&data_ate=). Usada só pelo card de Tempo
   médio de contratação — não grava no cache local nem no store global: as
   demais telas (modal de Vagas, Headcount, aba "Vaga" do Lançamento, e a
   sincronização de custo por vaga) continuam com a lista completa já
   carregada por hydrateOneState, sem depender do filtro de data do
   dashboard. `dataDe`/`dataAte` (opcionais, "YYYY-MM-DD") vêm do filtro de
   período; sem eles, baixa todas as vagas do estado (paginado). */
async function fetchVagasRangeOneState(state, dataDe, dataAte) {
  const suffix = state.toLowerCase();
  const rows = [];
  let page = 1;
  for (;;) {
    const params = new URLSearchParams({ limit: "500", page: String(page) });
    if (dataDe) params.set("data_de", dataDe);
    if (dataAte) params.set("data_ate", `${dataAte}T23:59:59`);
    const res = await apiFetch(`/api/vagas/${suffix}?${params.toString()}`);
    const pageRows = (res && res.data) || [];
    rows.push(...pageRows.map((r) => mapRemoteVacancy(r, state)));
    const totalPages = (res && res.pagination && res.pagination.totalPages) || 0;
    if (!pageRows.length || page >= totalPages) break;
    page += 1;
  }
  return rows;
}

export async function fetchVagasInRange(state, dataDe, dataAte) {
  const states = state === "todos" ? STATES.slice() : [state];
  const lists = await Promise.all(states.map((s) => fetchVagasRangeOneState(s, dataDe, dataAte)));
  return lists.flat();
}

/* Lançamentos da carga inicial de um estado: tenta a janela recente
   (paginada); se a rota falhar por qualquer motivo, cai para o download
   completo de antes (mesmo formato de resultado que fetchTable). */
async function fetchLancamentosInitial(state, suffix) {
  const windowStart = isoMonthsAgo(LANCAMENTOS_WINDOW_MONTHS);
  try {
    const data = await fetchLancamentosRange(state, windowStart, null);
    _coveredSince[state] = windowStart;
    return { data };
  } catch (err) {
    console.error(`[API] Falha ao paginar lançamentos_${suffix} por período, baixando tudo:`, err);
    try {
      const full = await apiFetch(`/api/data/lancamentos_${suffix}`);
      _coveredSince[state] = null; // já tem o histórico completo
      return { data: full && full.data ? full.data : [] };
    } catch (fallbackErr) {
      return { error: fallbackErr };
    }
  }
}

/* Estende a janela de lançamentos já carregada para trás quando o filtro de
   período do dashboard pede uma data anterior ao que já está em memória.
   Não faz nada quando o estado ainda não foi carregado (a hidratação normal
   cuida disso), quando já tem o histórico completo, ou quando a data pedida
   já está coberta. */
export async function ensureLancamentosSince(next, neededStartISO) {
  if (!neededStartISO) return;
  const states = next === "todos" ? STATES.slice() : [next];
  const targets = states.filter((s) => {
    if (!_loadedStates[s]) return false;
    const covered = _coveredSince[s];
    if (covered === null || covered === undefined) return false;
    return neededStartISO < covered;
  });
  if (!targets.length) return;

  beginLoading("Carregando período anterior...");
  try {
    await Promise.all(
      targets.map(async (s) => {
        const suffix = s.toLowerCase();
        const dataAte = shiftDayISO(_coveredSince[s], -1);
        try {
          const rows = await fetchLancamentosRange(s, neededStartISO, dataAte);
          rows.forEach((r) => DataCache.setItem(`lancamentos_${suffix}`, r.id, r));
          mergeFromRemote({ entries: mapRemoteEntries(rows) });
          _coveredSince[s] = neededStartISO;
        } catch (err) {
          console.error(`[API] Falha ao estender o período carregado de ${s}:`, err);
        }
      })
    );
  } finally {
    endLoading();
  }
}

/* Baixa os dados dos estados informados, exibindo a tela de carregamento
   enquanto houver rede. */
export async function hydrate(state) {
  state = state || DEFAULT_STATE;
  const states = state === "todos" ? STATES.slice() : [state];
  if (states.every((s) => _loadedStates[s])) return true;
  beginLoading();
  try {
    return await _hydrate(state);
  } finally {
    endLoading();
  }
}

/* Baixa e grava em cache as 6 tabelas de um único estado. Cada estado é
   isolado dos demais (ver _hydrate): a falha de um (ex.: timeout numa
   consulta grande) não impede os outros de serem carregados e marcados. */
async function hydrateOneState(s) {
  const suffix = s.toLowerCase();
  const fetchTable = async (name) => {
    try {
      return await apiFetch(`/api/data/${name}`);
    } catch (err) {
      console.error(`[API] Erro ao consultar ${name}:`, err);
      return { error: err };
    }
  };
  const [lan, vac, tur, per, hc, col, fil, dep] = await Promise.all([
    fetchLancamentosInitial(s, suffix),
    fetchTable(`vagas_${suffix}`),
    fetchTable(`turnover_${suffix}`),
    fetchTable(`permanencia_${suffix}`),
    fetchTable(`headcount_${suffix}`),
    fetchTable(`colaboradores_${suffix}`),
    fetchTable(`filiais_${suffix}`),
    fetchTable(`departamentos_${suffix}`)
  ]);
  const errored = [lan, vac, tur, per, hc, col, fil, dep].filter((res) => res && res.error);
  if (errored.length) {
    // Não marca o estado como carregado quando a consulta falha (ex.: sem
    // sessão autenticada ainda). Assim o estado é baixado novamente no
    // próximo acesso — evita telas vazias por estado "marcado" sem dados.
    errored.forEach((res) => console.error("[API]", res.error.message));
    delete _coveredSince[s];
    return false;
  }

  const rowsOf = (res) => (res && !res.error && res.data ? res.data : []);
  const rowsLan = rowsOf(lan);
  const rowsVac = rowsOf(vac);
  const rowsTur = rowsOf(tur);
  const rowsPer = rowsOf(per);
  const rowsHc = rowsOf(hc);
  const rowsCol = rowsOf(col);
  const rowsFil = rowsOf(fil);
  const rowsDep = rowsOf(dep);

  rowsLan.forEach((r) => DataCache.setItem(`lancamentos_${suffix}`, r.id, r));
  rowsVac.forEach((r) => DataCache.setItem(`vagas_${suffix}`, r.id, r));
  rowsTur.forEach((r) => DataCache.setItem(`turnover_${suffix}`, r.id, r));
  rowsPer.forEach((r) => DataCache.setItem(`permanencia_${suffix}`, r.id, r));
  rowsHc.forEach((r) => DataCache.setItem(`headcount_${suffix}`, r.id, r));
  rowsCol.forEach((r) => DataCache.setItem(`colaboradores_${suffix}`, r.id, r));
  rowsFil.forEach((r) => DataCache.setItem(`filiais_${suffix}`, r.id, r));
  rowsDep.forEach((r) => DataCache.setItem(`departamentos_${suffix}`, r.id, r));

  mergeFromRemote({
    entries: mapRemoteEntries(rowsLan),
    vacancies: rowsVac.map((r) => mapRemoteVacancy(r, s)),
    turnovers: rowsTur.map((r) => mapRemoteTurnover(r, s)),
    permanencias: rowsPer.map((r) => mapRemotePermanencia(r, s)),
    headcounts: rowsHc.map((r) => mapRemoteHeadcount(r, s)),
    employees: rowsCol.map((r) => mapRemoteEmployee(r, s)),
    branches: rowsFil.map((r) => mapRemoteBranch(r, s)),
    departments: rowsDep.map((r) => mapRemoteDepartment(r, s))
  });
  _loadedStates[s] = true;
  return true;
}

/* Carrega os estados pendentes em paralelo (antes era um for-of sequencial
   com await, que somava a latência de cada estado em vez de correr junto —
   a causa principal da demora ao entrar com o filtro em "todos", que carrega
   RO+AM+PA de uma vez). */
async function _hydrate(state) {
  state = state || DEFAULT_STATE;
  const states = state === "todos" ? STATES.slice() : [state];
  const pending = states.filter((s) => !_loadedStates[s]);
  if (!pending.length) return true;

  const results = await Promise.all(pending.map((s) => hydrateOneState(s)));
  const loadedAny = results.some(Boolean);

  if (loadedAny) {
    const v = await deltaVersao();
    if (v) DataCache.setVersion(v);
  }
  const loaded = pending.filter((_, i) => results[i]);
  if (loaded.length) console.info(`[API] Dados carregados: ${loaded.join(", ")}.`);
  return results.every(Boolean);
}

const STATE_TABLES = ["lancamentos_", "vagas_", "turnover_", "permanencia_", "headcount_", "colaboradores_", "filiais_", "departamentos_"];

function stateCachedKeys(suffix) {
  const out = [];
  DataCache.keys().forEach((key) => {
    const tabela = key.slice("ggd:".length).split(":")[0] || "";
    if (STATE_TABLES.some((p) => tabela.indexOf(p + suffix) === 0)) out.push(key);
  });
  return out;
}

/* Reconstrói em memória (merge, sem apagar o resto) o estado a partir das
   chaves do sessionStorage. Reusa os mesmos mapeamentos do download.
   Também recalcula `_coveredSince[state]` a partir da data mais antiga
   presente no cache — necessário porque esse controle vive só em memória e
   se perde a cada F5, mas o cache local (sessionStorage) sobrevive. */
function mergeStateFromCache(suffix, state) {
  const payload = { entries: {}, employees: [], vacancies: [], turnovers: [], permanencias: [], headcounts: [], branches: [], departments: [] };
  let minLancamentoDate = null;
  stateCachedKeys(suffix).forEach((key) => {
    const item = DataCache.readItem(key);
    if (!item || !item.id) return;
    const tabela = key.slice("ggd:".length).split(":")[0] || "";
    if (tabela.indexOf("lancamentos_") === 0) {
      const ind = item.indicador_id || "headcount";
      if (!payload.entries[ind]) payload.entries[ind] = [];
      payload.entries[ind].push({
        id: item.id,
        date: item.data,
        value: Number(item.valor),
        meta: item.meta || null
      });
      if (item.data && (!minLancamentoDate || item.data < minLancamentoDate)) minLancamentoDate = item.data;
    } else if (tabela.indexOf("colaboradores_") === 0) {
      payload.employees.push(mapRemoteEmployee(item, state));
    } else if (tabela.indexOf("vagas_") === 0) {
      payload.vacancies.push(mapRemoteVacancy(item, state));
    } else if (tabela.indexOf("permanencia_") === 0) {
      payload.permanencias.push(mapRemotePermanencia(item, state));
    } else if (tabela.indexOf("turnover_") === 0) {
      payload.turnovers.push(mapRemoteTurnover(item, state));
    } else if (tabela.indexOf("headcount_") === 0) {
      payload.headcounts.push(mapRemoteHeadcount(item, state));
    } else if (tabela.indexOf("filiais_") === 0) {
      payload.branches.push(mapRemoteBranch(item, state));
    } else if (tabela.indexOf("departamentos_") === 0) {
      payload.departments.push(mapRemoteDepartment(item, state));
    }
  });
  Object.keys(payload.entries).forEach((k) => payload.entries[k].sort((a, b) => compareDateAsc(a.date, b.date)));
  mergeFromRemote(payload);
  /* Sem nenhum lançamento em cache ainda: assume a janela padrão como
     coberta (seguro — no pior caso dispara uma busca extra depois). */
  _coveredSince[state] = minLancamentoDate || isoMonthsAgo(LANCAMENTOS_WINDOW_MONTHS);
}

/* Carrega estado(s) priorizando o cache local + delta sync (egress mínimo):
   1. se o estado já está em memória, nada é baixado;
   2. se há itens dele no cache local, reconstrói a memória e aplica apenas o
      delta desde a última versão;
   3. senão, faz o download completo do estado (que é então guardado no cache). */
export async function hydrateState(next) {
  const states = next === "todos" ? STATES.slice() : [next];
  if (states.every((s) => _loadedStates[s])) return true;
  beginLoading();
  try {
    return await _hydrateState(next);
  } finally {
    endLoading();
  }
}

async function _hydrateState(next) {
  // Limpa (uma vez) resíduos de PII de versões antigas gravados em localStorage.
  DataCache.removeLegacy();
  const states = next === "todos" ? STATES.slice() : [next];
  const pending = states.filter((s) => !_loadedStates[s]);
  if (!pending.length) return true;

  const versao = DataCache.getVersion();
  let usedCache = false;
  if (versao > 0) {
    const allCached = pending.every((s) => stateCachedKeys(s.toLowerCase()).length > 0);
    if (allCached) {
      pending.forEach((s) => {
        mergeStateFromCache(s.toLowerCase(), s);
        _loadedStates[s] = true;
      });
      usedCache = true;
    }
  }

  if (usedCache) {
    const delta = await fetchDelta(versao);
    if (delta) {
      if (delta.changes && delta.changes.length) {
        // Snapshot dos estados realmente carregados (já inclui `pending`, que
        // acabou de ser marcado acima): o applyDelta marca como carregado todo
        // estado citado no delta, o que marcaria indevidamente estados que
        // ainda não tiveram o conjunto completo de dados em memória.
        const loadedBefore = Object.keys(_loadedStates);
        applyDelta(delta.changes);
        Object.keys(_loadedStates).forEach((k) => delete _loadedStates[k]);
        loadedBefore.forEach((s) => (_loadedStates[s] = true));
        DataCache.setVersion(delta.versaoAtual);
      }
      console.info(`[API] Estados restaurados do cache local: ${pending.join(", ")}.`);
      return true;
    }
    // Delta indisponível: recarrega por completo para não exibir dados velhos.
    pending.forEach((s) => {
      delete _loadedStates[s];
      delete _coveredSince[s];
    });
  }

  return hydrate(pending.length === 1 ? pending[0] : "todos");
}

async function deltaVersao() {
  try {
    const data = await apiFetch("/api/delta/version");
    return Number(data && data.data && data.data.versao) || 0;
  } catch (err) {
    console.warn("[API] Versão do delta indisponível:", err.message);
    return 0;
  }
}

async function fetchDelta(versao) {
  try {
    const data = await apiFetch(`/api/delta/sync?versao=${Number(versao) || 0}`);
    const payload = data && data.data ? data.data : {};
    return {
      versaoAtual: Number(payload.versaoAtual) || Number(versao) || 0,
      changes: Array.isArray(payload.changes) ? payload.changes : []
    };
  } catch (err) {
    console.warn("[API] Falha no delta sync:", err);
    return null;
  }
}

function _removeFromMemory(tabela, id) {
  const data = useData();
  if (tabela.indexOf("lancamentos_") === 0) {
    Object.keys(data.entries).forEach((ind) => {
      data.entries[ind] = data.entries[ind].filter((e) => e.id !== id);
    });
  } else if (tabela.indexOf("colaboradores_") === 0) {
    data.employees = data.employees.filter((e) => e.id !== id);
  } else if (tabela.indexOf("vagas_") === 0) {
    data.vacancies = data.vacancies.filter((v) => v.id !== id);
  } else if (tabela.indexOf("permanencia_") === 0) {
    data.permanencias = data.permanencias.filter((p) => p.id !== id);
  } else if (tabela.indexOf("turnover_") === 0) {
    data.turnovers = data.turnovers.filter((t) => t.id !== id);
  } else if (tabela.indexOf("headcount_") === 0) {
    data.headcounts = data.headcounts.filter((h) => h.id !== id);
  } else if (tabela.indexOf("filiais_") === 0) {
    data.branches = data.branches.filter((b) => b.id !== id);
  } else if (tabela.indexOf("departamentos_") === 0) {
    data.departments = data.departments.filter((d) => d.id !== id);
  }
}

function _upsertInMemory(tabela, row, estado) {
  const data = useData();
  if (tabela.indexOf("lancamentos_") === 0) {
    const ind = row.indicador_id || "headcount";
    if (!data.entries[ind]) data.entries[ind] = [];
    upsertInList(data.entries[ind], {
      id: row.id,
      date: row.data,
      value: Number(row.valor),
      meta: row.meta || null
    });
    data.entries[ind].sort((a, b) => compareDateAsc(a.date, b.date));
  } else if (tabela.indexOf("colaboradores_") === 0) {
    upsertInList(data.employees, mapRemoteEmployee(row, estado));
  } else if (tabela.indexOf("vagas_") === 0) {
    upsertInList(data.vacancies, mapRemoteVacancy(row, estado));
  } else if (tabela.indexOf("permanencia_") === 0) {
    upsertInList(data.permanencias, mapRemotePermanencia(row, estado));
  } else if (tabela.indexOf("turnover_") === 0) {
    upsertInList(data.turnovers, mapRemoteTurnover(row, estado));
  } else if (tabela.indexOf("headcount_") === 0) {
    upsertInList(data.headcounts, mapRemoteHeadcount(row, estado));
  } else if (tabela.indexOf("filiais_") === 0) {
    upsertInList(data.branches, mapRemoteBranch(row, estado));
  } else if (tabela.indexOf("departamentos_") === 0) {
    upsertInList(data.departments, mapRemoteDepartment(row, estado));
  }
}

function applyDelta(changes) {
  (changes || []).forEach((c) => {
    if (!c || !c.tabela) return;
    const estado = c.tabela.slice(-2).toUpperCase();
    if (c.operacao === "delete") {
      DataCache.removeItem(c.tabela, c.registro_id);
      _removeFromMemory(c.tabela, c.registro_id);
    } else if (c.operacao === "upsert" && c.dados) {
      DataCache.setItem(c.tabela, c.registro_id, c.dados);
      _upsertInMemory(c.tabela, c.dados, estado);
    }
    _loadedStates[estado] = true;
  });
}

function loadLocalIntoMemory() {
  const keys = DataCache.keys();
  if (!keys.length) return false;

  const data = { entries: {}, employees: [], vacancies: [], turnovers: [], permanencias: [], headcounts: [], branches: [], departments: [] };
  const tablesSeen = {};
  const minLancamentoByState = {};

  keys.forEach((key) => {
    const item = DataCache.readItem(key);
    if (!item || !item.id) return;
    const rest = key.slice("ggd:".length);
    const sep = rest.indexOf(":");
    if (sep < 0) return;
    const tabela = rest.slice(0, sep);
    tablesSeen[tabela] = true;
    const estado = tabela.slice(-2).toUpperCase();

    if (tabela.indexOf("lancamentos_") === 0) {
      const ind = item.indicador_id || "headcount";
      if (!data.entries[ind]) data.entries[ind] = [];
      data.entries[ind].push({
        id: item.id,
        date: item.data,
        value: Number(item.valor),
        meta: item.meta || null
      });
      if (item.data && (!minLancamentoByState[estado] || item.data < minLancamentoByState[estado])) {
        minLancamentoByState[estado] = item.data;
      }
    } else if (tabela.indexOf("colaboradores_") === 0) {
      data.employees.push(mapRemoteEmployee(item, estado));
    } else if (tabela.indexOf("vagas_") === 0) {
      data.vacancies.push(mapRemoteVacancy(item, estado));
    } else if (tabela.indexOf("permanencia_") === 0) {
      data.permanencias.push(mapRemotePermanencia(item, estado));
    } else if (tabela.indexOf("turnover_") === 0) {
      data.turnovers.push(mapRemoteTurnover(item, estado));
    } else if (tabela.indexOf("headcount_") === 0) {
      data.headcounts.push(mapRemoteHeadcount(item, estado));
    } else if (tabela.indexOf("filiais_") === 0) {
      data.branches.push(mapRemoteBranch(item, estado));
    } else if (tabela.indexOf("departamentos_") === 0) {
      data.departments.push(mapRemoteDepartment(item, estado));
    }
  });

  Object.keys(data.entries).forEach((k) => data.entries[k].sort((a, b) => compareDateAsc(a.date, b.date)));
  replaceFromCache(data);

  Object.keys(_loadedStates).forEach((k) => delete _loadedStates[k]);
  Object.keys(_coveredSince).forEach((k) => delete _coveredSince[k]);
  STATES.forEach((s) => {
    const suffix = s.toLowerCase();
    if (tablesSeen["lancamentos_" + suffix] || tablesSeen["colaboradores_" + suffix]) {
      _loadedStates[s] = true;
      /* Ver mergeStateFromCache: recalcula a cada boot pois esse controle
         só existe em memória. */
      _coveredSince[s] = minLancamentoByState[s] || isoMonthsAgo(LANCAMENTOS_WINDOW_MONTHS);
    }
  });
  return true;
}

/* Boot com Delta Sync:
   1) reconstrói a memória a partir do sessionStorage (renderização rápida);
   2) se não houver cache -> download completo + semeadura item a item;
   3) se houver cache -> pede apenas os itens alterados/deletados desde a
      última versão e aplica via setItem/removeItem. */
export async function hydrateWithDelta(state) {
  DataCache.removeLegacy();

  const hasLocal = loadLocalIntoMemory();
  if (hasLocal) {
    console.info("[API] Cache local restaurado do sessionStorage.");
  }

  if (!hasLocal) {
    console.info("[API] Primeiro acesso — baixando dados completos.");
    Object.keys(_loadedStates).forEach((k) => delete _loadedStates[k]);
    Object.keys(_coveredSince).forEach((k) => delete _coveredSince[k]);
    return await hydrate(state);
  }

  const versao = DataCache.getVersion();
  const delta = await fetchDelta(versao);
  if (!delta) {
    console.info("[API] Delta indisponível — baixando dados completos (fallback).");
    DataCache.resetAll();
    Object.keys(_loadedStates).forEach((k) => delete _loadedStates[k]);
    Object.keys(_coveredSince).forEach((k) => delete _coveredSince[k]);
    resetData();
    return await hydrate(state);
  }

  if (delta.versaoAtual <= versao || !delta.changes.length) {
    console.info(`[API] Sem alterações (versão ${versao}) — usando cache local.`);
    return true;
  }

  console.info(`[API] Delta sync: ${delta.changes.length} alteração(ões) desde a versão ${versao}.`);
  applyDelta(delta.changes);
  DataCache.setVersion(delta.versaoAtual);
  return true;
}

/* Boot: chamado pelo main.js antes da montagem do app. Só hidrata quando já
   há sessão autenticada (sem ela a API responde 401).
   Usa o mesmo estado padrão do filtro do dashboard (DEFAULT_FILTER_STATE)
   — antes hidratava sempre "RO" (DEFAULT_STATE) aqui e, logo em seguida, o
   onMounted do Dashboard carregava os demais estados do filtro "todos"
   separadamente: duas rodadas de carregamento em vez de uma, com "RO"
   sendo baixado de novo a cada boot mesmo quando o filtro real era outro. */
export async function bootstrapData(authed) {
  registerRemote();
  if (!authed) {
    console.info("[API] Sem sessão ativa — dados serão carregados após o login.");
    return;
  }
  await hydrateWithDelta(DEFAULT_FILTER_STATE);
}

/* Descarta escritas locais ainda pendentes (fila com debounce). Usado no
   logout/expiração: sem isso, edições do usuário anterior poderiam ser
   enviadas ao banco com a sessão do próximo usuário. */
export function discardPendingWrites() {
  if (_flushTimer) {
    clearTimeout(_flushTimer);
    _flushTimer = null;
  }
  Object.keys(_queue).forEach((k) => _queue[k].clear());
}

/* Purga completa de dados sensíveis ao encerrar a sessão:
   fila de escrita + memória reativa + cache em sessionStorage. */
export function resetLocalState() {
  discardPendingWrites();
  resetData();
  Object.keys(_loadedStates).forEach((k) => delete _loadedStates[k]);
  Object.keys(_coveredSince).forEach((k) => delete _coveredSince[k]);
  DataCache.resetAll();
}

/* "Recarregar Dados": limpa cache e memória, remove resíduos antigos do
   localStorage e busca os dados atualizados direto do banco. A sessão
   (gg-auth) vive em sessionStorage e é preservada (as chaves ggd:* são as
   únicas apagadas). */
export async function reloadData() {
  DataCache.removeLegacy();
  DataCache.resetAll();
  resetData();
  Object.keys(_loadedStates).forEach((k) => delete _loadedStates[k]);
  Object.keys(_coveredSince).forEach((k) => delete _coveredSince[k]);
  await hydrate(DEFAULT_STATE);
}

/* Garante que escritas pendentes não se percam ao sair da página */
if (typeof window !== "undefined") {
  window.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") flush();
  });
  window.addEventListener("pagehide", () => flush());
}
