<script setup>
import { onMounted, onBeforeUnmount, onActivated, watch, ref } from "vue";
import { createMiniLineChart, updateMiniLineChart, setShowValues } from "@/lib/charts";
import { isDark } from "@/composables/useTheme";

const props = defineProps({
  entries: { type: Array, default: () => [] },
  showValues: { type: Boolean, default: false }
});

const canvas = ref(null);
let chart = null;

function mountChart() {
  if (!canvas.value) return;
  chart = createMiniLineChart(canvas.value);
  updateMiniLineChart(chart, props.entries);
  setShowValues(chart, props.showValues, { compact: true });
}

function unmountChart() {
  if (chart) {
    chart.destroy();
    chart = null;
  }
}

onMounted(mountChart);
onBeforeUnmount(unmountChart);

/* Ao voltar de uma aba mantida em cache (KeepAlive), reajusta o canvas. */
onActivated(() => {
  if (chart) chart.resize();
});

/* Recria o gráfico com a paleta do tema quando o modo claro/escuro muda */
watch(isDark, () => {
  unmountChart();
  mountChart();
});

watch(
  () => props.entries,
  (entries) => {
    if (chart) updateMiniLineChart(chart, entries);
  },
  { deep: true }
);

watch(
  () => props.showValues,
  (show) => {
    if (chart) setShowValues(chart, show, { compact: true });
  }
);
</script>

<template>
  <div class="h-10">
    <canvas ref="canvas" aria-hidden="true"></canvas>
  </div>
</template>
