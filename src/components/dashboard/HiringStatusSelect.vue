<script setup>
defineProps({
  modelValue: { type: String, default: "todas" },
  compact: { type: Boolean, default: false }
});

defineEmits(["update:modelValue"]);
</script>

<template>
  <select
    :value="modelValue"
    class="cursor-pointer rounded-lg border border-zinc-300 bg-white font-medium text-zinc-700 outline-none transition hover:bg-zinc-100 focus:border-accent dark:border-zinc-700 dark:bg-[#0a0a0a] dark:text-zinc-200 dark:hover:bg-zinc-800"
    :class="compact ? 'px-2.5 py-1.5 text-xs' : 'px-4 py-2.5 text-[15px]'"
    aria-label="Filtrar por status da vaga"
    title="Filtrar vagas por status"
    @change="$emit('update:modelValue', $event.target.value)"
  >
    <option value="todas">Todas</option>
    <option value="abertas">Abertas</option>
    <option value="fechadas">Fechadas</option>
  </select>
</template>
