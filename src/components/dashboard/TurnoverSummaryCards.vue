<script setup>
import { computed } from "vue";
import KpiIcon from "@/components/dashboard/KpiIcon.vue";
import TurnoverCostCard from "@/components/dashboard/TurnoverCostCard.vue";
import { formatValue } from "@/lib/utils";

/* KPIs de Admissões e Demissões ao lado do gráfico de Turnover no Painel, com
   as quantidades do período e estado filtrados (mesmo estilo dos cards de KPI).
   `summary`: { admissoes, demissoes, entradaPct, saidaPct } — ver
   cockpitChartFor em useDashboardData.js.
   `showCost`: empilha o card de Custo de admissões acima de Admissões (Painel). */
const props = defineProps({
  summary: { type: Object, required: true },
  showCost: { type: Boolean, default: false },
  /* false no Painel (CockpitPanel): o gráfico já tem a taxa geral no centro
     da pizza, então o card "Geral" ficaria redundante ali. */
  showGeral: { type: Boolean, default: true }
});

/* Clique num card: abre o detalhe — id "geral" | "admissoes" | "demissoes". */
const emit = defineEmits(["select"]);

const PERCENT = { type: "percent", decimals: 1 };

const cards = computed(() => [
  ...(props.showGeral
    ? [
        {
          id: "geral",
          label: "Geral",
          value: formatValue(PERCENT, props.summary.totalPct),
          rate: `${props.summary.admissoes + props.summary.demissoes} movimentações`
        }
      ]
    : []),
  {
    id: "admissoes",
    label: "Admissões",
    value: props.summary.admissoes,
    rate: `Entrada ${formatValue(PERCENT, props.summary.entradaPct)}`
  },
  {
    id: "demissoes",
    label: "Demissões",
    value: props.summary.demissoes,
    rate: `Saída ${formatValue(PERCENT, props.summary.saidaPct)}`
  }
]);
</script>

<template>
  <div class="flex gap-3 md:w-[180px] md:shrink-0 md:flex-col md:justify-center md:[&>*]:flex-none">
    <TurnoverCostCard v-if="showCost" :summary="summary" />
    <button
      v-for="card in cards"
      :key="card.id"
      type="button"
      class="flex flex-1 cursor-pointer flex-col items-center justify-center gap-1.5 rounded-2xl border border-zinc-200 bg-white px-3 py-3 text-center shadow-sm transition hover:border-zinc-300 hover:shadow-md dark:border-zinc-800 dark:bg-zinc-900 dark:hover:border-zinc-700"
      :title="`Ver detalhes de ${card.label}`"
      @click="emit('select', card.id)"
    >
      <span
        class="flex h-8 w-8 items-center justify-center rounded-lg bg-zinc-100 text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400"
      >
        <KpiIcon :id="card.id" />
      </span>
      <span class="text-sm font-semibold text-zinc-600 dark:text-zinc-300">{{ card.label }}</span>
      <span class="text-2xl font-bold leading-tight tabular-nums text-zinc-900 dark:text-zinc-100">{{ card.value }}</span>
      <span class="text-xs text-zinc-400">{{ card.rate }}</span>
    </button>
  </div>
</template>
