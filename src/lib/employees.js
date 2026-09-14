/* Domínio da Equipe: recalcula e grava snapshots diários dos indicadores
   computados (headcount, turnover, permanência, retenção) e administra vagas. */

import { COMPUTED_INDICATORS, STATES } from "./config";
import {
  useData,
  getEmployeeById,
  deleteEmployee,
  upsertEmployee,
  getVacancies,
  upsertVacancy,
  deleteVacancy,
  getVacancyById,
  addEntry,
  updateEntry,
  removeEntry,
  getLatestForMeta,
  upsertEntryForDate,
  removeEntryForDate
} from "./store";
import { createId, nowLocalISO, todayISO, daysBetween, sameState } from "./utils";
import { loadedStates } from "./db";

export function listEmployees(state) {
  const all = useData().employees;
  if (state && state !== "todos") {
    const target = String(state).trim().toUpperCase();
    return all.filter((e) => String(e.estado || "").trim().toUpperCase() === target);
  }
  return all;
}

/* Chave de comparação de nomes de pessoas: ignora caixa, acentos, espaços e
   pontuação — "Porto Velho", "PORTO VELHO", "portovelho" e "Porto-Velho"
   tornam-se a mesma chave. */
export function normalizePersonName(name) {
  return String(name ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]/g, "");
}

/* Procura colaboradores cujo nome, normalizado, seja igual ao informado.
   `excludeId` evita o próprio registro (útil na edição/cadastro). */
export function findEmployeesByName(name, excludeId = null) {
  const key = normalizePersonName(name);
  if (!key) return [];
  return useData().employees.filter(
    (e) => normalizePersonName(e.name) === key && e.id !== excludeId
  );
}

/* Chave de comparação de nomes abreviados de filial: ignora caixa, acentos,
   espaços/pontuação e zeros à esquerda de cada número.
   Ex.: "pvh5", "PVH 5", "pvh05", "Pvh-05" → mesma chave ("pvh5"). */
export function normalizeBranchKey(value) {
  const base = String(value ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]/g, "");
  return base.replace(/0+(\d)/g, "$1");
}

/* Localiza a filial pelo nome abreviado (shortName), tolerando as variações
   acima. Devolve a filial ou null. */
export function findBranchByShortName(text) {
  const key = normalizeBranchKey(text);
  if (!key) return null;
  return (
    useData().branches.find((b) => normalizeBranchKey(b.shortName) === key) || null
  );
}

/* Converte valor monetário opcional em número (null quando vazio). */
export function moneyOrNull(value) {
  if (value === undefined || value === null || value === "") return null;
  const num = Number(value);
  return isNaN(num) ? null : num;
}

/* Soma salário + encargos/benefícios/premiações/comissão do colaborador:
   custo mensal total de pessoal (0 quando nada foi informado). */
export function employeeMonthlyCost(employee) {
  if (!employee) return 0;
  const fields = [
    employee.salario,
    employee.valeTransporte,
    employee.valeAlimentacao,
    employee.inss,
    employee.fgts,
    employee.irrf,
    employee.premioArt62,
    employee.premioLoja,
    employee.comissao
  ];
  return fields.reduce((sum, v) => sum + (moneyOrNull(v) || 0), 0);
}

export function saveEmployee(employeeData) {
  const existing = employeeData.id ? getEmployeeById(employeeData.id) : null;
  const now = nowLocalISO();

  if (existing) {
    const updated = { ...existing, ...employeeData, updatedAt: now };
    /* Só mexe em `firedAt` quando o status é informado: edições parciais
       (ex.: salário) não podem apagar a data de desligamento. */
    if (employeeData.status !== undefined) {
      updated.firedAt =
        employeeData.status === "desligado"
          ? employeeData.firedAt || existing.firedAt || now
          : null;
    }
    upsertEmployee(updated);
    return updated;
  }

  const created = {
    id: createId(),
    name: employeeData.name,
    sector: employeeData.sector,
    user: employeeData.user,
    cargo: employeeData.cargo != null ? String(employeeData.cargo) : null,
    estado: employeeData.estado || null,
    salario: employeeData.salario != null ? Number(employeeData.salario) : null,
    hiredAt: employeeData.hiredAt || null,
    status: employeeData.status,
    type: employeeData.type,
    countsTurnover: !!employeeData.countsTurnover,
    departmentId: employeeData.departmentId || null,
    filialId: employeeData.filialId || null,
    liderImediato: employeeData.liderImediato != null ? String(employeeData.liderImediato) : null,
    gerenteRegional: employeeData.gerenteRegional != null ? String(employeeData.gerenteRegional) : null,
    valeTransporte: moneyOrNull(employeeData.valeTransporte),
    valeAlimentacao: moneyOrNull(employeeData.valeAlimentacao),
    inss: moneyOrNull(employeeData.inss),
    fgts: moneyOrNull(employeeData.fgts),
    irrf: moneyOrNull(employeeData.irrf),
    premioArt62: moneyOrNull(employeeData.premioArt62),
    premioLoja: moneyOrNull(employeeData.premioLoja),
    comissao: moneyOrNull(employeeData.comissao),
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

/* Reexporta a lista de departamentos de lib/departamentos.js (dono do
   domínio). Antes havia uma segunda implementação aqui que comparava o estado
   com `===` exato, enquanto a de departamentos.js usa sameState() — o mesmo
   departamento aparecia ou sumia da lista conforme o ponto de entrada. */
export { listDepartments } from "./departamentos";

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

  /* Reconcilia o custo das vagas: garante um lançamento para toda vaga com
     salário (inclusive as criadas antes desta regra). */
  getVacancies().forEach((v) => syncVacancyCost(v));
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
    list = list.filter((v) => sameState(v.estado, state));
  }
  /* Tolerante a vagas sem data de abertura (dados legados/importados). */
  return list
    .slice()
    .sort((a, b) => String(b.openAt || "").localeCompare(String(a.openAt || "")));
}

export function addVacancy({
  name,
  openAt,
  closeAt = null,
  salario = null,
  tipoContratacao = null,
  estado,
  filialId = null
}) {
  const vacancy = {
    id: createId(),
    name,
    openAt,
    closeAt: closeAt || null,
    salario: moneyOrNull(salario),
    tipoContratacao: tipoContratacao || null,
    estado: estado || null,
    filialId: filialId || null
  };
  upsertVacancy(vacancy);
  syncVacancyIndicator(vacancy.estado);
  syncVacancyCost(vacancy);
  return vacancy;
}

export function updateVacancy(
  id,
  { name, openAt, closeAt, salario, tipoContratacao, estado, filialId }
) {
  const vacancy = getVacancyById(id);
  if (!vacancy) return null;
  const prevEstado = vacancy.estado;
  const updated = {
    ...vacancy,
    name,
    openAt,
    closeAt: closeAt !== undefined ? closeAt || null : vacancy.closeAt,
    salario: salario !== undefined ? moneyOrNull(salario) : vacancy.salario,
    tipoContratacao:
      tipoContratacao !== undefined ? tipoContratacao || null : vacancy.tipoContratacao,
    estado: estado !== undefined ? estado || null : vacancy.estado,
    filialId: filialId !== undefined ? filialId || null : vacancy.filialId
  };
  upsertVacancy(updated);
  if (prevEstado !== updated.estado) syncVacancyIndicator(prevEstado);
  syncVacancyIndicator(updated.estado);
  syncVacancyCost(updated);
  return updated;
}

/* Fecha a vaga. Sem `closeDate`, usa o momento atual; com data (YYYY-MM-DD),
   encerra a vaga às 00:00 do dia informado. */
export function closeVacancy(id, closeDate = null) {
  const vacancy = getVacancyById(id);
  if (!vacancy || vacancy.closeAt) return null;
  const updated = { ...vacancy, closeAt: closeDate ? `${String(closeDate).slice(0, 10)}T00:00:00` : nowLocalISO() };
  upsertVacancy(updated);
  syncVacancyIndicator(updated.estado);
  syncVacancyCost(updated);
  return updated;
}

export function deleteVacancyRecord(id) {
  const vacancy = getVacancyById(id);
  const estado = vacancy ? vacancy.estado : null;
  deleteVacancy(id);
  syncVacancyIndicator(estado);
  removeVacancyCost(id);
}

/* Exclusão em lote: remove as vagas e recalcula o indicador uma única vez. */
export function deleteVacancies(ids) {
  const states = new Set();
  (ids || []).forEach((id) => {
    const v = getVacancyById(id);
    if (!v) return;
    deleteVacancy(id);
    removeVacancyCost(id);
    states.add(v.estado || null);
  });
  states.forEach((s) => syncVacancyIndicator(s));
}

/* Fechamento em lote: fecha as vagas abertas e recalcula uma única vez. */
export function closeVacancies(ids, closeDate = null) {
  const states = new Set();
  (ids || []).forEach((id) => {
    const v = getVacancyById(id);
    if (!v || v.closeAt) return;
    const closeAt = closeDate ? `${String(closeDate).slice(0, 10)}T00:00:00` : nowLocalISO();
    const updated = { ...v, closeAt };
    upsertVacancy(updated);
    syncVacancyCost(updated);
    states.add(v.estado || null);
  });
  states.forEach((s) => syncVacancyIndicator(s));
}

/* O salário da vaga entra no KPI "Custo de contratação" como um lançamento
   (um por vaga), esteja ela aberta ou fechada. A data do lançamento é a do
   fechamento quando houver; senão, a da abertura. Editar/limpar o salário
   atualiza ou remove o lançamento; excluir a vaga também remove. */
function syncVacancyCost(vacancy) {
  if (!vacancy) return;
  const existing = getLatestForMeta("custo_contratacao", "vacancyId", vacancy.id);
  const salario = moneyOrNull(vacancy.salario);
  if (salario === null) {
    if (existing) removeEntry("custo_contratacao", existing.id);
    return;
  }
  const date = String(vacancy.closeAt || vacancy.openAt || todayISO()).slice(0, 10);
  const meta = { vacancyId: vacancy.id, vacancyName: vacancy.name, source: "vaga" };
  if (vacancy.estado) meta.estado = vacancy.estado;
  if (existing) {
    updateEntry("custo_contratacao", existing.id, { value: salario, date, meta });
  } else {
    addEntry("custo_contratacao", { date, value: salario, state: vacancy.estado, meta });
  }
}

function removeVacancyCost(vacancyId) {
  const existing = getLatestForMeta("custo_contratacao", "vacancyId", vacancyId);
  if (existing) removeEntry("custo_contratacao", existing.id);
}

function syncVacancyIndicator(state) {
  const closed = listVacancies(state).filter((v) => v.closeAt && v.openAt);
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
  if (!vacancy.openAt || !vacancy.closeAt) return "—";
  const days = daysBetween(vacancy.openAt, vacancy.closeAt);
  if (days === null || isNaN(days)) return "—";
  return days.toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 }) + " dias";
}
