<script setup>
const props = defineProps({
  modelValue: { type: String, default: "" },
  options: { type: Array, default: () => [] },
  label: { type: String, default: "Gerente regional" },
  allLabel: { type: String, default: "Todos os gerentes regionais" },
  title: { type: String, default: "Filtrar Treinamento por gerente regional" },
  maxLabel: { type: Number, default: 0 },
  compact: { type: Boolean, default: false }
});

function shortLabel(text) {
  const t = String(text);
  return props.maxLabel && t.length > props.maxLabel ? t.slice(0, props.maxLabel).trimEnd() + "..." : t;
}

defineEmits(["update:modelValue"]);
</script>

<template>
  <select
    :value="modelValue"
    class="cursor-pointer truncate rounded-lg border bg-white font-medium text-zinc-700 outline-none transition hover:bg-zinc-100 focus:border-accent dark:bg-[#0a0a0a] dark:text-zinc-200 dark:hover:bg-zinc-800"
    :class="[
      modelValue ? 'border-accent' : 'border-zinc-300 dark:border-zinc-700',
      compact ? 'w-[7.5rem] px-2.5 py-1.5 text-xs' : 'max-w-[14rem] px-4 py-2.5 text-[15px]'
    ]"
    :aria-label="`Filtrar por ${label.toLowerCase()}`"
    :title="title"
    @change="$emit('update:modelValue', $event.target.value)"
  >
    <option value="">{{ allLabel }}</option>
    <option v-for="g in options" :key="g" :value="g" :title="g">{{ shortLabel(g) }}</option>
  </select>
</template>
