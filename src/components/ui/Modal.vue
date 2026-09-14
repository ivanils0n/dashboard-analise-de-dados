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
    <div
      class="fixed inset-0 z-[60] flex bg-black/50"
      :class="fullscreen ? 'p-0' : 'items-start justify-center overflow-y-auto p-4 py-10'"
      @click.self="emit('close')"
    >
      <div
        class="w-full min-w-0 rounded-2xl border border-zinc-200 bg-white shadow-2xl dark:border-zinc-800 dark:bg-zinc-900"
        :class="fullscreen
          ? 'flex h-screen max-w-none flex-col rounded-none border-0'
          : 'slide-up flex max-h-[90vh] flex-col ' + maxWidth"
        role="dialog"
        aria-modal="true"
        :aria-label="title"
      >
        <div class="flex shrink-0 items-start justify-between gap-4 border-b border-zinc-100 px-6 py-4 dark:border-zinc-800">
          <div>
            <h2 class="text-lg font-bold text-zinc-900 dark:text-zinc-100">{{ title }}</h2>
            <p v-if="subtitle" class="mt-0.5 text-sm text-zinc-500 dark:text-zinc-400">{{ subtitle }}</p>
          </div>
          <button
            type="button"
            class="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-xl leading-none text-zinc-400 transition hover:bg-zinc-100 hover:text-zinc-700 dark:hover:bg-zinc-800 dark:hover:text-zinc-200"
            aria-label="Fechar"
            @click="emit('close')"
          >
            &times;
          </button>
        </div>

        <div class="min-h-0 min-w-0 flex-1 overflow-y-auto" :class="fullscreen ? 'p-4 sm:p-6' : 'px-6 py-5'">
          <slot />
        </div>
      </div>
    </div>
  </Teleport>
</template>
