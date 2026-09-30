<script setup>
import { computed } from "vue";
import MiniLineChart from "@/components/charts/MiniLineChart.vue";
import KpiIcon from "@/components/dashboard/KpiIcon.vue";
import { formatValue, formatRawValue } from "@/lib/utils";
import { useCountUp } from "@/composables/useCountUp";
import { CONTEXT_ACTION_LABEL } from "@/lib/longPress";

const props = defineProps({
  kpi: { type: Object, required: true },
  selected: { type: Boolean, default: false },
  showValues: { type: Boolean, default: false },
  /* Posição na faixa: escalona a entrada dos cards (ver .kpi-enter). */
  index: { type: Number, default: 0 }
});

const emit = defineEmits(["select", "context"]);

/* Para indicadores onde "menor é melhor" (ex.: Absenteísmo), um aumento
   é ruim (vermelho) e uma queda é boa (verde). */
const goodWhenUp = computed(() => props.kpi.higherIsBetter !== false);

const deltaLabel = computed(() => {
  const d = props.kpi.delta;
  if (!d) return "sem dados";
  if (d.diff > 0) return `▲ ${formatRawValue(props.kpi, d.diff)}`;
  if (d.diff < 0) return `▼ ${formatRawValue(props.kpi, Math.abs(d.diff))}`;
  return "—";
});

const deltaTone = computed(() => {
  const d = props.kpi.delta;
  if (!d || d.diff === 0) return "text-zinc-400";
  const up = d.diff > 0;
  const good = goodWhenUp.value ? up : !up;
  return good ? "text-green-600 dark:text-green-400" : "text-red-600 dark:text-red-400";
});

const indicator = computed(() => ({ type: props.kpi.type, decimals: props.kpi.decimals ?? 1 }));
const hasValue = computed(() => props.kpi.current !== null && props.kpi.current !== undefined);

/* Moeda: o "R$" sai do número e é exibido em cima dele (ver template). */
const currencyPrefix = computed(() =>
  props.kpi.type === "currency" && hasValue.value ? "R$" : ""
);
/* Valor exibido: conta até o atual quando ele muda (filtro, mês, etc.). */
const animatedCurrent = useCountUp(() => {
  const v = props.kpi.current;
  return hasValue.value && Number.isFinite(Number(v)) ? Number(v) : v;
});
const valueText = computed(() => {
  if (!hasValue.value) return "—";
  const text = formatValue(indicator.value, animatedCurrent.value);
  return currencyPrefix.value ? text.replace(/^R\$\s*/, "") : text;
});

/* Dica de interação (clique direito; toque longo no celular) para KPIs com
   modal de detalhe. */
const contextHint = computed(() => {
  switch (props.kpi.id) {
    case "headcount":
    case "retencao":
      return `${CONTEXT_ACTION_LABEL}: colaboradores do mês`;
    case "custo_diaria":
      return `${CONTEXT_ACTION_LABEL}: lançamentos de diárias`;
    case "treinamento":
      return `${CONTEXT_ACTION_LABEL}: lançamentos de treinamento`;
    case "custo_total":
      return `${CONTEXT_ACTION_LABEL}: lançamentos de custos`;
    case "tempo_contratacao":
      return `${CONTEXT_ACTION_LABEL}: histórico de vagas`;
    case "custo_contratacao":
      return `${CONTEXT_ACTION_LABEL}: histórico de vagas`;
    case "absenteismo":
      return `${CONTEXT_ACTION_LABEL}: informações de absenteísmo`;
    case "turnover":
    case "turnover_experiencia":
    case "tempo_permanencia":
      return `${CONTEXT_ACTION_LABEL}: histórico de registros`;
    default:
      return "";
  }
});

function onKeydown(e) {
  if (e.key === "Enter" || e.key === " ") {
    e.preventDefault();
    emit("select", props.kpi.id);
  }
}
</script>

<template>
  <article
    class="kpi-card kpi-enter no-callout flex w-[220px] shrink-0 snap-start cursor-pointer flex-col rounded-2xl border bg-white p-4 shadow-sm dark:bg-zinc-900"
    :style="{ '--i': Math.min(index, 12) }"
    :class="selected
      ? 'border-accent ring-2 ring-accent/30'
      : 'border-zinc-200 hover:border-zinc-300 dark:border-zinc-800 dark:hover:border-zinc-700'"
    role="button"
    tabindex="0"
    :title="kpi.desc"
    @click="emit('select', kpi.id)"
    @contextmenu.prevent="emit('context', kpi.id)"
    @keydown="onKeydown"
  >
    <div class="flex flex-col items-center gap-1.5 text-center">
      <span
        class="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg transition"
        :class="selected
          ? 'bg-accent/10 text-accent-hover dark:text-accent-light'
          : 'bg-zinc-100 text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400'"
      >
        <KpiIcon :id="kpi.id" />
      </span>
      <span class="text-sm font-semibold text-zinc-600 dark:text-zinc-300">{{ kpi.name }}</span>
    </div>

    <!-- Turnover: a taxa total (a pizza Entrada/Saída fica no gráfico da página). -->
    <div v-if="kpi.kind === 'pie'" class="flex flex-1 flex-col items-center justify-center px-1 py-6">
      <p class="text-3xl font-bold leading-tight text-zinc-900 dark:text-zinc-100">
        {{ formatValue({ type: "percent", decimals: 1 }, kpi.totalPct) }}
      </p>
    </div>

    <!-- Indicadores lançados por mês (um único ponto no filtro atual): apenas
         o total, centralizado (sem mini gráfico, que precisa de mais de um
         ponto para mostrar tendência). Headcount e Turnover (Exp) também
         entram aqui: contam registros da própria tabela (headcount/turnover),
         não lançamentos genéricos — kpi.entries sempre viria vazio para eles,
         então o mini gráfico de linha nunca teria dado para desenhar. -->
    <div
      v-else-if="[
        'headcount',
        'custo_total',
        'treinamento',
        'custo_contratacao',
        'custo_diaria',
        'absenteismo',
        'tempo_permanencia',
        'retencao',
        'ticket_medio',
        'horas_regional',
        'rescisoes',
        'turnover_experiencia'
      ].includes(kpi.id)"
      class="flex flex-1 flex-col items-center justify-center px-1 py-6"
    >
      <p
        class="max-w-full break-words text-center font-bold leading-tight text-zinc-900 dark:text-zinc-100"
        :class="kpi.id === 'custo_total' ? 'text-2xl' : 'text-3xl'"
      >
        <span v-if="currencyPrefix" class="block text-sm font-semibold text-zinc-400">{{ currencyPrefix }}</span>
        {{ valueText }}
      </p>
      <span class="mt-1 text-xs text-zinc-400">{{ kpi.countText }}</span>
    </div>

    <!-- Padrão: mini gráfico de linha -->
    <div v-else>
      <MiniLineChart :entries="kpi.entries" :show-values="showValues" />
      <p class="mt-2 break-words text-center text-3xl font-bold leading-tight text-zinc-900 dark:text-zinc-100">
        <span v-if="currencyPrefix" class="block text-sm font-semibold text-zinc-400">{{ currencyPrefix }}</span>
        {{ valueText }}
      </p>
      <div class="mt-1 flex items-center justify-between gap-2 text-xs">
        <span :class="deltaTone">{{ deltaLabel }}</span>
        <span class="text-zinc-400">{{ kpi.countText }}</span>
      </div>
      <div
        v-if="kpi.id === 'tempo_contratacao'"
        class="mt-2 flex items-center justify-between gap-2 border-t border-zinc-100 pt-2 text-[11px] dark:border-zinc-800"
      >
        <span class="text-zinc-500 dark:text-zinc-400">
          Abertas: <strong class="text-zinc-800 dark:text-zinc-100">{{ kpi.vagasAbertas ?? 0 }}</strong>
        </span>
        <span class="text-zinc-500 dark:text-zinc-400">
          Fechadas: <strong class="text-zinc-800 dark:text-zinc-100">{{ kpi.vagasFechadas ?? 0 }}</strong>
        </span>
      </div>
    </div>

    <div v-if="contextHint" class="mt-2 border-t border-zinc-100 pt-2 text-right text-[10px] uppercase tracking-wide text-zinc-400 dark:border-zinc-800 dark:text-zinc-500">
      {{ contextHint }}
    </div>
  </article>
</template>
