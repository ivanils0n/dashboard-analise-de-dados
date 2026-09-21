<script setup>
import { computed } from "vue";
import KpiIcon from "@/components/dashboard/KpiIcon.vue";
import { formatValue } from "@/lib/utils";

/* KPI selecionável do Painel — mesma linguagem visual dos cards da Visão geral
   (ícone centralizado, nome embaixo, valor em destaque, "R$" acima do valor em
   moeda, Turnover com a taxa total), só que compacto: sem gráfico
   de linha, pois o gráfico do KPI aparece grande no centro do Painel. */
const props = defineProps({
  kpi: { type: Object, required: true },
  selected: { type: Boolean, default: false }
});

const emit = defineEmits(["select"]);

const PERCENT = { type: "percent", decimals: 1 };

const hasValue = computed(() => props.kpi.current !== null && props.kpi.current !== undefined);

/* Turnover (pizza): mostra a taxa total. */
const isPie = computed(() => props.kpi.kind === "pie");
const pieText = computed(() => formatValue(PERCENT, props.kpi.totalPct));

const currencyPrefix = computed(() =>
  props.kpi.kind !== "pie" && props.kpi.type === "currency" && hasValue.value ? "R$" : ""
);

const valueText = computed(() => {
  if (!hasValue.value) return "—";
  const text = formatValue({ type: props.kpi.type, decimals: props.kpi.decimals ?? 1 }, props.kpi.current);
  return currencyPrefix.value ? text.replace(/^R\$\s*/, "") : text;
});
</script>

<template>
  <button
    type="button"
    class="flex w-[200px] shrink-0 flex-col items-center gap-1.5 rounded-2xl border bg-white px-3 py-2.5 text-center shadow-sm transition hover:shadow-md dark:bg-zinc-900"
    :class="selected
      ? 'border-accent ring-2 ring-accent/30'
      : 'border-zinc-200 hover:border-zinc-300 dark:border-zinc-800 dark:hover:border-zinc-700'"
    :title="kpi.desc"
    :aria-pressed="selected"
    @click="emit('select', kpi.id)"
  >
    <span
      class="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg transition"
      :class="selected
        ? 'bg-accent/10 text-accent-hover dark:text-accent-light'
        : 'bg-zinc-100 text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400'"
    >
      <KpiIcon :id="kpi.id" />
    </span>
    <span class="text-sm font-semibold text-zinc-600 dark:text-zinc-300">{{ kpi.name }}</span>

    <span
      v-if="isPie"
      class="max-w-full break-words text-xl font-bold leading-tight tabular-nums text-zinc-900 dark:text-zinc-100"
    >
      {{ pieText }}
    </span>
    <span
      v-else
      class="max-w-full break-words text-xl font-bold leading-tight tabular-nums text-zinc-900 dark:text-zinc-100"
    >
      <span v-if="currencyPrefix" class="block text-sm font-semibold text-zinc-400">{{ currencyPrefix }}</span>
      {{ valueText }}
    </span>
  </button>
</template>
