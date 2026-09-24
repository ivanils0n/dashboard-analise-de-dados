<script setup>
/* Faixa de números-resumo de um gráfico (ex.: Total, Colaboradores e Média da
   diária no Painel). `items`: [{ label, value, accent? }] — `accent` destaca
   o número principal (cor de destaque e fundo levemente tingido). Os itens
   formam um único cartão dividido em células, com rótulo pequeno em caixa
   alta e o valor logo abaixo, alinhados ao centro. `compact`: versão enxuta
   para a barra superior do Painel (rótulo e valor menores, sem quebra). */
defineProps({
  items: { type: Array, default: () => [] },
  compact: { type: Boolean, default: false }
});
</script>

<template>
  <div
    class="inline-flex max-w-full items-stretch divide-x divide-zinc-200 overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-sm dark:divide-zinc-800 dark:border-zinc-800 dark:bg-zinc-900"
    role="group"
    aria-label="Resumo do gráfico"
  >
    <div
      v-for="item in items"
      :key="item.label"
      class="flex flex-col items-center justify-center text-center"
      :class="[
        compact ? 'min-w-[5.5rem] gap-0.5 px-4 py-1.5' : 'min-w-[9rem] gap-1 px-5 py-3',
        item.accent ? 'bg-accent/10 dark:bg-accent/15' : ''
      ]"
    >
      <span class="whitespace-nowrap text-[10px] font-semibold uppercase leading-none tracking-wider text-zinc-500 dark:text-zinc-400">
        {{ item.label }}
      </span>
      <span
        class="whitespace-nowrap font-bold tabular-nums leading-tight"
        :class="[
          compact ? 'text-lg' : 'text-2xl',
          item.accent ? 'text-accent-hover dark:text-accent-light' : 'text-zinc-900 dark:text-zinc-100'
        ]"
      >{{ item.value }}</span>
    </div>
  </div>
</template>
