/* Regras centrais de agregação dos indicadores.
   Único lugar que decide como um indicador é consolidado a partir dos seus
   lançamentos, garantindo que KPIs e gráficos sigam exatamente a mesma lógica. */

/* Identificadores cujo valor do período é a SOMA dos lançamentos. */
const SUM_INDICATORS = new Set(["absenteismo", "treinamento", "custo_total", "custo_contratacao"]);

/* Identificador cujo valor do período é a MÉDIA dos lançamentos. */
const AVG_INDICATORS = new Set(["custo_diaria"]);

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
  /* Um lançamento com valor 0 é um dado válido (ex.: 0 dias de contratação)
     e não pode virar "sem dados": só devolve null quando o valor está
     ausente ou não é numérico. */
  const raw = list[list.length - 1].value;
  if (raw === null || raw === undefined || raw === "") return null;
  const last = Number(raw);
  return Number.isFinite(last) ? last : null;
}

/* Totais do Absenteísmo por tipo (falta/atraso/afastamento). */
export function absenteismoTotals(list) {
  const totals = { falta: 0, atraso: 0, afastamento: 0 };
  (list || []).forEach((e) => {
    const type = e.meta && e.meta.type;
    /* hasOwnProperty, não `in`: `in` também casa com o protótipo
       ("toString", "constructor"...) e criaria chaves espúrias no total. */
    if (Object.prototype.hasOwnProperty.call(totals, type)) {
      totals[type] += Number(e.value) || 0;
    }
  });
  return totals;
}
