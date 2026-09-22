/* Camada de dados: cache por item (sessionStorage) + download completo via API
   (Cloudflare Worker → Google Sheets), escritas em fila com debounce, sessão/
   purga via resetLocalState. Sem sincronização incremental: o cache local
   vale até um logout/login novo ou até "Recarregar Dados" ser acionado. */
import { STATES, DEFAULT_STATE, DEFAULT_FILTER_STATE } from "./config";
import { apiFetch } from "./api";
import { DataCache } from "./cache";
import { bindRemote, mergeFromRemote, replaceFromCache, resetData } from "./store";
import { beginLoading, endLoading } from "../composables/useLoading";
import { useToast } from "../composables/useToast";
import { mapWithConcurrency } from "./utils";

const FLUSH_DELAY_MS = 1200; // agrupa escritas por até 1,2 s antes de enviar

/* Teto de requisições simultâneas para a API (Worker → Apps Script), que
   aceita no máximo 30 execuções ao mesmo tempo por usuário — folga
   deliberada abaixo disso pra sobrar espaço pra escritas concorrentes e
   outras abas/usuários batendo na mesma planilha. Acima do limite, a próxima
   requisição só sai quando alguma anterior termina (ver mapWithConcurrency
   em utils.js), em vez de todas de uma vez — é isso que evita o status
   "canceled" quando o total de chamadas cresce. */
const MAX_CONCURRENT_REQUESTS = 28;
const MAX_FLUSH_RETRIES = 3; // tentativas extras após falha de rede/servidor

/* Corrige timestamps "hora local" para a planilha sem duplicar fuso.
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

/* Conversores Entry ({id, date, value, meta}) -> linha da planilha, um por
   indicador que antes vivia na tabela genérica "lancamentos". `entry.meta`
   sempre carrega `estado` (ver _withState em store.js). */
function diariaToRow(entry) {
  const meta = entry.meta || {};
  return {
    id: entry.id,
    nome_colaborador: meta.employeeName || "",
    funcao: meta.funcao || null,
    departamento: meta.departamento || null,
    filial: meta.filial || null,
    lider_imediato: meta.liderImediato || null,
    gerente_regional: meta.gerenteRegional || null,
    regional: meta.regional || null,
    motivo: meta.motivo || null,
    competencia: entry.date,
    sem_periodo: Boolean(meta.semPeriodo),
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
    // Única fonte de carga horária (a "cargaHoraria" em meta era cópia redundante).
    horas: Number(entry.value) || 0,
    estado_sigla: meta.estado || null
  };
}

function custoFolhaToRow(entry) {
  const meta = entry.meta || {};
  return {
    id: entry.id,
    filial_cnpj: meta.cnpj || null,
    razao_social: meta.razaoSocial || null,
    percent: meta.percent != null && meta.percent !== "" ? Number(meta.percent) : null,
    competencia: entry.date,
    valor: Number(entry.value) || 0,
    estado_sigla: meta.estado || null
  };
}

function absenteismoToRow(entry) {
  const meta = entry.meta || {};
  return {
    id: entry.id,
    competencia: entry.date,
    valor: Number(entry.value) || 0,
    estado_sigla: meta.estado || null
  };
}

// "mes_incompleto" (ver lib/monthStatus.js): a existência da linha já é o
// marcador — sem "valor" nenhum a gravar.
function mesIncompletoToRow(entry) {
  const meta = entry.meta || {};
  return {
    id: entry.id,
    competencia: entry.date,
    estado_sigla: meta.estado || null
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
    filial: t.filial || null,
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

/* Incrementa a cada logout/login (resetLocalState). Respostas de requisições
   iniciadas por uma sessão anterior comparam a época e se descartam — sem
   isso, um download em andamento no logout despejava dados do usuário
   anterior na memória do próximo. */
let _epoch = 0;

function _enqueue(table, id, op) {
  if (!_queue[table]) _queue[table] = new Map();
  _queue[table].set(id, op);
  _schedule();
}

function _schedule(delay = FLUSH_DELAY_MS) {
  if (_flushTimer) return;
  _flushTimer = setTimeout(() => {
    _flushTimer = null;
    flush();
  }, delay);
}

/* Falha de rede (sem status), timeout (0), 408/429 e 5xx merecem nova
   tentativa; 4xx (validação, permissão, sessão) não melhora repetindo. */
function _isRetriable(err) {
  const status = err && err.status;
  return !status || status >= 500 || status === 429 || status === 408;
}

/* Devolve à fila as operações de uma tabela que falharam, sem sobrescrever
   uma operação mais nova para o mesmo registro. */
function _requeue(table, ops) {
  if (!_queue[table]) _queue[table] = new Map();
  ops.forEach((op, id) => {
    if (!_queue[table].has(id)) _queue[table].set(id, op);
  });
}

/* Limite do corpo de uma requisição `keepalive` (usada ao fechar a aba) é
   64 KB; acima disso o navegador rejeita a requisição. */
const KEEPALIVE_MAX_BYTES = 60000;

/* Envios são serializados: dois flushes simultâneos poderiam entregar
   "editar X" e "excluir X" fora de ordem ao servidor. */
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
      if (op.type === "upsert") upserts.push(op.row);
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
  errors.forEach((error, i) => {
    if (!error) return;
    const { table, ops } = jobs[i];
    const status = error.status || error.code;
    console.error(`[API] ${table}`, status ? `(${status}) ` : "", error.message || error);

    /* Só devolve à fila se a sessão é a mesma: escritas do usuário anterior
       nunca podem ser reenviadas com o token do próximo. */
    if (epoch === _epoch && _isRetriable(error) && _flushRetries < MAX_FLUSH_RETRIES) {
      _requeue(table, ops);
      willRetry = true;
    } else if (epoch === _epoch) {
      dropped += ops.size;
    }
  });

  if (willRetry) {
    _flushRetries += 1;
    _schedule(FLUSH_DELAY_MS * 2 ** _flushRetries);
  } else {
    _flushRetries = 0;
  }
  if (dropped) {
    useToast().show(
      `Não foi possível salvar ${dropped} alteração(ões) no servidor. Recarregue os dados e refaça, se necessário.`
    );
  }
}

// indicador_id (do formulário) -> { table (aba física), toRow }. Substitui a
// antiga tabela genérica "lancamentos": cada indicador manual tem aba própria.
const ENTRY_TABLE_META = {
  custo_diaria: { table: "diarias", toRow: diariaToRow },
  treinamento: { table: "treinamentos", toRow: treinamentoToRow },
  custo_total: { table: "custo_folha", toRow: custoFolhaToRow },
  absenteismo: { table: "absenteismo", toRow: absenteismoToRow },
  mes_incompleto: { table: "meses_incompletos", toRow: mesIncompletoToRow }
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
      _enqueue(stateTable(table, estado), entry.id, { type: "upsert", row: toRow(entry) });
    },
    entryUpdated(indicatorId, entry) {
      const { table, toRow } = entryTableMeta(indicatorId);
      const estado = entry.meta ? entry.meta.estado : null;
      _enqueue(stateTable(table, estado), entry.id, { type: "upsert", row: toRow(entry) });
    },
    entriesRemoved(indicatorId, ids, estado) {
      const { table } = entryTableMeta(indicatorId);
      const physicalTable = stateTable(table, estado);
      ids.forEach((id) => _enqueue(physicalTable, id, { type: "delete", id }));
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
    }
  });
}

/* Conversores linha da planilha -> Entry ({id, date, value, meta}), um por
   tabela dedicada. Mantêm exatamente a forma que metrics.js/useDashboardData.js
   e os modais de indicador já esperavam da antiga "lancamentos" — só a
   origem do dado mudou. */
function mapRemoteDiaria(row, impliedState) {
  return {
    id: row.id,
    date: row.competencia,
    value: Number(row.valor) || 0,
    meta: {
      employeeName: row.nome_colaborador || "",
      funcao: row.funcao || null,
      departamento: row.departamento || null,
      filial: row.filial || null,
      liderImediato: row.lider_imediato || null,
      gerenteRegional: row.gerente_regional || null,
      regional: row.regional || null,
      motivo: row.motivo || null,
      semPeriodo: Boolean(row.sem_periodo),
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
      employeeName: row.nome_colaborador || "",
      cargo: row.cargo || null,
      filial: row.filial || null,
      gerenteRegional: row.gerente_regional || null,
      tema: row.tema || null,
      modalidade: row.modalidade || null,
      estado: row.estado_sigla || impliedState || null
    }
  };
}

// Sem FK pra Filiais: guarda CNPJ e razão social direto na linha (mesmo
// jeito que o modal de Custo de Folha busca/mostra — ver submitCustosTotal
// em LaunchModal.vue), sem depender do cadastro de Filiais pra exibir.
function mapRemoteCustoFolha(row, impliedState) {
  return {
    id: row.id,
    date: row.competencia,
    value: Number(row.valor) || 0,
    meta: {
      cnpj: row.filial_cnpj || null,
      razaoSocial: row.razao_social || null,
      percent: row.percent != null && row.percent !== "" ? Number(row.percent) : null,
      estado: row.estado_sigla || impliedState || null
    }
  };
}

function mapRemoteAbsenteismo(row, impliedState) {
  return {
    id: row.id,
    date: row.competencia,
    value: Number(row.valor) || 0,
    meta: { estado: row.estado_sigla || impliedState || null }
  };
}

function mapRemoteMesIncompleto(row, impliedState) {
  return {
    id: row.id,
    date: row.competencia,
    value: 1,
    meta: { estado: row.estado_sigla || impliedState || null }
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
    filial: row.filial || null,
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
    filial: row.filial || null,
    estado: row.estado_sigla || impliedState || null
  };
}

function mapRemoteBranch(row, impliedState) {
  return {
    id: row.id,
    cnpj: row.cnpj ?? "",
    name: row.nome ?? "",
    shortName: row.abreviado ?? "",
    manager: row.gerente || null,
    estado: row.estado_sigla || impliedState || null
  };
}

/* Tabelas de dados por estado (nome-base → lista do store + mapeador de linha).
   Fonte única para restaurar do cache, aplicar delta e hidratar — antes cada
   um desses caminhos repetia a mesma cadeia de if/else. Desde que
   diarias/treinamentos/custo_folha/absenteismo ganharam abas próprias (no
   lugar da antiga "lancamentos" genérica), todas as tabelas passam por aqui
   uniformemente — nenhuma precisa mais de tratamento especial. */
const TABLE_KINDS = {
  vagas: { key: "vacancies", map: mapRemoteVacancy },
  turnover: { key: "turnovers", map: mapRemoteTurnover },
  permanencia: { key: "permanencias", map: mapRemotePermanencia },
  headcount: { key: "headcounts", map: mapRemoteHeadcount },
  filiais: { key: "branches", map: mapRemoteBranch },
  diarias: { key: "diarias", map: mapRemoteDiaria },
  treinamentos: { key: "treinamentos", map: mapRemoteTreinamento },
  custo_folha: { key: "custoFolha", map: mapRemoteCustoFolha },
  absenteismo: { key: "absenteismo", map: mapRemoteAbsenteismo },
  meses_incompletos: { key: "mesesIncompletos", map: mapRemoteMesIncompleto }
};
const DATA_TABLES = Object.keys(TABLE_KINDS);

/* "vagas_ro" → { base: "vagas", estado: "RO" }. Divide no ÚLTIMO "_" —
   necessário porque algumas chaves de tabela já têm "_" no nome
   (ex.: "custo_folha_ro" → base "custo_folha", não "custo"). */
function splitTable(tabela) {
  const i = tabela.lastIndexOf("_");
  return i > 0
    ? { base: tabela.slice(0, i), estado: tabela.slice(i + 1).toUpperCase() }
    : { base: tabela, estado: "" };
}

function emptyPayload() {
  return {
    vacancies: [],
    turnovers: [],
    permanencias: [],
    headcounts: [],
    branches: [],
    diarias: [],
    treinamentos: [],
    custoFolha: [],
    absenteismo: [],
    mesesIncompletos: []
  };
}

function statesOf(state) {
  return state === "todos" ? STATES.slice() : [state || DEFAULT_STATE];
}

// Coloca uma linha do banco no payload do store.
function addRowToPayload(payload, tabela, row, estado) {
  const { base } = splitTable(tabela);
  const kind = TABLE_KINDS[base];
  if (kind) payload[kind.key].push(kind.map(row, estado));
}

const _loadedStates = {};

export function loadedStates() {
  return _loadedStates;
}

/* Marcado quando o navegador recusa uma gravação do cache local (cota cheia):
   o cache fica incompleto e não pode receber a versão do delta. */
let _cacheDirty = false;

/* Grava linhas no cache local; para na primeira recusa e marca o cache como
   incompleto (ver _cacheDirty). */
function persistRows(tabela, rows) {
  for (let i = 0; i < rows.length; i++) {
    if (!DataCache.setItem(tabela, rows[i].id, rows[i])) {
      _cacheDirty = true;
      return false;
    }
  }
  return true;
}

/* Baixa os dados dos estados informados, exibindo a tela de carregamento
   enquanto houver rede. */
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

/* Tabelas já carregadas nesta sessão (os 3 estados de uma vez — ver
   bucketByEstado): fonte única do que falta baixar, tanto na carga normal
   quanto num retry após erro parcial. Zerado em clearLoadedTracking (logout,
   "Recarregar Dados"). */
const _tablesLoaded = new Set();

/* Tentativas extras só para as tabelas que falharem — as que já vieram
   certas não são rebaixadas junto. */
const MAX_TABLE_RETRIES = 2;

async function fetchOneTable(base) {
  try {
    const res = await apiFetch(`/api/data/${base}`);
    return { base, data: (res && res.data) || [] };
  } catch (err) {
    console.error(`[API] Erro ao consultar ${base}:`, err);
    return { base, error: err };
  }
}

/* Busca as tabelas informadas — sempre sem sufixo de estado (cada tabela
   volta com os 3 estados juntos numa única chamada, ver bucketByEstado) — e
   grava em cache/memória as que vierem certas. Devolve as que falharam, sem
   descartar o que já deu certo nesta rodada. */
async function fetchTablesOnce(bases) {
  const epoch = _epoch;
  const results = await mapWithConcurrency(bases, MAX_CONCURRENT_REQUESTS, fetchOneTable);
  if (epoch !== _epoch) return { failed: bases }; // logout/login no meio do download

  const payloads = { RO: emptyPayload(), AM: emptyPayload(), PA: emptyPayload() };
  const failed = [];
  let persisted = true;

  results.forEach(({ base, data, error }) => {
    if (error) {
      failed.push(base);
      return;
    }
    const kind = TABLE_KINDS[base];
    const buckets = bucketByEstado(data);
    STATES.forEach((s) => {
      if (persisted) persisted = persistRows(`${base}_${s.toLowerCase()}`, buckets[s]);
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

/* Baixa todas as tabelas que ainda faltam, uma chamada por tabela (sem
   sufixo de estado — nunca "diarias_ro"/"diarias_am"/"diarias_pa" em
   chamadas separadas, só "diarias" trazendo os 3 estados de uma vez).
   Chamar por estado multiplicava as requisições simultâneas ao Worker/Apps
   Script (que tem limite de execuções concorrentes — ver sheets.ts) e
   causava falhas intermitentes com status "canceled" em 1 ou 2 tabelas por
   vez, mesmo com a maioria carregando normalmente. Quando alguma tabela
   falha, tenta de novo só ela (até MAX_TABLE_RETRIES vezes) — nada que já
   carregou certo é rebaixado. Uma única promise compartilhada: chamadas
   concorrentes (vários componentes pedindo dados ao mesmo tempo) esperam a
   mesma operação em vez de disparar downloads paralelos redundantes. */
let _hydrateAllPromise = null;

function hydrateAllTables() {
  if (_hydrateAllPromise) return _hydrateAllPromise;

  _hydrateAllPromise = (async () => {
    let pending = DATA_TABLES.filter((base) => !_tablesLoaded.has(base));
    let attempt = 0;
    while (pending.length && attempt <= MAX_TABLE_RETRIES) {
      if (attempt > 0) {
        // Pequena espera antes de tentar de novo: dá um respiro ao Worker/Apps
        // Script quando o erro foi por limite de execuções concorrentes, em
        // vez de bater na mesma trava imediatamente.
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
      // Cache incompleto (cota cheia): descarta tudo — o próximo boot baixa de novo.
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

function keyTable(key) {
  return key.slice("ggd:".length).split(":")[0] || "";
}

/* Chaves do cache local que pertencem a um estado (sufixo "ro"/"am"/"pa"). */
function stateCachedKeys(suffix) {
  return DataCache.keys().filter((key) => {
    const { base, estado } = splitTable(keyTable(key));
    return estado.toLowerCase() === suffix && base in TABLE_KINDS;
  });
}

/* Reconstrói em memória (merge, sem apagar o resto) o estado a partir das
   chaves do sessionStorage. Reusa os mesmos mapeamentos do download. */
function mergeStateFromCache(state) {
  const payload = emptyPayload();
  stateCachedKeys(state.toLowerCase()).forEach((key) => {
    const item = DataCache.readItem(key);
    if (!item || !item.id) return;
    addRowToPayload(payload, keyTable(key), item, state);
  });
  mergeFromRemote(payload);
}

/* Carrega estado(s) priorizando o cache local + delta sync (egress mínimo):
   1. se o estado já está em memória, nada é baixado;
   2. se há itens dele no cache local, reconstrói a memória e aplica apenas o
      delta desde a última versão;
   3. senão, faz o download completo do estado (que é então guardado no cache).
   Pedidos simultâneos dos mesmos estados compartilham a mesma operação. */
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

// Sem sincronização incremental: se os estados pedidos já têm itens no cache
// local, reconstrói a memória a partir dele (sem ida à API); senão, baixa
// tudo. O cache só é invalidado por um logout/login novo ou por "Recarregar
// Dados" (ver resetLocalState/reloadData) — nunca por uma simples atualização
// de página (F5).
async function _hydrateState(pending) {
  DataCache.removeLegacy();

  if (pending.every((s) => stateCachedKeys(s.toLowerCase()).length > 0)) {
    pending.forEach((s) => {
      mergeStateFromCache(s);
      _loadedStates[s] = true;
    });
    /* Cache cobrindo os 3 estados: evita que o próximo hydrate (outro
       componente pedindo um estado que não estava no cache) rebaixe tudo de
       novo via rede — ver hydrateAllTables. */
    if (STATES.every((s) => _loadedStates[s])) {
      DATA_TABLES.forEach((base) => _tablesLoaded.add(base));
    }
    console.info(`[API] Estados restaurados do cache local: ${pending.join(", ")}.`);
    return true;
  }

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
    // Qualquer tabela vista pra esse estado já basta pra considerá-lo carregado.
    if (DATA_TABLES.some((base) => tablesSeen[`${base}_${suffix}`])) {
      _loadedStates[s] = true;
    }
  });
  // Mesma ideia por tabela: evita rebaixar via rede o que já veio do cache
  // (ver hydrateAllTables).
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

/* Boot:
   1) reconstrói a memória a partir do sessionStorage (renderização rápida,
      sem ida à API) — vale até um logout/login novo ou "Recarregar Dados";
   2) se não houver cache utilizável, baixa tudo da planilha. */
async function hydrateOnBoot(state) {
  DataCache.removeLegacy();

  const hasLocal = loadLocalIntoMemory();
  if (hasLocal) {
    console.info("[API] Cache local restaurado do sessionStorage.");
    return true;
  }

  console.info("[API] Sem cache utilizável — baixando dados completos.");
  clearLoadedTracking();
  return await hydrate(state);
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
  await hydrateOnBoot(DEFAULT_FILTER_STATE);
}

/* Descarta escritas locais ainda pendentes (fila com debounce). Usado no
   logout/expiração: sem isso, edições do usuário anterior poderiam ser
   enviadas ao banco com a sessão do próximo usuário. */
export function discardPendingWrites() {
  if (_flushTimer) {
    clearTimeout(_flushTimer);
    _flushTimer = null;
  }
  _flushRetries = 0;
  Object.keys(_queue).forEach((k) => _queue[k].clear());
}

/* Purga completa de dados sensíveis ao encerrar a sessão:
   fila de escrita + memória reativa + cache em sessionStorage. */
export function resetLocalState() {
  _epoch += 1;
  discardPendingWrites();
  resetData();
  clearLoadedTracking();
  _cacheDirty = false;
  DataCache.resetAll();
}

/* "Recarregar Dados": limpa cache e memória, remove resíduos antigos do
   localStorage e busca os dados atualizados direto do banco. Recarrega os
   MESMOS estados que estavam em memória (antes só o estado padrão era
   baixado — com o filtro em "Todos Estados" a tela ficava só com RO). A
   sessão (gg-auth) vive em sessionStorage e é preservada (as chaves ggd:* são
   as únicas apagadas). */
export async function reloadData() {
  // Edições ainda na fila entram no servidor ANTES de baixar de novo.
  await flush();

  const previous = STATES.filter((s) => _loadedStates[s]);
  DataCache.removeLegacy();
  DataCache.resetAll();
  _cacheDirty = false;
  resetData();
  clearLoadedTracking();

  beginLoading();
  try {
    await _hydrateStates(previous.length ? previous : [DEFAULT_STATE]);
  } finally {
    endLoading();
  }
}

/* Garante que escritas pendentes não se percam ao sair da página. `keepalive`
   deixa o navegador concluir o envio mesmo com a aba sendo fechada. */
if (typeof window !== "undefined") {
  window.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") flush({ keepalive: true });
  });
  window.addEventListener("pagehide", () => flush({ keepalive: true }));
}
