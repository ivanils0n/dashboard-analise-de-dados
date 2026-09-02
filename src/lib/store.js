/* =========================================================
   Store — camada de dados reativa (Vue 3)
   ---------------------------------------------------------
   O estado vive em memória dentro de um objeto `reactive`, que é
   a fonte consumida por toda a UI. As escritas são espelhadas no
   Supabase via um "remote" registrado pelo módulo supabase.js
   (write-through em lote com debounce).

   Estrutura em memória:
   {
     entries:    { "headcount": [ { id, date, value, meta }, ... ], ... },
     employees:  [ { id, name, sector, user, hiredAt, status, type,
                     countsTurnover, createdAt, updatedAt, firedAt }, ... ],
     vacancies:  [ { id, name, openAt, closeAt }, ... ],
     branches:   [ { id, branchId, cnpj, name, shortName, manager,
                     estado, createdAt, updatedAt }, ... ],
     departments:[ { id, name, shortName, estado, createdAt, updatedAt }, ... ]
   }
   ========================================================= */

import { reactive } from "vue";
import { createId } from "./utils";

export function emptyData() {
  return { version: 1, entries: {}, employees: [], vacancies: [], branches: [], departments: [] };
}

const data = reactive(emptyData());

/* Acesso reativo à camada de dados a partir de qualquer componente */
export function useData() {
  return data;
}

/* ---------- Remote (escritas no Supabase) ---------- */

let remote = null;

/* O supabase.js registra o adaptador de escrita quando habilitado;
   sem remote, o app opera apenas em memória/localStorage. */
export function bindRemote(adapter) {
  remote = adapter;
}

const ok = () => remote != null;

/* ---------- Entradas dos indicadores ---------- */

export function getAllEntries() {
  return data.entries;
}

export function getEntriesFor(indicatorId, state) {
  let list = (data.entries[indicatorId] || []).slice().sort((a, b) => a.date.localeCompare(b.date));
  if (state && state !== "todos") {
    list = list.filter((e) => e.meta && e.meta.estado === state);
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
  if (!data.entries[indicatorId]) data.entries[indicatorId] = [];
  const entry = { id: createId(), date, value: Number(value), meta: _withState(meta, state) };
  data.entries[indicatorId].push(entry);
  data.entries[indicatorId].sort((a, b) => a.date.localeCompare(b.date));
  if (ok()) remote.entryAdded(indicatorId, entry);
}

export function upsertEntryForDate(indicatorId, date, value, meta, state) {
  if (!data.entries[indicatorId]) data.entries[indicatorId] = [];
  const list = data.entries[indicatorId];
  const mergedMeta = _withState(meta, state);
  const mEstado = mergedMeta ? mergedMeta.estado : null;
  const idx = list.findIndex((e) => {
    if (e.date !== date) return false;
    const eEstado = e.meta ? e.meta.estado : null;
    return eEstado === mEstado;
  });
  if (idx >= 0) {
    const current = list[idx];
    const sameValue = Number(current.value) === Number(value);
    const sameMeta =
      mergedMeta === undefined ||
      JSON.stringify(current.meta || null) === JSON.stringify(mergedMeta || null);
    if (sameValue && sameMeta) return;
    current.value = Number(value);
    if (mergedMeta !== undefined) current.meta = mergedMeta;
    if (ok()) remote.entryUpdated(indicatorId, current);
  } else {
    const entry = { id: createId(), date, value: Number(value), meta: mergedMeta };
    list.push(entry);
    if (ok()) remote.entryAdded(indicatorId, entry);
  }
  list.sort((a, b) => a.date.localeCompare(b.date));
}

export function removeEntryForDate(indicatorId, date, state) {
  if (!data.entries[indicatorId]) return;
  const removedIds = [];
  data.entries[indicatorId] = data.entries[indicatorId].filter((e) => {
    if (e.date !== date) return true;
    const eEstado = e.meta ? e.meta.estado : null;
    if (state && state !== "todos" && eEstado !== state) return true;
    removedIds.push(e.id);
    return false;
  });
  if (ok()) remote.entriesRemoved(removedIds, state);
}

export function removeEntry(indicatorId, entryId) {
  if (!data.entries[indicatorId]) return;
  const entry = data.entries[indicatorId].find((e) => e.id === entryId);
  data.entries[indicatorId] = data.entries[indicatorId].filter((e) => e.id !== entryId);
  const estado = entry && entry.meta ? entry.meta.estado : null;
  if (ok()) remote.entriesRemoved([entryId], estado);
}

export function updateEntry(indicatorId, entryId, patch) {
  if (!data.entries[indicatorId]) return;
  const idx = data.entries[indicatorId].findIndex((e) => e.id === entryId);
  if (idx < 0) return;
  data.entries[indicatorId][idx] = { ...data.entries[indicatorId][idx], ...patch };
  data.entries[indicatorId].sort((a, b) => a.date.localeCompare(b.date));
  if (ok()) remote.entryUpdated(indicatorId, data.entries[indicatorId][idx]);
}

export function getLatestForMeta(indicatorId, metaKey, metaValue) {
  const matches = getEntriesFor(indicatorId).filter((e) => e.meta && e.meta[metaKey] === metaValue);
  return matches.length ? matches[matches.length - 1] : null;
}

export function clearEntries() {
  data.entries = {};
  if (ok()) remote.entriesCleared();
}

/* ---------- Colaboradores (Equipe) ---------- */

export function getEmployees() {
  return data.employees;
}

export function upsertEmployee(employee) {
  const idx = data.employees.findIndex((e) => e.id === employee.id);
  if (idx >= 0) data.employees[idx] = employee;
  else data.employees.push(employee);
  if (ok()) remote.employeeSaved(employee);
}

export function deleteEmployee(id) {
  const emp = data.employees.find((e) => e.id === id);
  data.employees = data.employees.filter((e) => e.id !== id);
  if (ok()) remote.employeeRemoved(id, emp ? emp.estado : null);
}

export function getEmployeeById(id) {
  return getEmployees().find((e) => e.id === id) || null;
}

/* ---------- Vagas (Tempo médio de contratação) ---------- */

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

/* ---------- Filiais ---------- */

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

/* ---------- Departamentos ---------- */

export function getDepartments() {
  return data.departments;
}

export function upsertDepartment(department) {
  const idx = data.departments.findIndex((d) => d.id === department.id);
  if (idx >= 0) data.departments[idx] = department;
  else data.departments.push(department);
  if (ok()) remote.departmentSaved(department);
}

export function deleteDepartment(id) {
  const dep = data.departments.find((d) => d.id === id);
  data.departments = data.departments.filter((d) => d.id !== id);
  if (ok()) remote.departmentRemoved(id, dep ? dep.estado : null);
}

export function getDepartmentById(id) {
  return getDepartments().find((d) => d.id === id) || null;
}

/* ---------- Carga / merge (usado pelo supabase.js) ---------- */

export function resetData() {
  Object.assign(data, emptyData());
}

export function replaceFromCache(cached) {
  const d = emptyData();
  if (cached && typeof cached === "object") {
    d.entries = cached.entries && typeof cached.entries === "object" ? cached.entries : {};
    d.employees = Array.isArray(cached.employees) ? cached.employees : [];
    d.vacancies = Array.isArray(cached.vacancies) ? cached.vacancies : [];
    d.branches = Array.isArray(cached.branches) ? cached.branches : [];
    d.departments = Array.isArray(cached.departments) ? cached.departments : [];
  }
  Object.assign(data, d);
}

export function mergeFromRemote(remoteData) {
  Object.entries(remoteData.entries || {}).forEach(([indicatorId, list]) => {
    if (!data.entries[indicatorId]) data.entries[indicatorId] = [];
    list.forEach((entry) => {
      if (!data.entries[indicatorId].some((e) => e.id === entry.id)) {
        data.entries[indicatorId].push({ ...entry });
      }
    });
    data.entries[indicatorId].sort((a, b) => a.date.localeCompare(b.date));
  });
  ["employees", "vacancies", "branches", "departments"].forEach((key) => {
    (remoteData[key] || []).forEach((item) => {
      if (!data[key].some((x) => x.id === item.id)) data[key].push({ ...item });
    });
  });
}

export function upsertInList(list, item) {
  const idx = list.findIndex((x) => x.id === item.id);
  if (idx >= 0) list[idx] = item;
  else list.push(item);
}
