import { reactive } from "vue";
import { createId, compareDateAsc, nameKey } from "./utils";

export function emptyData() {
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

const PUBLIC_ENTRY_INDICATORS = Object.keys(ENTRY_LISTS);

const isOcorrencia = (e) => !!(e.meta && e.meta.colaborador);

export function getAllEntries() {
  const all = {};
  PUBLIC_ENTRY_INDICATORS.forEach((indicatorId) => {
    const list = data[ENTRY_LISTS[indicatorId]];
    all[indicatorId] = indicatorId === "absenteismo" ? list.filter((e) => !isOcorrencia(e)) : list;
  });
  return all;
}

export function getEntriesFor(indicatorId, state) {
  // chama isso genericamente para TODO indicador em INDICATORS, esperando
  const key = ENTRY_LISTS[indicatorId];
  if (!key) return [];
  let list = (data[key] || []).slice().sort((a, b) => compareDateAsc(a.date, b.date));
  if (indicatorId === "absenteismo") list = list.filter((e) => !isOcorrencia(e));
  if (state && state !== "todos") {
    const target = String(state).trim().toUpperCase();
    list = list.filter(
      (e) => String((e.meta && e.meta.estado) || "").trim().toUpperCase() === target
    );
  }
  return list;
}

export function getBeneficios(state) {
  const list = (data.beneficios || []).slice().sort((a, b) => compareDateAsc(a.date, b.date));
  if (!state || state === "todos") return list;
  const target = String(state).trim().toUpperCase();
  return list.filter((e) => String((e.meta && e.meta.estado) || "").trim().toUpperCase() === target);
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

export function saveOcorrencia({ date, colaborador, setor, filial, motivo, observacao, estado, advertencia, acidente, cid, diasAtestado, tipoAcidente, aberturaCat }) {
  const existing = data.absenteismo.find(
    (e) => isOcorrencia(e) && e.date === date && nameKey(e.meta.colaborador) === nameKey(colaborador)
  );
  const meta = {
    colaborador,
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
  if (existing) {
    const updated = { ...existing, meta };
    const idx = data.absenteismo.indexOf(existing);
    data.absenteismo[idx] = updated;
    if (ok()) remote.entryUpdated("absenteismo", updated);
    return updated;
  }
  const entry = { id: createId(), date, value: 0, meta };
  data.absenteismo.push(entry);
  if (ok()) remote.entryAdded("absenteismo", entry);
  return entry;
}

export function removeOcorrencia(date, colaborador) {
  const existing = data.absenteismo.find(
    (e) => isOcorrencia(e) && e.date === date && nameKey(e.meta.colaborador) === nameKey(colaborador)
  );
  if (!existing) return;
  data.absenteismo = data.absenteismo.filter((e) => e.id !== existing.id);
  if (ok()) {
    remote.entriesRemoved("absenteismo", [existing.id], existing.meta.estado, {
      [existing.id]: { date: existing.date, colaborador }
    });
  }
}

export function getVacancies() {
  return data.vacancies;
}

export function upsertVacancy(vacancy) {
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
  if (cached && typeof cached === "object") {
    d.vacancies = Array.isArray(cached.vacancies) ? cached.vacancies : [];
    d.rescisoes = Array.isArray(cached.rescisoes) ? cached.rescisoes : [];
    d.headcounts = Array.isArray(cached.headcounts) ? cached.headcounts : [];
    d.branches = Array.isArray(cached.branches) ? cached.branches : [];
    d.diarias = Array.isArray(cached.diarias) ? cached.diarias : [];
    d.treinamentos = Array.isArray(cached.treinamentos) ? cached.treinamentos : [];
    d.custoFolha = Array.isArray(cached.custoFolha) ? cached.custoFolha : [];
    d.ferias = Array.isArray(cached.ferias) ? cached.ferias : [];
    d.beneficios = Array.isArray(cached.beneficios) ? cached.beneficios : [];
    d.absenteismo = Array.isArray(cached.absenteismo) ? cached.absenteismo : [];
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
    fresh.push({ ...item });
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

