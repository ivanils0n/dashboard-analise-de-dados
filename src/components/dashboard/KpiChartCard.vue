<script setup>
import { ref, computed, onMounted, onBeforeUnmount } from "vue";
import BarChart from "@/components/charts/BarChart.vue";
import PieChart from "@/components/charts/PieChart.vue";
import Badge from "@/components/ui/Badge.vue";
import Modal from "@/components/ui/Modal.vue";
import RetentionSummary from "@/components/dashboard/RetentionSummary.vue";
import TurnoverSummaryCards from "@/components/dashboard/TurnoverSummaryCards.vue";
import { getIndicatorById } from "@/lib/config";
import { aggregateByMonth, formatMonthLabel, formatValue } from "@/lib/utils";

/* Tipos cuja soma mensal não faz sentido — usa a média do mês. */
const AVG_TYPES = ["percent", "days", "months"];

const props = defineProps({
  card: { type: Object, required: true },
  entries: { type: Array, default: () => [] },
  pieData: { type: Array, default: () => [] },
  barData: { type: Array, default: () => [] },
  /* Card "table" (ex.: Retenção): { headcountInicial, headcountFinal,
     novasContratacoes, retencaoPct }. */
  tableData: { type: Object, default: null },
  showValues: { type: Boolean, default: false },
  /* Largura total (cards empilhados um abaixo do outro) em vez do card fixo
     de 280px da faixa horizontal. */
  stacked: { type: Boolean, default: false },
  /* Só no card de Turnover: quantidades do período ({ admissoes, demissoes,
     totalPct, entradaPct, saidaPct }) — mostradas ao lado da pizza, com a taxa
     total no centro. */
  turnoverSummary: { type: Object, default: null },
  /* Centro da rosca em pizzas que não são o Turnover: { value, caption }. */
  pieCenter: { type: Object, default: null }
});

const emit = defineEmits(["bar-click", "turnover-detail"]);

/* Taxa total de Turnover no centro da pizza. */
const centerInfo = computed(() => {
  if (props.turnoverSummary) {
    return { value: formatValue({ type: "percent", decimals: 1 }, props.turnoverSummary.totalPct), caption: "Turnover" };
  }
  return props.pieCenter || { value: "", caption: "" };
});

/* Clique num card de Admissões/Demissões: a tela hospeda o modal de detalhe.
   Da tela cheia, fecha o modal do gráfico antes. */
function onTurnoverDetail(kind) {
  fullscreenOpen.value = false;
  emit("turnover-detail", kind);
}

/* Altura do gráfico nos cards empilhados (padrão do BarChart: 288px). */
const STACKED_HEIGHT_PX = 340;

/* Tela cheia: gráficos de barras usam o modal do próprio BarChart; pizza e
   Retenção (tabela) abrem o modal deste card. */
const chartRef = ref(null);
const fullscreenOpen = ref(false);
function openFullscreen() {
  if (props.card.kind === "pie" || props.card.kind === "table") fullscreenOpen.value = true;
  else if (chartRef.value) chartRef.value.openFullscreen();
}

const flash = ref(false);
let flashTimer = null;

const indicator = computed(() => getIndicatorById(props.card.id) || { id: props.card.id, name: props.card.title });

/* Sentinela gravada como `date` dos lançamentos "sem período" (ver Custo da
   diária geral): cai sempre no mesmo mês (0001-01), o que permite isolar o
   grupo do restante da agregação mensal normal. */
const NO_PERIODO_MONTH = "0001-01";

/* Evolução por indicador: agrega os lançamentos por mês para o gráfico de
   barras (soma para contagens/valores, média para percentuais e prazos).
   Lançamentos "sem período" viram uma barra própria no fim, em vez de se
   misturarem com o mês real em que foram importados. */
const monthlyBarData = computed(() => {
  if (props.card.kind !== "line") return [];
  const method = AVG_TYPES.includes(indicator.value.type) ? "avg" : "sum";
  const monthly = aggregateByMonth(props.entries, method);
  const rows = [];
  let semPeriodo = null;
  monthly.forEach((m) => {
    const row = { label: formatMonthLabel(m.date), value: m.value, tooltipValue: formatValue(indicator.value, m.value) };
    if (m.date === NO_PERIODO_MONTH) {
      semPeriodo = { ...row, label: "Sem período" };
    } else {
      rows.push(row);
    }
  });
  if (semPeriodo) rows.push(semPeriodo);
  return rows;
});

const monthlyValueFormat = computed(() => {
  if (indicator.value.type === "currency") return "currency";
  if (indicator.value.type === "hours") return "hours";
  return "";
});

onMounted(() => {
  flash.value = true;
  flashTimer = setTimeout(() => (flash.value = false), 1800);
});

/* O card é remontado a cada troca de filtro/estado; sem isto o timer
   continuava vivo e escrevia num componente já desmontado. */
onBeforeUnmount(() => clearTimeout(flashTimer));
</script>

<template>
  <div
    class="rounded-2xl border border-zinc-200 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-900"
    :class="[stacked ? 'w-full p-5' : 'w-[280px] shrink-0 p-4', flash ? 'is-flash' : '']"
  >
    <div class="mb-3 flex items-start justify-between gap-2">
      <div>
        <h3 class="text-sm font-semibold text-zinc-900 dark:text-zinc-100">{{ card.title }}</h3>
        <span class="text-xs text-zinc-500 dark:text-zinc-400">{{ card.sub }}</span>
      </div>
      <div class="flex shrink-0 items-center gap-2">
        <Badge v-if="card.unit" tone="accent">{{ card.unit }}</Badge>
        <button
          type="button"
          class="icon-btn-sm"
          title="Tela cheia"
          :aria-label="`Ver gráfico ${card.title} em tela cheia`"
          @click="openFullscreen"
        >
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <path d="M8 3H5a2 2 0 0 0-2 2v3" />
            <path d="M16 3h3a2 2 0 0 1 2 2v3" />
            <path d="M8 21H5a2 2 0 0 1-2-2v-3" />
            <path d="M16 21h3a2 2 0 0 0 2-2v-3" />
          </svg>
        </button>
      </div>
    </div>

    <div v-if="card.kind === 'pie'" class="flex flex-col gap-4 md:flex-row md:items-center">
      <PieChart
        class="min-w-0 md:flex-1"
        :data="pieData"
        :show-values="showValues"
        :height="stacked ? 'h-[340px]' : 'h-52'"
        :center-value="centerInfo.value"
        :center-caption="centerInfo.caption"
        :value-format="card.valueFormat || 'percent'"
      />
      <TurnoverSummaryCards v-if="turnoverSummary" :summary="turnoverSummary" @select="onTurnoverDetail" />
    </div>
    <BarChart
      v-else-if="card.kind === 'bar'"
      ref="chartRef"
      :title="card.title"
      :subtitle="card.sub"
      :data="barData"
      :show-values="showValues"
      :show-trend="card.showTrend !== false"
      :value-format="card.valueFormat || ''"
      :height-px="stacked ? STACKED_HEIGHT_PX : undefined"
      :bars-clickable="card.id === 'custo_contratacao' || card.id === 'custo_diaria' || card.id === 'headcount'"
      :variant="card.variant || 'bar'"
      :horizontal="!!card.horizontal"
      @bar-click="emit('bar-click', $event)"
    />
    <RetentionSummary v-else-if="card.kind === 'table'" :table-data="tableData" />
    <BarChart
      v-else
      ref="chartRef"
      :title="card.title"
      :subtitle="card.sub"
      :data="monthlyBarData"
      :show-values="showValues"
      :show-trend="false"
      :value-format="monthlyValueFormat"
      :height-px="stacked ? STACKED_HEIGHT_PX : undefined"
    />

    <Modal v-if="fullscreenOpen" fullscreen :title="card.title" :subtitle="card.sub" @close="fullscreenOpen = false">
      <div class="h-[calc(100vh-190px)] min-h-[320px] w-full">
        <div v-if="card.kind === 'pie'" class="flex h-full flex-col gap-4 md:flex-row md:items-center">
          <PieChart
            class="min-h-0 min-w-0 md:flex-1"
            :data="pieData"
            :show-values="showValues"
            height="h-full"
            :center-value="centerInfo.value"
            :center-caption="centerInfo.caption"
            :value-format="card.valueFormat || 'percent'"
          />
          <TurnoverSummaryCards v-if="turnoverSummary" :summary="turnoverSummary" @select="onTurnoverDetail" />
        </div>
        <div v-else class="flex h-full items-center justify-center">
          <RetentionSummary :table-data="tableData" large />
        </div>
      </div>
    </Modal>
  </div>
</template>
