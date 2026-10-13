<script setup>
import CountUpText from "@/components/ui/CountUpText.vue";
import { computed } from "vue";
import { TIPOS } from "@/lib/absenteismo";

const props = defineProps({
  ocorrencias: { type: Array, default: () => [] },
  neutral: { type: Boolean, default: false },
  selected: { type: String, default: "" }
});

const emit = defineEmits(["select"]);

const selectedLabel = computed(() => {
  const t = TIPOS.find((x) => x.value === props.selected);
  return t ? t.plural || t.label : "";
});

function toggle(key) {
  emit("select", props.selected === key ? "" : key);
}

const cards = computed(() => {
  const total = props.ocorrencias.length;
  return TIPOS.map((t) => {
    const count = props.ocorrencias.filter((o) => t.has(o)).length;
    return {
      key: t.value,
      label: t.short || t.plural,
      letter: t.letter,
      chip: props.neutral ? "bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-200" : t.chip,
      count,
      share: total ? Math.round((count / total) * 100) : 0
    };
  });
});

const somaCards = computed(() => cards.value.reduce((s, c) => s + c.count, 0));
const sobreposicao = computed(() => somaCards.value - props.ocorrencias.length);
</script>

<template>
  <div class="mx-auto w-full lg:w-5/6 lg:min-w-[56rem]">
  <div class="grid w-full grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
    <button
      v-for="c in cards"
      :key="c.key"
      type="button"
      class="flex items-center gap-2.5 rounded-xl border bg-white px-3 py-2.5 text-left transition hover:-translate-y-0.5 hover:shadow-md dark:bg-zinc-900"
      :class="[
        selected === c.key ? 'border-accent ring-2 ring-accent/30' : 'border-zinc-200 hover:border-zinc-300 dark:border-zinc-800 dark:hover:border-zinc-700',
        selected && selected !== c.key ? 'opacity-50 hover:opacity-100' : ''
      ]"
      :aria-pressed="selected === c.key"
      :title="selected === c.key ? 'Mostrar todas as ocorrências' : `Mostrar só ${c.label.toLowerCase()}`"
      @click="toggle(c.key)"
    >
      <span class="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-xs font-bold" :class="c.chip">{{ c.letter }}</span>
      <div class="min-w-0">
        <p class="truncate text-[10px] font-medium uppercase tracking-wide text-zinc-400 dark:text-zinc-500">{{ c.label }}</p>
        <p class="flex items-baseline gap-1.5">
          <span class="text-xl font-bold tabular-nums leading-tight text-zinc-900 dark:text-zinc-100"><CountUpText :text="c.count" /></span>
          <span class="text-[11px] font-medium tabular-nums text-zinc-400 dark:text-zinc-500"><CountUpText :text="`${c.share}%`" /></span>
        </p>
      </div>
    </button>
  </div>
  <p v-if="selectedLabel" class="mx-auto mt-2 flex items-center justify-center gap-2 text-center text-xs text-zinc-500 dark:text-zinc-400">
    Mostrando só <strong class="text-zinc-800 dark:text-zinc-100">{{ selectedLabel.toLowerCase() }}</strong>
    <button
      type="button"
      class="rounded-md px-2 py-0.5 font-semibold text-accent-hover ring-1 ring-inset ring-accent/40 transition hover:bg-accent/10 dark:text-accent-light"
      @click="emit('select', '')"
    >
      Limpar filtro ×
    </button>
  </p>
  <p v-if="sobreposicao > 0" class="mx-auto mt-2 text-center text-[11px] text-zinc-400 dark:text-zinc-500">
    Total: {{ ocorrencias.length }} ocorrências. Advertência e Acidente são marcações somadas a um motivo
    ({{ sobreposicao }} {{ sobreposicao === 1 ? "ocorrência tem" : "ocorrências têm" }} marcação junto de um motivo).
  </p>
  </div>
</template>
