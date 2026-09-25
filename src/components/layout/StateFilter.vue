<script setup>
import { STATES } from "@/lib/config";
import { useFilters } from "@/composables/useFilters";

/* `variant` "sidebar": versão escura fixa (sidebar); "page": segue o tema, para
   ficar ao lado do filtro de período no corpo da página. */
defineProps({
  variant: { type: String, default: "sidebar" }
});

const { state, setState } = useFilters();
</script>

<template>
  <select
    :value="state.current"
    class="rounded-lg border outline-none transition focus:border-accent"
    :class="variant === 'page'
      ? 'border-zinc-300 bg-white px-3 py-1.5 text-sm font-medium text-zinc-700 hover:bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800'
      : 'border-zinc-700 bg-[#0a0a0a] px-4 py-2.5 text-[15px] font-medium text-zinc-200 hover:bg-zinc-800'"
    aria-label="Filtro por Estado"
    title="Filtro por Estado"
    @change="setState($event.target.value)"
  >
    <option value="todos">Todos Estados</option>
    <option v-for="s in STATES" :key="s" :value="s">{{ s }}</option>
  </select>
</template>
