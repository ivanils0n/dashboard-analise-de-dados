<script setup>
defineProps({
  items: { type: Array, default: () => [] },
  compact: { type: Boolean, default: false },
  grid: { type: Boolean, default: false }
});
</script>

<template>
  <div
    class="max-w-full overflow-hidden rounded-xl border border-zinc-200 shadow-sm dark:border-zinc-800"
    :class="grid ? 'grid w-full grid-cols-2 gap-px bg-zinc-200 dark:bg-zinc-800' : 'inline-flex items-stretch divide-x divide-zinc-200 bg-white dark:divide-zinc-800 dark:bg-zinc-900'"
    role="group"
    aria-label="Resumo do gráfico"
  >
    <div
      v-for="item in items"
      :key="item.label"
      class="flex flex-col items-center justify-center text-center"
      :class="[
        compact ? 'min-w-[5.5rem] gap-0.5 px-4 py-1.5' : 'min-w-[9rem] gap-1 px-5 py-3',
        grid ? 'bg-white dark:bg-zinc-900' : '',
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
