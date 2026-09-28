<script setup>
import { useToast } from "@/composables/useToast";

const { state } = useToast();
</script>

<template>
  <Teleport to="body">
    <div
      v-if="state.visible"
      class="fixed bottom-[calc(1.25rem+env(safe-area-inset-bottom))] left-1/2 z-[80] w-max max-w-[calc(100vw-2rem)] -translate-x-1/2 text-center rounded-xl bg-zinc-900 px-5 py-3 text-sm font-medium text-white shadow-2xl slide-up dark:bg-zinc-100 dark:text-zinc-900"
      role="status"
    >
      {{ state.message }}
    </div>
  </Teleport>
</template>
