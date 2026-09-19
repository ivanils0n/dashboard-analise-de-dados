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
  upsertManyInList,
  useData
} from "./store";
import { compareDateAsc, sameState } from "./utils";
import { beginLoading, endLoading } from "../composables/useLoading";
import { useToast } from "../composables/useToast";

const FLUSH_DELAY_MS = 1200; // agrupa escritas por até 1,2 s antes de enviar
const MAX_FLUSH_RETRIES = 3; // tentativas extras após falha de rede/servidor

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
    jobs.push({
      table,
      ops,
      promise: apiFetch(`/api/data/${table}`, { method: "POST", body, keepalive: useKeepalive })
    });
  });

  if (!jobs.length) return;

  const errors = await Promise.all(jobs.map((job) => job.promise.then(() => null, (err) => err)));

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

function entryFromRow(row) {
  return { id: row.id, date: row.data, value: Number(row.valor), meta: row.meta || null };
}

function mapRemoteEntries(rows) {
  const mapped = {};
  rows.forEach((row) => {
    if (!mapped[row.indicador_id]) mapped[row.indicador_id] = [];
    mapped[row.indicador_id].push(entryFromRow(row));
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

/* Tabelas de dados por estado (nome-base → lista do store + mapeador de linha).
   Fonte única para restaurar do cache, aplicar delta e hidratar — antes cada
   um desses caminhos repetia a mesma cadeia de if/else. `lancamentos` é
   tratado à parte (agrupa por indicador). */
const TABLE_KINDS = {
  colaboradores: { key: "employees", map: mapRemoteEmployee },
  vagas: { key: "vacancies", map: mapRemoteVacancy },
  turnover: { key: "turnovers", map: mapRemoteTurnover },
  permanencia: { key: "permanencias", map: mapRemotePermanencia },
  headcount: { key: "headcounts", map: mapRemoteHeadcount },
  filiais: { key: "branches", map: mapRemoteBranch },
  departamentos: { key: "departments", map: mapRemoteDepartment }
};
const KIND_KEYS = Object.values(TABLE_KINDS).map((kind) => kind.key);
const DATA_TABLES = Object.keys(TABLE_KINDS);

/* "colaboradores_ro" → { base: "colaboradores", estado: "RO" } */
function splitTable(tabela) {
  const i = tabela.lastIndexOf("_");
  return i > 0
    ? { base: tabela.slice(0, i), estado: tabela.slice(i + 1).toUpperCase() }
    : { base: tabela, estado: "" };
}

function emptyPayload() {
  return {
    entries: {},
    employees: [],
    vacancies: [],
    turnovers: [],
    permanencias: [],
    headcounts: [],
    branches: [],
    departments: []
  };
}

function statesOf(state) {
  return state === "todos" ? STATES.slice() : [state || DEFAULT_STATE];
}

/* Coloca uma linha do banco no payload do store. Devolve a data do
   lançamento (usada para saber até onde o histórico está carregado) ou null. */
function addRowToPayload(payload, tabela, row, estado) {
  const { base } = splitTable(tabela);
  if (base === "lancamentos") {
    const indicator = row.indicador_id || "headcount";
    if (!payload.entries[indicator]) payload.entries[indicator] = [];
    payload.entries[indicator].push(entryFromRow(row));
    return row.data || null;
  }
  const kind = TABLE_KINDS[base];
  if (kind) payload[kind.key].push(kind.map(row, estado));
  return null;
}

function sortEntries(entries) {
  Object.keys(entries).forEach((k) => entries[k].sort((a, b) => compareDateAsc(a.date, b.date)));
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
/* Páginas de lançamentos buscadas em paralelo (limitado para não abrir dezenas
   de conexões ao banco de uma vez). */
const LANCAMENTOS_PAGE_CONCURRENCY = 4;
const _coveredSince = {};

/* Marcado quando o navegador recusa uma gravação do cache local (cota cheia):
   o cache fica incompleto e não pode receber a versão do delta. */
let _cacheDirty = false;

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

/* Executa `fn` sobre os itens com no máximo `limit` chamadas simultâneas,
   preservando a ordem dos resultados. */
async function mapLimit(items, limit, fn) {
  const results = new Array(items.length);
  let next = 0;
  const worker = async () => {
    while (next < items.length) {
      const i = next++;
      results[i] = await fn(items[i]);
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}

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

/* Pagina a rota REST de lançamentos (limite 500/página) até completar o
   intervalo pedido. `dataAte` opcional (sem teto = até hoje). A primeira
   página revela o total de páginas; as demais são buscadas em paralelo. */
async function fetchLancamentosRange(state, dataDe, dataAte) {
  const suffix = state.toLowerCase();
  const fetchPage = (page) => {
    const params = new URLSearchParams({ limit: String(LANCAMENTOS_PAGE_LIMIT), page: String(page) });
    if (dataDe) params.set("data_de", dataDe);
    if (dataAte) params.set("data_ate", dataAte);
    return apiFetch(`/api/lancamentos/${suffix}?${params.toString()}`);
  };

  const first = await fetchPage(1);
  const rows = [...((first && first.data) || [])];
  const totalPages = (first && first.pagination && first.pagination.totalPages) || 0;
  if (totalPages > 1) {
    const pages = Array.from({ length: totalPages - 1 }, (_, i) => i + 2);
    const rest = await mapLimit(pages, LANCAMENTOS_PAGE_CONCURRENCY, fetchPage);
    rest.forEach((res) => rows.push(...((res && res.data) || [])));
  }

  /* Confere a integridade: com uma ordenação não determinística no servidor
     (empates de data/criado_em de uma importação em lote), páginas diferentes
     podem repetir ou pular linhas — e os totais dos KPIs (ex.: horas de
     Treinamento) ficam errados sem nenhum aviso. Quantidade de ids distintos
     diferente do total informado = carga incompleta; quem chama refaz pelo
     download completo (não paginado). */
  const expected = first && first.pagination && first.pagination.total;
  if (Number.isFinite(expected) && new Set(rows.map((r) => r.id)).size !== expected) {
    throw new Error(`Paginação de lançamentos incompleta (${state}): esperado ${expected} registro(s).`);
  }
  return rows;
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
  const targets = statesOf(next).filter((s) => {
    if (!_loadedStates[s]) return false;
    const covered = _coveredSince[s];
    if (covered === null || covered === undefined) return false;
    return neededStartISO < covered;
  });
  if (!targets.length) return;

  const epoch = _epoch;
  beginLoading("Carregando período anterior...");
  try {
    await Promise.all(
      targets.map(async (s) => {
        const suffix = s.toLowerCase();
        const dataAte = shiftDayISO(_coveredSince[s], -1);
        try {
          const rows = await fetchLancamentosRange(s, neededStartISO, dataAte);
          if (epoch !== _epoch) return;
          persistRows(`lancamentos_${suffix}`, rows);
          mergeFromRemote({ entries: mapRemoteEntries(rows) });
          _coveredSince[s] = neededStartISO;
        } catch (err) {
          console.error(`[API] Falha ao estender o período carregado de ${s}, baixando tudo:`, err);
          /* Mesmo caminho da carga inicial (ver fetchLancamentosInitial): sem a
             paginação, cai para o download completo — que já traz todo o
             histórico, então o estado deixa de precisar de novas extensões. */
          try {
            const full = await apiFetch(`/api/data/lancamentos_${suffix}`);
            if (epoch !== _epoch) return;
            const rows = (full && full.data) || [];
            persistRows(`lancamentos_${suffix}`, rows);
            mergeFromRemote({ entries: mapRemoteEntries(rows) });
            _coveredSince[s] = null;
          } catch (fallbackErr) {
            console.error(`[API] Falha ao baixar os lançamentos de ${s}:`, fallbackErr);
          }
        }
      })
    );
    if (_cacheDirty) {
      DataCache.resetAll();
      _cacheDirty = false;
    }
  } finally {
    endLoading();
  }
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

/* Uma única descida por estado por vez: vários componentes (modais, filtros,
   a própria tela) pedem o mesmo estado ao mesmo tempo, e cada pedido repetia
   o download completo. */
const _stateInflight = new Map();

function hydrateOneState(s) {
  let promise = _stateInflight.get(s);
  if (!promise) {
    promise = loadStateFromApi(s).finally(() => _stateInflight.delete(s));
    _stateInflight.set(s, promise);
  }
  return promise;
}

/* Baixa e grava em cache as 8 tabelas de um único estado. Cada estado é
   isolado dos demais (ver _hydrateStates): a falha de um (ex.: timeout numa
   consulta grande) não impede os outros de serem carregados e marcados. */
async function loadStateFromApi(s) {
  const epoch = _epoch;
  const suffix = s.toLowerCase();
  const fetchTable = async (name) => {
    try {
      return await apiFetch(`/api/data/${name}`);
    } catch (err) {
      console.error(`[API] Erro ao consultar ${name}:`, err);
      return { error: err };
    }
  };
  const [lan, ...others] = await Promise.all([
    fetchLancamentosInitial(s, suffix),
    ...DATA_TABLES.map((base) => fetchTable(`${base}_${suffix}`))
  ]);

  // Logout/login durante o download: descarta em vez de misturar sessões.
  if (epoch !== _epoch) return false;

  const errored = [lan, ...others].filter((res) => res && res.error);
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
  const payload = emptyPayload();
  payload.entries = mapRemoteEntries(rowsLan);

  let persisted = persistRows(`lancamentos_${suffix}`, rowsLan);
  DATA_TABLES.forEach((base, i) => {
    const rows = rowsOf(others[i]);
    if (persisted) persisted = persistRows(`${base}_${suffix}`, rows);
    const kind = TABLE_KINDS[base];
    payload[kind.key] = rows.map((row) => kind.map(row, s));
  });

  mergeFromRemote(payload);
  _loadedStates[s] = true;
  return true;
}

/* Carrega os estados pendentes em paralelo (antes era um for-of sequencial
   com await, que somava a latência de cada estado em vez de correr junto —
   a causa principal da demora ao entrar com o filtro em "todos", que carrega
   RO+AM+PA de uma vez). */
async function _hydrateStates(states) {
  const pending = states.filter((s) => !_loadedStates[s]);
  if (!pending.length) return true;

  /* A versão do delta é lida ANTES do download: o que mudar durante o
     download volta no próximo delta (reaplicar é idempotente). Lida depois,
     uma alteração feita nesse intervalo ficava para sempre fora do cache. */
  const versionBefore = await deltaVersao();
  const results = await Promise.all(pending.map((s) => hydrateOneState(s)));
  const loaded = pending.filter((_, i) => results[i]);

  if (loaded.length) {
    if (_cacheDirty) {
      // Cache incompleto (cota cheia): descarta tudo — o próximo boot baixa de novo.
      DataCache.resetAll();
      _cacheDirty = false;
    } else if (versionBefore) {
      /* Se outros estados já estavam em memória, a versão gravada por eles
         (mais antiga) é mantida: avançá-la esconderia deles as alterações
         intermediárias. */
      const othersLoaded = STATES.some((s) => _loadedStates[s] && !pending.includes(s));
      if (!othersLoaded || !DataCache.getVersion()) DataCache.setVersion(versionBefore);
    }
    console.info(`[API] Dados carregados: ${loaded.join(", ")}.`);
  }
  return results.every(Boolean);
}

function keyTable(key) {
  return key.slice("ggd:".length).split(":")[0] || "";
}

/* Chaves do cache local que pertencem a um estado (sufixo "ro"/"am"/"pa"). */
function stateCachedKeys(suffix) {
  return DataCache.keys().filter((key) => {
    const { base, estado } = splitTable(keyTable(key));
    return estado.toLowerCase() === suffix && (base === "lancamentos" || base in TABLE_KINDS);
  });
}

/* Remove do cache local tudo de um estado, para que ele seja baixado por
   inteiro na próxima vez (nunca fica um cache "meio atualizado"). */
function dropStateCache(estado) {
  stateCachedKeys(estado.toLowerCase()).forEach((key) => DataCache.removeKey(key));
}

/* Tira da memória os dados de um estado — usado antes de rebaixá-lo por
   inteiro, já que o merge por id manteria as linhas velhas/excluídas. */
function dropStateFromMemory(estado) {
  const data = useData();
  KIND_KEYS.forEach((key) => {
    data[key] = data[key].filter((item) => !sameState(item.estado, estado));
  });
  /* Lançamento sem estado no meta é gravado na tabela padrão (RO) — ver
     stateTable/entryAdded. */
  Object.keys(data.entries).forEach((indicator) => {
    data.entries[indicator] = data.entries[indicator].filter((e) => {
      const st = e.meta && e.meta.estado;
      return !(st ? sameState(st, estado) : estado === DEFAULT_STATE);
    });
  });
}

/* Reconstrói em memória (merge, sem apagar o resto) o estado a partir das
   chaves do sessionStorage. Reusa os mesmos mapeamentos do download.
   Também recalcula `_coveredSince[state]` a partir da data mais antiga
   presente no cache — necessário porque esse controle vive só em memória e
   se perde a cada F5, mas o cache local (sessionStorage) sobrevive. */
function mergeStateFromCache(state) {
  const payload = emptyPayload();
  let minLancamentoDate = null;
  stateCachedKeys(state.toLowerCase()).forEach((key) => {
    const item = DataCache.readItem(key);
    if (!item || !item.id) return;
    const date = addRowToPayload(payload, keyTable(key), item, state);
    if (date && (!minLancamentoDate || date < minLancamentoDate)) minLancamentoDate = date;
  });
  sortEntries(payload.entries);
  mergeFromRemote(payload);
  /* Sem nenhum lançamento em cache ainda: assume a janela padrão como
     coberta (seguro — no pior caso dispara uma busca extra depois). */
  _coveredSince[state] = minLancamentoDate || isoMonthsAgo(LANCAMENTOS_WINDOW_MONTHS);
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

async function _hydrateState(pending) {
  // Limpa (uma vez) resíduos de PII de versões antigas gravados em localStorage.
  DataCache.removeLegacy();

  const versao = DataCache.getVersion();
  if (versao > 0 && pending.every((s) => stateCachedKeys(s.toLowerCase()).length > 0)) {
    pending.forEach((s) => {
      mergeStateFromCache(s);
      _loadedStates[s] = true;
    });

    const delta = await fetchDelta(versao);
    if (delta) {
      if (delta.changes.length && applyDelta(delta.changes)) DataCache.setVersion(delta.versaoAtual);
      console.info(`[API] Estados restaurados do cache local: ${pending.join(", ")}.`);
      return true;
    }

    // Delta indisponível: recarrega por completo para não exibir dados velhos
    // (e tira da memória o que veio do cache, senão o merge por id o preservaria).
    pending.forEach((s) => {
      delete _loadedStates[s];
      delete _coveredSince[s];
      dropStateFromMemory(s);
      dropStateCache(s);
    });
  }

  return _hydrateStates(pending);
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

/* Aplica um delta de uma vez. Só o resultado líquido de cada registro conta
   (o último vence), remoções e inserções são feitas em lote (uma passada por
   lista) e cada indicador é reordenado uma única vez — a versão anterior
   varria e reordenava as listas inteiras a cada alteração.
   Alterações de estados que NÃO estão em memória são ignoradas e o cache
   local desses estados é descartado: eles serão baixados por inteiro quando
   forem pedidos. (Antes o delta marcava o estado como "carregado" só por
   citá-lo, e ele ficava com apenas os poucos registros alterados.)
   Devolve false se o cache local recusou alguma gravação — nesse caso o cache
   já foi descartado e a versão NÃO deve ser gravada. */
function applyDelta(changes) {
  const net = new Map();
  (changes || []).forEach((c) => {
    if (c && c.tabela) net.set(`${c.tabela}:${c.registro_id}`, c);
  });

  const removals = new Map(); // tabela → Set(ids)
  const upserts = new Map(); // tabela → [linhas]
  const skippedStates = new Set();
  let cacheOk = true;

  net.forEach((c) => {
    const { estado } = splitTable(c.tabela);
    if (!_loadedStates[estado]) {
      skippedStates.add(estado);
      return;
    }
    if (c.operacao === "delete") {
      DataCache.removeItem(c.tabela, c.registro_id);
      if (!removals.has(c.tabela)) removals.set(c.tabela, new Set());
      removals.get(c.tabela).add(c.registro_id);
    } else if (c.operacao === "upsert" && c.dados) {
      if (cacheOk && !DataCache.setItem(c.tabela, c.registro_id, c.dados)) cacheOk = false;
      if (!upserts.has(c.tabela)) upserts.set(c.tabela, []);
      upserts.get(c.tabela).push(c.dados);
    }
  });

  skippedStates.forEach((estado) => {
    if (estado) dropStateCache(estado);
  });

  const data = useData();

  removals.forEach((ids, tabela) => {
    const { base } = splitTable(tabela);
    if (base === "lancamentos") {
      Object.keys(data.entries).forEach((indicator) => {
        const list = data.entries[indicator];
        if (list.some((e) => ids.has(e.id))) {
          data.entries[indicator] = list.filter((e) => !ids.has(e.id));
        }
      });
    } else if (TABLE_KINDS[base]) {
      const key = TABLE_KINDS[base].key;
      data[key] = data[key].filter((item) => !ids.has(item.id));
    }
  });

  const touchedIndicators = new Set();
  upserts.forEach((rows, tabela) => {
    const { base, estado } = splitTable(tabela);
    if (base === "lancamentos") {
      const byIndicator = new Map();
      rows.forEach((row) => {
        const indicator = row.indicador_id || "headcount";
        if (!byIndicator.has(indicator)) byIndicator.set(indicator, []);
        byIndicator.get(indicator).push(entryFromRow(row));
      });
      byIndicator.forEach((items, indicator) => {
        if (!data.entries[indicator]) data.entries[indicator] = [];
        upsertManyInList(data.entries[indicator], items);
        touchedIndicators.add(indicator);
      });
    } else if (TABLE_KINDS[base]) {
      const { key, map } = TABLE_KINDS[base];
      upsertManyInList(
        data[key],
        rows.map((row) => map(row, estado))
      );
    }
  });
  touchedIndicators.forEach((indicator) => {
    data.entries[indicator].sort((a, b) => compareDateAsc(a.date, b.date));
  });

  if (!cacheOk) DataCache.resetAll();
  return cacheOk;
}

function loadLocalIntoMemory() {
  const keys = DataCache.keys();
  if (!keys.length) return false;

  const payload = emptyPayload();
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
    const { estado } = splitTable(tabela);
    const date = addRowToPayload(payload, tabela, item, estado);
    if (date && (!minLancamentoByState[estado] || date < minLancamentoByState[estado])) {
      minLancamentoByState[estado] = date;
    }
  });

  sortEntries(payload.entries);
  replaceFromCache(payload);

  clearLoadedTracking();
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

function clearLoadedTracking() {
  Object.keys(_loadedStates).forEach((k) => delete _loadedStates[k]);
  Object.keys(_coveredSince).forEach((k) => delete _coveredSince[k]);
}

/* Boot com Delta Sync:
   1) reconstrói a memória a partir do sessionStorage (renderização rápida);
   2) se não houver cache utilizável -> download completo + semeadura item a item;
   3) se houver cache -> pede apenas os itens alterados/deletados desde a
      última versão e aplica via setItem/removeItem. */
export async function hydrateWithDelta(state) {
  DataCache.removeLegacy();

  const hasLocal = loadLocalIntoMemory();
  const versao = DataCache.getVersion();

  /* Sem cache — ou com itens mas sem versão (a versão não chegou a ser
     gravada): não há ponto de partida confiável para o delta (pedir a partir
     da versão 0 traria o changelog inteiro). Baixa tudo. */
  if (!hasLocal || versao <= 0) {
    console.info("[API] Sem cache utilizável — baixando dados completos.");
    if (hasLocal) {
      DataCache.resetAll();
      resetData();
    }
    clearLoadedTracking();
    return await hydrate(state);
  }
  console.info("[API] Cache local restaurado do sessionStorage.");

  const delta = await fetchDelta(versao);
  if (!delta) {
    console.info("[API] Delta indisponível — baixando dados completos (fallback).");
    DataCache.resetAll();
    clearLoadedTracking();
    resetData();
    return await hydrate(state);
  }

  if (delta.versaoAtual <= versao || !delta.changes.length) {
    console.info(`[API] Sem alterações (versão ${versao}) — usando cache local.`);
    return true;
  }

  console.info(`[API] Delta sync: ${delta.changes.length} alteração(ões) desde a versão ${versao}.`);
  if (applyDelta(delta.changes)) DataCache.setVersion(delta.versaoAtual);
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
