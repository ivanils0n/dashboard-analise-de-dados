<script setup>
import { computed, ref } from "vue";
import { useRoute } from "vue-router";
import StateFilter from "./StateFilter.vue";
import UserMenu from "./UserMenu.vue";
import DashboardTabs from "./DashboardTabs.vue";
import { useTheme } from "@/composables/useTheme";
import { reloadData } from "@/lib/db";
import { syncAll } from "@/lib/employees";
import { useToast } from "@/composables/useToast";

const route = useRoute();
const { isDark, toggle } = useTheme();
const { show: toast } = useToast();

/* Reativo: o TopBar persiste entre rotas (layout aninhado), então os
   controles visíveis dependem da rota ATUAL, não da inicial. */
const showStateFilter = computed(() => ["dashboard", "filiais"].includes(route.name));
const showDashboardTabs = computed(() => route.name === "dashboard");

/* "Recarregar Dados": antes vivia no menu do Dashboard, agora fica sempre à
   mão no topo (funciona em qualquer tela, não só no Dashboard). */
const reloading = ref(false);
async function handleReload() {
  if (reloading.value) return;
  reloading.value = true;
  try {
    await reloadData();
    syncAll();
    toast("Dados recarregados.");
  } catch (err) {
    console.error("[TopBar] Falha ao recarregar os dados:", err);
    toast("Não foi possível recarregar os dados.");
  } finally {
    reloading.value = false;
  }
}
</script>

<template>
  <header
    class="sticky top-0 z-30 grid h-20 grid-cols-[1fr_auto] items-center border-b border-zinc-800 bg-[#0a0a0a] px-4 sm:px-5 md:grid-cols-[1fr_auto_1fr]"
  >
    <a href="#/dashboard" class="flex items-center" aria-label="Gente & Gestão — Dashboard">
      <img src="/logo.png" alt="Gente & Gestão" class="h-16 w-auto max-w-[260px] object-contain" />
    </a>

    <!-- Abas centralizadas (em telas pequenas ficam no corpo da página). -->
    <div class="hidden justify-center md:flex">
      <DashboardTabs v-if="showDashboardTabs" variant="topbar" />
    </div>

    <div class="flex items-center justify-end gap-2">
      <button
        type="button"
        class="rounded-lg border border-zinc-700 px-3.5 py-2.5 text-zinc-200 transition hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-50"
        aria-label="Recarregar dados"
        title="Recarregar dados"
        :disabled="reloading"
        @click="handleReload"
      >
        <svg
          width="19"
          height="19"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2.2"
          stroke-linecap="round"
          stroke-linejoin="round"
          aria-hidden="true"
          :class="reloading ? 'animate-spin' : ''"
        >
          <path d="M21 12a9 9 0 1 1-2.64-6.36" />
          <polyline points="21 3 21 9 15 9" />
        </svg>
      </button>

      <button
        type="button"
        class="rounded-lg border border-zinc-700 px-3.5 py-2.5 text-zinc-200 transition hover:bg-zinc-800"
        aria-label="Alternar modo noturno"
        title="Alternar modo noturno"
        @click="toggle"
      >
        <svg v-if="!isDark" width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
        </svg>
        <svg v-else width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
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
