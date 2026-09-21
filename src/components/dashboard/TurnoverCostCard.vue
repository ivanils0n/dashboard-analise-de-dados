<script setup>
import { computed } from "vue";
import KpiIcon from "@/components/dashboard/KpiIcon.vue";
import { formatValue } from "@/lib/utils";

/* KPI de Custo de admissões, à direita do gráfico de Turnover no Painel,
   acima do card de Admissões (renderizado por TurnoverSummaryCards com
   `show-cost`): soma dos salários das
   vagas fechadas no mês e estado filtrados. O custo anual é o mensal × 12.
   `summary`: { custoAdmissaoMensal } — ver cockpitChartFor em useDashboardData.js. */
const props = defineProps({
  summary: { type: Object, required: true }
});

const CURRENCY = { type: "currency", decimals: 2 };

const mensal = computed(() => props.summary.custoAdmissaoMensal);
const anual = computed(() => (mensal.value === null || mensal.value === undefined ? null : mensal.value * 12));
</script>

<template>
  <div
    class="flex flex-1 flex-col items-center justify-center gap-1.5 rounded-2xl border border-zinc-200 bg-white px-3 py-3 text-center shadow-sm dark:border-zinc-800 dark:bg-zinc-900"
  >
    <span
      class="flex h-8 w-8 items-center justify-center rounded-lg bg-zinc-100 text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400"
    >
      <KpiIcon id="custo_contratacao" />
    </span>
    <span class="text-sm font-semibold text-zinc-600 dark:text-zinc-300">Custo de admissões</span>
    <div class="flex flex-col items-center">
      <span class="text-[10px] font-semibold uppercase tracking-wide text-zinc-400">Custo mensal</span>
      <span class="max-w-full break-words text-xl font-bold leading-tight tabular-nums text-zinc-900 dark:text-zinc-100">
        {{ formatValue(CURRENCY, mensal) }}
      </span>
    </div>
    <div class="flex flex-col items-center">
      <span class="text-[10px] font-semibold uppercase tracking-wide text-zinc-400">Custo anual</span>
      <span class="max-w-full break-words text-sm font-semibold leading-tight tabular-nums text-zinc-600 dark:text-zinc-300">
        {{ formatValue(CURRENCY, anual) }}
      </span>
    </div>
  </div>
</template>
