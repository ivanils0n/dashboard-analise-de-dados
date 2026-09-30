<script setup>
import { computed } from "vue";
import { TIPOS } from "@/lib/absenteismo";

const props = defineProps({
  ocorrencias: { type: Array, default: () => [] }
});

const cards = computed(() => {
  const total = props.ocorrencias.length;
  return TIPOS.map((t) => {
    const count = props.ocorrencias.filter((o) => t.has(o)).length;
    return {
      key: t.value,
      label: t.short || t.plural,
      letter: t.letter,
      chip: t.chip,
      count,
      share: total ? Math.round((count / total) * 100) : 0
    };
  });
});

const somaCards = computed(() => cards.value.reduce((s, c) => s + c.count, 0));
const sobreposicao = computed(() => somaCards.value - props.ocorrencias.length);
</script>

<template>
  <div class="mx-auto w-full lg:w-5/6 lg:min-w-[56rem]">
  <div class="grid w-full grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
    <div
      v-for="c in cards"
      :key="c.key"
      class="flex items-center gap-2.5 rounded-xl border border-zinc-200 bg-white px-3 py-2.5 dark:border-zinc-800 dark:bg-zinc-900"
    >
      <span class="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-xs font-bold" :class="c.chip">{{ c.letter }}</span>
      <div class="min-w-0">
        <p class="truncate text-[10px] font-medium uppercase tracking-wide text-zinc-400 dark:text-zinc-500">{{ c.label }}</p>
        <p class="flex items-baseline gap-1.5">
          <span class="text-xl font-bold tabular-nums leading-tight text-zinc-900 dark:text-zinc-100">{{ c.count }}</span>
          <span class="text-[11px] font-medium tabular-nums text-zinc-400 dark:text-zinc-500">{{ c.share }}%</span>
        </p>
      </div>
    </div>
  </div>
  <p v-if="sobreposicao > 0" class="mx-auto mt-2 text-center text-[11px] text-zinc-400 dark:text-zinc-500">
    Total: {{ ocorrencias.length }} ocorrências. Advertência e Acidente são marcações somadas a um motivo
    ({{ sobreposicao }} {{ sobreposicao === 1 ? "ocorrência tem" : "ocorrências têm" }} marcação junto de um motivo).
  </p>
  </div>
</template>
