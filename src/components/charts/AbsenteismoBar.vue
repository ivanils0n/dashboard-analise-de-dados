<script setup>
import { onMounted, onBeforeUnmount, onActivated, watch, ref } from "vue";
import { createAbsenteismoBar, updateAbsenteismoBar, setShowValues } from "@/lib/charts";
import { isDark } from "@/composables/useTheme";

const props = defineProps({
  data: { type: Array, default: () => [] },
  showValues: { type: Boolean, default: false },
  height: { type: String, default: "h-56" }
});

const canvas = ref(null);
let chart = null;

function mountChart() {
  if (!canvas.value) return;
  chart = createAbsenteismoBar(canvas.value);
  updateAbsenteismoBar(chart, props.data);
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
    if (chart) updateAbsenteismoBar(chart, data);
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
