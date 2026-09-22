<script setup>
/* Filtro por Gerente regional do gráfico de Treinamento (Painel) — pill com
   ícone, mesma linguagem visual dos demais controles do Painel (chip
   arredondado, anel de foco na cor de destaque). `modelValue`: "" = todos os
   gerentes. */
defineProps({
  modelValue: { type: String, default: "" },
  options: { type: Array, default: () => [] }
});

defineEmits(["update:modelValue"]);
</script>

<template>
  <label
    class="gr-filter"
    :class="modelValue ? 'gr-filter--active' : ''"
    title="Filtrar Treinamento por gerente regional"
  >
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" class="shrink-0">
      <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3" />
    </svg>
    <span class="sr-only">Gerente regional</span>
    <select
      class="gr-filter-select"
      :value="modelValue"
      aria-label="Filtrar por gerente regional"
      @change="$emit('update:modelValue', $event.target.value)"
    >
      <option value="">Todos os gerentes regionais</option>
      <option v-for="g in options" :key="g" :value="g">{{ g }}</option>
    </select>
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" class="shrink-0 opacity-60">
      <polyline points="6 9 12 15 18 9" />
    </svg>
  </label>
</template>

<style scoped>
.gr-filter {
  display: inline-flex;
  align-items: center;
  gap: 0.4rem;
  height: 2.25rem;
  padding: 0 0.65rem 0 0.7rem;
  border-radius: 9999px;
  border: 1px solid rgb(212 212 216);
  background-color: #fff;
  color: rgb(82 82 91);
  cursor: pointer;
  transition: border-color 0.15s, box-shadow 0.15s, background-color 0.15s;
}
.gr-filter:hover {
  border-color: rgb(180 180 186);
}
.gr-filter:focus-within {
  border-color: #E8AF3E;
  box-shadow: 0 0 0 2px rgb(232 175 62 / 0.2);
}
.gr-filter--active {
  border-color: #E8AF3E;
  background-color: rgb(232 175 62 / 0.08);
  color: #B7791F;
}
:global(.dark) .gr-filter {
  border-color: rgb(63 63 70);
  background-color: rgb(24 24 27);
  color: rgb(212 212 216);
}
:global(.dark) .gr-filter:hover {
  border-color: rgb(82 82 91);
}
:global(.dark) .gr-filter--active {
  border-color: #E8AF3E;
  background-color: rgb(232 175 62 / 0.12);
  color: #f2c675;
}
.gr-filter-select {
  appearance: none;
  border: none;
  background: transparent;
  outline: none;
  padding: 0;
  max-width: 11.5rem;
  font-size: 0.8125rem;
  font-weight: 600;
  color: inherit;
  cursor: pointer;
  text-overflow: ellipsis;
}
.gr-filter-select option {
  color: rgb(24 24 27);
  background-color: #fff;
}
:global(.dark) .gr-filter-select option {
  color: rgb(244 244 245);
  background-color: rgb(24 24 27);
}
</style>
