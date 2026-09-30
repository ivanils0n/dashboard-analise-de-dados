<script setup>
defineProps({
  title: { type: String, default: "Sem dados para exibir" },
  text: { type: String, default: "Não há informações lançadas para o período e o estado filtrados." }
});
</script>

<template>
  <div
    class="absolute inset-0 z-10 flex flex-col items-center justify-center gap-2 rounded-xl bg-white/90 px-4 text-center dark:bg-zinc-900/90"
    role="status"
  >
    <div class="flex h-11 w-11 items-center justify-center rounded-full bg-accent/10 text-accent">
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
        <line x1="4" y1="20" x2="20" y2="20" />
        <rect x="6" y="11" width="3" height="6" rx="0.5" />
        <rect x="11" y="7" width="3" height="10" rx="0.5" />
        <rect x="16" y="13" width="3" height="4" rx="0.5" />
        <line x1="3" y1="3" x2="21" y2="21" />
      </svg>
    </div>
    <p class="text-sm font-semibold text-zinc-700 dark:text-zinc-200">{{ title }}</p>
    <p v-if="text" class="max-w-xs text-xs text-zinc-500 dark:text-zinc-400">{{ text }}</p>
  </div>
</template>
