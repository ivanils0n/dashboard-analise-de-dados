<script setup>
import { computed } from "vue";

/* Filtro de status (todas/abertas/fechadas) do gráfico de Tempo médio de
   contratação — controle segmentado com indicador deslizante (mesma linguagem
   do seletor Visão Geral/Painel). Setas ←/→ trocam de opção. */
const props = defineProps({
  modelValue: { type: String, default: "todas" }
});

const emit = defineEmits(["update:modelValue"]);

/* `dot`: cor do marcador de status (Todas não tem). */
const OPTIONS = [
  { value: "todas", label: "Todas", dot: "" },
  { value: "abertas", label: "Abertas", dot: "bg-emerald-500" },
  { value: "fechadas", label: "Fechadas", dot: "bg-zinc-400 dark:bg-zinc-500" }
];

const activeIndex = computed(() => Math.max(0, OPTIONS.findIndex((o) => o.value === props.modelValue)));

function onKeydown(e) {
  if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
  e.preventDefault();
  const step = e.key === "ArrowRight" ? 1 : -1;
  const next = OPTIONS[(activeIndex.value + step + OPTIONS.length) % OPTIONS.length];
  emit("update:modelValue", next.value);
  e.currentTarget.parentElement?.querySelector(`[data-status="${next.value}"]`)?.focus();
}
</script>

<template>
  <div
    class="relative inline-grid h-9 grid-cols-3 items-stretch rounded-xl bg-zinc-100 p-1 ring-1 ring-inset ring-zinc-200 dark:bg-zinc-900 dark:ring-zinc-800"
    role="tablist"
    aria-label="Filtro por status da vaga"
  >
    <!-- Indicador deslizante -->
    <span
      class="status-thumb pointer-events-none absolute inset-y-1 left-1 w-[calc((100%-0.5rem)/3)] rounded-lg bg-white shadow-sm ring-1 ring-inset ring-zinc-200 dark:bg-zinc-800 dark:ring-zinc-700"
      :style="{ transform: `translateX(${activeIndex * 100}%)` }"
      aria-hidden="true"
    ></span>

    <button
      v-for="opt in OPTIONS"
      :key="opt.value"
      type="button"
      role="tab"
      :data-status="opt.value"
      :aria-selected="modelValue === opt.value"
      :tabindex="modelValue === opt.value ? 0 : -1"
      class="relative z-10 flex min-w-[4.75rem] items-center justify-center gap-1.5 rounded-lg px-3 text-xs font-semibold tracking-tight outline-none transition-colors duration-200 focus-visible:ring-2 focus-visible:ring-accent/70"
      :class="modelValue === opt.value
        ? 'text-zinc-900 dark:text-zinc-100'
        : 'text-zinc-500 hover:text-zinc-700 dark:text-zinc-400 dark:hover:text-zinc-200'"
      @click="emit('update:modelValue', opt.value)"
      @keydown="onKeydown"
    >
      <span v-if="opt.dot" class="h-1.5 w-1.5 shrink-0 rounded-full" :class="opt.dot" aria-hidden="true"></span>
      {{ opt.label }}
    </button>
  </div>
</template>

<style scoped>
.status-thumb {
  transition: transform 0.38s cubic-bezier(0.22, 1, 0.36, 1);
}
@media (prefers-reduced-motion: reduce) {
  .status-thumb {
    transition-duration: 0.01ms;
  }
}
</style>
