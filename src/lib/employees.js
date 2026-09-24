/* Vagas, Turnover, Permanência e Headcount: cálculos e CRUD desses 4
   indicadores. "tempo_contratacao" e "custo_contratacao" são derivados ao
   vivo das vagas (sem gravar snapshot); Headcount, Retenção e Tempo de
   permanência são lançamento manual mensal/por planilha. */

import { STATES } from "./config";
import {
  useData,
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
  getHeadcountById
} from "./store";
import { createId, nowLocalISO, daysBetween, sameState } from "./utils";
import { loadedStates, reloadData } from "./db";

/* Restringe uma lista ao estado escolhido ("todos"/vazio = sem filtro; nesse
   caso devolve a própria lista, sem cópia). */
function filterByState(list, state) {
  if (!state || state === "todos") return list;
  return list.filter((x) => sameState(x.estado, state));
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

/* Distância de edição entre duas strings (Damerau-Levenshtein simplificada):
   inserção, remoção, troca de uma letra e troca de duas letras vizinhas
   contam 1 cada — "gm" → "gmi" = 1 (letra faltando), "phv" → "pvh" = 1
   (letras trocadas), "pvx" → "pvh" = 1 (letra errada). */
function editDistance(a, b) {
  const rows = a.length + 1;
  const cols = b.length + 1;
  const d = Array.from({ length: rows }, (_, i) => {
    const row = new Array(cols).fill(0);
    row[0] = i;
    return row;
  });
  for (let j = 0; j < cols; j++) d[0][j] = j;
  for (let i = 1; i < rows; i++) {
    for (let j = 1; j < cols; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
        d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
      }
    }
  }
  return d[rows - 1][cols - 1];
}

/* Filial mais parecida quando não há correspondência exata: as letras podem
   ter uma letra a mais/a menos, errada ou trocada de lugar, mas o NÚMERO é o
   definidor — "pvh 1" nunca casa com "pvh 11". Sem número no texto, casa só
   se uma única filial for a mais próxima. Empate entre filiais diferentes =
   ambíguo (null), para não associar à filial errada. */
function fuzzyBranch(key, list) {
  const letters = key.replace(/\d/g, "");
  const digits = key.replace(/\D/g, "");
  if (!letters) return null;
  const maxDist = letters.length >= 5 ? 2 : 1;
  let best = null;
  let bestDist = Infinity;
  let tie = false;
  list.forEach((b) => {
    const bKey = normalizeBranchKey(b.shortName);
    if (!bKey) return;
    if (digits && bKey.replace(/\D/g, "") !== digits) return;
    const dist = editDistance(letters, bKey.replace(/\d/g, ""));
    if (dist > maxDist) return;
    if (dist < bestDist) {
      best = b;
      bestDist = dist;
      tie = false;
    } else if (dist === bestDist && best && normalizeBranchKey(best.shortName) !== bKey) {
      tie = true;
    }
  });
  return best && !tie ? best : null;
}

/* Localiza a filial pelo nome abreviado (shortName), tolerando as variações
   acima e, sem correspondência exata, letras faltando/erradas/trocadas (ver
   fuzzyBranch). Quando `estado` é informado, exige que a filial pertença a ele —
   evita cruzar com uma filial de outro estado que reaproveite o mesmo nome
   abreviado. Devolve a filial ou null. */
export function findBranchByShortName(text, estado) {
  const key = normalizeBranchKey(text);
  if (!key) return null;
  let list = useData().branches;
  if (estado && estado !== "todos") list = list.filter((b) => sameState(b.estado, estado));
  return list.find((b) => normalizeBranchKey(b.shortName) === key) || fuzzyBranch(key, list);
}

/* Chave canônica da filial de um lançamento: a do cadastro quando a filial é
   reconhecida (inclusive com erro de digitação), senão a do próprio texto.
   Dois lançamentos "PVH1" e "phv 1" ficam com a mesma chave. */
export function branchKeyFor(text, estado) {
  const key = normalizeBranchKey(text);
  if (!key) return "";
  const b = findBranchByShortName(text, estado);
  return b ? normalizeBranchKey(b.shortName) : key;
}

/* Converte valor monetário opcional em número (null quando vazio). */
export function moneyOrNull(value) {
  if (value === undefined || value === null || value === "") return null;
  const num = Number(value);
  return isNaN(num) ? null : num;
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

/* "tempo_contratacao" e "custo_contratacao" já são calculados ao vivo a
   partir de "vagas" (ver useDashboardData.js — hiringAvgFor/costVacancyEntries),
   sem depender de nenhum snapshot gravado. syncAll() não tem mais nada pra
   recalcular, mas fica como no-op: é chamada em vários pontos do app (boot,
   troca de estado, fechamento de vaga) e removê-la exigiria tocar em todos
   esses pontos sem ganho nenhum. */
export function syncAll() {}

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
  filial = null,
  recrutador = null
}) {
  const vacancy = {
    id: createId(),
    name,
    openAt,
    closeAt: closeAt || null,
    salario: moneyOrNull(salario),
    tipoContratacao: tipoContratacao || null,
    estado: estado || null,
    filial: filial || null,
    recrutador: recrutador || null
  };
  upsertVacancy(vacancy);
  return vacancy;
}

export function updateVacancy(
  id,
  { name, openAt, closeAt, salario, tipoContratacao, estado, filial, recrutador }
) {
  const vacancy = getVacancyById(id);
  if (!vacancy) return null;
  const updated = {
    ...vacancy,
    name,
    openAt,
    closeAt: closeAt !== undefined ? closeAt || null : vacancy.closeAt,
    salario: salario !== undefined ? moneyOrNull(salario) : vacancy.salario,
    tipoContratacao:
      tipoContratacao !== undefined ? tipoContratacao || null : vacancy.tipoContratacao,
    estado: estado !== undefined ? estado || null : vacancy.estado,
    filial: filial !== undefined ? filial || null : vacancy.filial,
    recrutador: recrutador !== undefined ? recrutador || null : vacancy.recrutador
  };
  upsertVacancy(updated);
  return updated;
}

/* Fecha a vaga. Sem `closeDate`, usa o momento atual; com data (YYYY-MM-DD),
   encerra a vaga às 00:00 do dia informado. */
export function closeVacancy(id, closeDate = null) {
  const vacancy = getVacancyById(id);
  if (!vacancy || vacancy.closeAt) return null;
  const updated = { ...vacancy, closeAt: closeDate ? `${String(closeDate).slice(0, 10)}T00:00:00` : nowLocalISO() };
  upsertVacancy(updated);
  return updated;
}

/* Depois de excluir, recarrega os dados direto do servidor (mesmo mecanismo
   do botão "Recarregar Dados") — sem isso, uma exclusão que falhasse ao
   gravar na planilha (rede, sobrecarga do Apps Script) ficava "sumida" só
   localmente, e o app seguia mostrando dados desatualizados até um F5. */
export async function deleteVacancyRecord(id) {
  deleteVacancy(id);
  await reloadData();
}

/* Exclusão em lote. */
export async function deleteVacancies(ids) {
  (ids || []).forEach((id) => deleteVacancy(id));
  await reloadData();
}

/* Fechamento em lote: fecha as vagas ainda abertas. */
export function closeVacancies(ids, closeDate = null) {
  (ids || []).forEach((id) => {
    const v = getVacancyById(id);
    if (!v || v.closeAt) return;
    const closeAt = closeDate ? `${String(closeDate).slice(0, 10)}T00:00:00` : nowLocalISO();
    upsertVacancy({ ...v, closeAt });
  });
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

export function addTurnoverEntry({ filial = null, mesReferencia, admitidos = 0, demitidos = 0, ativos = 0, estado }) {
  const record = {
    id: createId(),
    filial: filial || null,
    mesReferencia: mesReferencia ? String(mesReferencia).slice(0, 7) : null,
    admitidos: Number(admitidos) || 0,
    demitidos: Number(demitidos) || 0,
    ativos: Number(ativos) || 0,
    estado: estado || null
  };
  upsertTurnover(record);
  return record;
}

export function updateTurnoverEntry(id, { filial, mesReferencia, admitidos, demitidos, ativos, estado }) {
  const record = getTurnoverById(id);
  if (!record) return null;
  const updated = {
    ...record,
    filial: filial !== undefined ? filial || null : record.filial,
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

/* Recarrega do servidor depois de excluir — ver deleteVacancyRecord acima. */
export async function deleteTurnoverEntry(id) {
  deleteTurnover(id);
  await reloadData();
}

/* Exclusão em lote (aba Histórico do Lançamento). */
export async function deleteTurnoverEntries(ids) {
  (ids || []).forEach((id) => deleteTurnover(id));
  await reloadData();
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

export function addPermanenciaRecord({ colaborador, dataAdmissao, dataDemissao, filial = null, estado }) {
  const record = {
    id: createId(),
    codigo: codigo != null && codigo !== "" ? String(codigo) : null,
    colaborador: String(colaborador || "").toUpperCase(),
    dataAdmissao: dataAdmissao || null,
    dataDemissao: dataDemissao || null,
    filial: filial || null,
    estado: estado || null
  };
  upsertPermanencia(record);
  return record;
}

export function updatePermanenciaRecord(id, { colaborador, dataAdmissao, dataDemissao, filial, estado }) {
  const record = getPermanenciaById(id);
  if (!record) return null;
  const updated = {
    ...record,
    colaborador: colaborador !== undefined ? String(colaborador || "").toUpperCase() : record.colaborador,
    dataAdmissao: dataAdmissao !== undefined ? dataAdmissao || null : record.dataAdmissao,
    dataDemissao: dataDemissao !== undefined ? dataDemissao || null : record.dataDemissao,
    filial: filial !== undefined ? filial || null : record.filial,
    estado: estado !== undefined ? estado || null : record.estado
  };
  upsertPermanencia(updated);
  return updated;
}

/* Recarrega do servidor depois de excluir — ver deleteVacancyRecord acima. */
export async function deletePermanenciaRecord(id) {
  deletePermanencia(id);
  await reloadData();
}

/* Exclusão em lote (modal de Tempo médio de permanência). */
export async function deletePermanenciaRecords(ids) {
  (ids || []).forEach((id) => deletePermanencia(id));
  await reloadData();
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

/* Filiais (nome abreviado lançado) que têm colaborador no estado, sem
   repetição (mesma chave normalizada) e em ordem alfabética — opções do
   filtro de filial do gráfico de Headcount. */
export function headcountFilialOptions(state) {
  const seen = new Map();
  filterByState(getHeadcounts(), state).forEach((h) => {
    const key = branchKeyFor(h.filial, h.estado);
    if (!key || seen.has(key)) return;
    const b = findBranchByShortName(h.filial, h.estado);
    seen.set(key, String((b && b.shortName) || h.filial).trim().toUpperCase());
  });
  return [...seen.values()].sort((a, b) => a.localeCompare(b, "pt-BR"));
}

/* Quadro do período por gênero — mesma reconstrução de headcountCountInRange.
   "total" conta todos os colaboradores (inclusive sem gênero informado). */
export function headcountGenderCountInRange(state, range, filial = "") {
  let list = filterByState(getHeadcounts(), state);
  if (filial) {
    const key = branchKeyFor(filial);
    list = list.filter((h) => branchKeyFor(h.filial, h.estado) === key);
  }
  const ym = range ? String(range.end || range.start || "").slice(0, 7) : "";
  if (ym) list = list.filter((h) => activeInMonth(h, ym));
  /* Aceita maiúsculas/minúsculas (dados vindos da planilha). */
  const is = (h, g) => String(h.genero || "").trim().toLowerCase() === g;
  return {
    masculino: list.filter((h) => is(h, "masculino")).length,
    feminino: list.filter((h) => is(h, "feminino")).length,
    total: list.length
  };
}

export function addHeadcountRecord({
  codigo = null,
  colaborador,
  funcao = null,
  remuneracao = null,
  dataAdmissao = null,
  mesReferencia,
  genero = null,
  tipoContrato = null,
  filial = null,
  estado
}) {
  const record = {
    id: createId(),
    colaborador: String(colaborador || "").toUpperCase(),
    funcao: funcao != null ? String(funcao).toUpperCase() : null,
    remuneracao: moneyOrNull(remuneracao),
    dataAdmissao: dataAdmissao || null,
    mesReferencia: mesReferencia ? String(mesReferencia).slice(0, 7) : null,
    genero: genero || null,
    tipoContrato: tipoContrato || null,
    filial: filial || null,
    estado: estado || null
  };
  upsertHeadcount(record);
  return record;
}

export function updateHeadcountRecord(
  id,
  { codigo, colaborador, funcao, remuneracao, dataAdmissao, mesReferencia, genero, tipoContrato, filial, estado }
) {
  const record = getHeadcountById(id);
  if (!record) return null;
  const updated = {
    ...record,
    codigo: codigo !== undefined ? (codigo != null && codigo !== "" ? String(codigo) : null) : record.codigo,
    colaborador: colaborador !== undefined ? String(colaborador || "").toUpperCase() : record.colaborador,
    funcao: funcao !== undefined ? (funcao != null ? String(funcao).toUpperCase() : null) : record.funcao,
    remuneracao: remuneracao !== undefined ? moneyOrNull(remuneracao) : record.remuneracao,
    dataAdmissao: dataAdmissao !== undefined ? dataAdmissao || null : record.dataAdmissao,
    mesReferencia:
      mesReferencia !== undefined ? (mesReferencia ? String(mesReferencia).slice(0, 7) : null) : record.mesReferencia,
    genero: genero !== undefined ? genero || null : record.genero,
    tipoContrato: tipoContrato !== undefined ? tipoContrato || null : record.tipoContrato,
    filial: filial !== undefined ? filial || null : record.filial,
    estado: estado !== undefined ? estado || null : record.estado
  };
  upsertHeadcount(updated);
  return updated;
}

/* Recarrega do servidor depois de excluir — ver deleteVacancyRecord acima. */
export async function deleteHeadcountRecord(id) {
  deleteHeadcount(id);
  await reloadData();
}

/* Exclusão em lote (aba Histórico do Lançamento). */
export async function deleteHeadcountRecords(ids) {
  (ids || []).forEach((id) => deleteHeadcount(id));
  await reloadData();
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
  const demitidosAindaFora = demitidosNoPeriodo;
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
