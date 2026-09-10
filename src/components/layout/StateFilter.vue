<script setup>
import { STATES } from "@/lib/config";
import { useFilters } from "@/composables/useFilters";

const { state, setState } = useFilters();
</script>

<template>
  <select
    :value="state.current"
    class="rounded-lg border border-zinc-700 bg-[#0a0a0a] px-3 py-1.5 text-sm font-medium text-zinc-200 outline-none transition hover:bg-zinc-800 focus:border-accent"
    aria-label="Filtro por Estado"
    title="Filtro por Estado"
    @change="setState($event.target.value)"
  >
    <option value="todos">Todos Estados</option>
    <option v-for="s in STATES" :key="s" :value="s">{{ s }}</option>
  </select>
</template>
