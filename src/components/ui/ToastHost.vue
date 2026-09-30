<script setup>
import { useToast } from "@/composables/useToast";

/* Notificações no canto inferior direito, empilhadas: cada uma é um cartão
   claro com ícone do tipo, mensagem, botão de fechar e barra de progresso do
   tempo restante. A mais antiga fica em cima; as novas entram embaixo. */
const { state, hide } = useToast();

const TONES = {
  success: { color: "#16a34a", icon: "M12 0a12 12 0 1012 12A12.014 12.014 0 0012 0zm6.927 8.2l-6.845 9.289a1.011 1.011 0 01-1.43.188l-4.888-3.908a1 1 0 111.25-1.562l4.076 3.261 6.227-8.451a1 1 0 111.61 1.183z" },
  error: { color: "#dc2626", icon: "M12 0a12 12 0 1012 12A12.013 12.013 0 0012 0zm3.707 14.293a1 1 0 11-1.414 1.414L12 13.414l-2.293 2.293a1 1 0 01-1.414-1.414L10.586 12 8.293 9.707a1 1 0 011.414-1.414L12 10.586l2.293-2.293a1 1 0 011.414 1.414L13.414 12z" },
  warning: { color: "#f59e0b", icon: "M12 0a12 12 0 1012 12A12.013 12.013 0 0012 0zm-1 6a1 1 0 012 0v6a1 1 0 01-2 0zm1 12.25a1.25 1.25 0 111.25-1.25A1.25 1.25 0 0112 18.25z" },
  loading: { color: "#e8ae3f", icon: "" },
  info: { color: "#0284c7", icon: "M12 0a12 12 0 1012 12A12.013 12.013 0 0012 0zm1 17a1 1 0 01-2 0v-5a1 1 0 012 0zm-1-8.75A1.25 1.25 0 1113.25 7 1.25 1.25 0 0112 8.25z" }
};

const toneOf = (type) => TONES[type] || TONES.success;
</script>

<template>
  <Teleport to="body">
    <TransitionGroup
      name="toast"
      tag="div"
      class="pointer-events-none fixed bottom-[calc(1rem+env(safe-area-inset-bottom))] left-4 right-4 z-[80] flex flex-col gap-3 sm:left-auto sm:right-5 sm:w-[22rem]"
      aria-live="polite"
    >
      <div
        v-for="t in state.items"
        :key="t.id"
        class="pointer-events-auto overflow-hidden rounded-lg border border-zinc-100 bg-white shadow-xl shadow-black/15 dark:border-zinc-700 dark:bg-zinc-800"
        role="status"
      >
        <div class="flex items-center gap-3 px-4 py-4">
          <svg v-if="t.type === 'loading'" class="h-6 w-6 shrink-0 animate-spin" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <circle cx="12" cy="12" r="10" stroke="currentColor" stroke-opacity="0.2" stroke-width="3" class="text-zinc-400" />
            <path d="M22 12a10 10 0 0 0-10-10" :stroke="toneOf(t.type).color" stroke-width="3" stroke-linecap="round" />
          </svg>
          <svg v-else class="h-6 w-6 shrink-0" viewBox="0 0 24 24" aria-hidden="true">
            <path :d="toneOf(t.type).icon" :fill="toneOf(t.type).color" />
          </svg>
          <p
            class="min-w-0 flex-1 text-[15px] leading-snug"
            :class="t.type === 'error' ? 'font-medium text-red-600 dark:text-red-400' : 'text-zinc-600 dark:text-zinc-200'"
          >{{ t.message }}</p>
          <button
            type="button"
            class="-mr-1 flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-zinc-400 transition hover:bg-zinc-100 hover:text-zinc-600 dark:hover:bg-zinc-700 dark:hover:text-zinc-200"
            aria-label="Fechar notificação"
            @click="hide(t.id)"
          >
            <svg class="h-3.5 w-3.5" viewBox="0 0 14 14" aria-hidden="true">
              <path fill="currentColor" d="M7.71 7.23l3.75 3.75-1.48 1.48-3.75-3.75-3.75 3.75L1 10.98l3.75-3.75L1 3.48 2.48 2l3.75 3.75L9.98 2l1.48 1.48z" />
            </svg>
          </button>
        </div>
        <div
          v-if="t.duration > 0"
          class="toast-progress h-1 origin-left"
          :style="{ backgroundColor: toneOf(t.type).color, animationDuration: t.duration + 'ms' }"
        />
      </div>
    </TransitionGroup>
  </Teleport>
</template>

<style scoped>
.toast-progress {
  animation-name: toast-progress;
  animation-timing-function: linear;
  animation-fill-mode: forwards;
}
@keyframes toast-progress {
  from {
    transform: scaleX(1);
  }
  to {
    transform: scaleX(0);
  }
}
/* Entrada: desliza da direita. Saída: desliza para a direita encolhendo e
   sumindo; as demais descem suavemente para ocupar o espaço (toast-move). */
.toast-enter-active {
  transition: opacity 0.3s ease, transform 0.3s cubic-bezier(0.22, 1, 0.36, 1);
}
.toast-leave-active {
  transition: opacity 0.35s ease, transform 0.35s cubic-bezier(0.55, 0, 0.9, 0.45);
}
.toast-enter-from {
  opacity: 0;
  transform: translateX(40px);
}
.toast-leave-to {
  opacity: 0;
  transform: translateX(110%) scale(0.96);
}
.toast-move {
  transition: transform 0.3s ease;
}
@media (prefers-reduced-motion: reduce) {
  .toast-enter-active,
  .toast-leave-active,
  .toast-move {
    transition: opacity 0.15s ease;
  }
  .toast-enter-from,
  .toast-leave-to {
    transform: none;
  }
}
</style>
