import { computed, ref } from "vue";
import { INDICATORS, getIndicatorById, ABSENTEEISM_TYPES } from "@/lib/config";
import { getEntriesFor, getAllEntries } from "@/lib/store";
import { computedSnapshot, listEmployees } from "@/lib/employees";
import { formatValue, formatDate } from "@/lib/utils";
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

  /* Valor de um indicador para uma lista de lançamentos:
     absenteísmo soma as ocorrências (cada evento = 1); custo usa a média;
     os demais usam o último valor do período. */
  function aggregateList(ind, list) {
    if (!list || !list.length) return null;
    if (ind.id === "absenteismo") {
      return list.reduce((s, e) => s + e.value, 0);
    }
    if (ind.id === "custo_contratacao") {
      const sum = list.reduce((s, e) => s + e.value, 0);
      return sum / list.length;
    }
    return list[list.length - 1].value;
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
      (ind) => ind.id !== "turnover_entradas" && ind.id !== "turnover_saidas" && ind.id !== "custo_contratacao"
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
    rows.sort((a, b) => b.entry.date.localeCompare(a.entry.date));

    if (!q) return rows;
    return rows.filter((r) => r.ind.name.toLowerCase().includes(q));
  }

  function formatEntryValue(ind, entry) {
    if (ind.form === "custo" && entry.meta && entry.meta.employeeName) {
      return `${formatValue(ind, entry.value)} · ${entry.meta.employeeName}`;
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
