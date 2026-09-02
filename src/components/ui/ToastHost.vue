<script setup>
import { useToast } from "@/composables/useToast";

const { state } = useToast();
</script>

<template>
  <Teleport to="body">
    <div
      v-if="state.visible"
      class="fixed bottom-5 left-1/2 z-[80] -translate-x-1/2 rounded-xl bg-zinc-900 px-5 py-3 text-sm font-medium text-white shadow-2xl slide-up dark:bg-zinc-100 dark:text-zinc-900"
      role="status"
    >
      {{ state.message }}
    </div>
  </Teleport>
</template>
