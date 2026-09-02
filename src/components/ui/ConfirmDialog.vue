<script setup>
import { onMounted, onUnmounted } from "vue";
import { useDialog } from "@/composables/useDialog";

const { state, close } = useDialog();

function onKeydown(e) {
  if (e.key === "Escape" && state.visible) close(false);
}

onMounted(() => document.addEventListener("keydown", onKeydown));
onUnmounted(() => document.removeEventListener("keydown", onKeydown));
</script>

<template>
  <Teleport to="body">
    <div
      v-if="state.visible"
      class="fixed inset-0 z-[70] flex items-center justify-center bg-black/50 p-4"
      @click.self="close(false)"
    >
      <div
        class="w-full max-w-sm rounded-2xl border border-zinc-200 bg-white p-6 shadow-2xl slide-up dark:border-zinc-800 dark:bg-zinc-900"
        role="alertdialog"
        aria-modal="true"
        :aria-label="state.title"
      >
        <div class="flex flex-col items-center gap-3 text-center">
          <div
            class="flex h-12 w-12 items-center justify-center rounded-full"
            :class="state.danger ? 'bg-red-100 text-red-600 dark:bg-red-950/60 dark:text-red-400' : 'bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300'"
          >
            <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
              <line x1="12" y1="9" x2="12" y2="13" />
              <line x1="12" y1="17" x2="12.01" y2="17" />
            </svg>
          </div>
          <h2 class="text-lg font-bold text-zinc-900 dark:text-zinc-100">{{ state.title }}</h2>
          <p v-if="state.message" class="text-sm text-zinc-500 dark:text-zinc-400">{{ state.message }}</p>
        </div>
        <div class="mt-6 flex justify-end gap-2">
          <button
            type="button"
            class="rounded-lg border border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-700 transition hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-800"
            @click="close(false)"
          >
            {{ state.cancelText }}
          </button>
          <button
            type="button"
            :class="state.danger
              ? 'bg-red-600 text-white hover:bg-red-700'
              : 'bg-zinc-900 text-white hover:bg-zinc-800 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-white'"
            class="rounded-lg px-4 py-2 text-sm font-semibold transition"
            @click="close(true)"
          >
            {{ state.confirmText }}
          </button>
        </div>
      </div>
    </div>
  </Teleport>
</template>
