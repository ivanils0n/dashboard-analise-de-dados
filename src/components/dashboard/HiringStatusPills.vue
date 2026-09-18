<script setup>
/* Filtro de status (abertas/fechadas) do gráfico de Tempo médio de
   contratação. */
defineProps({
  modelValue: { type: String, default: "todas" }
});

const emit = defineEmits(["update:modelValue"]);

const OPTIONS = [
  { value: "todas", label: "Todas" },
  { value: "abertas", label: "Abertas" },
  { value: "fechadas", label: "Fechadas" }
];
</script>

<template>
  <div class="state-pills" role="tablist" aria-label="Filtro por status da vaga">
    <button
      v-for="opt in OPTIONS"
      :key="opt.value"
      type="button"
      role="tab"
      :aria-selected="modelValue === opt.value"
      class="state-pill"
      :class="modelValue === opt.value ? 'is-active' : ''"
      @click="emit('update:modelValue', opt.value)"
    >
      {{ opt.label }}
    </button>
  </div>
</template>

<style scoped>
.state-pills {
  display: inline-flex;
  flex-wrap: wrap;
  gap: 0.2rem;
  border-radius: 9999px;
  border: 1px solid rgb(228 228 231);
  background-color: rgb(244 244 245);
  padding: 0.2rem;
}
.state-pill {
  border-radius: 9999px;
  border: 1px solid transparent;
  padding: 0.3rem 0.85rem;
  font-size: 0.72rem;
  font-weight: 700;
  letter-spacing: 0.01em;
  color: rgb(113 113 122);
  background-color: transparent;
  transition: background-color 0.15s ease, color 0.15s ease, box-shadow 0.15s ease, transform 0.1s ease;
}
.state-pill:hover {
  color: rgb(63 63 70);
}
.state-pill:active {
  transform: scale(0.96);
}
.state-pill.is-active {
  background-color: #fff;
  color: var(--color-accent, #B7791F);
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.12), 0 0 0 1px rgba(220, 38, 38, 0.15);
}
:global(.dark) .state-pills {
  border-color: rgb(63 63 70);
  background-color: rgb(24 24 27);
}
:global(.dark) .state-pill {
  color: rgb(161 161 170);
}
:global(.dark) .state-pill:hover {
  color: rgb(228 228 231);
}
:global(.dark) .state-pill.is-active {
  background-color: rgb(39 39 42);
  color: #F2C766;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.4), 0 0 0 1px rgba(248, 113, 113, 0.25);
}
</style>
