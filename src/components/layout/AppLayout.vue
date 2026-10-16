<script setup>
import SideBar from "./SideBar.vue";
</script>

<template>
  <div class="min-h-screen bg-ice text-zinc-900 dark:bg-zinc-950 dark:text-zinc-100">
    <div class="flex min-h-screen flex-col md:flex-row md:items-start">
      <SideBar />
      <main class="min-w-0 w-full flex-1 pl-[max(0.75rem,env(safe-area-inset-left))] pr-[max(0.75rem,env(safe-area-inset-right))] pb-[calc(2.5rem+env(safe-area-inset-bottom))] pt-4 sm:px-6 sm:pt-6 lg:px-8">
        <router-view v-slot="{ Component, route }">
          <transition name="page" mode="out-in">
            <keep-alive :max="6">
              <component :is="Component" :key="route.name" />
            </keep-alive>
          </transition>
        </router-view>
      </main>
    </div>
  </div>
</template>
