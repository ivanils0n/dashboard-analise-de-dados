<script setup>
import { computed } from "vue";

/* Card "table" da Retenção: { headcountInicial, headcountFinal,
   novasContratacoes, retencaoPct, missing }. Cada valor cai em "—" quando
   ainda não há dado suficiente (ex.: sem headcount inicial cadastrado).
   `large` aumenta a tipografia para o modo tela cheia. */
const props = defineProps({
  tableData: { type: Object, default: null },
  large: { type: Boolean, default: false }
});

function num(v) {
  return v === null || v === undefined ? "—" : v;
}

const retencaoText = computed(() => {
  const v = props.tableData && props.tableData.retencaoPct;
  return v === null || v === undefined ? "—" : `${v.toFixed(1)}%`;
});
</script>

<template>
  <div class="flex flex-col items-center gap-3 text-center" :class="large ? 'gap-6 text-lg' : 'text-sm'">
    <dl class="flex flex-col" :class="large ? 'gap-5' : 'gap-2'">
      <div class="flex flex-col items-center">
        <dt class="text-zinc-500 dark:text-zinc-400" :class="large ? 'text-base' : 'text-xs'">Headcount final</dt>
        <dd class="font-semibold tabular-nums text-zinc-900 dark:text-zinc-100" :class="large ? 'text-4xl' : ''">{{ num(tableData?.headcountFinal) }}</dd>
      </div>
      <div class="flex flex-col items-center">
        <dt class="text-zinc-500 dark:text-zinc-400" :class="large ? 'text-base' : 'text-xs'">Novas contratações</dt>
        <dd class="font-semibold tabular-nums text-zinc-900 dark:text-zinc-100" :class="large ? 'text-4xl' : ''">{{ num(tableData?.novasContratacoes) }}</dd>
      </div>
      <div class="flex flex-col items-center">
        <dt class="text-zinc-500 dark:text-zinc-400" :class="large ? 'text-base' : 'text-xs'">Headcount inicial</dt>
        <dd class="font-semibold tabular-nums text-zinc-900 dark:text-zinc-100" :class="large ? 'text-4xl' : ''">{{ num(tableData?.headcountInicial) }}</dd>
      </div>
    </dl>
    <div
      v-if="tableData?.missing?.length"
      class="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-amber-700 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-400"
      :class="large ? 'text-base' : 'text-xs'"
    >
      Sem dado suficiente para calcular: {{ tableData.missing.join(", ") }}.
    </div>
    <div
      class="rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2 text-zinc-600 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-300"
      :class="large ? 'text-xl' : 'text-xs'"
    >
      <div class="font-semibold text-zinc-500 dark:text-zinc-400">Cálculo</div>
      <div class="mt-1 tabular-nums">
        ({{ num(tableData?.headcountFinal) }} − {{ num(tableData?.novasContratacoes) }}) / {{ num(tableData?.headcountInicial) }}
      </div>
    </div>
    <div class="flex flex-col items-center">
      <span class="text-zinc-500 dark:text-zinc-400" :class="large ? 'text-base' : 'text-xs'">Retenção</span>
      <strong class="font-bold tabular-nums text-accent dark:text-red-400" :class="large ? 'text-7xl' : 'text-4xl'">{{ retencaoText }}</strong>
    </div>
  </div>
</template>
