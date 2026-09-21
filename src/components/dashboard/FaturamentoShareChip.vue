<script setup>
import { computed } from "vue";
import KpiIcon from "@/components/dashboard/KpiIcon.vue";
import { formatValue, formatCurrency } from "@/lib/utils";

/* KPI "% do faturamento" compacto, para a barra de título do gráfico de Custo de
   folha de salário (mesma altura do botão de faturamento, sem crescer o
   cabeçalho): ícone, rótulo e percentual; os detalhes do cálculo ficam no
   tooltip. `data`: { custo, faturamento, faturamentoMedio, headcount, pct,
   motivo } (ver ticketMedioFaturamento em useDashboardData.js). */
const props = defineProps({
  data: { type: Object, required: true }
});

const pctText = computed(() => formatValue({ type: "percent", decimals: 2 }, props.data.pct));

const details = computed(() => {
  const d = props.data;
  const lines = [
    "% do faturamento = Custo médio por colaborador ÷ Faturamento médio por colaborador × 100",
    `Custo médio por colaborador: ${formatCurrency(d.custo)}`,
    `Faturamento médio por colaborador: ${formatCurrency(d.faturamentoMedio)}`,
    `(Faturamento especulativo ${formatCurrency(d.faturamento)} ÷ ${d.headcount} colaboradores)`
  ];
  if (d.motivo) lines.push(d.motivo);
  return lines.join("\n");
});
</script>

<template>
  <div
    class="flex cursor-help items-center gap-1.5 whitespace-nowrap rounded-lg border px-3 py-1.5 text-xs font-medium"
    :class="data.motivo
      ? 'border-amber-300 bg-amber-50 text-amber-700 dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-300'
      : 'border-accent/40 bg-accent/10 text-zinc-700 dark:text-zinc-200'"
    :title="details"
  >
    <KpiIcon id="faturamento_pct" :size="14" />
    <span class="hidden xl:inline">% do faturamento</span>
    <strong class="tabular-nums text-zinc-900 dark:text-zinc-100" :class="data.motivo ? '!text-inherit' : ''">{{ pctText }}</strong>
  </div>
</template>
