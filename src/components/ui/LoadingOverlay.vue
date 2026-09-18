<script setup>
defineProps({
  show: { type: Boolean, default: false },
  label: { type: String, default: "Carregando informações..." }
});
</script>

<template>
  <Teleport to="body">
    <Transition name="gg-loading-fade">
      <div
        v-if="show"
        class="fixed inset-0 z-[120] flex flex-col items-center justify-center gap-7 bg-white/92 backdrop-blur-md dark:bg-zinc-950/92"
        role="status"
        aria-live="polite"
      >
        <div class="gg-spinner" aria-hidden="true">
          <span class="gg-spinner-track"></span>
          <span class="gg-spinner-arc"></span>
        </div>

        <div class="flex flex-col items-center gap-3">
          <p class="text-sm font-semibold tracking-wide text-zinc-700 dark:text-zinc-200">{{ label }}</p>
          <div class="gg-progress">
            <span class="gg-progress-fill"></span>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.gg-loading-fade-enter-active,
.gg-loading-fade-leave-active {
  transition: opacity 0.2s ease;
}
.gg-loading-fade-enter-from,
.gg-loading-fade-leave-to {
  opacity: 0;
}

.gg-spinner {
  position: relative;
  height: 58px;
  width: 58px;
}
.gg-spinner-track {
  position: absolute;
  inset: 0;
  border-radius: 9999px;
  border: 3px solid rgb(228 228 231);
}
:global(.dark) .gg-spinner-track {
  border-color: rgb(63 63 70);
}
.gg-spinner-arc {
  position: absolute;
  inset: 0;
  border-radius: 9999px;
  border: 3px solid transparent;
  border-top-color: var(--color-accent, #E8AF3E);
  border-right-color: var(--color-accent, #E8AF3E);
  animation: gg-spin 0.85s cubic-bezier(0.5, 0.05, 0.5, 0.95) infinite;
}
@keyframes gg-spin {
  to {
    transform: rotate(360deg);
  }
}

.gg-progress {
  height: 3px;
  width: 168px;
  overflow: hidden;
  border-radius: 9999px;
  background: rgb(228 228 231);
}
:global(.dark) .gg-progress {
  background: rgb(63 63 70);
}
.gg-progress-fill {
  display: block;
  height: 100%;
  width: 35%;
  border-radius: 9999px;
  background: linear-gradient(90deg, transparent, var(--color-accent, #E8AF3E), transparent);
  animation: gg-progress-sweep 1.4s ease-in-out infinite;
}
@keyframes gg-progress-sweep {
  0% {
    transform: translateX(-120%);
  }
  100% {
    transform: translateX(380%);
  }
}
</style>
