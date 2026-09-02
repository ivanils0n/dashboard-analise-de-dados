<script setup>
import TopBar from "./TopBar.vue";
import SideBar from "./SideBar.vue";
</script>

<template>
  <div class="min-h-screen bg-ice text-zinc-900 dark:bg-zinc-950 dark:text-zinc-100">
    <TopBar />
    <div class="flex min-h-[calc(100vh-4rem)] items-start">
      <SideBar />
      <main class="min-w-0 flex-1 px-4 pb-10 pt-6 sm:px-6 lg:px-8">
        <router-view />
        <footer class="mt-10 border-t border-zinc-200 pt-4 text-center text-xs text-zinc-400 dark:border-zinc-800 dark:text-zinc-400">
          Gente &amp; Gestão · Dashboard de análise de dados RH
        </footer>
      </main>
    </div>
  </div>
</template>
