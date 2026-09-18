<script setup>
import { onMounted, onBeforeUnmount, onActivated, watch, ref } from "vue";
import { createPieChart, updatePieChart, setShowValues, formatPiePercent } from "@/lib/charts";
import { isDark } from "@/composables/useTheme";

const props = defineProps({
  data: { type: Array, default: () => [] },
  showValues: { type: Boolean, default: false },
  height: { type: String, default: "h-40" },
  /* Quando true, um clique na área do gráfico (fatias e centro; a legenda
     continua só alternando as fatias) emite "chart-click". */
  clickable: { type: Boolean, default: false }
});

const emit = defineEmits(["chart-click"]);

const canvas = ref(null);
const overPlot = ref(false);
let chart = null;

function insidePlot(evt) {
  const area = chart && chart.chartArea;
  if (!area) return false;
  return evt.offsetX >= area.left && evt.offsetX <= area.right && evt.offsetY >= area.top && evt.offsetY <= area.bottom;
}

function onCanvasClick(evt) {
  if (props.clickable && insidePlot(evt)) emit("chart-click");
}

function onCanvasMove(evt) {
  overPlot.value = props.clickable && insidePlot(evt);
}

function mountChart() {
  if (!canvas.value) return;
  chart = createPieChart(canvas.value);
  updatePieChart(chart, props.data);
  setShowValues(chart, props.showValues, { formatter: formatPiePercent });
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
  () => props.data,
  (data) => {
    if (chart) updatePieChart(chart, data);
  },
  { deep: true }
);

watch(
  () => props.showValues,
  (show) => {
    if (chart) setShowValues(chart, show, { formatter: formatPiePercent });
  }
);
</script>

<template>
  <div class="relative" :class="height">
    <canvas
      ref="canvas"
      :class="overPlot ? 'cursor-pointer' : ''"
      aria-hidden="true"
      @click="onCanvasClick"
      @mousemove="onCanvasMove"
      @mouseleave="overPlot = false"
    ></canvas>
  </div>
</template>
