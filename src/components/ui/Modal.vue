<script setup>
import { onMounted, onUnmounted } from "vue";

defineProps({
  title: { type: String, required: true },
  subtitle: { type: String, default: "" },
  maxWidth: { type: String, default: "max-w-2xl" },
  fullscreen: { type: Boolean, default: false }
});

const emit = defineEmits(["close"]);

function onKeydown(e) {
  if (e.key === "Escape") emit("close");
}

onMounted(() => document.addEventListener("keydown", onKeydown));
onUnmounted(() => document.removeEventListener("keydown", onKeydown));
</script>

<template>
  <Teleport to="body">
    <Transition name="mac-modal" appear :duration="{ enter: 320, leave: 170 }">
    <div
      class="fixed inset-0 z-[60] flex bg-black/50"
      :class="fullscreen ? 'p-0' : 'items-end justify-center overflow-y-auto p-0 sm:items-start sm:p-4 sm:py-10'"
      @click.self="emit('close')"
    >
      <div
        class="mac-panel w-full min-w-0 rounded-2xl border border-zinc-200 bg-white shadow-2xl dark:border-zinc-800 dark:bg-zinc-900"
        :class="fullscreen
          ? 'safe-top safe-bottom safe-x flex h-[100dvh] max-w-none flex-col rounded-none border-0'
          : 'safe-bottom flex max-h-[92dvh] flex-col rounded-b-none sm:max-h-[90vh] sm:rounded-b-2xl ' + maxWidth"
        role="dialog"
        aria-modal="true"
        :aria-label="title"
      >
        <div class="flex shrink-0 items-start justify-between gap-4 border-b border-zinc-100 px-4 py-3 sm:px-6 sm:py-4 dark:border-zinc-800">
          <div>
            <h2 class="text-base font-bold text-zinc-900 sm:text-lg dark:text-zinc-100">{{ title }}</h2>
            <p v-if="subtitle" class="mt-0.5 text-sm text-zinc-500 dark:text-zinc-400">{{ subtitle }}</p>
          </div>
          <div v-if="$slots.actions" class="ml-auto flex min-w-0 items-center">
            <slot name="actions" />
          </div>
          <button
            type="button"
            class="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-2xl sm:h-8 sm:w-8 sm:text-xl leading-none text-zinc-400 transition hover:bg-zinc-100 hover:text-zinc-700 dark:hover:bg-zinc-800 dark:hover:text-zinc-200"
            aria-label="Fechar"
            @click="emit('close')"
          >
            &times;
          </button>
        </div>

        <div class="min-h-0 min-w-0 flex-1 overflow-y-auto" :class="fullscreen ? 'p-3 sm:p-6' : 'px-4 py-4 sm:px-6 sm:py-5'">
          <slot />
        </div>
      </div>
    </div>
    </Transition>
  </Teleport>
</template>
