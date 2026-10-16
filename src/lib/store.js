import { reactive, shallowReactive, toRaw, markRaw } from "vue";
import { createId, compareDateAsc, nameKey } from "./utils";

function emptyData() {
  return {
    version: 1,
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

const data = reactive(emptyData());

const listRevs = shallowReactive({});
const bumpList = (key) => {
  listRevs[key] = (listRevs[key] || 0) + 1;
};

const sortedMemo = new Map();

function memoList(memoKey, key, build) {
  const list = data[key] || [];
  const rev = listRevs[key] || 0;
  const src = toRaw(list);
  const hit = sortedMemo.get(memoKey);
  if (hit && hit.src === src && hit.rev === rev) return hit.list.slice();
  const built = build(list);
  sortedMemo.set(memoKey, { src, rev, list: built });
  return built.slice();
}

const byDateAsc = (list) => list.slice().sort((a, b) => compareDateAsc(a.date, b.date));

function filterByEstado(list, state) {
  if (!state || state === "todos") return list;
  const target = String(state).trim().toUpperCase();
  return list.filter((e) => String((e.meta && e.meta.estado) || "").trim().toUpperCase() === target);
}

export function useData() {
  return data;
}

let remote = null;

export function bindRemote(adapter) {
  remote = adapter;
}

const ok = () => remote != null;

const ENTRY_LISTS = {
  custo_diaria: "diarias",
  treinamento: "treinamentos",
  custo_total: "custoFolha",
  ferias: "ferias",
  absenteismo: "absenteismo"
};

function entryList(indicatorId) {
  const key = ENTRY_LISTS[indicatorId];
  if (!key) throw new Error(`Indicador de lançamento desconhecido: "${indicatorId}".`);
  return key;
}

const isOcorrencia = (e) => !!(e.meta && e.meta.colaborador);

export function getEntriesFor(indicatorId, state) {
  // chama isso genericamente para TODO indicador em INDICATORS, esperando
  const key = ENTRY_LISTS[indicatorId];
  if (!key) return [];
  return memoList(`${indicatorId}|${state || ""}`, key, (list) => {
    let out = byDateAsc(list);
    if (indicatorId === "absenteismo") out = out.filter((e) => !isOcorrencia(e));
    return filterByEstado(out, state);
  });
}

export function getBeneficios(state) {
  return memoList(`beneficios|${state || ""}`, "beneficios", (list) => filterByEstado(byDateAsc(list), state));
}

function _withState(meta, state) {
  const base = meta ? { ...meta } : {};
  if (state && state !== "todos") base.estado = state;
  else delete base.estado;
  return Object.keys(base).length ? base : null;
}

export function addEntry(indicatorId, { date, value, meta, state }) {
  const key = entryList(indicatorId);
  const entry = markRaw({ id: createId(), date, value: Number(value), meta: _withState(meta, state) });
  data[key].push(entry);
  data[key].sort((a, b) => compareDateAsc(a.date, b.date));
  bumpList(key);
  if (ok()) remote.entryAdded(indicatorId, entry);
}

export function updateEntry(indicatorId, entryId, patch) {
  const key = entryList(indicatorId);
  const idx = data[key].findIndex((e) => e.id === entryId);
  if (idx < 0) return;
  const previous = data[key][idx];
  const { state, ...fields } = patch;
  const updated = markRaw({ ...previous, ...fields });
  if ("state" in patch) {
    updated.meta = _withState(fields.meta !== undefined ? fields.meta : previous.meta, state);
  }
  data[key][idx] = updated;
  data[key].sort((a, b) => compareDateAsc(a.date, b.date));
  bumpList(key);
  if (!ok()) return;
  remote.entryUpdated(indicatorId, updated);
}

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

export function getOcorrencias() {
  return data.absenteismo.filter(isOcorrencia);
}

// Não agrupar por colaborador+data: a planilha pode ter linhas repetidas e todas contam nos KPIs.
const _matchOcorrencias = (date, colaborador) =>
  data.absenteismo.filter((e) => isOcorrencia(e) && e.date === date && nameKey(e.meta.colaborador) === nameKey(colaborador));

export function saveOcorrencia({ date, colaborador, codigo, setor, filial, motivo, observacao, estado, advertencia, acidente, cid, diasAtestado, tipoAcidente, aberturaCat }) {
  const matches = _matchOcorrencias(date, colaborador);
  const meta = {
    colaborador,
    codigo: codigo || null,
    setor: setor || null,
    filial: filial || null,
    motivo,
    observacao: observacao || null,
    estado: estado || null,
    competencia: String(date).slice(0, 7),
    advertencia: !!advertencia,
    acidente: !!acidente,
    cid: cid || null,
    diasAtestado: diasAtestado ?? null,
    tipoAcidente: tipoAcidente || null,
    aberturaCat: !!aberturaCat
  };
  if (matches.length) {
    let updated = null;
    matches.forEach((existing) => {
      updated = markRaw({ ...existing, meta });
      data.absenteismo[data.absenteismo.indexOf(existing)] = updated;
      if (ok()) remote.entryUpdated("absenteismo", updated);
    });
    bumpList("absenteismo");
    return updated;
  }
  const entry = markRaw({ id: createId(), date, value: 0, meta });
  data.absenteismo.push(entry);
  bumpList("absenteismo");
  if (ok()) remote.entryAdded("absenteismo", entry);
  return entry;
}

export function preencherOcorrencias(employees, ym) {
  const byName = new Map(employees.map((emp) => [emp.key, emp]));
  let filled = 0;
  data.absenteismo.forEach((e, idx) => {
    if (!isOcorrencia(e) || competenciaYmOf(e) !== ym) return;
    const emp = byName.get(nameKey(e.meta.colaborador));
    if (!emp) return;
    const patch = {};
    if (!e.meta.codigo && emp.codigo) patch.codigo = emp.codigo;
    if (!e.meta.setor && emp.setor) patch.setor = emp.setor;
    if (!e.meta.filial && emp.filial) patch.filial = emp.filial;
    if (!e.meta.estado && emp.estado) patch.estado = emp.estado;
    if (!Object.keys(patch).length) return;
    const updated = markRaw({ ...e, meta: { ...e.meta, ...patch } });
    data.absenteismo[idx] = updated;
    if (ok()) remote.entryUpdated("absenteismo", updated);
    filled++;
  });
  if (filled) bumpList("absenteismo");
  return filled;
}

const competenciaYmOf = (e) => (e.meta && e.meta.competencia) || String(e.date || "").slice(0, 7);

export function removeOcorrencia(date, colaborador) {
  const matches = _matchOcorrencias(date, colaborador);
  if (!matches.length) return;
  data.absenteismo = data.absenteismo.filter((e) => !matches.includes(e));
  if (ok()) {
    matches.forEach((existing) =>
      remote.entriesRemoved("absenteismo", [existing.id], existing.meta.estado, {
        [existing.id]: { date: existing.date, colaborador }
      })
    );
  }
}

export function getVacancies() {
  return data.vacancies;
}

export function upsertVacancy(vacancy) {
  markRaw(vacancy);
  const idx = data.vacancies.findIndex((v) => v.id === vacancy.id);
  if (idx >= 0) data.vacancies[idx] = vacancy;
  else data.vacancies.push(vacancy);
  if (ok()) remote.vacancySaved(vacancy, idx < 0);
}

export function deleteVacancy(id) {
  const v = data.vacancies.find((x) => x.id === id);
  data.vacancies = data.vacancies.filter((x) => x.id !== id);
  if (ok()) remote.vacancyRemoved(id, v ? v.estado : null);
}

export function getVacancyById(id) {
  return getVacancies().find((v) => v.id === id) || null;
}

export function getRescisoes() {
  return data.rescisoes;
}

export function getHeadcounts() {
  return data.headcounts;
}

export function upsertHeadcount(record) {
  markRaw(record);
  const idx = data.headcounts.findIndex((h) => h.id === record.id);
  if (idx >= 0) data.headcounts[idx] = record;
  else data.headcounts.push(record);
  if (ok()) remote.headcountSaved(record, idx < 0);
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
  markRaw(branch);
  const idx = data.branches.findIndex((b) => b.id === branch.id);
  if (idx >= 0) data.branches[idx] = branch;
  else data.branches.push(branch);
  if (ok()) remote.branchSaved(branch, idx < 0);
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
  const rawList = (list) => (Array.isArray(list) ? list.map((item) => markRaw(item)) : []);
  if (cached && typeof cached === "object") {
    d.vacancies = rawList(cached.vacancies);
    d.rescisoes = rawList(cached.rescisoes);
    d.headcounts = rawList(cached.headcounts);
    d.branches = rawList(cached.branches);
    d.diarias = rawList(cached.diarias);
    d.treinamentos = rawList(cached.treinamentos);
    d.custoFolha = rawList(cached.custoFolha);
    d.ferias = rawList(cached.ferias);
    d.beneficios = rawList(cached.beneficios);
    d.absenteismo = rawList(cached.absenteismo);
  }
  Object.assign(data, d);
}

function mergeNewItems(current, incoming) {
  if (!incoming || !incoming.length) return null;
  const known = new Set(current.map((x) => x.id));
  const fresh = [];
  incoming.forEach((item) => {
    if (known.has(item.id)) return;
    known.add(item.id);
    fresh.push(markRaw({ ...item }));
  });
  return fresh.length ? current.concat(fresh) : null;
}

const MERGE_LIST_KEYS = [
  "vacancies",
  "rescisoes",
  "headcounts",
  "branches",
  "diarias",
  "treinamentos",
  "custoFolha",
  "ferias",
  "beneficios",
  "absenteismo"
];

export function mergeFromRemote(remoteData) {
  MERGE_LIST_KEYS.forEach((key) => {
    const merged = mergeNewItems(data[key], remoteData[key]);
    if (merged) data[key] = merged;
  });
}

