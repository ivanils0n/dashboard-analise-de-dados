/* =========================================================
   Camada de dados — Supabase como única fonte de verdade
   ---------------------------------------------------------
   Os dados vivem em memória (_data), preenchidos a cada
   abertura direto do banco (hydrate). Toda escrita é
   espelhada no Supabase via Remote (write-through em lote).

   Estrutura em memória:
   {
     entries:    { "headcount": [ { id, date, value, meta }, ... ], ... },
     employees:  [ { id, name, sector, user, hiredAt, status, type,
                      countsTurnover, createdAt, updatedAt, firedAt }, ... ],
     vacancies:  [ { id, name, openAt, closeAt }, ... ],
     branches:   [ { id, branchId, cnpj, name, shortName, manager,
                      estado, createdAt, updatedAt }, ... ]
   }
   ========================================================= */

const Remote = {
  db() {
    return typeof SupabaseDB !== "undefined" ? SupabaseDB : null;
  },
  ok() {
    const db = this.db();
    return !!(db && db.enabled);
  },
  entryAdded(indicatorId, entry) {
    if (this.ok()) this.db().insertEntry(indicatorId, entry);
  },
  entryUpdated(indicatorId, entry) {
    if (this.ok()) this.db().updateEntryRow(indicatorId, entry);
  },
  entriesRemoved(ids, estado) {
    if (this.ok()) this.db().deleteEntryIds(ids, estado);
  },
  entriesCleared() {
    if (this.ok()) this.db().clearAllLancamentos();
  },
  employeeSaved(employee) {
    if (this.ok()) this.db().upsertEmployee(employee);
  },
  employeeRemoved(id, estado) {
    if (this.ok()) this.db().deleteEmployee(id, estado);
  },
  vacancySaved(vacancy) {
    if (this.ok()) this.db().upsertVacancy(vacancy);
  },
  vacancyRemoved(id, estado) {
    if (this.ok()) this.db().deleteVacancy(id, estado);
  },
  branchSaved(branch) {
    if (this.ok()) this.db().upsertBranch(branch);
  },
  branchRemoved(id, estado) {
    if (this.ok()) this.db().deleteBranch(id, estado);
  }
};

function emptyData() {
  return { version: 1, entries: {}, employees: [], vacancies: [], branches: [] };
}

const Storage = {
  _data: emptyData(),

  /* Acesso síncrono da UI aos dados já carregados do banco */
  load() {
    return this._data;
  },

  /* Mantido por compatibilidade com as chamadas existentes.
     A persistência real acontece via Remote (Supabase). */
  save() {},

  /* Mescla dados de um estado recém-carregado sem perder o que já está
     em memória (usado na carga sob demanda por estado). */
  mergeFromRemote(remote) {
    const data = this.load();
    Object.entries(remote.entries || {}).forEach(([indicatorId, list]) => {
      if (!data.entries[indicatorId]) data.entries[indicatorId] = [];
      list.forEach((entry) => {
        if (!data.entries[indicatorId].some((e) => e.id === entry.id)) {
          data.entries[indicatorId].push({ ...entry });
        }
      });
      data.entries[indicatorId].sort((a, b) => a.date.localeCompare(b.date));
    });
    ["employees", "vacancies", "branches"].forEach((key) => {
      (remote[key] || []).forEach((item) => {
        if (!data[key].some((x) => x.id === item.id)) data[key].push({ ...item });
      });
    });
    this.save();
  },

  /* ---------- Entradas dos indicadores ---------- */

  getAllEntries() {
    return this._data.entries;
  },

  getEntriesFor(indicatorId, state) {
    let list = (this._data.entries[indicatorId] || [])
      .slice()
      .sort((a, b) => a.date.localeCompare(b.date));
    if (state && state !== "todos") {
      list = list.filter((e) => e.meta && e.meta.estado === state);
    }
    return list;
  },

  getLatestFor(indicatorId) {
    const list = this.getEntriesFor(indicatorId);
    return list.length ? list[list.length - 1] : null;
  },

  /* Mantém o estado selecionado dentro do meta (sem mudar o schema) */
  _withState(meta, state) {
    const base = meta ? { ...meta } : {};
    if (state && state !== "todos") base.estado = state;
    else delete base.estado;
    return Object.keys(base).length ? base : null;
  },

  addEntry(indicatorId, { date, value, meta, state }) {
    const data = this.load();
    if (!data.entries[indicatorId]) data.entries[indicatorId] = [];
    const entry = { id: createId(), date, value: Number(value), meta: this._withState(meta, state) };
    data.entries[indicatorId].push(entry);
    data.entries[indicatorId].sort((a, b) => a.date.localeCompare(b.date));
    this.save();
    Remote.entryAdded(indicatorId, entry);
  },

  upsertEntryForDate(indicatorId, date, value, meta, state) {
    const data = this.load();
    if (!data.entries[indicatorId]) data.entries[indicatorId] = [];
    const list = data.entries[indicatorId];
    const mergedMeta = this._withState(meta, state);
    const mEstado = mergedMeta ? mergedMeta.estado : null;
    const idx = list.findIndex((e) => {
      if (e.date !== date) return false;
      const eEstado = e.meta ? e.meta.estado : null;
      return eEstado === mEstado;
    });
    if (idx >= 0) {
      const current = list[idx];
      /* Nada mudou: evita escrita remota desnecessária */
      const sameValue = Number(current.value) === Number(value);
      const sameMeta =
        mergedMeta === undefined ||
        JSON.stringify(current.meta || null) === JSON.stringify(mergedMeta || null);
      if (sameValue && sameMeta) return;
      current.value = Number(value);
      if (mergedMeta !== undefined) current.meta = mergedMeta;
      Remote.entryUpdated(indicatorId, current);
    } else {
      const entry = { id: createId(), date, value: Number(value), meta: mergedMeta };
      list.push(entry);
      Remote.entryAdded(indicatorId, entry);
    }
    list.sort((a, b) => a.date.localeCompare(b.date));
    this.save();
  },

  removeEntryForDate(indicatorId, date, state) {
    const data = this.load();
    if (!data.entries[indicatorId]) return;
    const removedIds = [];
    data.entries[indicatorId] = data.entries[indicatorId].filter((e) => {
      if (e.date !== date) return true;
      const eEstado = e.meta ? e.meta.estado : null;
      if (state && state !== "todos" && eEstado !== state) return true;
      removedIds.push(e.id);
      return false;
    });
    this.save();
    Remote.entriesRemoved(removedIds, state);
  },

  removeEntry(indicatorId, entryId) {
    const data = this.load();
    if (!data.entries[indicatorId]) return;
    const entry = data.entries[indicatorId].find((e) => e.id === entryId);
    data.entries[indicatorId] = data.entries[indicatorId].filter((e) => e.id !== entryId);
    this.save();
    const estado = entry && entry.meta ? entry.meta.estado : null;
    Remote.entriesRemoved([entryId], estado);
  },

  updateEntry(indicatorId, entryId, patch) {
    const data = this.load();
    if (!data.entries[indicatorId]) return;
    const idx = data.entries[indicatorId].findIndex((e) => e.id === entryId);
    if (idx < 0) return;
    data.entries[indicatorId][idx] = { ...data.entries[indicatorId][idx], ...patch };
    data.entries[indicatorId].sort((a, b) => a.date.localeCompare(b.date));
    this.save();
    Remote.entryUpdated(indicatorId, data.entries[indicatorId][idx]);
  },

  getLatestForMeta(indicatorId, metaKey, metaValue) {
    const list = this.getEntriesFor(indicatorId);
    const matches = list.filter((e) => e.meta && e.meta[metaKey] === metaValue);
    return matches.length ? matches[matches.length - 1] : null;
  },

  clearEntries() {
    this._data.entries = {};
    this.save();
    if (Remote.ok()) Remote.db().clearAllLancamentos();
  },

  /* ---------- Colaboradores (Equipe) ---------- */

  getEmployees() {
    return this._data.employees;
  },

  upsertEmployee(employee) {
    const data = this.load();
    const idx = data.employees.findIndex((e) => e.id === employee.id);
    if (idx >= 0) data.employees[idx] = employee;
    else data.employees.push(employee);
    this.save();
    Remote.employeeSaved(employee);
  },

  deleteEmployee(id) {
    const data = this.load();
    const emp = data.employees.find((e) => e.id === id);
    data.employees = data.employees.filter((e) => e.id !== id);
    this.save();
    Remote.employeeRemoved(id, emp ? emp.estado : null);
  },

  getEmployeeById(id) {
    return this.getEmployees().find((e) => e.id === id) || null;
  },

  /* ---------- Vagas (Tempo médio de contratação) ---------- */

  getVacancies() {
    return this._data.vacancies;
  },

  upsertVacancy(vacancy) {
    const data = this.load();
    const idx = data.vacancies.findIndex((v) => v.id === vacancy.id);
    if (idx >= 0) data.vacancies[idx] = vacancy;
    else data.vacancies.push(vacancy);
    this.save();
    Remote.vacancySaved(vacancy);
  },

  deleteVacancy(id) {
    const data = this.load();
    const v = data.vacancies.find((x) => x.id === id);
    data.vacancies = data.vacancies.filter((x) => x.id !== id);
    this.save();
    Remote.vacancyRemoved(id, v ? v.estado : null);
  },

  getVacancyById(id) {
    return this.getVacancies().find((v) => v.id === id) || null;
  },

  /* ---------- Filiais ---------- */

  getBranches() {
    return this._data.branches;
  },

  upsertBranch(branch) {
    const data = this.load();
    const idx = data.branches.findIndex((b) => b.id === branch.id);
    if (idx >= 0) data.branches[idx] = branch;
    else data.branches.push(branch);
    this.save();
    Remote.branchSaved(branch);
  },

  deleteBranch(id) {
    const data = this.load();
    const branch = data.branches.find((b) => b.id === id);
    data.branches = data.branches.filter((b) => b.id !== id);
    this.save();
    Remote.branchRemoved(id, branch ? branch.estado : null);
  },

  getBranchById(id) {
    return this.getBranches().find((b) => b.id === id) || null;
  }
};
