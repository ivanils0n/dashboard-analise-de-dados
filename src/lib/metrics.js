/* Regras centrais de agregação dos indicadores.
   Único lugar que decide como um indicador é consolidado a partir dos seus
   lançamentos, garantindo que KPIs e gráficos sigam exatamente a mesma lógica. */

/* Identificadores cujo valor do período é a SOMA dos lançamentos. */
const SUM_INDICATORS = new Set(["absenteismo", "treinamento", "custo_total"]);

/* Identificadores cujo valor do período é a MÉDIA dos lançamentos. */
const AVG_INDICATORS = new Set(["custo_diaria", "custo_contratacao"]);

/* Quantidade de colaboradores distintos numa lista de lançamentos (chave:
   employeeId, ou o nome quando não há id). Mesma regra do contador
   "Colaboradores" do modal de registros. */
export function uniqueEmployeeCount(list) {
  const keys = new Set();
  (list || []).forEach((e) => {
    const key = e && e.meta && (e.meta.employeeId || e.meta.employeeName);
    if (key) keys.add(key);
  });
  return keys.size;
}

/* Divisor da média da diária: colaboradores distintos identificados + cada
   lançamento SEM colaborador (contado como uma pessoa). Antes, se só alguns
   lançamentos tinham colaborador, os demais sumiam do divisor e a média
   ficava inflada. */
export function diariaDivisor(list) {
  const unnamed = (list || []).filter(
    (e) => !(e && e.meta && (e.meta.employeeId || e.meta.employeeName))
  ).length;
  return uniqueEmployeeCount(list) + unnamed;
}

export function aggregationKind(ind) {
  if (!ind) return "last";
  if (SUM_INDICATORS.has(ind.id)) return "sum";
  if (AVG_INDICATORS.has(ind.id)) return "avg";
  return "last";
}

/* Agrega uma lista de lançamentos segundo o tipo do indicador.
   Retorna null quando não há lançamentos. `list` deve vir ordenada por data. */
export function aggregateEntries(ind, list) {
  if (!list || !list.length) return null;
  const kind = aggregationKind(ind);
  if (kind === "sum") return list.reduce((s, e) => s + (Number(e.value) || 0), 0);
  if (kind === "avg") {
    const sum = list.reduce((s, e) => s + (Number(e.value) || 0), 0);
    /* Custo médio da diária = total pago ÷ colaboradores distintos (um mesmo
       colaborador pode ter várias diárias no período; dividir pelo número de
       lançamentos subestimava a média). Sem colaborador identificado nos
       lançamentos, cai para a divisão por lançamento. */
    if (ind.id === "custo_diaria") return sum / (diariaDivisor(list) || list.length);
    return sum / list.length;
  }
  /* Um lançamento com valor 0 é um dado válido (ex.: 0 dias de contratação)
     e não pode virar "sem dados": só devolve null quando o valor está
     ausente ou não é numérico. */
  const raw = list[list.length - 1].value;
  if (raw === null || raw === undefined || raw === "") return null;
  const last = Number(raw);
  return Number.isFinite(last) ? last : null;
}
