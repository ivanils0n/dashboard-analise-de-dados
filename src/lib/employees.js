/* Domínio da Equipe: recalcula e grava snapshots diários dos indicadores
   computados (headcount, turnover, permanência, retenção) e administra vagas. */

import { STATES } from "./config";
import {
  useData,
  getEmployeeById,
  deleteEmployee,
  upsertEmployee,
  getVacancies,
  upsertVacancy,
  deleteVacancy,
  getVacancyById,
  getTurnovers,
  upsertTurnover,
  deleteTurnover,
  getTurnoverById,
  getPermanencias,
  upsertPermanencia,
  deletePermanencia,
  getPermanenciaById,
  getHeadcounts,
  upsertHeadcount,
  deleteHeadcount,
  getHeadcountById,
  addEntry,
  updateEntry,
  removeEntry,
  getEntriesFor,
  getLatestForMeta,
  upsertEntryForDate,
  removeEntryForDate
} from "./store";
import { createId, nowLocalISO, todayISO, daysBetween, sameState } from "./utils";
import { loadedStates } from "./db";

/* Restringe uma lista ao estado escolhido ("todos"/vazio = sem filtro; nesse
   caso devolve a própria lista, sem cópia). */
function filterByState(list, state) {
  if (!state || state === "todos") return list;
  return list.filter((x) => sameState(x.estado, state));
}

export function listEmployees(state) {
  return filterByState(useData().employees, state);
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
   acima. Quando `estado` é informado, exige que a filial pertença a ele —
   evita cruzar com uma filial de outro estado que reaproveite o mesmo nome
   abreviado. Devolve a filial ou null. */
export function findBranchByShortName(text, estado) {
  const key = normalizeBranchKey(text);
  if (!key) return null;
  let list = useData().branches;
  if (estado && estado !== "todos") list = list.filter((b) => sameState(b.estado, estado));
  return list.find((b) => normalizeBranchKey(b.shortName) === key) || null;
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
    if (e.type === "efetivado" && e.status === "ativo") m.entradas += 1;
    if (e.type === "efetivado" && e.status === "desligado") m.saidas += 1;
  });
  return m;
}

/* ---------- Cálculos ---------- */

/* Média dos dias entre abertura e fechamento de uma lista de vagas — só as
   já fechadas contam (vagas ainda abertas não têm um tempo de contratação
   definitivo ainda). Pura (sem depender do store), reaproveitada tanto pelo
   snapshot diário local (avgHiringDays) quanto pelo card do dashboard, que a
   aplica às vagas do período filtrado (ver useDashboardData). */
export function averageHiringDays(list) {
  /* Só datas válidas e em ordem (fechamento depois da abertura): uma data
     ilegível virava 0 dia e uma invertida virava dias negativos, e ambas
     entravam na média puxando o resultado. */
  const days = (list || [])
    .filter((v) => v.openAt && v.closeAt)
    .map((v) => daysBetween(v.openAt, v.closeAt))
    .filter((d) => d !== null && Number.isFinite(d) && d >= 0);
  if (!days.length) return null;
  return days.reduce((sum, d) => sum + d, 0) / days.length;
}

/* Tempo médio de contratação a partir das vagas já carregadas no store,
   sem filtro de período — usado só pelo snapshot diário (syncVacancyIndicator).
   O card do dashboard filtra as vagas pelo período antes de usar
   averageHiringDays (ver useDashboardData). */
export function avgHiringDays(state) {
  return averageHiringDays(listVacancies(state));
}

/* Indicadores "computed" exibidos no dashboard — "tempo_contratacao" do card
   é calculado sobre as vagas do período (ver useDashboardData.js), não por
   este snapshot local.
   Headcount, Retenção e Tempo de permanência não entram mais aqui: viraram
   lançamento manual mensal (form "mensal"). */
export function computedSnapshot(indId, state) {
  switch (indId) {
    case "headcount":
      return headcountCount(state);
    case "tempo_contratacao":
      return avgHiringDays(state);
    default:
      return null;
  }
}

/* ---------- Snapshots dos indicadores computados ---------- */

/* Retenção e Tempo de permanência deixaram de ser calculados a
   partir da Equipe: agora são lançamentos manuais mensais (form "mensal"),
   como Custo da diária/Treinamento/Custo de folha — por isso não têm mais
   snapshot automático aqui. Só "tempo_contratacao" (vagas) e o custo das
   vagas continuam recalculados automaticamente. */
export function syncAll() {
  activeStates().forEach((state) => syncVacancyIndicator(state));

  /* Reconcilia o custo das vagas: garante um lançamento para toda vaga com
     salário (inclusive as criadas antes desta regra). O índice por vaga é
     montado uma vez — antes cada vaga varria e reordenava a lista inteira de
     lançamentos (O(vagas × lançamentos)). */
  const costByVacancy = costEntriesByVacancy();
  getVacancies().forEach((v) => syncVacancyCost(v, costByVacancy));
}

/* Estados cujos dados já estão em memória (otimização de carga). */
export function activeStates() {
  const loaded = STATES.filter((s) => loadedStates()[s]);
  if (loaded.length) return loaded;
  return STATES.slice();
}

/* ---------- Vagas (Tempo médio de contratação) ---------- */

export function listVacancies(state) {
  /* Tolerante a vagas sem data de abertura (dados legados/importados). */
  return filterByState(getVacancies(), state)
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
function shallowEqual(a, b) {
  const x = a || {};
  const y = b || {};
  const keys = Object.keys(x);
  return keys.length === Object.keys(y).length && keys.every((k) => x[k] === y[k]);
}

/* Último lançamento de custo de cada vaga (vacancyId → lançamento). Mesma
   regra de getLatestForMeta (o mais recente na ordem por data), mas para todas
   as vagas de uma vez. */
function costEntriesByVacancy() {
  const byVacancy = new Map();
  getEntriesFor("custo_contratacao").forEach((e) => {
    if (e.meta && e.meta.vacancyId) byVacancy.set(e.meta.vacancyId, e);
  });
  return byVacancy;
}

function syncVacancyCost(vacancy, costByVacancy) {
  if (!vacancy) return;
  const existing = costByVacancy
    ? costByVacancy.get(vacancy.id) || null
    : getLatestForMeta("custo_contratacao", "vacancyId", vacancy.id);
  const salario = moneyOrNull(vacancy.salario);
  if (salario === null) {
    if (existing) removeEntry("custo_contratacao", existing.id);
    return;
  }
  const date = String(vacancy.closeAt || vacancy.openAt || todayISO()).slice(0, 10);
  const meta = { vacancyId: vacancy.id, vacancyName: vacancy.name, source: "vaga" };
  if (vacancy.estado) meta.estado = vacancy.estado;
  if (existing) {
    /* Sem mudança, não toca no lançamento: cada updateEntry enfileira uma
       gravação no servidor. O syncAll roda a cada troca de estado e a cada
       boot — antes regravava o custo de TODAS as vagas toda vez. */
    if (
      Number(existing.value) === salario &&
      existing.date === date &&
      shallowEqual(existing.meta, meta)
    ) {
      return;
    }
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
  const today = todayISO();
  const avg = avgHiringDays(state);
  if (avg === null) {
    removeEntryForDate("tempo_contratacao", today, state);
    return;
  }
  upsertEntryForDate("tempo_contratacao", today, Number(avg.toFixed(1)), null, state);
}

export function formatVacancyTempo(vacancy) {
  if (!vacancy.openAt || !vacancy.closeAt) return "—";
  const days = daysBetween(vacancy.openAt, vacancy.closeAt);
  if (days === null || isNaN(days)) return "—";
  return days.toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 }) + " dias";
}

function dateWithinRange(dateVal, range) {
  if (!dateVal) return false;
  const d = String(dateVal).slice(0, 10);
  if (range.start && d < range.start) return false;
  if (range.end && d > range.end) return false;
  return true;
}

/* ---------- Turnover (lançamento manual por quantidade) ----------
   Não depende mais de colaboradores individuais: cada lançamento é só uma
   quantidade de admitidos e demitidos por filial num mês de referência
   (lançado à mão ou importado por planilha). O valor não aparece na Equipe —
   é puramente visual no KPI de Turnover e alimenta o cálculo de outros KPIs
   (Turnover %, Retenção). Calculado sob demanda, como "tempo_contratacao" é
   para vagas. */

export function listTurnoverEntries(state) {
  return filterByState(getTurnovers(), state)
    .slice()
    .sort((a, b) => String(b.mesReferencia || "").localeCompare(String(a.mesReferencia || "")));
}

/* Compara um mês "YYYY-MM" com um período { start, end } (datas
   "YYYY-MM-DD"), reduzindo o período ao mês correspondente antes de
   comparar — evita a comparação lexicográfica errada entre "2026-01" e
   "2026-01-15" que dateWithinRange faria com um mês "solto". */
function monthWithinRange(ym, range) {
  if (!ym) return false;
  if (!range) return true;
  const startYm = range.start ? String(range.start).slice(0, 7) : null;
  const endYm = range.end ? String(range.end).slice(0, 7) : null;
  if (startYm && ym < startYm) return false;
  if (endYm && ym > endYm) return false;
  return true;
}

/* Soma de admitidos/demitidos/ativos lançados no período (mês) filtrado —
   base do Turnover (%) e das Novas contratações da Retenção. `ativos` é a
   quantidade de colaboradores ativos no período, lançada junto (substitui o
   Headcount no cálculo do Turnover — ver turnoverRateStats). `range` null
   soma o total já lançado. */
export function turnoverQuantitiesInRange(state, range) {
  /* A soma não depende da ordem: usa a lista sem a cópia ordenada. */
  const list = filterByState(getTurnovers(), state);
  const filtered = range ? list.filter((t) => monthWithinRange(t.mesReferencia, range)) : list;
  return filtered.reduce(
    (acc, t) => {
      acc.admitidos += Number(t.admitidos) || 0;
      acc.demitidos += Number(t.demitidos) || 0;
      acc.ativos += Number(t.ativos) || 0;
      return acc;
    },
    { admitidos: 0, demitidos: 0, ativos: 0 }
  );
}

export function addTurnoverEntry({ filialId = null, mesReferencia, admitidos = 0, demitidos = 0, ativos = 0, estado }) {
  const record = {
    id: createId(),
    filialId: filialId || null,
    mesReferencia: mesReferencia ? String(mesReferencia).slice(0, 7) : null,
    admitidos: Number(admitidos) || 0,
    demitidos: Number(demitidos) || 0,
    ativos: Number(ativos) || 0,
    estado: estado || null
  };
  upsertTurnover(record);
  return record;
}

export function updateTurnoverEntry(id, { filialId, mesReferencia, admitidos, demitidos, ativos, estado }) {
  const record = getTurnoverById(id);
  if (!record) return null;
  const updated = {
    ...record,
    filialId: filialId !== undefined ? filialId || null : record.filialId,
    mesReferencia:
      mesReferencia !== undefined ? (mesReferencia ? String(mesReferencia).slice(0, 7) : null) : record.mesReferencia,
    admitidos: admitidos !== undefined ? Number(admitidos) || 0 : record.admitidos,
    demitidos: demitidos !== undefined ? Number(demitidos) || 0 : record.demitidos,
    ativos: ativos !== undefined ? Number(ativos) || 0 : record.ativos,
    estado: estado !== undefined ? estado || null : record.estado
  };
  upsertTurnover(updated);
  return updated;
}

export function deleteTurnoverEntry(id) {
  deleteTurnover(id);
}

/* Exclusão em lote (aba Histórico do Lançamento). */
export function deleteTurnoverEntries(ids) {
  (ids || []).forEach((id) => deleteTurnover(id));
}

/* ---------- Tempo médio de permanência (lançamento manual por planilha) ----------
   Registro próprio, independente do Turnover: colaborador, Data de admissão
   e Data de demissão, importados por planilha (modal dedicado). Usado só
   para o KPI "Tempo médio de permanência" — não conta admissão/demissão no
   Turnover nem no Headcount. */

export function listPermanenciaRecords(state) {
  return filterByState(getPermanencias(), state)
    .slice()
    .sort((a, b) => String(b.dataDemissao || "").localeCompare(String(a.dataDemissao || "")));
}

/* Média de dias entre Data de admissão e Data de demissão dos registros de
   permanência — só entram registros com as duas datas preenchidas. Filtrado
   no período pela data de demissão. */
export function turnoverAvgTenureDays(state, range) {
  let list = filterByState(getPermanencias(), state).filter((p) => p.dataAdmissao && p.dataDemissao);
  if (range) list = list.filter((p) => dateWithinRange(p.dataDemissao, range));
  /* Mesma regra do tempo de contratação: datas inválidas ou invertidas ficam
     fora da média em vez de virar 0 ou dias negativos. */
  const days = list
    .map((p) => daysBetween(p.dataAdmissao, p.dataDemissao))
    .filter((d) => d !== null && Number.isFinite(d) && d >= 0);
  if (!days.length) return null;
  return days.reduce((sum, d) => sum + d, 0) / days.length;
}

export function addPermanenciaRecord({ colaborador, dataAdmissao, dataDemissao, filialId = null, estado }) {
  const record = {
    id: createId(),
    colaborador: String(colaborador || "").toUpperCase(),
    dataAdmissao: dataAdmissao || null,
    dataDemissao: dataDemissao || null,
    filialId: filialId || null,
    estado: estado || null
  };
  upsertPermanencia(record);
  return record;
}

export function updatePermanenciaRecord(id, { colaborador, dataAdmissao, dataDemissao, filialId, estado }) {
  const record = getPermanenciaById(id);
  if (!record) return null;
  const updated = {
    ...record,
    colaborador: colaborador !== undefined ? String(colaborador || "").toUpperCase() : record.colaborador,
    dataAdmissao: dataAdmissao !== undefined ? dataAdmissao || null : record.dataAdmissao,
    dataDemissao: dataDemissao !== undefined ? dataDemissao || null : record.dataDemissao,
    filialId: filialId !== undefined ? filialId || null : record.filialId,
    estado: estado !== undefined ? estado || null : record.estado
  };
  upsertPermanencia(updated);
  return updated;
}

export function deletePermanenciaRecord(id) {
  deletePermanencia(id);
}

/* Exclusão em lote (modal de Tempo médio de permanência). */
export function deletePermanenciaRecords(ids) {
  (ids || []).forEach((id) => deletePermanencia(id));
}

/* ---------- Headcount (quadro persistente de colaboradores) ----------
   Cada colaborador vira um registro próprio (código, colaborador, função,
   remuneração, data de admissão), lançado uma vez e mantido daí em diante
   — não é reimportado todo mês. O quadro sempre traz TODOS os colaboradores
   já lançados; o filtro por mês (ex.: ago/2026) reconstrói "como estava
   naquele mês" usando a Data de admissão como base — conta quem já tinha
   sido admitido até aquele mês (ver activeInMonth) — e nunca inclui quem já
   foi desligado até esse mês. "status"/"demitidoMes" registram o
   desligamento (importação de "demitidos", que só altera o status — não
   cria registro novo). */

function activeInMonth(h, ym) {
  /* Sem Data de admissão (registro antigo ou importado sem ela), vale o mês de
     referência gravado: o colaborador conta a partir dele, e não em todos os
     meses — inclusive nos anteriores à sua entrada. */
  const admissaoYm = h.dataAdmissao
    ? String(h.dataAdmissao).slice(0, 7)
    : h.mesReferencia
      ? String(h.mesReferencia).slice(0, 7)
      : null;
  if (admissaoYm && admissaoYm > ym) return false; // ainda não tinha sido admitido
  if (h.status === "demitido" && h.demitidoMes && h.demitidoMes <= ym) return false; // já desligado
  return true;
}

/* Lista o quadro "como estava" no mês `mesReferencia` (formato "YYYY-MM").
   Sem mês informado, devolve todos os registros (cadastro completo, sem
   reconstrução histórica) — usado pela busca por código na importação. */
export function listHeadcountRecords(state, mesReferencia) {
  let list = filterByState(getHeadcounts(), state);
  if (mesReferencia) list = list.filter((h) => activeInMonth(h, mesReferencia));
  return list
    .slice()
    .sort((a, b) => String(a.colaborador || "").localeCompare(String(b.colaborador || "")));
}

export function headcountCount(state, mesReferencia) {
  return listHeadcountRecords(state, mesReferencia).length;
}

/* Contagem no período (reconstrução "como estava" no mês do período) —
   `range` null cai no total de registros já lançados (sem reconstrução). */
export function headcountCountInRange(state, range) {
  const list = filterByState(getHeadcounts(), state);
  if (!range) return list.length;
  const ym = String(range.end || range.start || "").slice(0, 7);
  if (!ym) return list.length;
  return list.filter((h) => activeInMonth(h, ym)).length;
}

/* Localiza um colaborador do headcount pelo código (usado pelas importações
   de "novos colaboradores" — evita duplicar quem já existe — e de
   "demitidos" — localiza quem terá o status alterado). Comparação
   tolerante a espaços/caixa. Quando `filialId` é informado (mesmo `null`),
   a busca exige empresa igual — duas filiais podem reaproveitar o mesmo
   código; quando omitido (`undefined`), cai no código isolado (compat.). */
export function findHeadcountByCodigo(state, codigo, filialId) {
  const key = String(codigo || "").trim().toLowerCase();
  if (!key) return null;
  const list = filterByState(getHeadcounts(), state).filter(
    (h) => String(h.codigo || "").trim().toLowerCase() === key
  );
  if (filialId !== undefined) {
    const fid = filialId || null;
    return list.find((h) => (h.filialId || null) === fid) || null;
  }
  return list[0] || null;
}

/* Localiza colaboradores do headcount por Código + Nome (usado pela
   importação de "demitidos" — não depende mais de Empresa). Nome comparado
   normalizado (ver normalizePersonName), tolerante a acentos/caixa/espaços.
   Busca primeiro por Código + Nome; se nada bater (ex.: código divergente na
   planilha), cai para busca só pelo Nome. Devolve todos os registros
   encontrados — mais de um significa duplicidade, que a tela trata pedindo
   para escolher qual é qual. */
export function findHeadcountMatches(state, codigo, colaborador) {
  const nameKey = normalizePersonName(colaborador);
  if (!nameKey) return [];
  let list = getHeadcounts();
  if (state && state !== "todos") list = list.filter((h) => sameState(h.estado, state));

  const codeKey = String(codigo || "").trim().toLowerCase();
  if (codeKey) {
    const byCodeAndName = list.filter(
      (h) => String(h.codigo || "").trim().toLowerCase() === codeKey && normalizePersonName(h.colaborador) === nameKey
    );
    if (byCodeAndName.length) return byCodeAndName;
  }

  return list.filter((h) => normalizePersonName(h.colaborador) === nameKey);
}

export function addHeadcountRecord({
  codigo = null,
  colaborador,
  funcao = null,
  remuneracao = null,
  dataAdmissao = null,
  mesReferencia,
  filialId = null,
  estado
}) {
  const record = {
    id: createId(),
    codigo: codigo != null ? String(codigo) : null,
    colaborador: String(colaborador || "").toUpperCase(),
    funcao: funcao != null ? String(funcao).toUpperCase() : null,
    remuneracao: moneyOrNull(remuneracao),
    dataAdmissao: dataAdmissao || null,
    mesReferencia: mesReferencia ? String(mesReferencia).slice(0, 7) : null,
    status: "ativo",
    demitidoMes: null,
    filialId: filialId || null,
    estado: estado || null
  };
  upsertHeadcount(record);
  return record;
}

export function updateHeadcountRecord(
  id,
  { codigo, colaborador, funcao, remuneracao, dataAdmissao, mesReferencia, status, demitidoMes, filialId, estado }
) {
  const record = getHeadcountById(id);
  if (!record) return null;
  const updated = {
    ...record,
    codigo: codigo !== undefined ? (codigo != null ? String(codigo) : null) : record.codigo,
    colaborador: colaborador !== undefined ? String(colaborador || "").toUpperCase() : record.colaborador,
    funcao: funcao !== undefined ? (funcao != null ? String(funcao).toUpperCase() : null) : record.funcao,
    remuneracao: remuneracao !== undefined ? moneyOrNull(remuneracao) : record.remuneracao,
    dataAdmissao: dataAdmissao !== undefined ? dataAdmissao || null : record.dataAdmissao,
    mesReferencia:
      mesReferencia !== undefined ? (mesReferencia ? String(mesReferencia).slice(0, 7) : null) : record.mesReferencia,
    status: status !== undefined ? (status === "demitido" ? "demitido" : "ativo") : record.status,
    demitidoMes:
      demitidoMes !== undefined ? (demitidoMes ? String(demitidoMes).slice(0, 7) : null) : record.demitidoMes,
    filialId: filialId !== undefined ? filialId || null : record.filialId,
    estado: estado !== undefined ? estado || null : record.estado
  };
  upsertHeadcount(updated);
  return updated;
}

/* Marca o colaborador como demitido a partir do mês informado (importação
   de "demitidos") — só altera o status, não cria um registro novo. */
export function markHeadcountDemitido(id, demitidoMes) {
  return updateHeadcountRecord(id, { status: "demitido", demitidoMes });
}

export function deleteHeadcountRecord(id) {
  deleteHeadcount(id);
}

/* Exclusão em lote (aba Histórico do Lançamento). */
export function deleteHeadcountRecords(ids) {
  (ids || []).forEach((id) => deleteHeadcount(id));
}

/* ---------- Cálculo do Turnover (%) e Turnover de Saída (%) ----------
   Turnover(%)           = (((admissões + demissões) / 2) / ativos) * 100
   Turnover de Saída(%)  = (demissões / ativos) * 100

   Admissões, demissões e ativos vêm todos diretamente da quantidade lançada
   (ou importada) por filial no mês filtrado (`range`) — ver
   turnoverQuantitiesInRange. "Ativos" substitui o Headcount no cálculo: o
   Turnover não depende mais do quadro lançado no KPI de Headcount. */
export function turnoverRateStats(state, range) {
  const { admitidos: admissoes, demitidos: desligamentos, ativos: headcountAtual } = turnoverQuantitiesInRange(
    state,
    range
  );
  const turnoverPct = headcountAtual ? ((admissoes + desligamentos) / 2 / headcountAtual) * 100 : null;
  const turnoverEntradaPct = headcountAtual ? (admissoes / headcountAtual) * 100 : null;
  const turnoverSaidaPct = headcountAtual ? (desligamentos / headcountAtual) * 100 : null;
  return {
    admissoes,
    desligamentos,
    headcountAtual,
    turnoverPct,
    turnoverEntradaPct,
    turnoverSaidaPct
  };
}

/* ---------- Cálculo da Retenção (%) ----------
   Retenção(%) = ((Headcount final - Novas contratações) / Headcount inicial) × 100

   Headcount final    = quadro do Headcount no último dia do mês filtrado
                         (`range`).
   Headcount inicial  = quadro do Headcount no primeiro dia do mês filtrado
                         (reconstruído a partir do último dia do mês ANTERIOR,
                         `prevRange`). Quem foi desligado DENTRO do mês
                         filtrado (demitidoMes = mês filtrado) ainda está
                         ativo nesse quadro — logo já está no inicial e NÃO
                         pode ser somado de novo. Só entram na soma os
                         "Demitidos" lançados no Turnover que o Headcount
                         ainda não reflete (desligados sem status "demitido"
                         no quadro), para quem lança o desligamento só no
                         Turnover: antes toda a quantidade do Turnover era
                         somada, e quem já estava marcado no Headcount era
                         contado duas vezes (inicial inflado, retenção menor).
   Novas contratações = total de "Admitidos" lançado no Turnover para o mês
                         filtrado (mesma fonte do KPI de Turnover). */
export function retentionRate(state, range, prevRange) {
  const headcountFinal = headcountCountInRange(state, range);
  const { admitidos: novasContratacoes, demitidos: demitidosNoPeriodo } = turnoverQuantitiesInRange(state, range);
  /* Desligados do mês filtrado já marcados no Headcount e que estavam no
     quadro do início do mês (já contados em headcountCountInRange(prevRange)). */
  const prevYm = prevRange ? String(prevRange.end || prevRange.start || "").slice(0, 7) : "";
  const ym = range ? String(range.end || range.start || "").slice(0, 7) : "";
  const jaMarcados =
    prevYm && ym
      ? filterByState(getHeadcounts(), state).filter(
          (h) => h.status === "demitido" && h.demitidoMes === ym && activeInMonth(h, prevYm)
        ).length
      : 0;
  const demitidosAindaFora = Math.max(0, demitidosNoPeriodo - jaMarcados);
  const headcountInicial = headcountCountInRange(state, prevRange) + demitidosAindaFora;
  const retencaoPct = headcountInicial ? ((headcountFinal - novasContratacoes) / headcountInicial) * 100 : null;
  return {
    headcountInicial,
    headcountFinal,
    novasContratacoes,
    retencaoPct
  };
}

/* Lançamentos de Turnover (uma linha por filial e mês) dentro do período
   filtrado — as mesmas linhas somadas por turnoverQuantitiesInRange, para o
   detalhamento de Admissões/Demissões. Mais recentes primeiro. */
export function turnoverEntriesInRange(state, range) {
  return listTurnoverEntries(state).filter((t) => monthWithinRange(t.mesReferencia, range));
}
