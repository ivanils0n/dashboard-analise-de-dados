import { ref, watch, onBeforeUnmount } from "vue";

const reducedMotion = () =>
  typeof window !== "undefined" &&
  window.matchMedia &&
  window.matchMedia("(prefers-reduced-motion: reduce)").matches;

const easeOutCubic = (t) => 1 - Math.pow(1 - t, 3);

export function useCountUp(source, { duration = 600 } = {}) {
  const isNum = (v) => typeof v === "number" && Number.isFinite(v);
  const display = ref(isNum(source()) ? 0 : source());
  let raf = 0;

  function run(to) {
    cancelAnimationFrame(raf);
    const from = isNum(display.value) ? display.value : 0;
    if (!isNum(to) || reducedMotion() || from === to) {
      display.value = to;
      return;
    }
    const start = performance.now();
    const tick = (now) => {
      const t = Math.min(1, (now - start) / duration);
      display.value = from + (to - from) * easeOutCubic(t);
      if (t < 1) raf = requestAnimationFrame(tick);
      else display.value = to;
    };
    raf = requestAnimationFrame(tick);
  }

  watch(source, run, { immediate: true });
  onBeforeUnmount(() => cancelAnimationFrame(raf));
  return display;
}
