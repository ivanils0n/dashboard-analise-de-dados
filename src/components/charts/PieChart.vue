<script setup>
import { onMounted, onBeforeUnmount, watch, ref } from "vue";
import { createPieChart, updatePieChart, setShowValues } from "@/lib/charts";
import { isDark } from "@/composables/useTheme";

const props = defineProps({
  data: { type: Array, default: () => [] },
  showValues: { type: Boolean, default: false },
  height: { type: String, default: "h-40" }
});

const canvas = ref(null);
let chart = null;

function mountChart() {
  if (!canvas.value) return;
  chart = createPieChart(canvas.value);
  updatePieChart(chart, props.data);
  setShowValues(chart, props.showValues);
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
  () => props.data,
  (data) => {
    if (chart) updatePieChart(chart, data);
  },
  { deep: true }
);

watch(
  () => props.showValues,
  (show) => {
    if (chart) setShowValues(chart, show);
  }
);
</script>

<template>
  <div class="relative" :class="height">
    <canvas ref="canvas" aria-hidden="true"></canvas>
  </div>
</template>
