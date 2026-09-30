<script setup>
import { onMounted, onBeforeUnmount, onActivated, watch, ref, computed, nextTick } from "vue";
import ChartEmpty from "@/components/charts/ChartEmpty.vue";
import { createPieChart, updatePieChart, setShowValues, setCenterText, setPieFormat, pieFormatter } from "@/lib/charts";
import { isDark } from "@/composables/useTheme";

const props = defineProps({
  data: { type: Array, default: () => [] },
  showValues: { type: Boolean, default: false },
  height: { type: String, default: "h-40" },
  clickable: { type: Boolean, default: false },
  centerValue: { type: String, default: "" },
  centerCaption: { type: String, default: "" },
  valueFormat: { type: String, default: "percent" }
});

const isEmpty = computed(() => props.data.every((d) => !Number(d.value)));

const emit = defineEmits(["chart-click", "chart-contextmenu"]);

const canvas = ref(null);
const overPlot = ref(false);
let chart = null;

function insidePlot(evt) {
  const area = chart && chart.chartArea;
  if (!area) return false;
  return evt.offsetX >= area.left && evt.offsetX <= area.right && evt.offsetY >= area.top && evt.offsetY <= area.bottom;
}

function sliceIndexAt(evt) {
  if (!chart) return null;
  const hits = chart.getElementsAtEventForMode(evt, "nearest", { intersect: true }, false);
  return hits.length ? hits[0].index : null;
}

function onCanvasClick(evt) {
  if (props.clickable && insidePlot(evt)) emit("chart-click", sliceIndexAt(evt));
}

function onCanvasContext(evt) {
  if (props.clickable && insidePlot(evt)) {
    evt.preventDefault();
    emit("chart-contextmenu", sliceIndexAt(evt));
  }
}

function onCanvasMove(evt) {
  overPlot.value = props.clickable && insidePlot(evt);
}

function effectiveShow() {
  return props.showValues || props.valueFormat === "count";
}

function mountChart() {
  if (!canvas.value) return;
  chart = createPieChart(canvas.value);
  setPieFormat(chart, props.valueFormat);
  updatePieChart(chart, props.data);
  setShowValues(chart, effectiveShow(), { formatter: pieFormatter(props.valueFormat) });
  applyCenterText();
}

function applyCenterText() {
  setCenterText(chart, props.centerValue ? { value: props.centerValue, caption: props.centerCaption } : null);
}

function unmountChart() {
  if (chart) {
    chart.destroy();
    chart = null;
  }
}

const ready = ref(false);
let readyTimer = null;
function showWhenSized() {
  if (ready.value) return;
  if (chart) chart.resize();
  ready.value = true;
}
onMounted(() => {
  mountChart();
  nextTick(() => {
    if (chart) chart.resize();
    requestAnimationFrame(showWhenSized);
    readyTimer = setTimeout(showWhenSized, 120);
  });
});
onBeforeUnmount(() => {
  clearTimeout(readyTimer);
  unmountChart();
});

onActivated(() => {
  if (chart) chart.resize();
});

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

watch(() => [props.centerValue, props.centerCaption], applyCenterText);

watch(
  () => props.valueFormat,
  (format) => {
    if (!chart) return;
    setPieFormat(chart, format);
    setShowValues(chart, effectiveShow(), { formatter: pieFormatter(format) });
  }
);

watch(
  () => props.showValues,
  (show) => {
    if (chart) setShowValues(chart, effectiveShow(), { formatter: pieFormatter(props.valueFormat) });
  }
);
</script>

<template>
  <div class="relative" :class="height">
    <canvas
      ref="canvas"
      :class="[overPlot ? 'cursor-pointer' : '', ready ? 'opacity-100' : 'opacity-0', 'transition-opacity duration-200']"
      aria-hidden="true"
      @click="onCanvasClick"
      @contextmenu="onCanvasContext"
      @mousemove="onCanvasMove"
      @mouseleave="overPlot = false"
    ></canvas>
    <ChartEmpty v-if="isEmpty" />
  </div>
</template>
