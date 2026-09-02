/* =========================================================
   Domínio da Equipe e indicadores calculados
   ---------------------------------------------------------
   A partir dos colaboradores e das vagas, recalcula e grava
   snapshots (por dia) dos indicadores computados:
   headcount, turnover, tempo de permanência,
   turnover no período de experiência e retenção.
   Também administra as vagas do Tempo médio de contratação.
   ========================================================= */

import { COMPUTED_INDICATORS, STATES } from "./config";
import {
  useData,
  getEmployeeById,
  deleteEmployee,
  getBranchById,
  getDepartments,
  upsertEmployee,
  getVacancies,
  upsertVacancy,
  deleteVacancy,
  getVacancyById,
  upsertEntryForDate,
  removeEntryForDate
} from "./store";
import { createId, nowLocalISO, todayISO, daysBetween } from "./utils";
import { loadedStates } from "./supabase";

export function listEmployees(state) {
  const all = useData().employees;
  if (state && state !== "todos") {
    return all.filter((e) => (e.estado || null) === state);
  }
  return all;
}

export function saveEmployee(employeeData) {
  const existing = employeeData.id ? getEmployeeById(employeeData.id) : null;
  const now = nowLocalISO();

  if (existing) {
    const updated = { ...existing, ...employeeData, updatedAt: now };
    if (employeeData.status === "desligado") {
      updated.firedAt = employeeData.firedAt || existing.firedAt || now;
    } else {
      updated.firedAt = null;
    }
    upsertEmployee(updated);
    return updated;
  }

  const created = {
    id: createId(),
    name: employeeData.name,
    sector: employeeData.sector,
    user: employeeData.user,
    estado: employeeData.estado || null,
    hiredAt: employeeData.hiredAt || null,
    status: employeeData.status,
    type: employeeData.type,
    countsTurnover: !!employeeData.countsTurnover,
    departmentId: employeeData.departmentId || null,
    filialId: employeeData.filialId || null,
    createdAt: now,
    updatedAt: now,
    firedAt: employeeData.firedAt || null
  };
  upsertEmployee(created);
  return created;
}

export function removeEmployee(id) {
  deleteEmployee(id);
  syncAll();
}

/* ---------- Departamentos & Filiais ---------- */

export function listDepartments(state) {
  const all = getDepartments();
  if (state && state !== "todos") {
    return all.filter((d) => (d.estado || null) === state);
  }
  return all.slice();
}

export function departmentMetrics(department, state, filialId, dateRange) {
  if (!department) return { total: 0, ativos: 0, entradas: 0, saidas: 0 };
  let list = listEmployees(state).filter((e) => e.sector === department.name);
  if ((!state || state === "todos") && department.estado) {
    list = list.filter((e) => e.estado === department.estado);
  }
  if (filialId) {
    list = list.filter((e) => e.filialId === filialId);
  }
  list = filterByEntryDate(list, dateRange);
  return metricsFrom(list);
}

function filterByEntryDate(list, dateRange) {
  if (!dateRange || (!dateRange.start && !dateRange.end)) return list;
  return list.filter((e) => {
    const d = e.hiredAt ? e.hiredAt.split("T")[0] : "";
    if (dateRange.start && (!d || d < dateRange.start)) return false;
    if (dateRange.end && (!d || d > dateRange.end)) return false;
    return true;
  });
}

export function filialMetrics(filial, state) {
  if (!filial) return { total: 0, ativos: 0, entradas: 0, saidas: 0 };
  const list = listEmployees(state).filter((e) => e.filialId === filial.id);
  return metricsFrom(list);
}

function metricsFrom(list) {
  const m = { total: list.length, ativos: 0, entradas: 0, saidas: 0 };
  list.forEach((e) => {
    if (e.status === "ativo") m.ativos += 1;
    if (e.type === "efetivado" && e.countsTurnover && e.status === "ativo") m.entradas += 1;
    if (e.type === "efetivado" && e.countsTurnover && e.status === "desligado") m.saidas += 1;
  });
  return m;
}

/* ---------- Cálculos ---------- */

export function headcount(state) {
  return listEmployees(state).filter((e) => e.status === "ativo").length;
}

export function turnoverEntradas(state) {
  return listEmployees(state).filter((e) => e.type === "efetivado" && e.countsTurnover && e.status === "ativo").length;
}

export function turnoverSaidas(state) {
  return listEmployees(state).filter((e) => e.type === "efetivado" && e.countsTurnover && e.status === "desligado").length;
}

export function retentionPct(state) {
  const list = listEmployees(state);
  if (!list.length) return null;
  const kept = list.filter((e) => e.status === "ativo").length;
  return (kept / list.length) * 100;
}

export function permanenceAvgDays(state) {
  const desligados = listEmployees(state).filter((e) => e.status === "desligado" && e.firedAt);
  if (!desligados.length) return null;
  const total = desligados.reduce((sum, e) => {
    const days = daysBetween(e.hiredAt || e.createdAt, e.firedAt) || 0;
    return sum + Math.max(1, Math.ceil(days));
  }, 0);
  return total / desligados.length;
}

export function probationTurnoverCount(state) {
  return listEmployees(state).filter((e) => e.type === "experiencia" && e.status === "desligado").length;
}

export function computedSnapshot(indId, state) {
  switch (indId) {
    case "headcount":
      return headcount(state);
    case "turnover_entradas":
      return turnoverEntradas(state);
    case "turnover_saidas":
      return turnoverSaidas(state);
    case "retencao":
      return retentionPct(state);
    case "tempo_permanencia":
      return permanenceAvgDays(state);
    case "turnover_experiencia":
      return probationTurnoverCount(state);
    default:
      return null;
  }
}

/* ---------- Snapshots dos indicadores computados ---------- */

export function syncAll() {
  const today = todayISO();
  const computedIds = COMPUTED_INDICATORS.map((i) => i.id);
  const states = activeStates();

  states.forEach((state) => {
    const list = listEmployees(state);
    if (!list.length) {
      computedIds.forEach((id) => removeEntryForDate(id, today, state));
      return;
    }
    upsertEntryForDate("headcount", today, headcount(state), null, state);
    upsertEntryForDate("turnover_entradas", today, turnoverEntradas(state), null, state);
    upsertEntryForDate("turnover_saidas", today, turnoverSaidas(state), null, state);
    const retention = retentionPct(state);
    if (retention !== null) {
      upsertEntryForDate("retencao", today, Number(retention.toFixed(1)), null, state);
    }
    const permanence = permanenceAvgDays(state);
    if (permanence !== null) {
      upsertEntryForDate("tempo_permanencia", today, Number(permanence.toFixed(1)), null, state);
    }
    upsertEntryForDate("turnover_experiencia", today, probationTurnoverCount(state), null, state);
  });
}

/* Estados cujos dados já estão em memória (otimização de carga). */
export function activeStates() {
  const loaded = STATES.filter((s) => loadedStates()[s]);
  if (loaded.length) return loaded;
  return STATES.slice();
}

/* ---------- Vagas (Tempo médio de contratação) ---------- */

export function listVacancies(state) {
  let list = getVacancies();
  if (state && state !== "todos") {
    list = list.filter((v) => (v.estado || null) === state);
  }
  return list.slice().sort((a, b) => b.openAt.localeCompare(a.openAt));
}

export function addVacancy({ name, openAt, estado }) {
  const vacancy = { id: createId(), name, openAt, closeAt: null, estado: estado || null };
  upsertVacancy(vacancy);
  syncVacancyIndicator(vacancy.estado);
  return vacancy;
}

export function updateVacancy(id, { name, openAt }) {
  const vacancy = getVacancyById(id);
  if (!vacancy) return null;
  const updated = { ...vacancy, name, openAt };
  upsertVacancy(updated);
  syncVacancyIndicator(updated.estado);
  return updated;
}

export function closeVacancy(id) {
  const vacancy = getVacancyById(id);
  if (!vacancy || vacancy.closeAt) return null;
  const updated = { ...vacancy, closeAt: nowLocalISO() };
  upsertVacancy(updated);
  syncVacancyIndicator(updated.estado);
  return updated;
}

export function deleteVacancyRecord(id) {
  const vacancy = getVacancyById(id);
  const estado = vacancy ? vacancy.estado : null;
  deleteVacancy(id);
  syncVacancyIndicator(estado);
}

function syncVacancyIndicator(state) {
  const closed = listVacancies(state).filter((v) => v.closeAt);
  const today = todayISO();
  if (!closed.length) {
    removeEntryForDate("tempo_contratacao", today, state);
    return;
  }
  const total = closed.reduce((sum, v) => sum + (daysBetween(v.openAt, v.closeAt) || 0), 0);
  const avg = total / closed.length;
  upsertEntryForDate("tempo_contratacao", today, Number(avg.toFixed(1)), null, state);
}

export function formatVacancyTempo(vacancy) {
  if (!vacancy.closeAt) return "—";
  const days = daysBetween(vacancy.openAt, vacancy.closeAt);
  if (days === null) return "—";
  return days.toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 }) + " dias";
}
