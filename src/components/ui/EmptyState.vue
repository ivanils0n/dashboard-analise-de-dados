<script setup>
defineProps({
  title: { type: String, required: true },
  text: { type: String, default: "" }
});
</script>

<template>
  <div class="flex flex-col items-center justify-center gap-2 py-10 text-center">
    <div
      class="flex h-10 w-10 items-center justify-center rounded-full bg-zinc-100 text-zinc-400 dark:bg-zinc-800 dark:text-zinc-400"
    >
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
        <rect x="3" y="3" width="18" height="18" rx="2" />
        <line x1="9" y1="9" x2="15" y2="15" />
        <line x1="15" y1="9" x2="9" y2="15" />
      </svg>
    </div>
    <p class="text-sm font-semibold text-zinc-700 dark:text-zinc-200">{{ title }}</p>
    <p v-if="text" class="max-w-sm text-sm text-zinc-500 dark:text-zinc-400">{{ text }}</p>
  </div>
</template>
