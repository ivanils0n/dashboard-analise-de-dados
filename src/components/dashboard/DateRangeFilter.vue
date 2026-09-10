<script setup>
import { ref, reactive, computed, onMounted, onUnmounted } from "vue";
import { firstDayOfMonthISO, lastDayOfMonthISO, todayISO, formatDate, monthYm, firstDayOfYm, lastDayOfYm } from "@/lib/utils";

/* Filtro de período compacto: um único campo "01/01/2026 - 31/01/2026".
   Ao clicar, abre um dropdown com os seletores de data.
   `range` é um objeto reativo { start, end } atualizado in-place. */
const props = defineProps({
  range: { type: Object, required: true },
  title: { type: String, default: "Período" },
  align: { type: String, default: "right" }
});

const open = ref(false);
const draft = reactive({ start: "", end: "" });

const label = computed(() => {
  const s = props.range && props.range.start;
  const e = props.range && props.range.end;
  if (s && e) return `${formatDate(s)} - ${formatDate(e)}`;
  if (s) return `a partir de ${formatDate(s)}`;
  if (e) return `até ${formatDate(e)}`;
  return props.title;
});

const active = computed(() => !!(props.range && (props.range.start || props.range.end)));

function toggle() {
  open.value = !open.value;
  if (open.value) {
    draft.start = props.range ? props.range.start || "" : "";
    draft.end = props.range ? props.range.end || "" : "";
  }
}

function apply() {
  if (!props.range) return;
  props.range.start = draft.start;
  props.range.end = draft.end;
  open.value = false;
}
function setThisMonth() {
  draft.start = firstDayOfMonthISO();
  draft.end = lastDayOfMonthISO();
  apply();
}

/* Mês anterior ao vigente, calculado dinamicamente (ex.: hoje é
   Setembro/2026 -> seleciona Agosto/2026). */
function setLastMonth() {
  const ym = monthYm(-1);
  draft.start = firstDayOfYm(ym);
  draft.end = lastDayOfYm(ym);
  apply();
}

/* Seleciona o dia de hoje (início = fim = hoje) e aplica na hora. */
function setToday() {
  draft.start = todayISO();
  draft.end = todayISO();
  apply();
}

function onDocClick() {
  open.value = false;
}

onMounted(() => document.addEventListener("click", onDocClick));
onUnmounted(() => document.removeEventListener("click", onDocClick));
</script>

<template>
  <div class="relative" @click.stop>
    <button
      type="button"
      class="inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-sm font-medium transition"
      :class="active
        ? 'border-accent/50 bg-accent/5 text-accent-hover dark:border-red-500/40 dark:bg-red-500/10 dark:text-red-400'
        : 'border-zinc-300 text-zinc-700 hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-800'"
      :aria-expanded="open"
      :title="title"
      @click="toggle"
    >
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
        <rect x="3" y="4" width="18" height="18" rx="2" />
        <line x1="16" y1="2" x2="16" y2="6" />
        <line x1="8" y1="2" x2="8" y2="6" />
        <line x1="3" y1="10" x2="21" y2="10" />
      </svg>
      <span class="whitespace-nowrap tabular-nums">{{ label }}</span>
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
        <polyline points="6 9 12 15 18 9" />
      </svg>
    </button>

    <div
      v-if="open"
      class="absolute z-40 mt-2 w-72 rounded-xl border border-zinc-200 bg-white shadow-xl slide-up dark:border-zinc-800 dark:bg-zinc-900"
      :class="align === 'right' ? 'right-0' : 'left-0'"
    >
      <div class="grid grid-cols-2 gap-2 p-3">
        <div class="flex flex-col gap-1.5">
          <label class="text-xs font-medium text-zinc-500 dark:text-zinc-400">De</label>
          <input v-model="draft.start" type="date" class="input-field" aria-label="Data início" />
        </div>
        <div class="flex flex-col gap-1.5">
          <label class="text-xs font-medium text-zinc-500 dark:text-zinc-400">Até</label>
          <input v-model="draft.end" type="date" class="input-field" aria-label="Data fim" />
        </div>
      </div>

      <div class="flex items-center justify-end gap-2 border-t border-zinc-100 px-3 py-2.5 dark:border-zinc-800">
        <button type="button" class="btn-ghost btn-sm" @click="setLastMonth">Mês anterior</button>
        <button type="button" class="btn-ghost btn-sm" @click="setThisMonth">Mês atual</button>
        <button type="button" class="btn-ghost btn-sm" @click="setToday">Hoje</button>
        <button type="button" class="btn-primary btn-sm" @click="apply">Aplicar</button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.input-field {
  border-radius: 0.5rem;
  border: 1px solid rgb(212 212 216);
  background-color: #fff;
  padding: 0.375rem 0.5rem;
  font-size: 0.875rem;
  color: rgb(24 24 27);
  outline: none;
  transition: border-color 0.15s, box-shadow 0.15s;
}
.input-field:focus {
  border-color: #ef4444;
  box-shadow: 0 0 0 2px rgb(239 68 68 / 0.2);
}
:global(.dark) .input-field {
  border-color: rgb(63 63 70);
  background-color: rgb(9 9 11);
  color: rgb(244 244 245);
}
.btn-primary {
  border-radius: 0.5rem;
  background-color: #ef4444;
  padding: 0.375rem 0.7rem;
  font-size: 0.8125rem;
  font-weight: 600;
  color: #fff;
  transition: background-color 0.15s;
}
.btn-primary:hover {
  background-color: #dc2626;
}
.btn-ghost {
  border-radius: 0.5rem;
  border: 1px solid rgb(212 212 216);
  padding: 0.375rem 0.7rem;
  font-size: 0.8125rem;
  font-weight: 500;
  color: rgb(63 63 70);
  transition: background-color 0.15s;
}
.btn-ghost:hover {
  background-color: rgb(244 244 245);
}
:global(.dark) .btn-ghost {
  border-color: rgb(63 63 70);
  color: rgb(228 228 231);
}
:global(.dark) .btn-ghost:hover {
  background-color: rgb(39 39 42);
}
.btn-sm {
  padding: 0.25rem 0.5rem;
  font-size: 0.75rem;
}
</style>
