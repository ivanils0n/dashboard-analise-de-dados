<script setup>
import { onMounted, onBeforeUnmount, onActivated, watch, ref, computed, nextTick } from "vue";
import Modal from "@/components/ui/Modal.vue";
import ChartEmpty from "@/components/charts/ChartEmpty.vue";
import { createBarChart, updateBarChart, createSeriesLineChart, updateSeriesLineChart, animateTrendLine, cancelTrendAnimation } from "@/lib/charts";
import { isDark } from "@/composables/useTheme";
import { formatCurrency, formatHoursClock } from "@/lib/utils";

const props = defineProps({
  data: { type: Array, default: () => [] },
  showValues: { type: Boolean, default: false },
  showTrend: { type: Boolean, default: true },
  animateTrend: { type: Boolean, default: false },
  heightPx: { type: Number, default: 288 },
  valueFormat: { type: String, default: "" },
  fluid: { type: Boolean, default: false },
  barsClickable: { type: Boolean, default: false },
  variant: { type: String, default: "bar" },
  lineXLabels: { type: Boolean, default: false },
  horizontal: { type: Boolean, default: false },
  alignTop: { type: Boolean, default: false },
  title: { type: String, default: "" },
  subtitle: { type: String, default: "" },
  singleCaption: { type: String, default: "" },
  showLegend: { type: Boolean, default: true },
  rotateValues: { type: Boolean, default: false }
});

const emit = defineEmits(["bar-click", "bar-contextmenu"]);

const isEmpty = computed(() =>
  props.data.every((row) =>
    Array.isArray(row.series) ? row.series.every((s) => !Number(s.value)) : !Number(row.value)
  )
);

const singleRow = computed(() => (props.variant !== "line" && !isEmpty.value && props.data.length === 1 ? props.data[0] : null));

const singleText = computed(() => {
  const row = singleRow.value;
  if (!row) return "";
  const formatter = formatterFor(props.valueFormat);
  if (formatter) return formatter(Number(row.value) || 0);
  if (row.tooltipValue) return String(row.tooltipValue);
  return Number(row.value || 0).toLocaleString("pt-BR", { maximumFractionDigits: 2 });
});

const singleParts = computed(() => {
  const row = singleRow.value;
  if (!row || !Array.isArray(row.series)) return [];
  const parts = row.series.filter((s) => s.label !== "Total");
  if (parts.length < 2) return [];
  const sum = parts.reduce((acc, s) => acc + (Number(s.value) || 0), 0);
  const showPct = sum > 0 && Math.abs(sum - (Number(row.value) || 0)) < 0.5;
  const formatter = formatterFor(props.valueFormat);
  return parts.map((s) => ({
    label: s.label,
    text: formatter ? formatter(Number(s.value) || 0) : (Number(s.value) || 0).toLocaleString("pt-BR", { maximumFractionDigits: 2 }),
    pct: showPct ? `${(((Number(s.value) || 0) / sum) * 100).toFixed(1).replace(".", ",")}%` : ""
  }));
});

function singlePayload() {
  const row = singleRow.value;
  return { index: 0, datasetIndex: 0, label: row ? row.label : "", value: row ? row.value : null };
}

function onSingleClick() {
  if (props.barsClickable && singleRow.value) emit("bar-click", singlePayload());
}

function onSingleContextmenu(evt) {
  if (!singleRow.value) return;
  evt.preventDefault();
  emit("bar-contextmenu", singlePayload());
}

const expandOpen = ref(false);

const ROW_PX = 30;
const isHorizontal = computed(() => props.horizontal && props.variant !== "line");
const seriesPerRow = computed(() => (props.data[0] && Array.isArray(props.data[0].series) ? props.data[0].series.length : 1));
const rowsHeightPx = computed(() => props.data.length * (seriesPerRow.value > 1 ? seriesPerRow.value * 24 + 12 : ROW_PX) + 48);
const rootStyle = computed(() => (props.fluid ? undefined : { height: props.heightPx + "px" }));
const canvasBoxStyle = computed(() => {
  if (!isHorizontal.value) return { height: "100%" };
  if (props.alignTop) return { height: `${rowsHeightPx.value}px` };
  return { height: `max(100%, ${rowsHeightPx.value}px)` };
});

function openFullscreen() {
  expandOpen.value = true;
}

defineExpose({ openFullscreen });

const canvas = ref(null);
let chart = null;

function onCanvasClick(evt) {
  if (!chart) return;
  const points = chart.getElementsAtEventForMode(evt, "nearest", { intersect: true }, true);
  if (!points.length) return;
  const index = points[0].index;
  const realValues = chart.__realBarValues;
  emit("bar-click", {
    index,
    datasetIndex: points[0].datasetIndex,
    label: chart.data.labels[index],
    value: realValues ? realValues[index] : chart.data.datasets[0] ? chart.data.datasets[0].data[index] : null
  });
}

function onCanvasContextmenu(evt) {
  if (!chart) return;
  const points = chart.getElementsAtEventForMode(evt, "nearest", { intersect: true }, true);
  if (!points.length) return;
  evt.preventDefault();
  const index = points[0].index;
  const realValues = chart.__realBarValues;
  emit("bar-contextmenu", {
    index,
    datasetIndex: points[0].datasetIndex,
    label: chart.data.labels[index],
    value: realValues ? realValues[index] : chart.data.datasets[0] ? chart.data.datasets[0].data[index] : null
  });
}

function formatterFor(format) {
  if (format === "currency") return (v) => formatCurrency(v);
  if (format === "percent") return (v) => `${Number(v).toFixed(1).replace(".", ",")}%`;
  if (format === "percent2") return (v) => `${Number(v).toFixed(2).replace(".", ",")}%`;
  if (format === "hours") {
    return (v) => formatHoursClock(v);
  }
  return null;
}

function applyOptions() {
  if (!chart) return;
  const formatter = formatterFor(props.valueFormat);
  const display = props.showValues && props.variant !== "line";
  chart.__valueLabels = { display, formatter };
  if (chart.options.plugins.valueLabels) {
    chart.options.plugins.valueLabels.display = display;
    chart.options.plugins.valueLabels.formatter = formatter;
  }
}

function drawData() {
  if (!chart) return;
  if (props.variant === "line") {
    updateSeriesLineChart(chart, props.data, { formatter: formatterFor(props.valueFormat), xTicks: props.lineXLabels });
  } else {
    updateBarChart(chart, props.data, { trend: props.showTrend, legend: props.showLegend, rotate: props.rotateValues });
    if (props.animateTrend && props.showTrend) animateTrendLine(chart);
    else chart.__trendProgress = undefined;
  }
}

async function refreshData() {
  if (!chart) return;
  if (!isHorizontal.value) return drawData();
  await nextTick();
  if (!chart) return;
  chart.resize();
  drawData();
}

function mountChart() {
  if (!canvas.value) return;
  chart =
    props.variant === "line"
      ? createSeriesLineChart(canvas.value)
      : createBarChart(canvas.value, { horizontal: isHorizontal.value });
  applyOptions();
  refreshData();
}

function unmountChart() {
  if (chart) {
    cancelTrendAnimation(chart);
    chart.destroy();
    chart = null;
  }
}

onMounted(mountChart);
onBeforeUnmount(unmountChart);

onActivated(() => {
  if (chart) chart.resize();
});

watch(isDark, () => {
  unmountChart();
  mountChart();
});

watch(
  () => [props.variant, isHorizontal.value],
  () => {
    unmountChart();
    mountChart();
  }
);

watch(
  () => props.data,
  () => refreshData(),
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
    refreshData();
  }
);

watch(
  () => [props.showTrend, props.showLegend, props.rotateValues],
  () => refreshData()
);
</script>

<template>
  <div
    class="relative w-full"
    :class="[fluid ? 'h-full' : '', isHorizontal ? 'overflow-y-auto overflow-x-hidden' : '']"
    :style="rootStyle"
  >
    <div class="relative w-full" :class="singleRow ? 'invisible' : ''" :style="canvasBoxStyle">
      <canvas
        ref="canvas"
        :class="barsClickable ? 'cursor-pointer' : ''"
        aria-hidden="true"
        @click="onCanvasClick"
        @contextmenu="onCanvasContextmenu"
      ></canvas>
    </div>
    <div
      v-if="singleRow"
      class="absolute inset-0 flex flex-col items-center justify-center gap-2 px-4 text-center"
      :class="barsClickable ? 'cursor-pointer' : ''"
      role="img"
      :aria-label="`${singleRow.label}: ${singleText}`"
      @click="onSingleClick"
      @contextmenu="onSingleContextmenu"
    >
      <span v-if="singleCaption" class="break-words text-sm font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">{{ singleCaption }}</span>
      <span v-else-if="singleRow.label" class="break-words text-sm font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">{{ singleRow.label }}</span>
      <span class="break-words text-5xl font-bold tabular-nums text-zinc-900 dark:text-zinc-100">{{ singleText }}</span>
      <div v-if="singleParts.length" class="mt-4 flex flex-wrap items-stretch justify-center gap-3">
        <div
          v-for="part in singleParts"
          :key="part.label"
          class="min-w-[120px] rounded-xl border border-zinc-200 bg-zinc-50 px-4 py-2.5 dark:border-zinc-700/70 dark:bg-zinc-800/50"
        >
          <div class="text-xs font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">{{ part.label }}</div>
          <div class="mt-0.5 text-xl font-bold tabular-nums text-zinc-900 dark:text-zinc-100">{{ part.text }}</div>
          <div v-if="part.pct" class="text-xs tabular-nums text-zinc-500 dark:text-zinc-400">{{ part.pct }}</div>
        </div>
      </div>
    </div>
    <ChartEmpty v-if="isEmpty" />
  </div>

  <Modal
    v-if="expandOpen"
    fullscreen
    :title="title || 'Gráfico'"
    :subtitle="subtitle"
    @close="expandOpen = false"
  >
    <div class="h-[calc(100dvh-190px)] min-h-[320px] w-full">
      <BarChart
        :data="data"
        :show-values="showValues"
        :show-trend="showTrend"
        :value-format="valueFormat"
        :bars-clickable="barsClickable"
        :variant="variant"
        :line-x-labels="lineXLabels"
        :horizontal="horizontal"
        :align-top="alignTop"
        fluid
        @bar-click="emit('bar-click', $event)"
        @bar-contextmenu="emit('bar-contextmenu', $event)"
      />
    </div>
  </Modal>
</template>
