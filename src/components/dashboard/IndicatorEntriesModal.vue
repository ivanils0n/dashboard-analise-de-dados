<script setup>
import { ref, reactive, computed, watch } from "vue";
import Modal from "@/components/ui/Modal.vue";
import EmptyState from "@/components/ui/EmptyState.vue";
import { STATES, STATE_NAMES, DEFAULT_STATE, getIndicatorById } from "@/lib/config";
import { getEntriesFor, removeEntry, removeEntries } from "@/lib/store";
import { hydrateState } from "@/lib/supabase";
import {
  formatDate,
  formatCurrency,
  firstDayOfMonthISO,
  lastDayOfMonthISO,
  monthYm,
  firstDayOfYm,
  lastDayOfYm,
  singleMonthOfRange,
  ymLabel
} from "@/lib/utils";
import { useFilters } from "@/composables/useFilters";
import { useDialog } from "@/composables/useDialog";
import { useToast } from "@/composables/useToast";
import { canEditData } from "@/lib/auth";

/* Modal genérico de registros de um indicador manual. Cada coluna descreve
   como ler a célula a partir do lançamento:
     { label, meta }              texto de entry.meta[meta]
     { label, meta, money }       valor monetário de entry.meta[meta]
     { label, meta, hours }       horas de entry.meta[meta]
     { label, meta, percent }     percentual de entry.meta[meta]
     { label, period: [a, b] }    período a–b em entry.meta
     { label, date }              data do lançamento
     { label, value }             valor do lançamento formatado pelo indicador
*/

const props = defineProps({
  open: { type: Boolean, default: false },
  indicatorId: { type: String, required: true },
  title: { type: String, default: "" },
  subtitle: { type: String, default: "" },
  columns: { type: Array, default: () => [] }
});

const emit = defineEmits(["close", "edit"]);

const { state: filters } = useFilters();
const { confirm } = useDialog();
const { show: toast } = useToast();
const canEdit = canEditData();

const indicator = computed(() => getIndicatorById(props.indicatorId) || { id: props.indicatorId });

const applied = ref(false);
const form = reactive({
  estado: filters.current !== "todos" ? filters.current : DEFAULT_STATE,
  search: "",
  from: "",
  to: ""
});

watch(
  () => form.estado,
  async (state) => {
    applied.value = false;
    try {
      await hydrateState(state === "todos" ? "todos" : state);
    } catch (err) {
      console.warn("[IndicatorEntriesModal] Falha ao carregar dados do estado:", err);
    }
  }
);

watch(
  () => form.search,
  () => {
    applied.value = false;
  }
);

watch(
  () => [form.from, form.to],
  () => {
    applied.value = false;
  }
);

function apply() {
  applied.value = true;
}

/* Período = mês vigente (dinâmico) */
function setThisMonthPeriod() {
  form.from = firstDayOfMonthISO();
  form.to = lastDayOfMonthISO();
  applied.value = false;
}

/* Período = mês anterior ao vigente (ex.: hoje Setembro/2026 -> Ago/2026) */
function setLastMonthPeriod() {
  const ym = monthYm(-1);
  form.from = firstDayOfYm(ym);
  form.to = lastDayOfYm(ym);
  applied.value = false;
}

function clearFilters() {
  form.estado = filters.current !== "todos" ? filters.current : DEFAULT_STATE;
  form.search = "";
  form.from = "";
  form.to = "";
  applied.value = false;
}

/* Rótulo do período selecionado quando é um único mês. */
const selectedMonthLabel = computed(() => {
  const ym = singleMonthOfRange(form.from, form.to);
  return ym ? ymLabel(ym) : "";
});

/* ---------- Células ---------- */

function meta(entry, key) {
  return entry && entry.meta ? entry.meta[key] : undefined;
}

function hoursLabel(value) {
  if (value === undefined || value === null || value === "" || isNaN(Number(value))) return "—";
  const n = Number(value);
  return n.toLocaleString("pt-BR", { maximumFractionDigits: 1 }) + " h";
}

function cellText(entry, col) {
  if (col.value) return formatValue(entry);
  if (col.date) return formatDate(entry.date);
  if (col.period) {
    const a = meta(entry, col.period[0]);
    const b = meta(entry, col.period[1]);
    if (!a) return "—";
    return b && b !== a ? `${formatDate(a)} — ${formatDate(b)}` : formatDate(a);
  }
  const v = meta(entry, col.meta);
  if (v === undefined || v === null || v === "") return "—";
  if (col.money) return formatCurrency(v);
  if (col.hours) return hoursLabel(v);
  if (col.percent) {
    const n = Number(v);
    if (isNaN(n)) return "—";
    return n.toLocaleString("pt-BR", { maximumFractionDigits: 2 }) + "%";
  }
  return String(v);
}

function rawCell(entry, col) {
  if (col.date) return entry.date || "";
  if (col.value) return String(entry.value ?? "");
  if (col.period) {
    const a = meta(entry, col.period[0]);
    const b = meta(entry, col.period[1]);
    return `${a || ""} ${b || ""}`;
  }
  const v = meta(entry, col.meta);
  return v === undefined || v === null ? "" : String(v);
}

function formatValue(entry) {
  if (entry.value === undefined || entry.value === null) return "—";
  const num = Number(entry.value);
  if (isNaN(num)) return "—";
  if (indicator.value.type === "currency") return formatCurrency(num);
  return num.toLocaleString("pt-BR", { maximumFractionDigits: indicator.value.decimals ?? 1 });
}

/* ---------- Linhas ---------- */

const rows = computed(() => {
  if (!applied.value) return [];
  let list = getEntriesFor(props.indicatorId, form.estado).slice();

  if (form.from && form.to && form.to < form.from) return [];

  if (form.from) list = list.filter((e) => e.date >= form.from);
  if (form.to) list = list.filter((e) => e.date <= form.to);

  const q = form.search.trim().toLowerCase();
  if (q) {
    list = list.filter((e) => {
      const hay = props.columns.map((c) => rawCell(e, c)).join(" ").toLowerCase();
      return hay.includes(q);
    });
  }

  list.sort((a, b) => b.date.localeCompare(a.date) || b.id.localeCompare(a.id));
  return list;
});

async function removeRow(entry) {
  const ok = await confirm({
    title: "Excluir registro?",
    message: "O registro será removido definitivamente e os totais serão recalculados.",
    confirmText: "Excluir",
    danger: true
  });
  if (!ok) return;
  removeEntry(props.indicatorId, entry.id);
  toast("Registro excluído.");
}

/* ---------- Seleção múltipla / exclusão em lote ---------- */
const selectedIds = ref(new Set());

const selectedRows = computed(() => rows.value.filter((e) => selectedIds.value.has(e.id)));
const allVisibleSelected = computed(
  () => rows.value.length > 0 && rows.value.every((e) => selectedIds.value.has(e.id))
);

function toggleRow(entry) {
  const next = new Set(selectedIds.value);
  if (next.has(entry.id)) next.delete(entry.id);
  else next.add(entry.id);
  selectedIds.value = next;
}

function toggleSelectAll() {
  if (allVisibleSelected.value) {
    selectedIds.value = new Set();
  } else {
    selectedIds.value = new Set(rows.value.map((e) => e.id));
  }
}

async function handleBulkDelete() {
  const list = selectedRows.value;
  const n = list.length;
  if (!n) return;
  const ok = await confirm({
    title: `Excluir ${n} registro(s)?`,
    message: "Os registros selecionados serão removidos definitivamente e os totais serão recalculados.",
    confirmText: `Excluir ${n}`,
    danger: true
  });
  if (!ok) return;
  removeEntries(list.map((entry) => ({ indicatorId: props.indicatorId, entry })));
  selectedIds.value = new Set();
  toast(`${n} registro(s) excluído(s).`);
}

/* Pede ao pai para abrir o modal de lançamento em modo edição. */
function editRow(entry) {
  emit("edit", { indicatorId: props.indicatorId, entry });
}

function close() {
  emit("close");
}
</script>

<template>
  <Modal
    :title="title || indicator.name"
    :subtitle="subtitle || indicator.desc || ''"
    :open="open"
    max-width="max-w-5xl"
    @close="close"
  >
    <div class="flex flex-col gap-3">
      <div class="flex flex-col gap-3 sm:flex-row sm:items-end">
        <div class="flex flex-col gap-1.5 sm:w-56">
          <label class="text-sm font-medium text-zinc-700 dark:text-zinc-200">Estado</label>
          <select v-model="form.estado" class="input-field">
            <option value="todos">Todos Estados</option>
            <option v-for="s in STATES" :key="s" :value="s">{{ s }} — {{ STATE_NAMES[s] }}</option>
          </select>
        </div>

        <div class="flex flex-1 flex-col gap-1.5">
          <label class="text-sm font-medium text-zinc-700 dark:text-zinc-200">Buscar</label>
          <input v-model="form.search" type="search" class="input-field" placeholder="Pesquisar por colaborador, filial, tema, motivo..." />
        </div>

        <div class="flex gap-2">
          <button type="button" class="btn-primary" @click="apply">Buscar registros</button>
          <button type="button" class="btn-ghost" @click="clearFilters">Limpar</button>
        </div>
      </div>

      <div class="rounded-xl border border-zinc-200 px-3 py-2.5 dark:border-zinc-800">
        <div class="flex flex-wrap items-end gap-x-4 gap-y-2">
          <div class="flex flex-col gap-1">
            <span class="text-[11px] font-semibold uppercase tracking-wide text-zinc-400">Período</span>
            <div class="flex flex-wrap items-center gap-1.5">
              <button
                type="button"
                class="chip"
                :class="singleMonthOfRange(form.from, form.to) === monthYm(0) ? 'chip-active' : ''"
                @click="setThisMonthPeriod"
              >
                Mês atual
              </button>
              <button
                type="button"
                class="chip"
                :class="singleMonthOfRange(form.from, form.to) === monthYm(-1) ? 'chip-active' : ''"
                @click="setLastMonthPeriod"
              >
                Mês anterior
              </button>
            </div>
          </div>
          <div class="flex min-w-[150px] flex-1 flex-col gap-1.5">
            <label class="text-[11px] font-semibold uppercase tracking-wide text-zinc-400">De</label>
            <input v-model="form.from" type="date" class="input-field" />
          </div>
          <div class="flex min-w-[150px] flex-1 flex-col gap-1.5">
            <label class="text-[11px] font-semibold uppercase tracking-wide text-zinc-400">Até</label>
            <input v-model="form.to" type="date" class="input-field" />
          </div>
          <span v-if="selectedMonthLabel" class="pb-1 text-xs font-medium text-zinc-400">
            Exibindo {{ selectedMonthLabel }}
          </span>
        </div>
      </div>

      <div v-if="canEdit && selectedRows.length" class="flex flex-wrap items-center gap-2 rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-2 dark:border-zinc-800 dark:bg-zinc-900">
        <span class="rounded-full bg-accent/10 px-2.5 py-1 text-xs font-semibold text-accent-hover dark:text-red-400">
          {{ selectedRows.length }} selecionado(s)
        </span>
        <button
          type="button"
          class="rounded-lg bg-red-600 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-red-700"
          @click="handleBulkDelete"
        >
          Excluir selecionados
        </button>
      </div>

      <div v-if="rows.length" class="overflow-hidden rounded-xl border border-zinc-200 dark:border-zinc-800">
        <div class="max-h-[28rem] overflow-auto">
          <div class="overflow-x-auto">
            <table class="w-full min-w-max text-left text-sm">
              <thead class="sticky top-0 z-10 bg-white dark:bg-zinc-900">
                <tr class="border-b border-zinc-100 text-xs uppercase tracking-wide text-zinc-400 dark:border-zinc-800 dark:text-zinc-400">
                  <th v-if="canEdit" class="w-10 px-4 py-2.5 font-semibold">
                    <input
                      type="checkbox"
                      class="h-4 w-4 cursor-pointer accent-red-600"
                      :checked="allVisibleSelected"
                      aria-label="Selecionar todos os registros visíveis"
                      @change="toggleSelectAll"
                    />
                  </th>
                  <th v-for="col in columns" :key="col.label" class="whitespace-nowrap px-4 py-2.5 font-semibold">{{ col.label }}</th>
                  <th v-if="canEdit" class="px-4 py-2.5"></th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="entry in rows" :key="entry.id" class="border-b border-zinc-100 last:border-0 dark:border-zinc-800">
                  <td v-if="canEdit" class="px-4 py-2.5">
                    <input
                      type="checkbox"
                      class="h-4 w-4 cursor-pointer accent-red-600"
                      :checked="selectedIds.has(entry.id)"
                      aria-label="Selecionar registro"
                      @change="toggleRow(entry)"
                    />
                  </td>
                  <td v-for="col in columns" :key="col.label" class="whitespace-nowrap px-4 py-2.5 text-zinc-700 dark:text-zinc-300">
                    {{ cellText(entry, col) }}
                  </td>
                  <td v-if="canEdit" class="px-4 py-2.5 text-right">
                    <div class="flex justify-end gap-2">
                      <button type="button" class="btn-ghost-sm" aria-label="Editar registro" @click="editRow(entry)">Editar</button>
                      <button type="button" class="icon-btn-sm" aria-label="Excluir registro" @click="removeRow(entry)">&times;</button>
                    </div>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
        <div class="border-t border-zinc-100 px-4 py-2 text-xs text-zinc-400 dark:border-zinc-800 dark:text-zinc-400">
          {{ rows.length === 1 ? "1 registro" : `${rows.length} registros` }}
        </div>
      </div>

      <div v-else-if="applied">
        <EmptyState title="Nenhum registro encontrado" text="Ajuste o estado ou a busca e tente novamente." />
      </div>

      <div v-else>
        <EmptyState
          title="Aguardando filtros"
          text="Selecione o estado (opcional) e clique em “Buscar registros” para listar os lançamentos."
        />
      </div>
    </div>
  </Modal>
</template>

<style scoped>
.input-field {
  border-radius: 0.5rem;
  border: 1px solid rgb(212 212 216);
  background-color: #fff;
  padding: 0.5rem 0.75rem;
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
  padding: 0.5rem 1rem;
  font-size: 0.875rem;
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
  padding: 0.5rem 1rem;
  font-size: 0.875rem;
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
.chip {
  border-radius: 9999px;
  border: 1px solid rgb(212 212 216);
  background-color: #fff;
  padding: 0.2rem 0.7rem;
  font-size: 0.75rem;
  font-weight: 500;
  color: rgb(82 82 91);
  transition: background-color 0.15s, color 0.15s;
}
.chip:hover {
  background-color: rgb(244 244 245);
}
.chip-active {
  border-color: rgb(239 68 68);
  background-color: rgb(239 68 68);
  color: #fff;
}
:global(.dark) .chip {
  border-color: rgb(63 63 70);
  background-color: rgb(24 24 27);
  color: rgb(212 212 216);
}
:global(.dark) .chip:hover {
  background-color: rgb(39 39 42);
}
:global(.dark) .chip-active {
  border-color: rgb(220 38 38);
  background-color: rgb(220 38 38);
  color: #fff;
}
.icon-btn-sm {
  display: flex;
  height: 1.9rem;
  width: 1.9rem;
  align-items: center;
  justify-content: center;
  border-radius: 0.5rem;
  font-size: 1rem;
  line-height: 1;
  color: rgb(113 113 122);
  transition: background-color 0.15s, color 0.15s;
}
.icon-btn-sm:hover {
  background-color: rgb(244 244 245);
  color: rgb(24 24 27);
}
:global(.dark) .icon-btn-sm {
  color: rgb(161 161 170);
}
:global(.dark) .icon-btn-sm:hover {
  background-color: rgb(39 39 42);
  color: rgb(244 244 245);
}
.btn-ghost-sm {
  border-radius: 0.5rem;
  border: 1px solid rgb(212 212 216);
  padding: 0.3rem 0.65rem;
  font-size: 0.75rem;
  font-weight: 500;
  color: rgb(63 63 70);
  transition: background-color 0.15s;
}
.btn-ghost-sm:hover {
  background-color: rgb(244 244 245);
}
:global(.dark) .btn-ghost-sm {
  border-color: rgb(63 63 70);
  color: rgb(228 228 231);
}
:global(.dark) .btn-ghost-sm:hover {
  background-color: rgb(39 39 42);
}
</style>
