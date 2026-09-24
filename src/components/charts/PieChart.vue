<script setup>
import { onMounted, onBeforeUnmount, onActivated, watch, ref } from "vue";
import { createPieChart, updatePieChart, setShowValues, setCenterText, setPieFormat, pieFormatter } from "@/lib/charts";
import { isDark } from "@/composables/useTheme";

const props = defineProps({
  data: { type: Array, default: () => [] },
  showValues: { type: Boolean, default: false },
  height: { type: String, default: "h-40" },
  /* Quando true, um clique na área do gráfico (fatias e centro; a legenda
     continua só alternando as fatias) emite "chart-click". */
  clickable: { type: Boolean, default: false },
  /* Texto no centro da rosca (ex.: taxa total de Turnover) e sua legenda. */
  centerValue: { type: String, default: "" },
  centerCaption: { type: String, default: "" },
  /* Formato dos valores (tooltip e rótulos): "percent" (Turnover) ou "currency". */
  valueFormat: { type: String, default: "percent" }
});

const emit = defineEmits(["chart-click", "chart-contextmenu"]);

const canvas = ref(null);
const overPlot = ref(false);
let chart = null;

function insidePlot(evt) {
  const area = chart && chart.chartArea;
  if (!area) return false;
  return evt.offsetX >= area.left && evt.offsetX <= area.right && evt.offsetY >= area.top && evt.offsetY <= area.bottom;
}

/* Índice da fatia sob o ponteiro (ex.: Turnover — 0 = Entrada/Admissões,
   1 = Saída/Demissões), para quem ouve "chart-click"/"chart-contextmenu"
   abrir o detalhe daquela fatia específica; `null` quando o clique cai fora
   de qualquer fatia (ex.: buraco central da rosca), mantendo o
   comportamento padrão de quem ouve o evento. */
function sliceIndexAt(evt) {
  if (!chart) return null;
  const hits = chart.getElementsAtEventForMode(evt, "nearest", { intersect: true }, false);
  return hits.length ? hits[0].index : null;
}

function onCanvasClick(evt) {
  if (props.clickable && insidePlot(evt)) emit("chart-click", sliceIndexAt(evt));
}

/* Botão direito na área do gráfico: mesmo destino do clique esquerdo (abre o
   modal de informações), sem o menu de contexto do navegador. */
function onCanvasContext(evt) {
  if (props.clickable && insidePlot(evt)) {
    evt.preventDefault();
    emit("chart-contextmenu", sliceIndexAt(evt));
  }
}

function onCanvasMove(evt) {
  overPlot.value = props.clickable && insidePlot(evt);
}

/* Pizza de contagem (Headcount por gênero) sempre mostra quantidade e % nas
   fatias, sem depender do botão "Mostrar valores". */
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

watch(() => [props.centerValue, props.centerCaption], applyCenterText);

/* A mesma pizza é reaproveitada entre KPIs (ex.: Turnover ↔ Custo médio por
   colaborador): ao trocar o formato, atualiza tooltip e rótulos. */
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
      :class="overPlot ? 'cursor-pointer' : ''"
      aria-hidden="true"
      @click="onCanvasClick"
      @contextmenu="onCanvasContext"
      @mousemove="onCanvasMove"
      @mouseleave="overPlot = false"
    ></canvas>
  </div>
</template>
