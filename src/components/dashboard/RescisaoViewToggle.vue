<script setup>
/* Alterna o gráfico de Rescisões entre barras por função e pizza por estado.
   v-model: "funcao" | "estado". */
defineProps({
  modelValue: { type: String, default: "funcao" }
});
defineEmits(["update:modelValue"]);

const OPTIONS = [
  { value: "funcao", label: "Por função", title: "Barras por função" },
  { value: "estado", label: "Por estado", title: "Pizza por estado" }
];
</script>

<template>
  <div class="flex overflow-hidden rounded-lg border border-zinc-300 dark:border-zinc-700" role="group" aria-label="Tipo de gráfico">
    <button
      v-for="opt in OPTIONS"
      :key="opt.value"
      type="button"
      class="px-3 py-1.5 text-xs font-medium transition"
      :class="modelValue === opt.value ? 'bg-accent/15 text-accent' : 'text-zinc-600 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-800'"
      :title="opt.title"
      :aria-pressed="modelValue === opt.value"
      @click="$emit('update:modelValue', opt.value)"
    >
      {{ opt.label }}
    </button>
  </div>
</template>
