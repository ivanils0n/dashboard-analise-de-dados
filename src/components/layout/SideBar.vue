<script setup>
import { computed } from "vue";
import { useRoute, useRouter } from "vue-router";
import { authState, getProfile } from "@/lib/auth";
import StateFilter from "./StateFilter.vue";
import UserMenu from "./UserMenu.vue";
import DashboardTabs from "./DashboardTabs.vue";
import { useTheme } from "@/composables/useTheme";
import { sidebarCollapsed as collapsed } from "@/composables/useSidebar";

/* Sidebar esquerda (antiga TopBar + navegação): logo, páginas, abas Visão
   Geral/Painel, filtro de estado, tema e conta. Em telas pequenas vira uma
   faixa no topo. */
const route = useRoute();
const router = useRouter();
const { isDark, toggle } = useTheme();

const profile = computed(() => authState.profile || getProfile() || {});
const isAdmin = computed(() => profile.value.perfil === "admin");
const isVisitor = computed(() => profile.value.perfil === "visitante");

const items = [
  {
    name: "dashboard",
    label: "Dashboard",
    paths: ["M12 20v-10M18 20V4M6 20v-4"]
  },
  {
    name: "filiais",
    label: "Filiais",
    paths: ["M3 9l1.5-5h15L21 9M3 9h18v3a3 3 0 0 1-3 3H6a3 3 0 0 1-3-3V9zM6 15v6h12v-6"]
  },
  {
    name: "usuarios",
    label: "Usuários",
    paths: [
      "M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z",
      "M12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6z"
    ]
  }
];

/* Grupo "Detalhado": páginas com o detalhamento linha a linha de um KPI. */
const detailItems = [
  {
    name: "rescisoes",
    label: "Rescisões",
    paths: ["M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z", "M14 2v4a2 2 0 0 0 2 2h4", "M9 15h6"]
  },
  {
    name: "treinamentos",
    label: "Treinamentos",
    paths: [
      "M21.42 10.922a1 1 0 0 0-.019-1.838L12.83 5.18a2 2 0 0 0-1.66 0L2.6 9.08a1 1 0 0 0 0 1.832l8.57 3.908a2 2 0 0 0 1.66 0z",
      "M22 10v6",
      "M6 12.5V16a6 3 0 0 0 12 0v-3.5"
    ]
  },
  {
    name: "vagas",
    label: "Vagas",
    paths: ["M16 20V4a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16", "M20 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2z"]
  }
];

/* O visitante só vê o Dashboard (sem navegação); os demais não-admin não
   veem Usuários. */
const visibleItems = computed(() =>
  isAdmin.value ? items : isVisitor.value ? [] : items.filter((i) => i.name !== "usuarios")
);

const visibleDetailItems = computed(() => (isVisitor.value ? [] : detailItems));

/* Reativo: a sidebar persiste entre rotas (layout aninhado), então os
   controles visíveis dependem da rota ATUAL, não da inicial. */
const showStateFilter = computed(() => route.name === "filiais");
const showDashboardTabs = computed(() => route.name === "dashboard");
</script>

<template>
  <aside
    class="z-30 flex w-full flex-wrap items-center gap-3 border-b border-zinc-800 bg-[#0a0a0a] px-4 py-3 transition-[width] duration-200 md:sticky md:top-0 md:h-screen md:shrink-0 md:flex-col md:flex-nowrap md:items-stretch md:gap-0 md:self-start md:border-b-0 md:border-r"
    :class="collapsed ? 'md:w-16 md:px-2 md:py-4' : 'md:w-44 md:p-4'"
    aria-label="Painel de controle"
  >
    <div class="flex items-center gap-2 md:pb-4" :class="collapsed ? 'md:justify-center' : 'md:justify-between'">
      <a href="#/dashboard" class="flex min-w-0 items-center md:flex-1 md:justify-center" :class="collapsed && 'md:hidden'" aria-label="Gente & Gestão — Dashboard">
        <img src="/logo.png" alt="Gente & Gestão" class="h-12 w-auto max-w-[180px] object-contain md:h-auto md:max-h-16 md:w-full" />
      </a>
      <button
        type="button"
        class="hidden h-8 w-8 shrink-0 items-center justify-center rounded-lg text-zinc-400 transition hover:bg-zinc-800 hover:text-zinc-200 md:flex"
        :aria-label="collapsed ? 'Expandir sidebar' : 'Recolher sidebar'"
        :title="collapsed ? 'Expandir sidebar' : 'Recolher sidebar'"
        :aria-expanded="!collapsed"
        @click="collapsed = !collapsed"
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <polyline v-if="!collapsed" points="15 18 9 12 15 6" />
          <polyline v-else points="9 18 15 12 9 6" />
        </svg>
      </button>
    </div>

    <nav v-if="visibleItems.length" class="flex gap-1 md:flex-col md:border-t md:border-zinc-800 md:pt-4" aria-label="Navegação principal">
      <p v-if="!collapsed" class="mb-1 hidden px-1 text-[10px] font-semibold uppercase tracking-widest text-zinc-500 md:block">Páginas</p>
      <button
        v-for="item in visibleItems"
        :key="item.name"
        type="button"
        class="flex items-center gap-3 rounded-lg px-3 py-2.5 text-[13px] font-semibold transition"
        :title="item.label"
        :aria-label="item.label"
        :class="[
          collapsed && 'md:justify-center md:px-0',
          route.name === item.name
            ? 'bg-accent/15 text-accent'
            : 'text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200'
        ]"
        :aria-current="route.name === item.name ? 'page' : undefined"
        @click="router.push({ name: item.name })"
      >
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" class="shrink-0">
          <path v-for="d in item.paths" :key="d" :d="d" />
        </svg>
        <span :class="collapsed && 'md:hidden'">{{ item.label }}</span>
      </button>
    </nav>

    <div v-if="showDashboardTabs" class="md:mt-4 md:border-t md:border-zinc-800 md:pt-4">
      <p v-if="!collapsed" class="mb-2 hidden px-1 text-[10px] font-semibold uppercase tracking-widest text-zinc-500 md:block">Visualização</p>
      <DashboardTabs variant="topbar" class="hidden md:grid" vertical :compact="collapsed" />
      <DashboardTabs variant="topbar" class="md:hidden" />
    </div>

    <nav v-if="visibleDetailItems.length" class="flex gap-1 md:mt-4 md:flex-col md:border-t md:border-zinc-800 md:pt-4" aria-label="Detalhado">
      <p v-if="!collapsed" class="mb-1 hidden px-1 text-[10px] font-semibold uppercase tracking-widest text-zinc-500 md:block">Detalhado</p>
      <button
        v-for="item in visibleDetailItems"
        :key="item.name"
        type="button"
        class="flex items-center gap-3 rounded-lg px-3 py-2.5 text-[13px] font-semibold transition"
        :title="item.label"
        :aria-label="item.label"
        :class="[
          collapsed && 'md:justify-center md:px-0',
          route.name === item.name
            ? 'bg-accent/15 text-accent'
            : 'text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200'
        ]"
        :aria-current="route.name === item.name ? 'page' : undefined"
        @click="router.push({ name: item.name })"
      >
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" class="shrink-0">
          <path v-for="d in item.paths" :key="d" :d="d" />
        </svg>
        <span :class="collapsed && 'md:hidden'">{{ item.label }}</span>
      </button>
    </nav>

    <div v-if="showStateFilter" :class="collapsed && 'md:hidden'" class="md:mt-4 md:border-t md:border-zinc-800 md:pt-4">
      <p class="mb-2 hidden px-1 text-[10px] font-semibold uppercase tracking-widest text-zinc-500 md:block">Filtro</p>
      <StateFilter class="w-full" />
    </div>

    <div class="ml-auto flex items-center gap-2 md:ml-0 md:mt-auto md:flex-col md:items-stretch md:border-t md:border-zinc-800 md:pt-4">
      <button
        type="button"
        class="flex items-center justify-center gap-2 rounded-lg border border-zinc-700 px-3.5 py-2.5 text-[13px] font-medium text-zinc-200 transition hover:bg-zinc-800"
        aria-label="Alternar modo noturno"
        title="Alternar modo noturno"
        @click="toggle"
      >
        <svg v-if="!isDark" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
        </svg>
        <svg v-else width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
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
        <span class="hidden" :class="!collapsed && 'md:inline'">{{ isDark ? "Modo claro" : "Modo noturno" }}</span>
      </button>
      <UserMenu :compact="collapsed" />
      <p v-if="!collapsed" class="hidden text-center text-[10px] text-zinc-500 md:block">Feito por <span class="font-bold text-zinc-300">Ivanilson</span></p>
    </div>
  </aside>
</template>
