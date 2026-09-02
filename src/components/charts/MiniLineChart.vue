<script setup>
import { onMounted, onBeforeUnmount, watch, ref } from "vue";
import { createMiniLineChart, updateMiniLineChart } from "@/lib/charts";
import { isDark } from "@/composables/useTheme";

const props = defineProps({
  entries: { type: Array, default: () => [] }
});

const canvas = ref(null);
let chart = null;

function mountChart() {
  if (!canvas.value) return;
  chart = createMiniLineChart(canvas.value);
  updateMiniLineChart(chart, props.entries);
}

function unmountChart() {
  if (chart) {
    chart.destroy();
    chart = null;
  }
}

onMounted(mountChart);
onBeforeUnmount(unmountChart);

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
</script>

<template>
  <div class="h-10">
    <canvas ref="canvas" aria-hidden="true"></canvas>
  </div>
</template>
