<script setup>
import { ref, computed, onMounted, onBeforeUnmount } from "vue";
import BarChart from "@/components/charts/BarChart.vue";
import PieChart from "@/components/charts/PieChart.vue";
import Badge from "@/components/ui/Badge.vue";
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
  showValues: { type: Boolean, default: false }
});

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

/* Card "table" (Retenção): cada valor cai em "—" quando ainda não há dado
   suficiente (ex.: sem headcount inicial cadastrado). */
function tableNum(v) {
  return v === null || v === undefined ? "—" : v;
}
const retencaoText = computed(() => {
  const v = props.tableData && props.tableData.retencaoPct;
  return v === null || v === undefined ? "—" : `${v.toFixed(1)}%`;
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
    class="w-[280px] shrink-0 rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-900"
    :class="flash ? 'is-flash' : ''"
  >
    <div class="mb-3 flex items-start justify-between gap-2">
      <div>
        <h3 class="text-sm font-semibold text-zinc-900 dark:text-zinc-100">{{ card.title }}</h3>
        <span class="text-xs text-zinc-500 dark:text-zinc-400">{{ card.sub }}</span>
      </div>
      <Badge v-if="card.unit" tone="accent">{{ card.unit }}</Badge>
    </div>

    <PieChart v-if="card.kind === 'pie'" :data="pieData" :show-values="showValues" height="h-52" />
    <BarChart
      v-else-if="card.kind === 'bar'"
      :data="barData"
      :show-values="showValues"
      :show-trend="card.showTrend !== false"
      :value-format="card.valueFormat || ''"
    />
    <div v-else-if="card.kind === 'table'" class="flex flex-col gap-3 text-sm">
      <dl class="flex flex-col gap-2">
        <div class="flex items-center justify-between">
          <dt class="text-xs text-zinc-500 dark:text-zinc-400">Headcount final</dt>
          <dd class="font-semibold tabular-nums text-zinc-900 dark:text-zinc-100">{{ tableNum(tableData?.headcountFinal) }}</dd>
        </div>
        <div class="flex items-center justify-between">
          <dt class="text-xs text-zinc-500 dark:text-zinc-400">Novas contratações</dt>
          <dd class="font-semibold tabular-nums text-zinc-900 dark:text-zinc-100">{{ tableNum(tableData?.novasContratacoes) }}</dd>
        </div>
        <div class="flex items-center justify-between">
          <dt class="text-xs text-zinc-500 dark:text-zinc-400">Headcount inicial</dt>
          <dd class="font-semibold tabular-nums text-zinc-900 dark:text-zinc-100">{{ tableNum(tableData?.headcountInicial) }}</dd>
        </div>
      </dl>
      <div
        v-if="tableData?.missing?.length"
        class="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-700 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-400"
      >
        Sem dado suficiente para calcular: {{ tableData.missing.join(", ") }}.
      </div>
      <div class="rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2 text-xs text-zinc-600 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-300">
        <div class="font-semibold text-zinc-500 dark:text-zinc-400">Cálculo</div>
        <div class="mt-1 tabular-nums">
          ({{ tableNum(tableData?.headcountFinal) }} − {{ tableNum(tableData?.novasContratacoes) }}) / {{ tableNum(tableData?.headcountInicial) }}
          = <strong class="text-zinc-900 dark:text-zinc-100">{{ retencaoText }}</strong>
        </div>
      </div>
    </div>
    <BarChart
      v-else
      :data="monthlyBarData"
      :show-values="showValues"
      :show-trend="false"
      :value-format="monthlyValueFormat"
    />
  </div>
</template>
