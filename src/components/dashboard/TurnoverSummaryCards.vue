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
  showGeral: { type: Boolean, default: true },
  /* A partir de que largura os cards viram uma coluna vertical de 180px ao lado
     do gráfico: "md" (padrão) ou "lg". Abaixo disso ficam alinhados numa linha
     horizontal (ex.: tablet no Painel, com a pizza ocupando a largura toda). */
  verticalFrom: { type: String, default: "md" }
});

const VERTICAL = {
  md: "md:h-full md:min-h-0 md:w-[180px] md:shrink-0 md:flex-col md:justify-center md:[&>*]:min-h-0 md:[&>*]:flex-auto md:[&>*]:overflow-hidden",
  lg: "lg:h-full lg:min-h-0 lg:w-[180px] lg:shrink-0 lg:flex-col lg:justify-center lg:[&>*]:min-h-0 lg:[&>*]:flex-auto lg:[&>*]:overflow-hidden"
};

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
  <div :class="[showCost ? 'grid grid-cols-2 gap-2 sm:flex sm:gap-3' : 'flex gap-3', VERTICAL[verticalFrom] || VERTICAL.md]">
    <TurnoverCostCard v-if="showCost" class="col-span-2 sm:col-span-1" :summary="summary" />
    <button
      v-for="card in cards"
      :key="card.id"
      type="button"
      class="flex flex-1 cursor-pointer flex-col items-center justify-center gap-1.5 rounded-2xl border border-zinc-200 bg-white px-3 py-2.5 text-center shadow-sm transition hover:border-zinc-300 hover:shadow-md dark:border-zinc-800 dark:bg-zinc-900 dark:hover:border-zinc-700"
      :title="`Ver detalhes de ${card.label}`"
      @click="emit('select', card.id)"
    >
      <span
        class="flex h-8 w-8 items-center justify-center rounded-lg bg-zinc-100 text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400"
      >
        <KpiIcon :id="card.id" />
      </span>
      <span class="text-sm font-semibold text-zinc-600 dark:text-zinc-300">{{ card.label }}</span>
      <span class="text-xl font-bold leading-tight tabular-nums sm:text-2xl text-zinc-900 dark:text-zinc-100">{{ card.value }}</span>
      <span class="text-xs text-zinc-400">{{ card.rate }}</span>
    </button>
  </div>
</template>
