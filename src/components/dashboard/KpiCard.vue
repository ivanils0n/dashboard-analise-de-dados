<script setup>
import { computed } from "vue";
import MiniLineChart from "@/components/charts/MiniLineChart.vue";
import PieChart from "@/components/charts/PieChart.vue";
import { formatValue, formatRawValue } from "@/lib/utils";

const props = defineProps({
  kpi: { type: Object, required: true },
  selected: { type: Boolean, default: false }
});

const emit = defineEmits(["select"]);

const deltaLabel = computed(() => {
  const d = props.kpi.delta;
  if (!d) return "sem dados";
  if (d.diff > 0) return `▲ ${formatRawValue(props.kpi, d.diff)}`;
  if (d.diff < 0) return `▼ ${formatRawValue(props.kpi, Math.abs(d.diff))}`;
  return "—";
});

const deltaTone = computed(() => {
  const d = props.kpi.delta;
  if (!d) return "text-zinc-400";
  if (d.diff > 0) return "text-green-600 dark:text-green-400";
  if (d.diff < 0) return "text-red-600 dark:text-red-400";
  return "text-zinc-400";
});

const indicator = computed(() => ({ type: props.kpi.type, decimals: props.kpi.decimals ?? 1 }));
const valueText = computed(() =>
  props.kpi.current !== null && props.kpi.current !== undefined
    ? formatValue(indicator.value, props.kpi.current)
    : "—"
);

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
  </article>
</template>
