import { computed, ref } from "vue";
import { INDICATORS, getIndicatorById, ABSENTEEISM_TYPES, STATES } from "@/lib/config";
import { getEntriesFor, getAllEntries, getBranches } from "@/lib/store";
import { computedSnapshot, listEmployees, listVacancies } from "@/lib/employees";
import {
  formatValue,
  formatDate,
  formatCurrency,
  aggregateByDay,
  normalizeText,
  compareDateDesc
} from "@/lib/utils";
import { aggregateEntries, absenteismoTotals } from "@/lib/metrics";
import { useFilters } from "@/composables/useFilters";

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
   filtro de período (reactive { start, end }) e do estado selecionado.
   Todos os totais são calculados diretamente sobre os lançamentos.
   `options.diariaShowSemPeriodo` (ref) controla o filtro "Mostrar sem
   período" do KPI de Custo da diária geral. */
export function useDashboardData(filter, options = {}) {
  const { state } = useFilters();
  const diariaShowSemPeriodo = options.diariaShowSemPeriodo || ref(false);

  function currentState() {
    /* Lê `revision` além de `current`: garante recomputação a cada troca de
       estado mesmo que o valor se repita (ex.: RO -> todos -> RO). */
    void state.revision;
    return state.current;
  }

  function filterByRange(list) {
    const start = filter.start;
    const end = filter.end;
    if (!start && !end) return list;
    return list.filter((e) => {
      if (start && e.date < start) return false;
      if (end && e.date > end) return false;
      return true;
    });
  }

  function filteredEntries(ind) {
    return filterByRange(getEntriesFor(ind.id, currentState()));
  }

  function absenteismoTypeTotals() {
    const ind = getIndicatorById("absenteismo");
    if (!ind) return { falta: 0, atraso: 0, afastamento: 0 };
    return absenteismoTotals(filteredEntries(ind));
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
     podem ocorrer na mesma data). Lançamentos importados sem período (ver
     importação por planilha) ficam de fora por padrão — não têm uma data
     real, então não respeitam o filtro de período — e só entram quando
     `includeSemPeriodo` é true (filtro ao lado do KPI). */
  function diariaDailySeries(includeSemPeriodo = false) {
    const ind = getIndicatorById("custo_diaria");
    if (!ind) return [];
    const all = getEntriesFor(ind.id, currentState());
    const comPeriodo = all.filter((e) => !(e.meta && e.meta.semPeriodo));
    let list = filterByRange(comPeriodo);
    if (includeSemPeriodo) {
      list = list.concat(all.filter((e) => e.meta && e.meta.semPeriodo));
    }
    return aggregateByDay(list);
  }

  /* Quantos lançamentos de diária foram importados sem período definido
     (estado/filtro atual, sem considerar o filtro de data). */
  function diariaSemPeriodoCount() {
    const ind = getIndicatorById("custo_diaria");
    if (!ind) return 0;
    return getEntriesFor(ind.id, currentState()).filter((e) => e.meta && e.meta.semPeriodo).length;
  }

  /* Valor de um indicador para uma lista de lançamentos (regra única de
     agregação, centralizada em lib/metrics.js). */
  function aggregateList(ind, list) {
    return aggregateEntries(ind, list);
  }

  /* Headcount por estado (uma barra por estado) para o card de barras. */
  function headcountBarByState() {
    return STATES.map((s) => {
      const value = computedSnapshot("headcount", s) || 0;
      return { label: s, value, tooltipValue: String(value) };
    });
  }

  /* Rótulo (filial) que agrupa um treinamento: usa o shortName gravado no
     lançamento; para lançamentos antigos, tenta localizar a filial pelo texto
     do cadastro. */
  function treinamentoFilialLabel(meta) {
    const m = meta || {};
    if (m.shortName) return String(m.shortName).toUpperCase();
    const text = String(m.filial || "").toUpperCase();
    if (!text) return "Sem filial";
    const branches = getBranches();
    const match =
      branches.find((b) => b.shortName && text.includes(String(b.shortName).toUpperCase())) ||
      branches.find((b) => b.name && text.includes(String(b.name).toUpperCase()));
    return match ? String(match.shortName || match.name).toUpperCase() : text;
  }

  /* Agregação para o gráfico de barras do Treinamento: soma a carga horária
     por filial (loja) no período filtrado. */
  function treinamentoBarByFilial() {
    const ind = getIndicatorById("treinamento");
    if (!ind) return [];
    const byFilial = new Map();
    filteredEntries(ind).forEach((e) => {
      const filial = treinamentoFilialLabel(e.meta);
      byFilial.set(filial, (byFilial.get(filial) || 0) + (Number(e.value) || 0));
    });
    return [...byFilial.entries()]
      .map(([label, value]) => ({
        label,
        value,
        tooltipValue: formatValue(ind, value)
      }))
      .sort((a, b) => b.value - a.value);
  }

  /* Lançamentos de treinamento de uma filial (usados ao clicar na barra). */
  function treinamentoFilialEntries(label) {
    const ind = getIndicatorById("treinamento");
    if (!ind) return [];
    return filteredEntries(ind).filter((e) => treinamentoFilialLabel(e.meta) === label);
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
        tooltipValue: formatCurrency(value)
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
      const allEntries = getEntriesFor(ind.id, currentState());
      let current = indicatorCurrentValue(ind);
      let prev = null;
      if (filter.start && allEntries.length) {
        const before = allEntries.filter((e) => e.date < filter.start);
        prev = before.length ? aggregateList(ind, before) : null;
      } else if (!filter.start && entries.length > 1) {
        /* Sem início de período: o "anterior" é a agregação de tudo menos o
           último lançamento (respeitando soma/média/último do indicador). */
        prev = aggregateList(ind, entries.slice(0, -1));
      }

      let delta = null;
      if (current !== null && prev !== null) {
        const diff = Number(current) - Number(prev);
        delta = { diff, up: diff > 0, down: diff < 0 };
      }

      /* "Mostrar sem período" (filtro ao lado do KPI): soma ao total exibido
         os lançamentos de diária importados sem competência definida — eles
         não entram em `entries`/`current` por padrão (ver diariaDailySeries). */
      let extraCount = 0;
      if (ind.id === "custo_diaria" && diariaShowSemPeriodo.value) {
        const semPeriodoEntries = allEntries.filter((e) => e.meta && e.meta.semPeriodo);
        extraCount = semPeriodoEntries.length;
        current = (Number(current) || 0) + semPeriodoEntries.reduce((sum, e) => sum + (Number(e.value) || 0), 0);
      }

      const totalCount = entries.length + extraCount;
      const countText = totalCount === 1 ? "1 lançamento" : `${totalCount} lançamentos`;

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

      const base = {
        id: ind.id,
        kind: "normal",
        name: ind.name,
        desc: ind.desc,
        type: ind.type,
        decimals: ind.decimals,
        higherIsBetter: ind.higherIsBetter !== false,
        current,
        prev,
        delta,
        countText,
        entries
      };

      /* Tempo médio de contratação: quantidade de vagas abertas/fechadas. */
      if (ind.id === "tempo_contratacao") {
        const vacs = listVacancies(currentState());
        base.vagasAbertas = vacs.filter((v) => !v.closeAt).length;
        base.vagasFechadas = vacs.filter((v) => v.closeAt).length;
      }

      return base;
    });
  });

  const selectedId = ref(null);

  const selectedKpiId = computed(() => selectedId.value);

  function selectKpi(id) {
    selectedId.value = id;
  }

  /* ---------- Faixa de gráficos por indicador ----------
     "Custos Totais" e "Treinamento" saem desta faixa e ganham gráfico próprio
     abaixo do Panorama (o KPI/card continua selecionável). */
  const kpiChartCards = computed(() => {
    const visible = INDICATORS.filter(
      (ind) =>
        ind.id !== "turnover_saidas" &&
        ind.id !== "custo_total" &&
        ind.id !== "treinamento"
    );
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
      if (ind.id === "headcount") {
        return {
          id: "headcount",
          kind: "bar",
          title: "Headcount",
          sub: "Por estado",
          unit: "colaboradores",
          valueFormat: "",
          showTrend: false
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
            { label: "Falta", value: t.falta, tooltipValue: String(t.falta) },
            { label: "Atestado", value: t.atraso, tooltipValue: String(t.atraso) },
            { label: "Acidente", value: t.afastamento, tooltipValue: String(t.afastamento) }
          ];
        }
        const value = indicatorCurrentValue(ind);
        return [
          {
            label: ind.name,
            value,
            tooltipValue: value === null ? "sem dados" : formatValue(ind, value),
            format: ind.id === "custo_total" ? "currency" : null
          }
        ];
      })
      .flat();
  });

  /* ---------- Tabela de lançamentos ---------- */

  function tableRows(query) {
    const q = normalizeText(query).trim();
    const all = getAllEntries();
    const rows = [];
    const stateTarget = String(currentState() || "").trim().toUpperCase();
    const matchesState = (e) =>
      stateTarget === "TODOS" ||
      String((e.meta && e.meta.estado) || "").trim().toUpperCase() === stateTarget;
    /* Diárias importadas sem período não têm uma data real (usam uma
       sentinela só para satisfazer o banco) — sempre aparecem aqui, sem
       respeitar o filtro de data do topo. */
    const inDateRange = (e) => {
      if (e.meta && e.meta.semPeriodo) return true;
      if (filter.start && e.date < filter.start) return false;
      if (filter.end && e.date > filter.end) return false;
      return true;
    };
    INDICATORS.forEach((ind) => {
      (all[ind.id] || []).forEach((e) => {
        if (!inDateRange(e)) return;
        if (!matchesState(e)) return;
        rows.push({ entry: e, ind });
      });
    });
    (all[SALARY_IND.id] || []).forEach((e) => {
      if (!inDateRange(e)) return;
      if (!matchesState(e)) return;
      rows.push({ entry: e, ind: SALARY_IND });
    });
    // Ordenação cronológica decrescente: o lançamento mais recente no topo.
    // Desempate por id (criações mais novas primeiro) para o mesmo dia.
    rows.sort(
      (a, b) =>
        compareDateDesc(a.entry.date, b.entry.date) ||
        String(b.entry.id || "").localeCompare(String(a.entry.id || ""))
    );

    if (!q) return rows;
    return rows.filter((r) => {
      if (normalizeText(r.ind.name).includes(q)) return true;
      const meta = r.entry.meta;
      if (!meta || typeof meta !== "object") return false;
      return Object.values(meta).some((v) => typeof v === "string" && normalizeText(v).includes(q));
    });
  }

  function formatEntryValue(ind, entry) {
    if (ind.form === "treinamento" && entry.meta) {
      const parts = [entry.meta.employeeName || "", entry.meta.tema || ""].filter(Boolean);
      return `${formatValue(ind, entry.value)} · ${parts.join(" — ")}`;
    }
    if (ind.form === "diaria" && entry.meta && entry.meta.employeeName) {
      const parts = [entry.meta.employeeName];
      if (entry.meta.motivo) parts.push(entry.meta.motivo);
      return `${formatValue(ind, entry.value)} · ${parts.join(" — ")}`;
    }
    if (ind.form === "custo" && entry.meta && entry.meta.employeeName) {
      return `${formatValue(ind, entry.value)} · ${entry.meta.employeeName}`;
    }
    if (ind.id === "custo_contratacao" && entry.meta && entry.meta.vacancyName) {
      return `${formatValue(ind, entry.value)} · ${entry.meta.vacancyName}`;
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
    diariaSemPeriodoCount,
    treinamentoBarByFilial,
    treinamentoFilialEntries,
    headcountBarByState,
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
