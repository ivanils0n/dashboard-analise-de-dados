<script setup>
import { onMounted, onBeforeUnmount, onActivated, watch, ref } from "vue";
import { createBarChart, updateBarChart } from "@/lib/charts";
import { isDark } from "@/composables/useTheme";
import { formatCurrency, formatHoursClock } from "@/lib/utils";

const props = defineProps({
  data: { type: Array, default: () => [] },
  showValues: { type: Boolean, default: false },
  showTrend: { type: Boolean, default: true },
  heightPx: { type: Number, default: 288 },
  valueFormat: { type: String, default: "" }
});

const canvas = ref(null);
let chart = null;

function formatterFor(format) {
  if (format === "currency") return (v) => formatCurrency(v);
  if (format === "hours") {
    return (v) => formatHoursClock(v);
  }
  return null;
}

function applyOptions() {
  if (!chart) return;
  const formatter = formatterFor(props.valueFormat);
  chart.__valueLabels = { display: props.showValues, formatter };
  if (chart.options.plugins.valueLabels) {
    chart.options.plugins.valueLabels.display = props.showValues;
    chart.options.plugins.valueLabels.formatter = formatter;
  }
}

function mountChart() {
  if (!canvas.value) return;
  chart = createBarChart(canvas.value);
  applyOptions();
  /* Uma única atualização no mount (evita múltiplos resizes). */
  updateBarChart(chart, props.data, { format: props.valueFormat, trend: props.showTrend });
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
    if (chart) updateBarChart(chart, data, { format: props.valueFormat, trend: props.showTrend });
  },
  { deep: true }
);

watch(
  () => props.showValues,
  () => {
    if (!chart) return;
    applyOptions();
    chart.update();
  }
);

watch(
  () => props.valueFormat,
  () => {
    if (!chart) return;
    applyOptions();
    updateBarChart(chart, props.data, { format: props.valueFormat, trend: props.showTrend });
  }
);

watch(
  () => props.showTrend,
  () => {
    if (!chart) return;
    updateBarChart(chart, props.data, { format: props.valueFormat, trend: props.showTrend });
  }
);
</script>

<template>
  <div class="relative w-full" :style="{ height: heightPx + 'px' }">
    <canvas ref="canvas" aria-hidden="true"></canvas>
  </div>
</template>
