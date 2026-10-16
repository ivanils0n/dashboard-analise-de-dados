<script setup>
import { ref, onMounted, onUnmounted } from "vue";
import { exportElementToPdf } from "@/lib/pdf";
import { useToast } from "@/composables/useToast";

const props = defineProps({
  title: { type: String, required: true },
  // Não remover: os modais passam :open e, sem declarar, o Vue avisa no console.
  open: { type: Boolean, default: true },
  subtitle: { type: String, default: "" },
  maxWidth: { type: String, default: "max-w-2xl" },
  fullscreen: { type: Boolean, default: false },
  centered: { type: Boolean, default: false },
  flush: { type: Boolean, default: false },
  pdf: { type: Boolean, default: false }
});

const emit = defineEmits(["close"]);

const panel = ref(null);
const gerandoPdf = ref(false);
async function baixarPdf() {
  if (gerandoPdf.value || !panel.value) return;
  gerandoPdf.value = true;
  try {
    await exportElementToPdf(panel.value, { title: props.title, subtitle: props.subtitle });
  } catch (err) {
    console.error("[PDF]", err);
    useToast().show("Não foi possível gerar o PDF.", "error");
  } finally {
    gerandoPdf.value = false;
  }
}

function onKeydown(e) {
  if (e.key === "Escape") emit("close");
}

const ready = ref(false);
let readyTimer = null;
let readyFrame = 0;
function markReady() {
  clearTimeout(readyTimer);
  cancelAnimationFrame(readyFrame);
  ready.value = true;
}

onMounted(() => {
  document.addEventListener("keydown", onKeydown);
  readyFrame = requestAnimationFrame(() => {
    readyTimer = setTimeout(markReady, 0);
  });
  readyTimer = setTimeout(markReady, 80);
});
onUnmounted(() => {
  document.removeEventListener("keydown", onKeydown);
  clearTimeout(readyTimer);
  cancelAnimationFrame(readyFrame);
});
</script>

<template>
  <Teleport to="body">
    <Transition name="mac-modal" appear :duration="{ enter: 380, leave: 160 }">
    <div
      class="fixed inset-0 z-[60] flex bg-black/50"
      :class="fullscreen ? 'p-0' : 'items-end justify-center overflow-y-auto p-0 sm:items-start sm:p-4 sm:py-10'"
      @click.self="emit('close')"
    >
      <div
        ref="panel"
        class="mac-panel w-full min-w-0 rounded-2xl border border-zinc-200 bg-white shadow-2xl dark:border-zinc-800 dark:bg-zinc-900"
        :class="fullscreen
          ? 'safe-top safe-bottom safe-x flex h-[100dvh] max-w-none flex-col rounded-none border-0'
          : 'safe-bottom flex max-h-[92dvh] flex-col rounded-b-none sm:max-h-[90vh] sm:rounded-b-2xl ' + maxWidth"
        role="dialog"
        aria-modal="true"
        :aria-label="title"
      >
        <div class="flex shrink-0 items-start justify-between gap-4 border-b border-zinc-100 px-4 dark:border-zinc-800"
          :class="flush ? 'py-2 sm:px-4' : 'py-3 sm:px-6 sm:py-4'">
          <span v-if="centered" class="w-10 shrink-0 sm:w-8" aria-hidden="true"></span>
          <div :class="centered && 'min-w-0 flex-1 text-center'">
            <h2
              class="font-bold text-zinc-900 dark:text-zinc-100"
              :class="centered ? 'text-xl sm:text-2xl' : 'text-base sm:text-lg'"
            >
              {{ title }}
            </h2>
            <p v-if="subtitle" class="mt-0.5 text-sm text-zinc-500 dark:text-zinc-400">{{ subtitle }}</p>
          </div>
          <div v-if="ready && $slots.actions" data-pdf-hide class="fade-in ml-auto flex min-w-0 items-center">
            <slot name="actions" />
          </div>
          <button
            v-if="pdf"
            type="button"
            data-pdf-hide
            class="flex h-10 shrink-0 items-center justify-center gap-1.5 rounded-lg px-3 text-sm font-semibold text-zinc-500 transition hover:bg-zinc-100 hover:text-zinc-800 disabled:opacity-50 sm:h-8 dark:text-zinc-300 dark:hover:bg-zinc-800 dark:hover:text-zinc-100"
            :class="!($slots.actions) && 'ml-auto'"
            :disabled="gerandoPdf || !ready"
            title="Baixar esta análise em PDF"
            aria-label="Baixar em PDF"
            @click="baixarPdf"
          >
            <svg v-if="!gerandoPdf" class="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              <path d="M12 3v12" />
              <path d="m7 11 5 5 5-5" />
              <path d="M5 21h14" />
            </svg>
            <span v-else class="h-4 w-4 animate-spin rounded-full border-2 border-zinc-300 border-t-accent" aria-hidden="true"></span>
            PDF
          </button>
          <button
            type="button"
            data-pdf-hide
            class="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-2xl sm:h-8 sm:w-8 sm:text-xl leading-none text-zinc-400 transition hover:bg-zinc-100 hover:text-zinc-700 dark:hover:bg-zinc-800 dark:hover:text-zinc-200"
            aria-label="Fechar"
            @click="emit('close')"
          >
            &times;
          </button>
        </div>

        <div
          data-pdf-scroll
          class="min-h-0 min-w-0 flex-1 overflow-y-auto"
          :class="[flush ? 'p-0' : fullscreen ? 'p-3 sm:p-6' : 'px-4 py-4 sm:px-6 sm:py-5', ready && 'fade-in']"
        >
          <slot v-if="ready" />
          <div v-else class="flex min-h-[12rem] items-center justify-center" aria-busy="true">
            <span class="h-7 w-7 animate-spin rounded-full border-2 border-zinc-200 border-t-accent dark:border-zinc-700 dark:border-t-accent" aria-hidden="true"></span>
          </div>
        </div>
      </div>
      <div v-if="gerandoPdf" class="absolute inset-0 z-10 flex flex-col items-center justify-center gap-3 bg-black/70 text-sm font-semibold text-zinc-100" role="status">
        <span class="h-8 w-8 animate-spin rounded-full border-2 border-zinc-500 border-t-accent" aria-hidden="true"></span>
        Gerando PDF...
      </div>
    </div>
    </Transition>
  </Teleport>
</template>
