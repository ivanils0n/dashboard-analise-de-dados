<script setup>
import { computed, onBeforeUnmount, ref, watch } from "vue";
import { UF_MAP } from "@/lib/ufShapes";
import { STATE_NAMES } from "@/lib/config";

const props = defineProps({
  states: { type: Array, default: () => [] },
  title: { type: String, default: "Mapa por estado" },
  subtitle: { type: String, default: "" },
  showValues: { type: Boolean, default: true }
});

const UF_FILL = {
  RO: { base: "fill-red-500/60 hover:fill-red-500/80", hover: "fill-red-500", dot: "bg-red-500" },
  AM: { base: "fill-blue-500/60 hover:fill-blue-500/80", hover: "fill-blue-500", dot: "bg-blue-500" },
  PA: { base: "fill-yellow-400/70 hover:fill-yellow-400/90", hover: "fill-yellow-400", dot: "bg-yellow-400" }
};

const emit = defineEmits(["select"]);

const single = computed(() => props.states.length === 1);

function selectState(uf) {
  emit("select", single.value ? "todos" : uf);
}

function stateLabel(name) {
  return single.value ? "Voltar para todos os estados" : `Filtrar por ${name}`;
}

const targetViewBox = computed(() =>
  single.value ? UF_MAP.states[props.states[0].uf]?.viewBox || UF_MAP.viewBox : UF_MAP.viewBox
);

const ZOOM_MS = 480;
const parseBox = (box) => box.split(/\s+/).map(Number);
const targetFrame = () => [...parseBox(targetViewBox.value), single.value ? 0.09 : 0.045];
const view = ref(targetFrame());
let raf = 0;

function easeOutQuart(t) {
  return 1 - Math.pow(1 - t, 4);
}

function stopZoom() {
  if (raf) cancelAnimationFrame(raf);
  raf = 0;
}

watch(targetViewBox, () => {
  stopZoom();
  const from = [...view.value];
  const to = targetFrame();
  const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
  if (reduce || from.some((n) => !Number.isFinite(n)) || to.some((n) => !Number.isFinite(n))) {
    view.value = to;
    return;
  }
  const start = performance.now();
  const step = (now) => {
    const t = Math.min(1, (now - start) / ZOOM_MS);
    const k = easeOutQuart(t);
    view.value = from.map((v, i) => v + (to[i] - v) * k);
    raf = t < 1 ? requestAnimationFrame(step) : 0;
  };
  raf = requestAnimationFrame(step);
});

onBeforeUnmount(stopZoom);

const viewBox = computed(() => view.value.slice(0, 4).map((n) => +n.toFixed(2)).join(" "));

const fontSize = computed(() => Math.round((view.value[2] || 1000) * view.value[4]));

const shapes = computed(() =>
  props.states
    .map((s) => ({ ...s, shape: UF_MAP.states[s.uf], name: STATE_NAMES[s.uf] || s.uf }))
    .filter((s) => s.shape)
);

const hoverUf = ref(null);
const hoverShape = computed(() => shapes.value.find((s) => s.uf === hoverUf.value) || null);
</script>

<template>
  <div
    class="flex flex-col rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-900"
  >
    <div class="mb-3 text-center">
      <h3 class="text-sm font-semibold text-zinc-900 dark:text-zinc-100">{{ title }}</h3>
      <span class="text-xs text-zinc-500 dark:text-zinc-400">{{ subtitle }}</span>
    </div>

    <div class="flex min-h-[220px] flex-1 items-center justify-center">
      <svg
        :viewBox="viewBox"
        class="max-h-[320px] w-full"
        preserveAspectRatio="xMidYMid meet"
        role="img"
        :aria-label="`Mapa: ${shapes.map((s) => s.name).join(', ')}`"
      >
        <TransitionGroup name="uf-map" tag="g">
        <g v-for="s in shapes" :key="s.uf" class="uf-shape">
          <path
            :d="s.shape.d"
            fill-rule="evenodd"
            stroke-width="2"
            stroke-linejoin="round"
            class="stroke-white outline-none transition-colors focus-visible:stroke-accent dark:stroke-zinc-900"
            :class="[
              s.filled ? (UF_FILL[s.uf]?.base || 'fill-accent/40 hover:fill-accent/60') : 'fill-zinc-200 hover:fill-zinc-300 dark:fill-zinc-700 dark:hover:fill-zinc-600',
              'cursor-pointer'
            ]"
            role="button"
            tabindex="0"
            :aria-label="stateLabel(s.name)"
            @pointerenter="hoverUf = s.uf"
            @pointerleave="hoverUf = null"
            @focus="hoverUf = s.uf"
            @blur="hoverUf = null"
            @click="selectState(s.uf)"
            @keydown.enter.prevent="selectState(s.uf)"
            @keydown.space.prevent="selectState(s.uf)"
          >
            <title>{{ showValues ? `${s.name} — ${s.text}${s.sub ? ` (${s.sub})` : ""}` : s.name }}</title>
          </path>
          <text
            :x="s.shape.cx"
            :y="s.shape.cy"
            text-anchor="middle"
            dominant-baseline="central"
            font-weight="700"
            :font-size="fontSize"
            class="pointer-events-none fill-zinc-700 dark:fill-zinc-100"
          >
            {{ s.uf }}
          </text>
        </g>
        </TransitionGroup>
        <g v-if="hoverShape" :key="hoverShape.uf" class="uf-hover pointer-events-none" aria-hidden="true">
          <path
            :d="hoverShape.shape.d"
            fill-rule="evenodd"
            stroke-width="2"
            stroke-linejoin="round"
            class="stroke-white dark:stroke-zinc-900"
            :class="hoverShape.filled ? (UF_FILL[hoverShape.uf]?.hover || 'fill-accent') : 'fill-zinc-300 dark:fill-zinc-600'"
          />
          <text
            :x="hoverShape.shape.cx"
            :y="hoverShape.shape.cy"
            text-anchor="middle"
            dominant-baseline="central"
            font-weight="700"
            :font-size="fontSize"
            class="fill-zinc-800 dark:fill-zinc-50"
          >
            {{ hoverShape.uf }}
          </text>
        </g>
      </svg>
    </div>

    <ul class="mt-3 flex flex-col gap-1.5 border-t border-zinc-100 pt-3 text-sm dark:border-zinc-800">
      <li v-for="s in shapes" :key="s.uf" class="flex items-center justify-between gap-3">
        <span class="flex items-center gap-2 text-zinc-600 dark:text-zinc-300">
          <span
            class="h-2.5 w-2.5 rounded-sm"
            :class="s.filled ? (UF_FILL[s.uf]?.dot || 'bg-accent/60') : 'bg-zinc-300 dark:bg-zinc-600'"
          ></span>
          {{ s.name }}
        </span>
        <span v-if="showValues" class="text-right font-semibold tabular-nums text-zinc-900 dark:text-zinc-100">
          {{ s.text }}
          <span v-if="s.sub" class="block text-xs font-normal text-zinc-400">{{ s.sub }}</span>
        </span>
      </li>
    </ul>
  </div>
</template>

<style scoped>
@keyframes uf-hover-pop {
  from { transform: scale(1); }
  to { transform: scale(1.14); }
}
.uf-hover {
  transform-box: fill-box;
  transform-origin: center;
  animation: uf-hover-pop 0.18s cubic-bezier(0.22, 1, 0.36, 1) forwards;
  filter: drop-shadow(0 4px 6px rgb(0 0 0 / 0.35));
}
@media (prefers-reduced-motion: reduce) {
  .uf-hover {
    animation: none;
  }
}
.uf-shape {
  transform-box: fill-box;
  transform-origin: center;
}
.uf-map-enter-active {
  transition: opacity 0.4s ease-out 0.08s, transform 0.45s cubic-bezier(0.22, 1, 0.36, 1) 0.08s;
}
.uf-map-leave-active {
  transition: opacity 0.2s ease-in, transform 0.2s ease-in;
  pointer-events: none;
}
.uf-map-enter-from,
.uf-map-leave-to {
  opacity: 0;
  transform: scale(0.92);
}
@media (prefers-reduced-motion: reduce) {
  .uf-map-enter-active,
  .uf-map-leave-active {
    transition-duration: 0.01ms;
    transition-delay: 0s;
  }
}
</style>
