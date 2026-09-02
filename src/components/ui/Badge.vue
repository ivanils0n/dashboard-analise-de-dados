<script setup>
defineProps({
  tone: { type: String, default: "default" }
});
</script>

<template>
  <span
    class="inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-xs font-semibold whitespace-nowrap"
    :class="{
      'bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300': tone === 'default',
      'bg-zinc-200/70 text-zinc-500 dark:bg-zinc-700/60 dark:text-zinc-400': tone === 'muted',
      'bg-accent/10 text-accent-hover dark:text-red-400': tone === 'accent',
      'bg-zinc-900 text-zinc-100 dark:bg-zinc-100 dark:text-zinc-900': tone === 'dark'
    }"
  >
    <slot />
  </span>
</template>
