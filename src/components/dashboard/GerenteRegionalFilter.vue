<script setup>
/* Filtro genérico em dropdown (Painel), com o mesmo visual do filtro de
   Estado da TopBar (StateFilter.vue). `modelValue`: "" = sem filtro. Usado
   pelo filtro de Gerente regional (Treinamento) e de Recrutador (Tempo médio
   de contratação). */
const props = defineProps({
  modelValue: { type: String, default: "" },
  options: { type: Array, default: () => [] },
  label: { type: String, default: "Gerente regional" },
  allLabel: { type: String, default: "Todos os gerentes regionais" },
  title: { type: String, default: "Filtrar Treinamento por gerente regional" },
  /* Rótulos das opções acima deste tamanho são cortados com "..." (o texto
     completo fica no tooltip) — evita que a lista fique enorme com textos
     longos. 0 = sem corte. */
  maxLabel: { type: Number, default: 0 }
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
    class="max-w-[14rem] cursor-pointer truncate rounded-lg border bg-white px-4 py-2.5 text-[15px] font-medium text-zinc-700 outline-none transition hover:bg-zinc-100 focus:border-accent dark:bg-[#0a0a0a] dark:text-zinc-200 dark:hover:bg-zinc-800"
    :class="modelValue ? 'border-accent' : 'border-zinc-300 dark:border-zinc-700'"
    :aria-label="`Filtrar por ${label.toLowerCase()}`"
    :title="title"
    @change="$emit('update:modelValue', $event.target.value)"
  >
    <option value="">{{ allLabel }}</option>
    <option v-for="g in options" :key="g" :value="g" :title="g">{{ shortLabel(g) }}</option>
  </select>
</template>
