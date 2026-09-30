<script setup>
defineProps({ modelValue: { type: String, default: "mapa" } });
const emit = defineEmits(["update:modelValue"]);

const TABS = [
  { id: "mapa", label: "Mapa" },
  { id: "graficos", label: "Gráficos" }
];
</script>

<template>
  <div class="inline-flex h-9 w-fit items-center gap-1 rounded-lg bg-zinc-100 p-1 dark:bg-zinc-800/70" role="tablist">
    <button
      v-for="t in TABS"
      :key="t.id"
      type="button"
      role="tab"
      :aria-selected="modelValue === t.id"
      class="h-full rounded-md px-4 text-xs font-semibold transition"
      :class="modelValue === t.id ? 'bg-white text-zinc-900 shadow-sm dark:bg-zinc-700 dark:text-zinc-100' : 'text-zinc-500 hover:text-zinc-700 dark:text-zinc-400 dark:hover:text-zinc-200'"
      @click="emit('update:modelValue', t.id)"
    >
      {{ t.label }}
    </button>
  </div>
</template>
