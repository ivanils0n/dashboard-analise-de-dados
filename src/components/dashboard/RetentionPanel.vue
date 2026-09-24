<script setup>
import { computed } from "vue";

/* Painel da Retenção (gráfico central do Painel): resultado em destaque com
   barra de progresso, o fluxo do quadro (Headcount inicial + Novas contratações
   − Demissões = Headcount final) e a fórmula usada. `data`: { headcountInicial,
   headcountFinal, novasContratacoes, demissoes, retencaoPct, missing }. Cada
   valor cai em "—" quando ainda não há dado suficiente. `large`: tipografia
   maior (tela cheia). */
const props = defineProps({
  data: { type: Object, default: null },
  large: { type: Boolean, default: false }
});

function num(v) {
  return v === null || v === undefined ? "—" : v;
}

const pct = computed(() => {
  const v = props.data && props.data.retencaoPct;
  return v === null || v === undefined || !Number.isFinite(v) ? null : v;
});
const pctText = computed(() => (pct.value === null ? "—" : `${pct.value.toFixed(1).replace(".", ",")}%`));
/* Largura da barra: limitada a 0–100% (a taxa pode passar de 100 ou ser negativa). */
const barWidth = computed(() => `${Math.max(0, Math.min(100, pct.value ?? 0))}%`);

const steps = computed(() => [
  { key: "ini", label: "Headcount inicial", value: num(props.data?.headcountInicial), sign: "", tone: "neutral" },
  { key: "nov", label: "Novas contratações", value: num(props.data?.novasContratacoes), sign: "+", tone: "positive" },
  { key: "dem", label: "Demissões", value: num(props.data?.demissoes), sign: "−", tone: "negative" },
  { key: "fin", label: "Headcount final", value: num(props.data?.headcountFinal), sign: "=", tone: "neutral" }
]);

const TONES = {
  neutral: "text-zinc-900 dark:text-zinc-100",
  positive: "text-emerald-600 dark:text-emerald-400",
  negative: "text-red-600 dark:text-red-400"
};
</script>

<template>
  <div class="flex h-full flex-col justify-center gap-5 overflow-y-auto py-2">
    <div
      v-if="data?.missing?.length"
      class="rounded-xl border border-amber-300 bg-amber-50 px-4 py-2.5 text-center text-sm text-amber-700 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-400"
    >
      Sem dado suficiente para calcular: {{ data.missing.join(", ") }}.
    </div>

    <!-- Resultado -->
    <div class="rounded-2xl border border-accent/25 bg-accent/5 px-6 py-5 text-center dark:border-accent/25 dark:bg-accent/10">
      <span class="text-xs font-semibold uppercase tracking-widest text-zinc-500 dark:text-zinc-400">Taxa de retenção</span>
      <strong
        class="mt-1 block font-bold leading-none tabular-nums text-accent dark:text-accent-light"
        :class="large ? 'text-8xl' : 'text-6xl'"
      >{{ pctText }}</strong>
      <div
        class="mx-auto mt-4 h-2 w-full max-w-md overflow-hidden rounded-full bg-zinc-200 dark:bg-zinc-800"
        role="progressbar"
        aria-label="Taxa de retenção"
        aria-valuemin="0"
        aria-valuemax="100"
        :aria-valuenow="pct === null ? undefined : Math.round(pct)"
      >
        <div class="h-full rounded-full bg-accent transition-all duration-500" :style="{ width: barWidth }"></div>
      </div>
    </div>

    <!-- Fluxo do quadro -->
    <div>
      <h3 class="mb-2 text-center text-xs font-semibold uppercase tracking-widest text-zinc-500 dark:text-zinc-400">
        Movimentação do quadro
      </h3>
      <div class="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <div
          v-for="step in steps"
          :key="step.key"
          class="relative rounded-xl border border-zinc-200 bg-white px-4 py-3 text-center shadow-sm dark:border-zinc-800 dark:bg-zinc-900"
        >
          <span
            v-if="step.sign"
            class="absolute left-2 top-2 flex h-5 w-5 items-center justify-center rounded-full bg-zinc-100 text-xs font-bold text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400"
            aria-hidden="true"
          >{{ step.sign }}</span>
          <span class="block text-[11px] font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">{{ step.label }}</span>
          <p class="mt-1 font-bold tabular-nums" :class="[TONES[step.tone], large ? 'text-4xl' : 'text-3xl']">{{ step.value }}</p>
        </div>
      </div>
    </div>

    <!-- Fórmula -->
    <div class="rounded-xl border border-zinc-200 bg-zinc-50 px-4 py-3 text-center dark:border-zinc-800 dark:bg-zinc-900">
      <span class="text-[11px] font-semibold uppercase tracking-widest text-zinc-500 dark:text-zinc-400">Cálculo</span>
      <p class="mt-1 font-semibold tabular-nums text-zinc-800 dark:text-zinc-100" :class="large ? 'text-xl' : 'text-base'">
        ({{ num(data?.headcountFinal) }} − {{ num(data?.novasContratacoes) }}) ÷ {{ num(data?.headcountInicial) }} × 100
        <span class="text-zinc-400"> = </span>
        <span class="text-accent-hover dark:text-accent-light">{{ pctText }}</span>
      </p>
    </div>
  </div>
</template>
