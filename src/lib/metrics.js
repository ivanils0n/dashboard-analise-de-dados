/* Regras centrais de agregação dos indicadores.
   Único lugar que decide como um indicador é consolidado a partir dos seus
   lançamentos. Usado pelos KPIs, gráficos e pela camada de Feedback para
   garantir que todos sigam exatamente a mesma lógica. */

/* Identificadores cujo valor do período é a SOMA dos lançamentos. */
const SUM_INDICATORS = new Set(["absenteismo", "custo_diaria", "treinamento", "custo_total"]);

/* Identificador cujo valor do período é a MÉDIA dos lançamentos. */
const AVG_INDICATORS = new Set(["custo_contratacao"]);

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
    return sum / list.length;
  }
  return Number(list[list.length - 1].value) || null;
}

/* Totais do Absenteísmo por tipo (falta/atraso/afastamento). */
export function absenteismoTotals(list) {
  const totals = { falta: 0, atraso: 0, afastamento: 0 };
  (list || []).forEach((e) => {
    const type = e.meta && e.meta.type;
    if (type in totals) totals[type] += Number(e.value) || 0;
  });
  return totals;
}

/* Soma os valores por rótulo (ex.: custos por filial). */
export function sumByKey(list, keyOf, valueOf = (e) => Number(e.value) || 0) {
  const map = new Map();
  (list || []).forEach((e) => {
    const key = keyOf(e);
    map.set(key, (map.get(key) || 0) + valueOf(e));
  });
  return map;
}
