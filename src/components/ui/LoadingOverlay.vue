<script setup>
defineProps({
  show: { type: Boolean, default: false },
  label: { type: String, default: "Carregando informações..." }
});
</script>

<template>
  <Teleport to="body">
    <div
      v-if="show"
      class="fixed inset-0 z-[120] flex flex-col items-center justify-center gap-6 bg-white/85 backdrop-blur-sm dark:bg-zinc-950/85"
      role="status"
      aria-live="polite"
    >
      <div class="ball-stage">
        <span class="ball"></span>
        <span class="ball-shadow"></span>
      </div>
      <p class="text-sm font-medium text-zinc-600 dark:text-zinc-300">{{ label }}</p>
    </div>
  </Teleport>
</template>

<style scoped>
.ball-stage {
  position: relative;
  display: flex;
  height: 88px;
  width: 96px;
  align-items: flex-end;
  justify-content: center;
}
.ball {
  display: block;
  height: 26px;
  width: 26px;
  border-radius: 9999px;
  background: linear-gradient(160deg, #f87171, #dc2626);
  box-shadow: 0 6px 14px rgb(220 38 38 / 0.35);
  animation: gg-ball-bounce 0.62s cubic-bezier(0.28, 0.84, 0.42, 1) infinite alternate;
}
.ball-shadow {
  position: absolute;
  bottom: 2px;
  left: 50%;
  height: 7px;
  width: 34px;
  margin-left: -17px;
  border-radius: 9999px;
  background: rgb(24 24 27 / 0.35);
  filter: blur(1px);
  animation: gg-ball-shadow 0.62s cubic-bezier(0.28, 0.84, 0.42, 1) infinite alternate;
}
@keyframes gg-ball-bounce {
  0% {
    transform: translateY(0) scale(1.08, 0.82);
  }
  100% {
    transform: translateY(-62px) scale(0.94, 1.1);
  }
}
@keyframes gg-ball-shadow {
  0% {
    transform: scaleX(1);
    opacity: 0.4;
  }
  100% {
    transform: scaleX(0.45);
    opacity: 0.12;
  }
}
</style>
