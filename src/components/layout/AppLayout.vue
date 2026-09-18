<script setup>
import { computed } from "vue";
import { authState } from "@/lib/auth";
import TopBar from "./TopBar.vue";
import SideBar from "./SideBar.vue";

/* O visitante tem acesso somente leitura ao dashboard e não exibe a sidebar.
   Lê o estado reativo (authState.profile) para reagir a login/logout. */
const isVisitor = computed(() => {
  const p = authState.profile;
  return !!(p && p.perfil === "visitante");
});
</script>

<template>
  <div class="min-h-screen bg-ice text-zinc-900 dark:bg-zinc-950 dark:text-zinc-100">
    <TopBar />
    <div class="flex min-h-[calc(100vh-5rem)] items-start">
      <SideBar v-if="!isVisitor" />
      <main class="min-w-0 flex-1 px-4 pb-10 pt-6 sm:px-6 lg:px-8">
        <router-view v-slot="{ Component, route }">
          <transition name="page" mode="out-in">
            <keep-alive :max="6">
              <component :is="Component" :key="route.name" />
            </keep-alive>
          </transition>
        </router-view>
        <footer class="mt-10 border-t border-zinc-200 pt-4 text-center text-xs text-zinc-400 dark:border-zinc-800 dark:text-zinc-400">
          Gente &amp; Gestão · Dashboard de análise de dados RH
        </footer>
      </main>
    </div>
  </div>
</template>
