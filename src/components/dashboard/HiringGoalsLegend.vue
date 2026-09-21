<script setup>
/* Meta de dias por tipo de vaga (Tempo médio de contratação) — mesma
   legenda reaproveitada no KpiCard, no gráfico central do Painel e na sua
   versão em tela cheia. */
defineProps({
  size: { type: String, default: "sm" } // "sm" (card) | "md" (gráfico central)
});
</script>

<template>
  <div
    class="flex flex-wrap items-center gap-x-4 gap-y-1 text-zinc-400 dark:text-zinc-500"
    :class="size === 'md' ? 'justify-center text-xs' : 'justify-between text-[10px]'"
    title="Meta de dias por tipo de vaga"
  >
    <span>Operacional: <strong class="text-zinc-600 dark:text-zinc-300">10 d</strong></span>
    <span>Adm: <strong class="text-zinc-600 dark:text-zinc-300">15 d</strong></span>
    <span>Gerente: <strong class="text-zinc-600 dark:text-zinc-300">30 d</strong></span>
  </div>
</template>
