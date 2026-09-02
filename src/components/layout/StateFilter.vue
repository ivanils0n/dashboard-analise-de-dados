<script setup>
import { ref, onMounted, onUnmounted, computed } from "vue";
import { STATES } from "@/lib/config";
import { useFilters } from "@/composables/useFilters";

const { state, setState } = useFilters();
const open = ref(false);

const label = computed(() =>
  state.current === "todos" ? "Todos Estados" : state.current
);

function toggle() {
  open.value = !open.value;
}

function select(value) {
  open.value = false;
  setState(value);
}

function onDocumentClick() {
  open.value = false;
}

onMounted(() => document.addEventListener("click", onDocumentClick));
onUnmounted(() => document.removeEventListener("click", onDocumentClick));
</script>

<template>
  <div class="relative" @click.stop>
    <button
      type="button"
      class="inline-flex items-center gap-1.5 rounded-lg border border-zinc-700 px-3 py-1.5 text-sm font-medium text-zinc-200 transition hover:bg-zinc-800"
      :aria-expanded="open"
      title="Filtro por Estado"
      @click="toggle"
    >
      {{ label }}
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
        <polyline points="6 9 12 15 18 9" />
      </svg>
    </button>

    <div
      v-if="open"
      class="absolute right-0 z-40 mt-2 w-40 overflow-hidden rounded-xl border border-zinc-200 bg-white py-1 shadow-xl slide-up dark:border-zinc-800 dark:bg-zinc-900"
    >
      <button
        type="button"
        class="block w-full px-4 py-2 text-left text-sm transition hover:bg-zinc-100 dark:hover:bg-zinc-800"
        :class="state.current === 'todos' ? 'font-semibold text-accent-hover dark:text-red-400' : 'text-zinc-700 dark:text-zinc-200'"
        @click="select('todos')"
      >
        Todos Estados
      </button>
      <button
        v-for="s in STATES"
        :key="s"
        type="button"
        class="block w-full px-4 py-2 text-left text-sm transition hover:bg-zinc-100 dark:hover:bg-zinc-800"
        :class="state.current === s ? 'font-semibold text-accent-hover dark:text-red-400' : 'text-zinc-700 dark:text-zinc-200'"
        @click="select(s)"
      >
        {{ s }}
      </button>
    </div>
  </div>
</template>
