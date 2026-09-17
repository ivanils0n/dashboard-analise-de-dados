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
    <BarChart
      v-else
      :data="monthlyBarData"
      :show-values="showValues"
      :show-trend="false"
      :value-format="monthlyValueFormat"
    />
  </div>
</template>
