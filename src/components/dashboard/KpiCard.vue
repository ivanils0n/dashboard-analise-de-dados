<script setup>
import { computed } from "vue";
import MiniLineChart from "@/components/charts/MiniLineChart.vue";
import KpiIcon from "@/components/dashboard/KpiIcon.vue";
import { formatValue, formatRawValue } from "@/lib/utils";

const props = defineProps({
  kpi: { type: Object, required: true },
  selected: { type: Boolean, default: false },
  showValues: { type: Boolean, default: false },
  /* Só usado no card "Custo da diária geral": quantos lançamentos importados
     estão sem período e se, no momento, estão sendo exibidos no gráfico. */
  semPeriodoCount: { type: Number, default: 0 },
  showSemPeriodo: { type: Boolean, default: false }
});

const emit = defineEmits(["select", "context", "toggle-sem-periodo"]);

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
const valueText = computed(() => {
  if (!hasValue.value) return "—";
  const text = formatValue(indicator.value, props.kpi.current);
  return currencyPrefix.value ? text.replace(/^R\$\s*/, "") : text;
});

/* Dica de interação (clique direito) para KPIs com modal de detalhe. */
const contextHint = computed(() => {
  switch (props.kpi.id) {
    case "headcount":
    case "retencao":
      return "Botão direito: colaboradores do mês";
    case "custo_diaria":
      return "Botão direito: lançamentos de diárias";
    case "treinamento":
      return "Botão direito: lançamentos de treinamento";
    case "custo_total":
      return "Botão direito: lançamentos de custos";
    case "tempo_contratacao":
      return "Botão direito: histórico de vagas";
    case "custo_contratacao":
      return "Botão direito: histórico de vagas";
    case "absenteismo":
      return "Botão direito: lançamentos mensais";
    case "turnover":
    case "turnover_experiencia":
    case "tempo_permanencia":
      return "Botão direito: histórico de registros";
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
    class="flex w-[220px] shrink-0 cursor-pointer flex-col rounded-2xl border bg-white p-4 shadow-sm transition hover:shadow-md dark:bg-zinc-900"
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

    <label
      v-if="kpi.id === 'custo_diaria' && semPeriodoCount"
      class="mt-2 flex cursor-pointer items-center gap-1.5 border-t border-zinc-100 pt-2 text-[11px] text-zinc-500 dark:border-zinc-800 dark:text-zinc-400"
      @click.stop
    >
      <input
        type="checkbox"
        class="h-3.5 w-3.5 cursor-pointer accent-accent"
        :checked="showSemPeriodo"
        @change="emit('toggle-sem-periodo', $event.target.checked)"
      />
      Mostrar sem período ({{ semPeriodoCount }})
    </label>
  </article>
</template>
