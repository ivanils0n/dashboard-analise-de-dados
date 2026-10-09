<script setup>
import { computed, nextTick, ref, onMounted, onBeforeUnmount } from "vue";
import DateRangeFilter from "@/components/dashboard/DateRangeFilter.vue";
import StateFilter from "@/components/layout/StateFilter.vue";
import { useFilters } from "@/composables/useFilters";

const props = defineProps({
  expanded: { type: Boolean, default: false },
  range: { type: Object, required: true },
  showValues: { type: Boolean, default: false },
  showHideValues: { type: Boolean, default: false },
  canRefresh: { type: Boolean, default: false },
  reloading: { type: Boolean, default: false },
  canExport: { type: Boolean, default: false }
});

const emit = defineEmits(["update:expanded", "reload", "tour", "toggle-values", "export"]);

const { state: filters } = useFilters();
const stateLabel = computed(() => (filters.current && filters.current !== "todos" ? filters.current : "Todos"));

const asideRef = ref(null);
function onPointerDownOutside(e) {
  if (!props.expanded || !asideRef.value || asideRef.value.contains(e.target)) return;
  emit("update:expanded", false);
}
onMounted(() => ["pointerdown", "mousedown"].forEach((t) => document.addEventListener(t, onPointerDownOutside, true)));
onBeforeUnmount(() => ["pointerdown", "mousedown"].forEach((t) => document.removeEventListener(t, onPointerDownOutside, true)));

async function expandAndOpen(selector) {
  emit("update:expanded", true);
  await nextTick();
  setTimeout(() => {
    const el = document.querySelector(`[data-side-actions] ${selector}`);
    if (el && el.offsetParent) el.tagName === "SELECT" ? el.focus() : el.click();
  }, 220);
}
</script>

<template>
  <aside
    ref="asideRef"
    data-side-actions
    class="side-bar dark fixed inset-y-0 right-0 z-30 hidden flex-col border-l border-zinc-800 transition-[width] duration-200 md:flex"
    :class="expanded ? 'w-44 p-4 shadow-2xl shadow-black/60' : 'w-16 px-2 py-4'"
    aria-label="Filtros e ações"
  >

    <div class="flex items-center gap-2 pb-4" :class="expanded ? 'justify-between' : 'justify-center'">
      <button
        type="button"
        class="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-zinc-400 transition hover:bg-zinc-800 hover:text-zinc-200"
        :aria-label="expanded ? 'Recolher painel de filtros' : 'Expandir painel de filtros'"
        :title="expanded ? 'Recolher' : 'Expandir'"
        :aria-expanded="expanded"
        @click="emit('update:expanded', !expanded)"
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <polyline v-if="expanded" points="9 18 15 12 9 6" />
          <polyline v-else points="15 18 9 12 15 6" />
        </svg>
      </button>
      <img
        v-if="expanded"
        src="/logotipo.png"
        alt="Gente &amp; Gestão"
        class="aspect-[2.3/1] min-w-0 flex-1 object-cover"
      />
    </div>

    <div class="flex flex-col gap-1 border-t border-zinc-800 pt-4">
      <p v-if="expanded" class="mb-1 px-1 text-[10px] font-semibold uppercase tracking-widest text-zinc-500">Filtros</p>
      <template v-if="expanded">
        <DateRangeFilter data-tour="period" class="side-filter" :range="range" title="Período" />
        <StateFilter data-tour="state" class="mt-1 w-full !px-3 !py-2 !text-[13px]" />
      </template>
      <template v-else>
        <button type="button" data-tour="period" class="side-btn" title="Período" aria-label="Período" @click="expandAndOpen('[data-tour=period] > button')">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <rect x="3" y="4" width="18" height="18" rx="2" />
            <line x1="16" y1="2" x2="16" y2="6" />
            <line x1="8" y1="2" x2="8" y2="6" />
            <line x1="3" y1="10" x2="21" y2="10" />
          </svg>
        </button>
        <button type="button" data-tour="state" class="side-btn flex-col !gap-0.5" :title="`Estado: ${stateLabel}`" aria-label="Filtro por Estado" @click="expandAndOpen('select[data-tour=state]')">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z" />
            <circle cx="12" cy="10" r="3" />
          </svg>
          <span class="text-[9px] font-bold uppercase leading-none">{{ stateLabel }}</span>
        </button>
      </template>
    </div>

    <div class="mt-4 flex flex-col gap-1 border-t border-zinc-800 pt-4">
      <p v-if="expanded" class="mb-1 px-1 text-[10px] font-semibold uppercase tracking-widest text-zinc-500">Ações</p>
      <button
        v-if="showHideValues"
        type="button"
        data-tour="hide-values"
        class="side-btn"
        :class="expanded && 'side-btn-wide'"
        :title="showValues ? 'Ocultar valores' : 'Mostrar valores'"
        :aria-label="showValues ? 'Ocultar valores' : 'Mostrar valores'"
        @click="emit('toggle-values')"
      >
        <svg v-if="showValues" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <path d="M9.88 9.88a3 3 0 1 0 4.24 4.24" />
          <path d="M10.73 5.08A10.43 10.43 0 0 1 12 5c7 0 10 7 10 7a13.16 13.16 0 0 1-1.67 2.68" />
          <path d="M6.61 6.61A13.53 13.53 0 0 0 2 12s3 7 10 7a9.74 9.74 0 0 0 5.39-1.61" />
          <line x1="2" y1="2" x2="22" y2="22" />
        </svg>
        <svg v-else width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z" />
          <circle cx="12" cy="12" r="3" />
        </svg>
        <span v-if="expanded">{{ showValues ? "Ocultar valores" : "Mostrar valores" }}</span>
      </button>
      <button
        v-if="canRefresh"
        type="button"
        data-tour="refresh"
        class="side-btn"
        :class="expanded && 'side-btn-wide'"
        title="Recarregar dados"
        aria-label="Recarregar dados"
        :disabled="reloading"
        @click="emit('reload')"
      >
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" :class="reloading ? 'animate-spin' : ''">
          <path d="M21 12a9 9 0 1 1-2.64-6.36" />
          <polyline points="21 3 21 9 15 9" />
        </svg>
        <span v-if="expanded">Recarregar</span>
      </button>
      <template v-if="canExport">
        <button
          type="button"
          data-tour="menu"
          class="side-btn"
          :class="expanded && 'side-btn-wide'"
          title="Baixar em XLSX"
          aria-label="Baixar em XLSX"
          @click="emit('export', 'xlsx')"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z" />
            <path d="M14 2v4a2 2 0 0 0 2 2h4" />
            <path d="M8 13h8M8 17h8M12 13v4" />
          </svg>
          <span v-if="expanded">Baixar XLSX</span>
        </button>
        <button
          type="button"
          class="side-btn"
          :class="expanded && 'side-btn-wide'"
          title="Baixar em CSV"
          aria-label="Baixar em CSV"
          @click="emit('export', 'csv')"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z" />
            <path d="M14 2v4a2 2 0 0 0 2 2h4" />
            <path d="M12 12v6M9 15l3 3 3-3" />
          </svg>
          <span v-if="expanded">Baixar CSV</span>
        </button>
      </template>
    </div>

    <div class="mt-auto flex flex-col gap-1 border-t border-zinc-800 pt-4">
      <button
        type="button"
        data-tour="tour-button"
        class="side-btn side-btn-outline"
        :class="expanded && 'side-btn-wide'"
        title="Tour pela dashboard"
        aria-label="Tour pela dashboard"
        @click="emit('tour')"
      >
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <circle cx="12" cy="12" r="10" />
          <line x1="12" y1="16" x2="12" y2="12" />
          <line x1="12" y1="8" x2="12.01" y2="8" />
        </svg>
        <span v-if="expanded">Tour</span>
      </button>
    </div>
  </aside>
</template>

<style scoped>
.side-bar {
  background-color: #0a0a0a;
}
.side-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0.75rem;
  border-radius: 0.5rem;
  padding: 0.625rem 0;
  font-size: 13px;
  font-weight: 600;
  color: rgb(161 161 170);
  transition: background-color 0.15s, color 0.15s;
}
.side-btn:hover:not(:disabled) {
  background-color: rgb(39 39 42);
  color: rgb(228 228 231);
}
.side-btn:disabled {
  cursor: not-allowed;
  opacity: 0.5;
}
.side-btn-wide {
  justify-content: flex-start;
  padding-left: 0.75rem;
  padding-right: 0.75rem;
  text-align: left;
}
.side-btn-outline {
  border: 1px solid rgb(63 63 70);
  font-weight: 500;
  color: rgb(228 228 231);
}
.side-btn svg {
  flex-shrink: 0;
}
.side-filter :deep(> button) {
  width: 100%;
  justify-content: flex-start;
  padding: 0.5rem 0.75rem;
  font-size: 13px;
}
</style>
