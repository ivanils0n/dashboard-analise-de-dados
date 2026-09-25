<script setup>
import { ref, computed, onMounted, onBeforeUnmount } from "vue";

/* Filtro em dropdown com seleção múltipla (caixas de marcar), no mesmo visual
   do GerenteRegionalFilter. `modelValue`: lista dos valores marcados
   ([] = sem filtro). Rótulos acima de `maxLabel` caracteres são cortados com
   "..." (o texto completo fica no tooltip). */
const props = defineProps({
  modelValue: { type: Array, default: () => [] },
  options: { type: Array, default: () => [] },
  label: { type: String, default: "Filtro" },
  allLabel: { type: String, default: "Todos" },
  /* Texto do botão quando há mais de um item marcado: "{n} motivos". */
  pluralLabel: { type: String, default: "selecionados" },
  title: { type: String, default: "" },
  maxLabel: { type: Number, default: 40 },
  /* Converte o valor da opção no texto exibido (ex.: "2026-08" -> "ago/2026"). */
  formatOption: { type: Function, default: (v) => v }
});

const emit = defineEmits(["update:modelValue"]);

const open = ref(false);
const root = ref(null);

function short(text) {
  const t = String(props.formatOption(text));
  return props.maxLabel && t.length > props.maxLabel ? t.slice(0, props.maxLabel).trimEnd() + "..." : t;
}

const buttonText = computed(() => {
  const n = props.modelValue.length;
  if (!n) return props.allLabel;
  if (n === 1) return short(props.modelValue[0]);
  return `${n} ${props.pluralLabel}`;
});

function toggle(option) {
  const next = props.modelValue.includes(option)
    ? props.modelValue.filter((v) => v !== option)
    : [...props.modelValue, option];
  emit("update:modelValue", next);
}

function onDocumentClick(e) {
  if (root.value && !root.value.contains(e.target)) open.value = false;
}
onMounted(() => document.addEventListener("click", onDocumentClick));
onBeforeUnmount(() => document.removeEventListener("click", onDocumentClick));
</script>

<template>
  <div ref="root" class="relative" @keydown.esc="open = false">
    <button
      type="button"
      class="flex max-w-[14rem] cursor-pointer items-center gap-2 rounded-lg border bg-white px-4 py-2.5 text-[15px] font-medium text-zinc-700 outline-none transition hover:bg-zinc-100 focus:border-accent dark:bg-[#0a0a0a] dark:text-zinc-200 dark:hover:bg-zinc-800"
      :class="modelValue.length ? 'border-accent' : 'border-zinc-300 dark:border-zinc-700'"
      :aria-label="`Filtrar por ${label.toLowerCase()}`"
      :title="title"
      aria-haspopup="listbox"
      :aria-expanded="open"
      @click="open = !open"
    >
      <span class="truncate">{{ buttonText }}</span>
      <svg class="shrink-0" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
        <polyline points="6 9 12 15 18 9" />
      </svg>
    </button>

    <div
      v-if="open"
      class="absolute left-0 z-40 mt-2 w-72 max-w-[calc(100vw-2rem)] overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-xl dark:border-zinc-800 dark:bg-zinc-900"
      role="listbox"
      aria-multiselectable="true"
    >
      <div class="flex items-center justify-between border-b border-zinc-100 px-3 py-2 text-xs dark:border-zinc-800">
        <span class="font-semibold text-zinc-500 dark:text-zinc-400">{{ modelValue.length }} de {{ options.length }}</span>
        <button
          type="button"
          class="font-semibold text-accent transition hover:underline disabled:cursor-not-allowed disabled:opacity-40 disabled:no-underline"
          :disabled="!modelValue.length"
          @click="emit('update:modelValue', [])"
        >
          Limpar
        </button>
      </div>
      <ul class="max-h-64 overflow-y-auto py-1">
        <li v-for="o in options" :key="o">
          <label
            class="flex cursor-pointer items-center gap-2 px-3 py-1.5 text-sm text-zinc-700 hover:bg-zinc-100 dark:text-zinc-200 dark:hover:bg-zinc-800"
            :title="formatOption(o)"
          >
            <input type="checkbox" class="h-4 w-4 shrink-0 cursor-pointer accent-accent" :checked="modelValue.includes(o)" @change="toggle(o)" />
            <span class="truncate">{{ short(o) }}</span>
          </label>
        </li>
        <li v-if="!options.length" class="px-3 py-2 text-sm text-zinc-400">Nenhuma opção</li>
      </ul>
    </div>
  </div>
</template>
