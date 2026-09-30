<script setup>
import { onMounted, onBeforeUnmount, onActivated, watch, ref, computed } from "vue";
import ChartEmpty from "@/components/charts/ChartEmpty.vue";
import { createLineChart, updateLineChart, setShowValues } from "@/lib/charts";
import { isDark } from "@/composables/useTheme";

const props = defineProps({
  indicator: { type: Object, required: true },
  entries: { type: Array, default: () => [] },
  showValues: { type: Boolean, default: false },
  height: { type: String, default: "h-56" }
});

const isEmpty = computed(() => !props.entries.length);

const canvas = ref(null);
let chart = null;

function mountChart() {
  if (!canvas.value) return;
  chart = createLineChart(canvas.value);
  updateLineChart(chart, props.indicator, props.entries);
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

onActivated(() => {
  if (chart) chart.resize();
});

watch(isDark, () => {
  unmountChart();
  mountChart();
});

watch(
  () => [props.entries, props.indicator],
  () => {
    if (chart) updateLineChart(chart, props.indicator, props.entries);
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
    <ChartEmpty v-if="isEmpty" />
  </div>
</template>
