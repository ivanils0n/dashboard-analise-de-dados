/* Store de dados reativa (Vue 3): fonte consumida pela UI, espelhada na API
   (Google Sheets) via adaptador "remote" (write-through em lote com debounce). */
import { reactive } from "vue";
import { createId, compareDateAsc } from "./utils";

export function emptyData() {
  return {
    version: 1,
    vacancies: [],
    turnovers: [],
    permanencias: [],
    // Aba "rescisoes": alimentada direto na planilha, só leitura no app.
    rescisoes: [],
    headcounts: [],
    branches: [],
    // Substituem a antiga tabela genérica "lancamentos" (indicador_id + meta
    // json): cada indicador manual (Diária, Treinamento, Custo de folha,
    // Absenteísmo) agora tem lista própria, no mesmo padrão das acima.
    diarias: [],
    treinamentos: [],
    custoFolha: [],
    absenteismo: [],
    // Marcação de "mês incompleto" (ver lib/monthStatus.js) — mesmo padrão.
    mesesIncompletos: []
  };
}

const data = reactive(emptyData());

/* Acesso reativo aos dados por qualquer componente */
export function useData() {
  return data;
}

/* Adaptador de escrita na API (registrado pelo db.js) */
let remote = null;

export function bindRemote(adapter) {
  remote = adapter;
}

const ok = () => remote != null;

/* indicador_id (usado pelos formulários desde a época da tabela genérica
   "lancamentos") -> lista dedicada no store. Mantém a API pública de sempre
   (getEntriesFor/addEntry/... com Entry = {id, date, value, meta}) para que
   metrics.js, useDashboardData.js e os modais de indicador não precisem
   saber que a origem do dado mudou de um dicionário genérico pra 4 tabelas. */
const ENTRY_LISTS = {
  custo_diaria: "diarias",
  treinamento: "treinamentos",
  custo_total: "custoFolha",
  absenteismo: "absenteismo",
  mes_incompleto: "mesesIncompletos"
};

function entryList(indicatorId) {
  const key = ENTRY_LISTS[indicatorId];
  if (!key) throw new Error(`Indicador de lançamento desconhecido: "${indicatorId}".`);
  return key;
}

// "mes_incompleto" (ver lib/monthStatus.js) usa o mesmo mecanismo de
// lançamento, mas não é um indicador de verdade — não deve aparecer em
// getAllEntries() (tabela de lançamentos, exportação).
const PUBLIC_ENTRY_INDICATORS = ["custo_diaria", "treinamento", "custo_total", "absenteismo"];

export function getAllEntries() {
  const all = {};
  PUBLIC_ENTRY_INDICATORS.forEach((indicatorId) => {
    all[indicatorId] = data[ENTRY_LISTS[indicatorId]];
  });
  return all;
}

export function getEntriesFor(indicatorId, state) {
  // Tolerante a indicadores sem lançamento próprio (ex.: "headcount",
  // "turnover" — calculados, não vêm de uma lista de entries): o dashboard
  // chama isso genericamente para TODO indicador em INDICATORS, esperando
  // lista vazia de volta, não uma exceção. Só addEntry/updateEntry/... (a
  // escrita) devem falhar alto num indicatorId desconhecido — ver entryList.
  const key = ENTRY_LISTS[indicatorId];
  if (!key) return [];
  let list = (data[key] || []).slice().sort((a, b) => compareDateAsc(a.date, b.date));
  if (state && state !== "todos") {
    const target = String(state).trim().toUpperCase();
    list = list.filter(
      (e) => String((e.meta && e.meta.estado) || "").trim().toUpperCase() === target
    );
  }
  return list;
}

function _withState(meta, state) {
  const base = meta ? { ...meta } : {};
  if (state && state !== "todos") base.estado = state;
  else delete base.estado;
  return Object.keys(base).length ? base : null;
}

export function addEntry(indicatorId, { date, value, meta, state }) {
  const key = entryList(indicatorId);
  const entry = { id: createId(), date, value: Number(value), meta: _withState(meta, state) };
  data[key].push(entry);
  data[key].sort((a, b) => compareDateAsc(a.date, b.date));
  if (ok()) remote.entryAdded(indicatorId, entry);
}

export function removeEntry(indicatorId, entryId) {
  const key = entryList(indicatorId);
  const entry = data[key].find((e) => e.id === entryId);
  data[key] = data[key].filter((e) => e.id !== entryId);
  const estado = entry && entry.meta ? entry.meta.estado : null;
  if (entry && ok()) remote.entriesRemoved(indicatorId, [entryId], estado);
}

/* `patch.state` funciona como em addEntry: vira `meta.estado` (os formulários
   montam o payload igual para criar e editar). Sem essa conversão a edição
   descartava o estado do lançamento e ele sumia dos filtros por estado.
   Sem `state` no patch, o meta segue como veio. */
export function updateEntry(indicatorId, entryId, patch) {
  const key = entryList(indicatorId);
  const idx = data[key].findIndex((e) => e.id === entryId);
  if (idx < 0) return;
  const previous = data[key][idx];
  const { state, ...fields } = patch;
  const updated = { ...previous, ...fields };
  if ("state" in patch) {
    updated.meta = _withState(fields.meta !== undefined ? fields.meta : previous.meta, state);
  }
  data[key][idx] = updated;
  data[key].sort((a, b) => compareDateAsc(a.date, b.date));
  if (!ok()) return;
  /* Mudar de estado muda de tabela no servidor: remove a linha da antiga (se
     for a mesma tabela, o upsert abaixo substitui a exclusão na fila). O envio
     usa `updated` — após o sort, `idx` já pode apontar para outro lançamento. */
  const prevEstado = (previous.meta && previous.meta.estado) || null;
  const nextEstado = (updated.meta && updated.meta.estado) || null;
  if (prevEstado !== nextEstado) remote.entriesRemoved(indicatorId, [entryId], prevEstado);
  remote.entryUpdated(indicatorId, updated);
}

/* Exclusão em lote de lançamentos. `rows` é um array de
   { indicatorId, entry }. Remove todos de uma vez e enfileira as exclusões
   remotas agrupadas por (indicatorId, estado) — cada indicador tem sua
   própria tabela física, então o agrupamento não pode ser só por estado. */
export function removeEntries(rows) {
  if (!rows || !rows.length) return;
  const removable = rows.filter(({ indicatorId, entry }) => {
    const key = ENTRY_LISTS[indicatorId];
    if (!key) return false;
    return data[key].some((e) => e.id === entry.id);
  });
  if (!removable.length) return;

  const groups = new Map();
  removable.forEach(({ indicatorId, entry }) => {
    const estado = entry.meta && entry.meta.estado ? entry.meta.estado : "__none__";
    const groupKey = `${indicatorId}::${estado}`;
    if (!groups.has(groupKey)) groups.set(groupKey, { indicatorId, estado, ids: [] });
    groups.get(groupKey).ids.push(entry.id);
  });

  groups.forEach(({ indicatorId, estado, ids }) => {
    if (ok()) remote.entriesRemoved(indicatorId, ids, estado === "__none__" ? null : estado);
  });

  removable.forEach(({ indicatorId, entry }) => {
    const key = entryList(indicatorId);
    data[key] = data[key].filter((e) => e.id !== entry.id);
  });
}

export function getVacancies() {
  return data.vacancies;
}

export function upsertVacancy(vacancy) {
  const idx = data.vacancies.findIndex((v) => v.id === vacancy.id);
  if (idx >= 0) data.vacancies[idx] = vacancy;
  else data.vacancies.push(vacancy);
  if (ok()) remote.vacancySaved(vacancy);
}

export function deleteVacancy(id) {
  const v = data.vacancies.find((x) => x.id === id);
  data.vacancies = data.vacancies.filter((x) => x.id !== id);
  if (ok()) remote.vacancyRemoved(id, v ? v.estado : null);
}

export function getVacancyById(id) {
  return getVacancies().find((v) => v.id === id) || null;
}

export function getTurnovers() {
  return data.turnovers;
}

export function upsertTurnover(turnover) {
  const idx = data.turnovers.findIndex((t) => t.id === turnover.id);
  if (idx >= 0) data.turnovers[idx] = turnover;
  else data.turnovers.push(turnover);
  if (ok()) remote.turnoverSaved(turnover);
}

export function deleteTurnover(id) {
  const t = data.turnovers.find((x) => x.id === id);
  data.turnovers = data.turnovers.filter((x) => x.id !== id);
  if (ok()) remote.turnoverRemoved(id, t ? t.estado : null);
}

export function getTurnoverById(id) {
  return getTurnovers().find((t) => t.id === id) || null;
}

export function getPermanencias() {
  return data.permanencias;
}

export function upsertPermanencia(record) {
  const idx = data.permanencias.findIndex((p) => p.id === record.id);
  if (idx >= 0) data.permanencias[idx] = record;
  else data.permanencias.push(record);
  if (ok()) remote.permanenciaSaved(record);
}

export function deletePermanencia(id) {
  const p = data.permanencias.find((x) => x.id === id);
  data.permanencias = data.permanencias.filter((x) => x.id !== id);
  if (ok()) remote.permanenciaRemoved(id, p ? p.estado : null);
}

export function getPermanenciaById(id) {
  return getPermanencias().find((p) => p.id === id) || null;
}

export function getRescisoes() {
  return data.rescisoes;
}

export function getHeadcounts() {
  return data.headcounts;
}

export function upsertHeadcount(record) {
  const idx = data.headcounts.findIndex((h) => h.id === record.id);
  if (idx >= 0) data.headcounts[idx] = record;
  else data.headcounts.push(record);
  if (ok()) remote.headcountSaved(record);
}

export function deleteHeadcount(id) {
  const h = data.headcounts.find((x) => x.id === id);
  data.headcounts = data.headcounts.filter((x) => x.id !== id);
  if (ok()) remote.headcountRemoved(id, h ? h.estado : null);
}

export function getHeadcountById(id) {
  return getHeadcounts().find((h) => h.id === id) || null;
}

export function getBranches() {
  return data.branches;
}

export function upsertBranch(branch) {
  const idx = data.branches.findIndex((b) => b.id === branch.id);
  if (idx >= 0) data.branches[idx] = branch;
  else data.branches.push(branch);
  if (ok()) remote.branchSaved(branch);
}

export function deleteBranch(id) {
  const branch = data.branches.find((b) => b.id === id);
  data.branches = data.branches.filter((b) => b.id !== id);
  if (ok()) remote.branchRemoved(id, branch ? branch.estado : null);
}

export function getBranchById(id) {
  return getBranches().find((b) => b.id === id) || null;
}

export function resetData() {
  Object.assign(data, emptyData());
}

export function replaceFromCache(cached) {
  const d = emptyData();
  if (cached && typeof cached === "object") {
    d.vacancies = Array.isArray(cached.vacancies) ? cached.vacancies : [];
    d.turnovers = Array.isArray(cached.turnovers) ? cached.turnovers : [];
    d.permanencias = Array.isArray(cached.permanencias) ? cached.permanencias : [];
    d.rescisoes = Array.isArray(cached.rescisoes) ? cached.rescisoes : [];
    d.headcounts = Array.isArray(cached.headcounts) ? cached.headcounts : [];
    d.branches = Array.isArray(cached.branches) ? cached.branches : [];
    d.diarias = Array.isArray(cached.diarias) ? cached.diarias : [];
    d.treinamentos = Array.isArray(cached.treinamentos) ? cached.treinamentos : [];
    d.custoFolha = Array.isArray(cached.custoFolha) ? cached.custoFolha : [];
    d.absenteismo = Array.isArray(cached.absenteismo) ? cached.absenteismo : [];
    d.mesesIncompletos = Array.isArray(cached.mesesIncompletos) ? cached.mesesIncompletos : [];
  }
  Object.assign(data, d);
}

/* Junta itens novos a uma lista sem duplicar ids. Usa um Set dos ids já
   presentes (O(n)) — a versão anterior fazia `some` para cada item, ou seja
   O(n²), o que travava a tela na carga inicial de históricos grandes. Devolve
   a lista resultante (nova), ou null quando nada foi acrescentado. */
function mergeNewItems(current, incoming) {
  if (!incoming || !incoming.length) return null;
  const known = new Set(current.map((x) => x.id));
  const fresh = [];
  incoming.forEach((item) => {
    if (known.has(item.id)) return;
    known.add(item.id);
    fresh.push({ ...item });
  });
  return fresh.length ? current.concat(fresh) : null;
}

const MERGE_LIST_KEYS = [
  "vacancies",
  "turnovers",
  "permanencias",
  "rescisoes",
  "headcounts",
  "branches",
  "diarias",
  "treinamentos",
  "custoFolha",
  "absenteismo",
  "mesesIncompletos"
];

export function mergeFromRemote(remoteData) {
  MERGE_LIST_KEYS.forEach((key) => {
    const merged = mergeNewItems(data[key], remoteData[key]);
    if (merged) data[key] = merged;
  });
}

