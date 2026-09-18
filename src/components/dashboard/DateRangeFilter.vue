<script setup>
import { ref, reactive, computed, onMounted, onUnmounted } from "vue";
import {
  MONTHS_SHORT,
  ymOf,
  ymLabel,
  currentYm,
  addMonthsYm,
  firstDayOfYm,
  lastDayOfYm,
  singleMonthOfRange,
  yearOptions
} from "@/lib/utils";

/* Filtro de período: um único mês fixo (ex.: "Ago/2026"), não mais um
   intervalo de dias. `range` continua sendo um objeto reativo { start, end }
   (compatibilidade com o resto do app, que filtra por data) — só que agora
   sempre corresponde exatamente ao 1º e ao último dia do mês escolhido. */
const props = defineProps({
  range: { type: Object, required: true },
  title: { type: String, default: "Mês" },
  align: { type: String, default: "right" }
});

/* "apply" avisa que o usuário aplicou um período — mesmo quando é o mesmo mês
   já filtrado (nesse caso o `range` não muda e nenhum watcher dispararia). */
const emit = defineEmits(["apply"]);

const open = ref(false);
const draft = reactive({ ym: currentYm() });

const currentRangeYm = computed(() => {
  const s = props.range && props.range.start;
  const e = props.range && props.range.end;
  return singleMonthOfRange(s, e) || (s ? ymOf(s) : "");
});

const label = computed(() => {
  const ym = currentRangeYm.value;
  return ym ? ymLabel(ym) : props.title;
});

const active = computed(() => !!currentRangeYm.value);

const years = yearOptions(5, 1);

const draftMonthNum = computed(() => (draft.ym ? Number(draft.ym.split("-")[1]) : new Date().getMonth() + 1));
const draftYearNum = computed(() => (draft.ym ? Number(draft.ym.split("-")[0]) : new Date().getFullYear()));

function setDraftMonth(m) {
  draft.ym = `${draftYearNum.value}-${String(m).padStart(2, "0")}`;
}
function setDraftYear(y) {
  draft.ym = `${y}-${String(draftMonthNum.value).padStart(2, "0")}`;
}

function toggle() {
  open.value = !open.value;
  if (open.value) {
    draft.ym = currentRangeYm.value || currentYm();
  }
}

function apply() {
  if (!props.range) return;
  props.range.start = firstDayOfYm(draft.ym);
  props.range.end = lastDayOfYm(draft.ym);
  open.value = false;
  emit("apply");
}

function setPrevMonth() {
  draft.ym = addMonthsYm(draft.ym, -1);
}
function setNextMonth() {
  draft.ym = addMonthsYm(draft.ym, 1);
}
function setCurrentMonth() {
  draft.ym = currentYm();
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
      <span class="whitespace-nowrap tabular-nums capitalize">{{ label }}</span>
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
        <polyline points="6 9 12 15 18 9" />
      </svg>
    </button>

    <div
      v-if="open"
      class="absolute z-40 mt-2 w-64 rounded-xl border border-zinc-200 bg-white shadow-xl slide-up dark:border-zinc-800 dark:bg-zinc-900"
      :class="align === 'right' ? 'right-0' : 'left-0'"
    >
      <div class="flex flex-col gap-2 p-3">
        <div class="flex items-center justify-between gap-2">
          <button type="button" class="btn-ghost btn-sm" aria-label="Mês anterior" @click="setPrevMonth">‹</button>
          <select v-model="draftYearNum" class="input-field flex-1 text-center" aria-label="Ano" @change="setDraftYear(Number($event.target.value))">
            <option v-for="y in years" :key="y" :value="y">{{ y }}</option>
          </select>
          <button type="button" class="btn-ghost btn-sm" aria-label="Próximo mês" @click="setNextMonth">›</button>
        </div>
        <div class="grid grid-cols-4 gap-1.5">
          <button
            v-for="(m, i) in MONTHS_SHORT"
            :key="m"
            type="button"
            class="rounded-lg px-2 py-1.5 text-xs font-medium transition"
            :class="draftMonthNum === i + 1
              ? 'bg-accent text-white'
              : 'bg-zinc-100 text-zinc-600 hover:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-700'"
            @click="setDraftMonth(i + 1)"
          >
            {{ m }}
          </button>
        </div>
      </div>

      <div class="flex items-center justify-between gap-2 border-t border-zinc-100 px-3 py-2.5 dark:border-zinc-800">
        <button type="button" class="btn-ghost btn-sm" @click="setCurrentMonth">Mês atual</button>
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
