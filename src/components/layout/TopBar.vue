<script setup>
import { computed } from "vue";
import { useRoute } from "vue-router";
import StateFilter from "./StateFilter.vue";
import UserMenu from "./UserMenu.vue";
import { useTheme } from "@/composables/useTheme";

const route = useRoute();
const { isDark, toggle } = useTheme();

/* Reativo: o TopBar persiste entre rotas (layout aninhado), então os
   controles visíveis dependem da rota ATUAL, não da inicial. */
const showStateFilter = computed(() =>
  ["dashboard", "equipe", "filiais", "departamentos"].includes(route.name)
);
</script>

<template>
  <header
    class="sticky top-0 z-30 flex h-16 items-center justify-between border-b border-zinc-800 bg-[#0a0a0a] px-4 sm:px-5"
  >
    <a href="#/dashboard" class="flex items-center" aria-label="Gente & Gestão — Dashboard">
      <img src="/logo.png" alt="Gente & Gestão" class="h-10 w-auto max-w-[170px] object-contain" />
    </a>

    <div class="flex items-center gap-2">
      <button
        type="button"
        class="rounded-lg border border-zinc-700 px-3 py-1.5 text-zinc-200 transition hover:bg-zinc-800"
        aria-label="Alternar modo noturno"
        title="Alternar modo noturno"
        @click="toggle"
      >
        <svg v-if="!isDark" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
        </svg>
        <svg v-else width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <circle cx="12" cy="12" r="4" />
          <line x1="12" y1="2" x2="12" y2="4" />
          <line x1="12" y1="20" x2="12" y2="22" />
          <line x1="4.93" y1="4.93" x2="6.34" y2="6.34" />
          <line x1="17.66" y1="17.66" x2="19.07" y2="19.07" />
          <line x1="2" y1="12" x2="4" y2="12" />
          <line x1="20" y1="12" x2="22" y2="12" />
          <line x1="4.93" y1="19.07" x2="6.34" y2="17.66" />
          <line x1="17.66" y1="6.34" x2="19.07" y2="4.93" />
        </svg>
      </button>

      <StateFilter v-if="showStateFilter" />

      <UserMenu />
    </div>
  </header>
</template>
