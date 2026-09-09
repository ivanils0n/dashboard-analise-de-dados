import { computed, ref } from "vue";
import { INDICATORS, getIndicatorById, ABSENTEEISM_TYPES } from "@/lib/config";
import { getEntriesFor, getAllEntries } from "@/lib/store";
import { computedSnapshot, listEmployees } from "@/lib/employees";
import { formatValue, formatDate, formatCurrency, aggregateByDay } from "@/lib/utils";
import { useFilters } from "./useFilters";

/* Lançamento especial "Salário dos Colaboradores": não vira KPI/gráfico,
   mas aparece em "Lançamentos recentes" com formatação de moeda. */
const SALARY_IND = {
  id: "salario_colaborador",
  name: "Salário dos Colaboradores",
  type: "currency",
  decimals: 2,
  form: "salario"
};

/* Centraliza o cálculo dos dados exibidos no dashboard a partir do
   filtro de período (reactive { start, end }) e do estado selecionado. */
export function useDashboardData(filter) {
  const { state } = useFilters();

  function currentState() {
    return state.current;
  }

  function filteredEntries(ind) {
    const list = getEntriesFor(ind.id, currentState());
    const start = filter.start;
    const end = filter.end;
    if (!start && !end) return list;
    return list.filter((e) => {
      if (start && e.date < start) return false;
      if (end && e.date > end) return false;
      return true;
    });
  }

  function absTotalsFromEntries(entries) {
    const totals = { falta: 0, atraso: 0, afastamento: 0 };
    (entries || []).forEach((e) => {
      const type = e.meta && e.meta.type;
      if (type in totals) totals[type] += e.value || 0;
    });
    return totals;
  }

  function absenteismoTypeTotals() {
    const ind = getIndicatorById("absenteismo");
    if (!ind) return { falta: 0, atraso: 0, afastamento: 0 };
    return absTotalsFromEntries(filteredEntries(ind));
  }

  /* Série diária do Absenteísmo para o gráfico de evolução: soma as
     ocorrências do dia (agregação total, sem visão individual).
     Ex.: 1 falta + 1 atestado no mesmo dia => um único ponto com valor 2. */
  function absenteismoDailySeries() {
    const ind = getIndicatorById("absenteismo");
    if (!ind) return [];
    return aggregateByDay(filteredEntries(ind));
  }

  /* Série diária das diárias: soma o valor pago por dia (vários lançamentos
     podem ocorrer na mesma data). */
  function diariaDailySeries() {
    const ind = getIndicatorById("custo_diaria");
    if (!ind) return [];
    return aggregateByDay(filteredEntries(ind));
  }

  /* Série diária do Treinamento: soma a carga horária por dia. */
  function trainingDailySeries() {
    const ind = getIndicatorById("treinamento");
    if (!ind) return [];
    return aggregateByDay(filteredEntries(ind));
  }

  /* Valor de um indicador para uma lista de lançamentos:
     absenteísmo soma as ocorrências (cada evento = 1); diárias, treinamento
     e custos totais somam o valor/horas no período; custo usa a média; os
     demais usam o último valor. */
  function aggregateList(ind, list) {
    if (!list || !list.length) return null;
    if (
      ind.id === "absenteismo" ||
      ind.id === "custo_diaria" ||
      ind.id === "treinamento" ||
      ind.id === "custo_total"
    ) {
      return list.reduce((s, e) => s + e.value, 0);
    }
    if (ind.id === "custo_contratacao") {
      const sum = list.reduce((s, e) => s + e.value, 0);
      return sum / list.length;
    }
    return list[list.length - 1].value;
  }

  /* Agregação para o gráfico de barras do Treinamento: soma o valor pago
     por filial (loja) no período filtrado. */
  function treinamentoBarByFilial() {
    const ind = getIndicatorById("treinamento");
    if (!ind) return [];
    const byFilial = new Map();
    filteredEntries(ind).forEach((e) => {
      const meta = e.meta || {};
      const filial = meta.filial || "Sem filial";
      const valor = meta.valorPago != null ? Number(meta.valorPago) : 0;
      byFilial.set(filial, (byFilial.get(filial) || 0) + valor);
    });
    return [...byFilial.entries()]
      .map(([label, value]) => ({
        label,
        value,
        tooltip: `${label}: ${formatCurrency(value)}`
      }))
      .sort((a, b) => b.value - a.value);
  }

  /* Agregação para o gráfico de barras dos Custos Totais: soma os custos
     lançados por filial (razão social) no período filtrado. */
  function custosBarByFilial() {
    const ind = getIndicatorById("custo_total");
    if (!ind) return [];
    const byFilial = new Map();
    filteredEntries(ind).forEach((e) => {
      const meta = e.meta || {};
      const filial = meta.filial || meta.razaoSocial || "Sem filial";
      byFilial.set(filial, (byFilial.get(filial) || 0) + (Number(e.value) || 0));
    });
    return [...byFilial.entries()]
      .map(([label, value]) => ({
        label,
        value,
        tooltip: `${label}: ${formatCurrency(value)}`
      }))
      .sort((a, b) => b.value - a.value);
  }

  function indicatorCurrentValue(ind) {
    if (ind.computed) {
      return computedSnapshot(ind.id, currentState());
    }
    return aggregateList(ind, filteredEntries(ind));
  }

  /* ---------- KPIs ---------- */

  const kpis = computed(() => {
    const visible = INDICATORS.filter((ind) => ind.id !== "turnover_saidas");
    return visible.map((ind) => {
      const entries = filteredEntries(ind);
      const allEntries =
        currentState() !== "todos" ? getEntriesFor(ind.id, currentState()) : getEntriesFor(ind.id);
      const current = indicatorCurrentValue(ind);
      let prev = null;
      if (filter.start && allEntries.length) {
        const before = allEntries.filter((e) => e.date < filter.start);
        prev = before.length ? aggregateList(ind, before) : null;
      } else if (!filter.start && entries.length > 1) {
        prev = entries[entries.length - 2].value;
      }

      let delta = null;
      if (current !== null && prev !== null) {
        const diff = Number(current) - Number(prev);
        delta = { diff, up: diff > 0, down: diff < 0 };
      }

      const countText = entries.length === 1 ? "1 lançamento" : `${entries.length} lançamentos`;

      /* Card especial do Turnover (entradas vs saídas) */
      if (ind.id === "turnover_entradas") {
        const entradas = indicatorCurrentValue(getIndicatorById("turnover_entradas")) || 0;
        const saidas = indicatorCurrentValue(getIndicatorById("turnover_saidas")) || 0;
        return {
          id: "turnover_total",
          kind: "pie",
          name: "Turnover",
          value: entradas + saidas,
          countText,
          pieData: [
            { label: "Entradas", value: entradas },
            { label: "Saídas", value: saidas }
          ]
        };
      }

      /* Card especial do Turnover no período de experiência */
      if (ind.id === "turnover_experiencia") {
        const val = indicatorCurrentValue(ind) || 0;
        const ativosExp = listEmployees(currentState()).filter(
          (e) => e.type === "experiencia" && e.status === "ativo"
        ).length;
        return {
          id: "turnover_experiencia",
          kind: "pie",
          name: "Turnover (Exp)",
          value: val,
          countText,
          pieData: [
            { label: "Entradas", value: ativosExp },
            { label: "Saídas", value: val }
          ]
        };
      }

      return {
        id: ind.id,
        kind: "normal",
        name: ind.name,
        desc: ind.desc,
        type: ind.type,
        higherIsBetter: ind.higherIsBetter !== false,
        current,
        prev,
        delta,
        countText,
        entries
      };
    });
  });

  const selectedId = ref(null);

  const selectedKpiId = computed(() => selectedId.value);

  function selectKpi(id) {
    selectedId.value = id;
  }

  /* ---------- Faixa de gráficos por indicador ---------- */

  const kpiChartCards = computed(() => {
    const visible = INDICATORS.filter((ind) => ind.id !== "turnover_saidas");
    return visible.map((ind) => {
      if (ind.id === "turnover_entradas") {
        return {
          id: "turnover_entradas",
          kind: "pie",
          title: "Turnover",
          sub: "Entradas vs Saídas",
          unit: ""
        };
      }
      if (ind.id === "turnover_experiencia") {
        return {
          id: "turnover_experiencia",
          kind: "pie",
          title: ind.name,
          sub: "Entradas vs Saídas",
          unit: ""
        };
      }
      if (ind.id === "treinamento") {
        return {
          id: "treinamento",
          kind: "bar",
          title: "Treinamento",
          sub: "Valor pago por filial",
          unit: "R$"
        };
      }
      if (ind.id === "custo_total") {
        return {
          id: "custo_total",
          kind: "bar",
          title: "Custos Totais",
          sub: "Custo por filial",
          unit: "R$"
        };
      }
      return { id: ind.id, kind: "line", title: ind.name, sub: "Evolução no período", unit: ind.unit };
    });
  });

  function chartPieData(kind) {
    if (kind === "turnover_entradas") {
      const entradas = indicatorCurrentValue(getIndicatorById("turnover_entradas")) || 0;
      const saidas = indicatorCurrentValue(getIndicatorById("turnover_saidas")) || 0;
      return [
        { label: "Entradas", value: entradas },
        { label: "Saídas", value: saidas }
      ];
    }
    const saidas = indicatorCurrentValue(getIndicatorById("turnover_experiencia")) || 0;
    const ativosExp = listEmployees(currentState()).filter(
      (e) => e.type === "experiencia" && e.status === "ativo"
    ).length;
    return [
      { label: "Entradas", value: ativosExp },
      { label: "Saídas", value: saidas }
    ];
  }

  /* ---------- Panorama (barras) ---------- */

  const panorama = computed(() => {
    return INDICATORS.filter(
      (ind) =>
        ind.id !== "turnover_entradas" &&
        ind.id !== "turnover_saidas" &&
        ind.id !== "custo_contratacao" &&
        ind.id !== "treinamento"
    )
      .map((ind) => {
        if (ind.id === "absenteismo") {
          const t = absenteismoTypeTotals();
          return [
            { label: "Falta", value: t.falta, tooltip: `Falta: ${t.falta}` },
            { label: "Atestado", value: t.atraso, tooltip: `Atestado: ${t.atraso}` },
            { label: "Acidente", value: t.afastamento, tooltip: `Acidente: ${t.afastamento}` }
          ];
        }
        const value = indicatorCurrentValue(ind);
        return [
          {
            label: ind.name,
            value,
            tooltip: value === null ? `${ind.name}: sem dados` : `${ind.name}: ${formatValue(ind, value)}`
          }
        ];
      })
      .flat();
  });

  /* ---------- Tabela de lançamentos ---------- */

  function tableRows(query) {
    const q = (query || "").trim().toLowerCase();
    const all = getAllEntries();
    const rows = [];
    INDICATORS.forEach((ind) => {
      (all[ind.id] || []).forEach((e) => {
        if (filter.start && e.date < filter.start) return;
        if (filter.end && e.date > filter.end) return;
        if (currentState() !== "todos" && !(e.meta && e.meta.estado === currentState())) return;
        rows.push({ entry: e, ind });
      });
    });
    (all[SALARY_IND.id] || []).forEach((e) => {
      if (filter.start && e.date < filter.start) return;
      if (filter.end && e.date > filter.end) return;
      if (currentState() !== "todos" && !(e.meta && e.meta.estado === currentState())) return;
      rows.push({ entry: e, ind: SALARY_IND });
    });
    // Ordenação cronológica decrescente: o lançamento mais recente no topo.
    // Desempate por id (criações mais novas primeiro) para o mesmo dia.
    rows.sort((a, b) => b.entry.date.localeCompare(a.entry.date) || b.entry.id.localeCompare(a.entry.id));

    if (!q) return rows;
    return rows.filter((r) => {
      if (r.ind.name.toLowerCase().includes(q)) return true;
      const meta = r.entry.meta;
      if (!meta || typeof meta !== "object") return false;
      return Object.values(meta).some((v) => typeof v === "string" && v.toLowerCase().includes(q));
    });
  }

  function formatEntryValue(ind, entry) {
    if (ind.form === "treinamento" && entry.meta) {
      const parts = [entry.meta.employeeName || "", entry.meta.tema || ""].filter(Boolean);
      return `${formatValue(ind, entry.value)} · ${parts.join(" — ")}`;
    }
    if (ind.form === "diaria" && entry.meta && entry.meta.employeeName) {
      const parts = [entry.meta.employeeName];
      if (entry.meta.pagamento) parts.push(entry.meta.pagamento);
      return `${formatValue(ind, entry.value)} · ${parts.join(" — ")}`;
    }
    if (ind.form === "custo" && entry.meta && entry.meta.employeeName) {
      return `${formatValue(ind, entry.value)} · ${entry.meta.employeeName}`;
    }
    if (ind.form === "custo_total" && entry.meta && entry.meta.razaoSocial) {
      return `${formatValue(ind, entry.value)} · ${entry.meta.razaoSocial}`;
    }
    if (ind.form === "salario" && entry.meta && entry.meta.employeeName) {
      return `${formatValue(ind, entry.value)} · ${entry.meta.employeeName}`;
    }
    if (ind.form === "absenteismo" && entry.meta) {
      const label = ABSENTEEISM_TYPES[entry.meta.type] || entry.meta.type;
      return `${formatValue(ind, entry.value)} · ${label}`;
    }
    return formatValue(ind, entry.value);
  }

  return {
    filteredEntries,
    absenteismoTypeTotals,
    absenteismoDailySeries,
    diariaDailySeries,
    trainingDailySeries,
    treinamentoBarByFilial,
    custosBarByFilial,
    indicatorCurrentValue,
    kpis,
    selectedKpiId,
    selectKpi,
    kpiChartCards,
    chartPieData,
    panorama,
    tableRows,
    formatEntryValue,
    formatDate
  };
}
