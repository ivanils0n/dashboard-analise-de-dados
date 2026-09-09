<script setup>
import { computed } from "vue";
import MiniLineChart from "@/components/charts/MiniLineChart.vue";
import PieChart from "@/components/charts/PieChart.vue";
import { formatValue, formatRawValue } from "@/lib/utils";

const props = defineProps({
  kpi: { type: Object, required: true },
  selected: { type: Boolean, default: false }
});

const emit = defineEmits(["select", "context"]);

/* Para indicadores onde "menor é melhor" (ex.: Absenteísmo), um aumento
   é ruim (vermelho) e uma queda é boa (verde). */
const goodWhenUp = computed(() => props.kpi.higherIsBetter !== false);

const deltaLabel = computed(() => {
  const d = props.kpi.delta;
  if (!d) return "sem dados";
  if (d.diff > 0) return `▲ ${formatRawValue(props.kpi, d.diff)}`;
  if (d.diff < 0) return `▼ ${formatRawValue(props.kpi, Math.abs(d.diff))}`;
  return "—";
});

const deltaTone = computed(() => {
  const d = props.kpi.delta;
  if (!d || d.diff === 0) return "text-zinc-400";
  const up = d.diff > 0;
  const good = goodWhenUp.value ? up : !up;
  return good ? "text-green-600 dark:text-green-400" : "text-red-600 dark:text-red-400";
});

const indicator = computed(() => ({ type: props.kpi.type, decimals: props.kpi.decimals ?? 1 }));
const valueText = computed(() =>
  props.kpi.current !== null && props.kpi.current !== undefined
    ? formatValue(indicator.value, props.kpi.current)
    : "—"
);

/* Dica de interação (clique direito) para KPIs com modal de detalhe. */
const contextHint = computed(() => {
  switch (props.kpi.id) {
    case "headcount":
      return "Botão direito: detalhes de custos";
    case "custo_diaria":
      return "Botão direito: lançamentos de diárias";
    case "treinamento":
      return "Botão direito: lançamentos de treinamento";
    default:
      return "";
  }
});

function onKeydown(e) {
  if (e.key === "Enter" || e.key === " ") {
    e.preventDefault();
    emit("select", props.kpi.id);
  }
}
</script>

<template>
  <article
    class="flex w-[240px] shrink-0 cursor-pointer flex-col rounded-2xl border bg-white p-4 shadow-sm transition hover:shadow-md dark:bg-zinc-900"
    :class="selected
      ? 'border-accent ring-2 ring-accent/30'
      : 'border-zinc-200 hover:border-zinc-300 dark:border-zinc-800 dark:hover:border-zinc-700'"
    role="button"
    tabindex="0"
    :title="kpi.desc"
    @click="emit('select', kpi.id)"
    @contextmenu.prevent="emit('context', kpi.id)"
    @keydown="onKeydown"
  >
    <div class="flex items-center justify-between gap-2">
      <span class="text-sm font-semibold text-zinc-600 dark:text-zinc-300">{{ kpi.name }}</span>
    </div>

    <!-- Turnover: pizza -->
    <div v-if="kpi.kind === 'pie'" class="mt-1">
      <p class="text-2xl font-bold text-zinc-900 dark:text-zinc-100">{{ kpi.value }}</p>
      <PieChart :data="kpi.pieData" height="h-28" />
    </div>

    <!-- Padrão: mini gráfico de linha -->
    <div v-else>
      <MiniLineChart :entries="kpi.entries" />
      <p class="mt-1 text-2xl font-bold text-zinc-900 dark:text-zinc-100">{{ valueText }}</p>
      <div class="mt-1 flex items-center justify-between gap-2 text-xs">
        <span :class="deltaTone">{{ deltaLabel }}</span>
        <span class="text-zinc-400">{{ kpi.countText }}</span>
      </div>
    </div>

    <div v-if="contextHint" class="mt-2 border-t border-zinc-100 pt-2 text-right text-[10px] uppercase tracking-wide text-zinc-400 dark:border-zinc-800 dark:text-zinc-500">
      {{ contextHint }}
    </div>
  </article>
</template>
