<script setup>
import { onMounted, onBeforeUnmount, watch, ref } from "vue";
import { createBarChart, updateBarChart } from "@/lib/charts";
import { isDark } from "@/composables/useTheme";

const props = defineProps({
  data: { type: Array, default: () => [] }
});

const canvas = ref(null);
let chart = null;

function mountChart() {
  if (!canvas.value) return;
  chart = createBarChart(canvas.value);
  updateBarChart(chart, props.data);
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
    if (chart) updateBarChart(chart, data);
  },
  { deep: true }
);
</script>

<template>
  <div class="relative h-72">
    <canvas ref="canvas" aria-hidden="true"></canvas>
  </div>
</template>
