<script setup>
import { onMounted, onBeforeUnmount, onActivated, watch, ref } from "vue";
import Modal from "@/components/ui/Modal.vue";
import { createBarChart, updateBarChart, createSeriesLineChart, updateSeriesLineChart } from "@/lib/charts";
import { isDark } from "@/composables/useTheme";
import { formatCurrency, formatHoursClock } from "@/lib/utils";

const props = defineProps({
  data: { type: Array, default: () => [] },
  showValues: { type: Boolean, default: false },
  showTrend: { type: Boolean, default: true },
  heightPx: { type: Number, default: 288 },
  valueFormat: { type: String, default: "" },
  /* Ocupa toda a altura do contêiner (usado no modo tela cheia). */
  fluid: { type: Boolean, default: false },
  /* Habilita o clique nas barras (emite "bar-click"). */
  barsClickable: { type: Boolean, default: false },
  /* "line": mesmos dados, desenhados como linha (pontos clicáveis). */
  variant: { type: String, default: "bar" },
  title: { type: String, default: "" },
  subtitle: { type: String, default: "" }
});

const emit = defineEmits(["bar-click", "bar-contextmenu"]);

const expandOpen = ref(false);

/* Abre o modal em tela cheia. O botão fica no cabeçalho da seção,
   fora da área do gráfico (chamado via ref pelo componente pai). */
function openFullscreen() {
  expandOpen.value = true;
}

defineExpose({ openFullscreen });

const canvas = ref(null);
let chart = null;

/* Clique em uma barra: identifica o índice sob o cursor e emite o rótulo. */
function onCanvasClick(evt) {
  if (!chart) return;
  const points = chart.getElementsAtEventForMode(evt, "nearest", { intersect: true }, true);
  if (!points.length) return;
  const index = points[0].index;
  const realValues = chart.__realBarValues;
  emit("bar-click", {
    index,
    label: chart.data.labels[index],
    value: realValues ? realValues[index] : chart.data.datasets[0] ? chart.data.datasets[0].data[index] : null
  });
}

/* Botão direito numa barra: mesmo cálculo de índice/valor do clique normal,
   mas emite "bar-contextmenu" (ex.: editar direto, sem passar pelo detalhe)
   e bloqueia o menu nativo do navegador. */
function onCanvasContextmenu(evt) {
  if (!chart) return;
  const points = chart.getElementsAtEventForMode(evt, "nearest", { intersect: true }, true);
  if (!points.length) return;
  evt.preventDefault();
  const index = points[0].index;
  const realValues = chart.__realBarValues;
  emit("bar-contextmenu", {
    index,
    label: chart.data.labels[index],
    value: realValues ? realValues[index] : chart.data.datasets[0] ? chart.data.datasets[0].data[index] : null
  });
}

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
  /* Linha: sem números sobre os pontos — os valores ficam no tooltip. */
  const display = props.showValues && props.variant !== "line";
  chart.__valueLabels = { display, formatter };
  if (chart.options.plugins.valueLabels) {
    chart.options.plugins.valueLabels.display = display;
    chart.options.plugins.valueLabels.formatter = formatter;
  }
}

/* Desenha os dados no formato do variant atual (barras ou linha). */
function refreshData() {
  if (!chart) return;
  if (props.variant === "line") {
    updateSeriesLineChart(chart, props.data, { formatter: formatterFor(props.valueFormat) });
  } else {
    updateBarChart(chart, props.data, { trend: props.showTrend });
  }
}

function mountChart() {
  if (!canvas.value) return;
  chart = props.variant === "line" ? createSeriesLineChart(canvas.value) : createBarChart(canvas.value);
  applyOptions();
  /* Uma única atualização no mount (evita múltiplos resizes). */
  refreshData();
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

/* O mesmo componente é reaproveitado ao trocar de KPI (ex.: no Cockpit); sem
   recriar, o gráfico ficava no formato anterior (barras em vez de linha). */
watch(
  () => props.variant,
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
  () => props.showTrend,
  () => refreshData()
);
</script>

<template>
  <div
    class="relative w-full"
    :class="fluid ? 'h-full' : ''"
    :style="fluid ? undefined : { height: heightPx + 'px' }"
  >
    <canvas
      ref="canvas"
      :class="barsClickable ? 'cursor-pointer' : ''"
      aria-hidden="true"
      @click="onCanvasClick"
      @contextmenu="onCanvasContextmenu"
    ></canvas>
  </div>

  <Modal
    v-if="expandOpen"
    fullscreen
    :title="title || 'Gráfico'"
    :subtitle="subtitle"
    @close="expandOpen = false"
  >
    <div class="h-[calc(100vh-190px)] min-h-[320px] w-full">
      <BarChart
        :data="data"
        :show-values="showValues"
        :show-trend="showTrend"
        :value-format="valueFormat"
        :bars-clickable="barsClickable"
        :variant="variant"
        fluid
        @bar-click="emit('bar-click', $event)"
        @bar-contextmenu="emit('bar-contextmenu', $event)"
      />
    </div>
  </Modal>
</template>
