<script setup>
import { computed } from "vue";

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
const barWidth = computed(() => `${Math.max(0, Math.min(100, pct.value ?? 0))}%`);

const MAX_DIVERGENCIAS = 12;
const diferenca = computed(() => {
  const d = props.data;
  if (!d || !Number.isFinite(d.headcountEsperado) || !Number.isFinite(d.headcountFinal)) return 0;
  return d.headcountEsperado - d.headcountFinal;
});
const divergencias = computed(() => (diferenca.value ? props.data?.divergencias || [] : []));
const divergenciasVisiveis = computed(() => divergencias.value.slice(0, MAX_DIVERGENCIAS));

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
  <div class="flex h-full flex-col justify-center-safe gap-5 overflow-y-auto py-2">
    <div
      v-if="data?.missing?.length"
      class="rounded-xl border border-amber-300 bg-amber-50 px-4 py-2.5 text-center text-sm text-amber-700 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-400"
    >
      Sem dado suficiente para calcular: {{ data.missing.join(", ") }}.
    </div>

    <div
      v-if="diferenca"
      class="rounded-xl border border-amber-300 bg-amber-50 px-4 py-2.5 text-sm text-amber-700 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-400"
      role="alert"
    >
      <p class="text-center font-semibold">
        A conta não fecha: inicial + contratações − demissões = {{ data.headcountEsperado }}, mas o headcount final é
        {{ data.headcountFinal }} (diferença de {{ Math.abs(diferenca) }}).
      </p>
      <p v-if="divergencias.length && !large" class="mt-1 text-center text-xs">
        {{ divergencias.length }} {{ divergencias.length === 1 ? "registro divergente" : "registros divergentes" }} na planilha — expanda o painel para ver quais.
      </p>
      <ul v-if="divergencias.length && large" class="mt-2 flex flex-col gap-1 text-sm">
        <li v-for="d in divergenciasVisiveis" :key="d.key">
          <strong>{{ d.colaborador }}</strong>
          <span v-if="d.codigo"> (cód. {{ d.codigo }})</span>
          <span v-if="d.filial || d.estado"> · {{ [d.filial, d.estado].filter(Boolean).join("/") }}</span>
          — {{ d.motivo }}.
        </li>
        <li v-if="divergencias.length > divergenciasVisiveis.length" class="font-semibold">
          + {{ divergencias.length - divergenciasVisiveis.length }} outros registros divergentes.
        </li>
      </ul>
    </div>

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
          <span class="block px-4 text-[11px] font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">{{ step.label }}</span>
          <p class="mt-1 font-bold tabular-nums" :class="[TONES[step.tone], large ? 'text-4xl' : 'text-3xl']">{{ step.value }}</p>
        </div>
      </div>
    </div>

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
