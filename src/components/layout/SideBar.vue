<script setup>
import { computed, ref, watch, onMounted, onBeforeUnmount } from "vue";
import { useRoute, useRouter } from "vue-router";
import { authState, getProfile } from "@/lib/auth";
import StateFilter from "./StateFilter.vue";
import UserMenu from "./UserMenu.vue";
import DashboardTabs from "./DashboardTabs.vue";
import { useTheme } from "@/composables/useTheme";
import { sidebarCollapsed, sidebarEffectiveCollapsed as collapsedTarget } from "@/composables/useSidebar";

/* Sidebar esquerda (antiga TopBar + navegação): logo, páginas, abas Visão
   Geral/Painel, filtro de estado, tema e conta. Em celulares (abaixo de md)
   vira um cabeçalho compacto (menu, logo, tema, conta e as abas do Dashboard)
   com a navegação num menu lateral deslizante. */
const route = useRoute();
const router = useRouter();
const { isDark, toggle } = useTheme();

/* `collapsedTarget` define a LARGURA da sidebar (anima em 200 ms). `collapsed`
   é o estado do CONTEÚDO (textos/rótulos): ao recolher muda na hora (os textos
   somem antes de a barra encolher); ao expandir só muda quando a largura já
   terminou de crescer — senão os textos apareciam antes da barra abrir. */
const SIDEBAR_TRANSITION_MS = 200;
const collapsed = ref(collapsedTarget.value);
let expandTimer = null;
watch(collapsedTarget, (target) => {
  clearTimeout(expandTimer);
  if (target) collapsed.value = true;
  else expandTimer = setTimeout(() => (collapsed.value = false), SIDEBAR_TRANSITION_MS);
});
onBeforeUnmount(() => clearTimeout(expandTimer));

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

/* Menu lateral do celular: fecha ao navegar, com Esc e ao tocar fora. */
const drawerOpen = ref(false);
watch(
  () => route.fullPath,
  () => {
    drawerOpen.value = false;
  }
);
function onKeydown(e) {
  if (e.key === "Escape") drawerOpen.value = false;
}
onMounted(() => document.addEventListener("keydown", onKeydown));
onBeforeUnmount(() => document.removeEventListener("keydown", onKeydown));

const drawerSections = computed(() =>
  [
    { title: "Páginas", items: visibleItems.value },
    { title: "Detalhado", items: visibleDetailItems.value }
  ].filter((section) => section.items.length)
);
</script>

<template>
  <!-- ===== Celular: cabeçalho compacto + menu lateral ===== -->
  <header class="safe-top safe-x sticky top-0 z-40 border-b border-zinc-800 bg-[#0a0a0a] md:hidden">
    <div class="flex items-center gap-2 px-3 py-2">
      <button
        v-if="drawerSections.length || showStateFilter"
        type="button"
        class="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-zinc-300 transition hover:bg-zinc-800"
        aria-label="Abrir menu"
        :aria-expanded="drawerOpen"
        @click="drawerOpen = true"
      >
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <line x1="4" y1="6" x2="20" y2="6" />
          <line x1="4" y1="12" x2="20" y2="12" />
          <line x1="4" y1="18" x2="20" y2="18" />
        </svg>
      </button>
      <a href="#/dashboard" class="flex min-w-0 flex-1 items-center" aria-label="Gente & Gestão — Dashboard">
        <img src="/logo.png" alt="Gente & Gestão" class="h-9 w-auto max-w-[150px] object-contain" />
      </a>
      <button
        type="button"
        class="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-zinc-300 transition hover:bg-zinc-800"
        :aria-label="isDark ? 'Modo claro' : 'Modo noturno'"
        @click="toggle"
      >
        <svg v-if="!isDark" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
        </svg>
        <svg v-else width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
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
      <UserMenu compact />
    </div>
    <div v-if="showDashboardTabs" data-tour="tabs" class="px-3 pb-2">
      <DashboardTabs variant="topbar" />
    </div>

    <Transition name="drawer">
      <div v-if="drawerOpen" class="fixed inset-0 z-50" role="dialog" aria-modal="true" aria-label="Menu">
        <div class="absolute inset-0 bg-black/60" @click="drawerOpen = false"></div>
        <nav class="drawer-panel safe-top safe-bottom absolute inset-y-0 left-0 flex w-72 max-w-[85vw] flex-col gap-5 overflow-y-auto border-r border-zinc-800 bg-[#0a0a0a] px-4" aria-label="Navegação">
          <div class="flex items-center justify-between gap-2 pt-3">
            <img src="/logo.png" alt="Gente & Gestão" class="h-10 w-auto max-w-[160px] object-contain" />
            <button
              type="button"
              class="flex h-10 w-10 items-center justify-center rounded-lg text-2xl leading-none text-zinc-400 transition hover:bg-zinc-800 hover:text-zinc-200"
              aria-label="Fechar menu"
              @click="drawerOpen = false"
            >
              &times;
            </button>
          </div>
          <div v-for="section in drawerSections" :key="section.title" class="flex flex-col gap-1">
            <p class="mb-1 px-1 text-[10px] font-semibold uppercase tracking-widest text-zinc-500">{{ section.title }}</p>
            <button
              v-for="item in section.items"
              :key="item.name"
              type="button"
              class="flex items-center gap-3 rounded-lg px-3 py-3 text-[15px] font-semibold transition"
              :class="route.name === item.name ? 'bg-accent/15 text-accent' : 'text-zinc-300 hover:bg-zinc-800 hover:text-zinc-100'"
              :aria-current="route.name === item.name ? 'page' : undefined"
              @click="router.push({ name: item.name })"
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" class="shrink-0">
                <path v-for="d in item.paths" :key="d" :d="d" />
              </svg>
              {{ item.label }}
            </button>
          </div>
          <div v-if="showStateFilter" class="flex flex-col gap-2">
            <p class="px-1 text-[10px] font-semibold uppercase tracking-widest text-zinc-500">Filtro</p>
            <StateFilter class="w-full" />
          </div>
          <p class="mb-6 mt-auto text-center text-[10px] text-zinc-500">Copyright © <span class="font-bold text-zinc-300">IBDS</span></p>
        </nav>
      </div>
    </Transition>
  </header>

  <!-- ===== Tablet/computador: sidebar ===== -->
  <aside
    class="z-30 hidden w-full flex-wrap md:flex items-center gap-3 border-b border-zinc-800 bg-[#0a0a0a] px-4 py-3 transition-[width] duration-200 md:sticky md:top-0 md:h-screen md:shrink-0 md:flex-col md:flex-nowrap md:items-stretch md:gap-0 md:self-start md:border-b-0 md:border-r"
    :class="collapsedTarget ? 'md:w-16 md:px-2 md:py-4' : 'md:w-44 md:p-4'"
    aria-label="Painel de controle"
  >
    <!-- Cantos arredondados "para fora": a cor da sidebar escorre em curva para
         o conteúdo no topo e na base (raio invertido). Só visual. -->
    <span class="sidebar-flare sidebar-flare-top" aria-hidden="true"></span>
    <span class="sidebar-flare sidebar-flare-bottom" aria-hidden="true"></span>
    <div class="flex items-center gap-2 md:pb-4" :class="collapsed ? 'md:justify-center' : 'md:justify-between'">
      <a href="#/dashboard" class="flex min-w-0 items-center md:flex-1 md:justify-center" :class="collapsed && 'md:hidden'" aria-label="Gente & Gestão — Dashboard">
        <img src="/logo.png" alt="Gente & Gestão" class="h-12 w-auto max-w-[180px] object-contain md:h-auto md:max-h-16 md:w-full" />
      </a>
      <button
        type="button"
        class="hidden h-8 w-8 shrink-0 items-center justify-center rounded-lg text-zinc-400 transition hover:bg-zinc-800 hover:text-zinc-200 lg:flex"
        :aria-label="collapsedTarget ? 'Expandir sidebar' : 'Recolher sidebar'"
        :title="collapsedTarget ? 'Expandir sidebar' : 'Recolher sidebar'"
        :aria-expanded="!collapsedTarget"
        @click="sidebarCollapsed = !sidebarCollapsed"
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <polyline v-if="!collapsedTarget" points="15 18 9 12 15 6" />
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

    <div v-if="showDashboardTabs" data-tour="tabs" class="md:mt-4 md:border-t md:border-zinc-800 md:pt-4">
      <p v-if="!collapsed" class="mb-2 hidden px-1 text-[10px] font-semibold uppercase tracking-widest text-zinc-500 md:block">Visualização</p>
      <DashboardTabs variant="topbar" class="hidden md:grid" vertical :compact="collapsed" />
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
      <p v-if="!collapsed" class="hidden text-center text-[10px] text-zinc-500 md:block">Copyright © <span class="font-bold text-zinc-300">IBDS</span></p>
    </div>
  </aside>
</template>

<style scoped>
/* Raio invertido nos cantos externos da sidebar (topo e base): um quadrado
   colado na borda direita, com um quarto de círculo transparente. */
.sidebar-flare {
  position: absolute;
  left: 100%;
  width: 24px;
  height: 24px;
  pointer-events: none;
}
.sidebar-flare-top {
  top: 0;
  background: radial-gradient(circle at 100% 100%, transparent 23px, #0a0a0a 24px);
}
.sidebar-flare-bottom {
  bottom: 0;
  background: radial-gradient(circle at 100% 0, transparent 23px, #0a0a0a 24px);
}
@media (max-width: 767px) {
  .sidebar-flare {
    display: none;
  }
}
.drawer-enter-active,
.drawer-leave-active {
  transition: opacity 0.2s ease;
}
.drawer-enter-active .drawer-panel,
.drawer-leave-active .drawer-panel {
  transition: transform 0.24s cubic-bezier(0.22, 1, 0.36, 1);
}
.drawer-enter-from,
.drawer-leave-to {
  opacity: 0;
}
.drawer-enter-from .drawer-panel,
.drawer-leave-to .drawer-panel {
  transform: translateX(-100%);
}
@media (prefers-reduced-motion: reduce) {
  .drawer-enter-active,
  .drawer-leave-active,
  .drawer-enter-active .drawer-panel,
  .drawer-leave-active .drawer-panel {
    transition-duration: 0.01ms;
  }
}
</style>
