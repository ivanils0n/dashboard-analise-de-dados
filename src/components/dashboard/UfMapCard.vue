<script setup>
import { computed } from "vue";
import { UF_MAP } from "@/lib/ufShapes";
import { STATE_NAMES } from "@/lib/config";

/* Mapa dos estados atendidos (RO, AM e PA). `states`: [{ uf, text, sub, filled }]
   — `text` é o valor já formatado do KPI naquele estado, `sub` um detalhe (ex.:
   nº de vagas) e `filled` diz se há dado (colore o estado). Com o filtro em
   "todos" chegam os três; com um estado escolhido, só ele (o mapa amplia esse
   estado). */
const props = defineProps({
  states: { type: Array, default: () => [] },
  title: { type: String, default: "Mapa por estado" },
  subtitle: { type: String, default: "" }
});

/* Clique (ou Enter/Espaço) num estado: pede ao dashboard para filtrar por ele.
   Com um só estado no mapa (já filtrado), clicar nele de novo volta para
   "todos". */
const emit = defineEmits(["select"]);

const single = computed(() => props.states.length === 1);

function selectState(uf) {
  emit("select", single.value ? "todos" : uf);
}

function stateLabel(name) {
  return single.value ? "Voltar para todos os estados" : `Filtrar por ${name}`;
}

const viewBox = computed(() =>
  single.value ? UF_MAP.states[props.states[0].uf]?.viewBox || UF_MAP.viewBox : UF_MAP.viewBox
);

/* Sigla com tamanho proporcional à largura do viewBox exibido. */
const fontSize = computed(() => {
  const width = Number(viewBox.value.split(/\s+/)[2]) || 1000;
  return Math.round(width * (single.value ? 0.09 : 0.045));
});

const shapes = computed(() =>
  props.states
    .map((s) => ({ ...s, shape: UF_MAP.states[s.uf], name: STATE_NAMES[s.uf] || s.uf }))
    .filter((s) => s.shape)
);
</script>

<template>
  <div
    class="flex flex-col rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-900"
  >
    <div class="mb-3">
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
        <g v-for="s in shapes" :key="s.uf">
          <path
            :d="s.shape.d"
            fill-rule="evenodd"
            stroke-width="2"
            stroke-linejoin="round"
            class="stroke-white outline-none transition-colors focus-visible:stroke-accent dark:stroke-zinc-900"
            :class="[
              s.filled ? 'fill-accent/40 hover:fill-accent/60' : 'fill-zinc-200 hover:fill-zinc-300 dark:fill-zinc-700 dark:hover:fill-zinc-600',
              'cursor-pointer'
            ]"
            role="button"
            tabindex="0"
            :aria-label="stateLabel(s.name)"
            @click="selectState(s.uf)"
            @keydown.enter.prevent="selectState(s.uf)"
            @keydown.space.prevent="selectState(s.uf)"
          >
            <title>{{ s.name }} — {{ s.text }}{{ s.sub ? ` (${s.sub})` : "" }}</title>
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
      </svg>
    </div>

    <ul class="mt-3 flex flex-col gap-1.5 border-t border-zinc-100 pt-3 text-sm dark:border-zinc-800">
      <li v-for="s in shapes" :key="s.uf" class="flex items-center justify-between gap-3">
        <span class="flex items-center gap-2 text-zinc-600 dark:text-zinc-300">
          <span
            class="h-2.5 w-2.5 rounded-sm"
            :class="s.filled ? 'bg-accent/60' : 'bg-zinc-300 dark:bg-zinc-600'"
          ></span>
          {{ s.name }}
        </span>
        <span class="text-right font-semibold tabular-nums text-zinc-900 dark:text-zinc-100">
          {{ s.text }}
          <span v-if="s.sub" class="block text-xs font-normal text-zinc-400">{{ s.sub }}</span>
        </span>
      </li>
    </ul>
  </div>
</template>
