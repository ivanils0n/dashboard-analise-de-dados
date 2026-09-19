<script setup>
/* Faixa de números-resumo de um gráfico (ex.: Total, Colaboradores e Média da
   diária no Cockpit). `items`: [{ label, value, accent? }] — `accent` destaca
   o card (mesma cor dos totais dos modais de registros). `compact`: versão
   enxuta para a barra superior do gráfico. */
defineProps({
  items: { type: Array, default: () => [] },
  compact: { type: Boolean, default: false }
});
</script>

<template>
  <div class="flex flex-wrap gap-2" :class="compact ? 'justify-center' : ''">
    <div
      v-for="item in items"
      :key="item.label"
      class="flex flex-col rounded-xl border"
      :class="[
        compact ? 'items-center gap-0 px-3 py-1.5' : 'min-w-[9rem] gap-0.5 px-4 py-2.5',
        item.accent
          ? 'border-accent/25 bg-accent/5 dark:border-accent/25 dark:bg-accent/10'
          : 'border-zinc-200 bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-900'
      ]"
    >
      <span class="text-[10px] font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">{{ item.label }}</span>
      <span
        class="font-bold tabular-nums text-zinc-900 dark:text-zinc-100"
        :class="compact ? 'text-base leading-tight' : 'text-xl'"
      >{{ item.value }}</span>
    </div>
  </div>
</template>
