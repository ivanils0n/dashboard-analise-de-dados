import { ref, computed, watch, onBeforeUnmount } from "vue";

const reducedMotion = () =>
  typeof window !== "undefined" &&
  window.matchMedia &&
  window.matchMedia("(prefers-reduced-motion: reduce)").matches;

const easeOutQuart = (t) => 1 - Math.pow(1 - t, 4);

export function useCountUp(source, { duration = 1000 } = {}) {
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
      display.value = from + (to - from) * easeOutQuart(t);
      if (t < 1) raf = requestAnimationFrame(tick);
      else display.value = to;
    };
    raf = requestAnimationFrame(tick);
  }

  watch(source, run, { immediate: true });
  onBeforeUnmount(() => cancelAnimationFrame(raf));
  return display;
}

const NUMBER_IN_TEXT = /-?\d{1,3}(?:\.\d{3})+(?:,\d+)?|-?\d+(?:,\d+)?/;

function parseTextNumber(text) {
  if (typeof text === "number") {
    if (!Number.isFinite(text) || !Number.isInteger(text)) return null;
    return { before: "", after: "", value: text, decimals: 0, grouping: false };
  }
  if (typeof text !== "string") return null;
  const str = String(text);
  const match = str.match(NUMBER_IN_TEXT);
  if (!match) return null;
  const raw = match[0];
  const comma = raw.indexOf(",");
  return {
    before: str.slice(0, match.index),
    after: str.slice(match.index + raw.length),
    value: Number(raw.replace(/\./g, "").replace(",", ".")),
    decimals: comma === -1 ? 0 : raw.length - comma - 1,
    grouping: raw.includes(".")
  };
}

export function useCountUpText(source, options) {
  const parsed = computed(() => parseTextNumber(source()));
  const animated = useCountUp(() => (parsed.value ? parsed.value.value : null), options);
  return computed(() => {
    const p = parsed.value;
    if (!p || typeof animated.value !== "number") return source() ?? "";
    const n = animated.value.toLocaleString("pt-BR", {
      minimumFractionDigits: p.decimals,
      maximumFractionDigits: p.decimals,
      useGrouping: p.grouping
    });
    return p.before + n + p.after;
  });
}
