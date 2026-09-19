<script setup>
import { useRoute, useRouter } from "vue-router";
import { getProfile } from "@/lib/auth";

const route = useRoute();
const router = useRouter();
const profile = getProfile();
const isAdmin = profile && profile.perfil === "admin";
const isVisitor = profile && profile.perfil === "visitante";

const items = [
  {
    name: "dashboard",
    label: "Dashboard",
    paths: ["M12 20v-10M18 20V4M6 20v-4"]
  },
  /* Aba "Equipe" desativada (fica fora da sidebar) — comentada, não removida,
     para o caso de precisar reativar no futuro.
  {
    name: "equipe",
    label: "Equipe",
    paths: ["M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2M9 7a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"]
  },
  */
  {
    name: "filiais",
    label: "Filiais",
    paths: ["M3 9l1.5-5h15L21 9M3 9h18v3a3 3 0 0 1-3 3H6a3 3 0 0 1-3-3V9zM6 15v6h12v-6"]
  },
  /* Aba "Departamentos" desativada (fica fora da sidebar) — comentada, não
     removida, para o caso de precisar reativar no futuro.
  {
    name: "departamentos",
    label: "Departamentos",
    paths: ["M3 3h7v7H3zM14 3h7v7h-7zM14 14h7v7h-7zM3 14h7v7H3z"]
  },
  */
  {
    name: "usuarios",
    label: "Usuários",
    paths: [
      "M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z",
      "M12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6z"
    ]
  }
];

let visibleItems = isAdmin
  ? items
  : isVisitor
    ? items.filter((i) => i.name === "dashboard")
    : items.filter((i) => i.name !== "usuarios");
</script>

<template>
  <aside
    class="sticky top-20 z-30 flex h-[calc(100vh-5rem)] w-[84px] shrink-0 flex-col items-center self-start border-r border-zinc-800 bg-[#0a0a0a] py-3"
  >
    <nav class="flex flex-1 flex-col items-center gap-3" aria-label="Navegação principal">
      <button
        v-for="item in visibleItems"
        :key="item.name"
        type="button"
        class="group relative flex h-14 w-14 items-center justify-center overflow-visible rounded-xl transition"
        :class="route.name === item.name
          ? 'bg-accent/15 text-accent'
          : 'text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200'"
        :title="item.label"
        :aria-label="item.label"
        @click="router.push({ name: item.name })"
      >
        <svg
          width="26"
          height="26"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          stroke-linecap="round"
          stroke-linejoin="round"
          aria-hidden="true"
          class="overflow-visible"
        >
          <path v-for="d in item.paths" :key="d" :d="d" />
        </svg>
        <span
          class="pointer-events-none absolute left-full z-[60] ml-2 whitespace-nowrap rounded-md bg-zinc-900 px-2 py-1 text-xs font-medium text-white opacity-0 shadow-lg transition group-hover:opacity-100 dark:bg-zinc-100 dark:text-zinc-900"
        >
          {{ item.label }}
        </span>
      </button>
    </nav>
    <div class="mt-auto pt-4 text-center">
      <p class="text-[10px] text-zinc-500">Feito por</p>
      <p class="text-xs font-bold text-zinc-200">Ivanilson</p>
    </div>
  </aside>
</template>
