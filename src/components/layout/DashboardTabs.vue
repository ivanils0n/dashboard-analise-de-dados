<script setup>
import { computed } from "vue";
import { activeTab, switchTab } from "@/composables/useDashboardTab";

/* Controle segmentado Visão Geral / Painel. `topbar`: versão para a barra
   superior (sempre escura); `page`: versão para o corpo da página (segue o
   tema). O "indicador" desliza entre as abas; setas ←/→ trocam de aba. */
defineProps({
  variant: { type: String, default: "page" }
});

const TABS = [
  { id: "visao-geral", label: "Visão Geral" },
  { id: "cockpit", label: "Painel" }
];

const activeIndex = computed(() => Math.max(0, TABS.findIndex((t) => t.id === activeTab.value)));

function onKeydown(e) {
  if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
  e.preventDefault();
  const step = e.key === "ArrowRight" ? 1 : -1;
  const next = TABS[(activeIndex.value + step + TABS.length) % TABS.length];
  switchTab(next.id);
  e.currentTarget.parentElement?.querySelector(`[data-tab="${next.id}"]`)?.focus();
}
</script>

<template>
  <div
    class="relative grid h-10 grid-cols-2 items-stretch rounded-xl p-1 ring-1 ring-inset"
    :class="variant === 'topbar'
      ? 'bg-white/[0.04] ring-white/10'
      : 'bg-zinc-100 ring-zinc-200 dark:bg-zinc-900 dark:ring-zinc-800'"
    role="tablist"
    aria-label="Modo de visualização"
  >
    <!-- Indicador deslizante -->
    <span
      class="tabs-thumb pointer-events-none absolute inset-y-1 left-1 w-[calc(50%-0.25rem)] rounded-lg shadow-sm ring-1 ring-inset"
      :class="variant === 'topbar'
        ? 'bg-zinc-700/80 ring-white/10'
        : 'bg-white ring-zinc-200 dark:bg-zinc-800 dark:ring-zinc-700'"
      :style="{ transform: `translateX(${activeIndex * 100}%)` }"
      aria-hidden="true"
    ></span>

    <button
      v-for="tab in TABS"
      :key="tab.id"
      type="button"
      role="tab"
      :data-tab="tab.id"
      :aria-selected="activeTab === tab.id"
      :tabindex="activeTab === tab.id ? 0 : -1"
      class="relative z-10 flex min-w-[7.5rem] items-center justify-center gap-2 rounded-lg px-4 text-[13px] font-semibold tracking-tight outline-none transition-colors duration-200 focus-visible:ring-2 focus-visible:ring-accent/70"
      :class="variant === 'topbar'
        ? (activeTab === tab.id ? 'text-white' : 'text-zinc-400 hover:text-zinc-200')
        : (activeTab === tab.id
          ? 'text-zinc-900 dark:text-zinc-100'
          : 'text-zinc-500 hover:text-zinc-700 dark:text-zinc-400 dark:hover:text-zinc-200')"
      @click="switchTab(tab.id)"
      @keydown="onKeydown"
    >
      <svg
        v-if="tab.id === 'visao-geral'"
        width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor"
        stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"
      >
        <rect x="3" y="3" width="7" height="7" rx="1.5" />
        <rect x="14" y="3" width="7" height="7" rx="1.5" />
        <rect x="3" y="14" width="7" height="7" rx="1.5" />
        <rect x="14" y="14" width="7" height="7" rx="1.5" />
      </svg>
      <svg
        v-else
        width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor"
        stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"
      >
        <path d="M3 3v18h18" />
        <path d="M7 15l4-4 3 3 5-6" />
      </svg>
      {{ tab.label }}
    </button>
  </div>
</template>

<style scoped>
.tabs-thumb {
  transition: transform 0.38s cubic-bezier(0.22, 1, 0.36, 1);
}
@media (prefers-reduced-motion: reduce) {
  .tabs-thumb {
    transition-duration: 0.01ms;
  }
}
</style>
