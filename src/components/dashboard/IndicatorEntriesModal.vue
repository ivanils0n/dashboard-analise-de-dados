<script setup>
import { ref, reactive, computed, watch, nextTick, onMounted, onBeforeUnmount } from "vue";
import Modal from "@/components/ui/Modal.vue";
import EmptyState from "@/components/ui/EmptyState.vue";
import { STATES, STATE_NAMES, getIndicatorById } from "@/lib/config";
import { getEntriesFor, removeEntry, removeEntries } from "@/lib/store";
import { hydrateState } from "@/lib/db";
import {
  formatDate,
  formatCurrency,
  singleMonthOfRange,
  ymLabel,
  ymShortLabel,
  normalizeText,
  formatHoursClock,
  compareDateDesc
} from "@/lib/utils";
import { useFilters } from "@/composables/useFilters";
import { dateFilter } from "@/composables/useDateFilter";
import { useDialog } from "@/composables/useDialog";
import { useToast } from "@/composables/useToast";
import { canEditData } from "@/lib/auth";
import { uniqueEmployeeCount } from "@/lib/metrics";

/* Modal genérico de registros de um indicador manual. Cada coluna descreve
   como ler a célula a partir do lançamento:
     { label, meta }              texto de entry.meta[meta]
     { label, meta, money }       valor monetário de entry.meta[meta]
     { label, meta, hours }       horas de entry.meta[meta]
     { label, meta, percent }     percentual de entry.meta[meta]
     { label, period: [a, b] }    período a–b em entry.meta
     { label, date }              data do lançamento
     { label, month }             competência mês/ano do lançamento (ex.: ago/26)
     { label, monthYear }         competência com ano completo (ex.: ago/2026)
     { label, value }             valor do lançamento formatado pelo indicador
*/

const props = defineProps({
  open: { type: Boolean, default: false },
  indicatorId: { type: String, required: true },
  title: { type: String, default: "" },
  columns: { type: Array, default: () => [] }
});

const emit = defineEmits(["close", "edit"]);

const { state: filters } = useFilters();
const { confirm } = useDialog();
const { show: toast } = useToast();
const canEdit = canEditData();

const indicator = computed(() => getIndicatorById(props.indicatorId) || { id: props.indicatorId });

/* Sem filtro de data manual aqui — segue sempre o mês selecionado no filtro
   global do dashboard (DateRangeFilter), sem opção de sobrepor dentro do
   modal. */
const form = reactive({
  /* Segue o filtro de estado do dashboard, inclusive "Todos Estados": antes
     "todos" abria em RO e o "Total no filtro" deixava AM e PA de fora — o
     total não batia com o do dashboard. */
  estado: filters.current,
  filial: "todos",
  search: ""
});

watch(
  () => form.estado,
  async (state) => {
    form.filial = "todos";
    try {
      await hydrateState(state === "todos" ? "todos" : state);
    } catch (err) {
      console.warn("[IndicatorEntriesModal] Falha ao carregar dados do estado:", err);
    }
  }
);

function clearFilters() {
  form.estado = filters.current;
  form.filial = "todos";
  form.search = "";
}

/* Sigla da filial do lançamento — lida direto do próprio registro, sem
   depender do cadastro de Filiais (evita "sumir" do filtro por causa de
   texto digitado à mão, filial renomeada/excluída ou estado divergente no
   cadastro). Usa meta.shortName quando existe (ex.: Custos Totais); senão a
   primeira palavra de meta.filial, que segue o padrão "SIGLA Nome da
   filial" (Diárias e Treinamento). */
function entryFilialKey(entry) {
  const m = entry.meta || {};
  if (m.shortName) return normalizeText(m.shortName).trim();
  const text = normalizeText(m.filial || "").trim();
  return text.split(/\s+/)[0] || "";
}

function entryFilialLabel(entry) {
  const m = entry.meta || {};
  if (m.shortName) return String(m.shortName).trim();
  const text = String(m.filial || "").trim();
  return text.split(/\s+/)[0] || "";
}

/* Rótulo do mês selecionado no filtro global do dashboard. */
const selectedMonthLabel = computed(() => {
  const ym = singleMonthOfRange(dateFilter.start, dateFilter.end);
  return ym ? ymLabel(ym) : "";
});

/* ---------- Células ---------- */

function meta(entry, key) {
  return entry && entry.meta ? entry.meta[key] : undefined;
}

function hoursLabel(value) {
  if (value === undefined || value === null || value === "" || isNaN(Number(value))) return "—";
  return formatHoursClock(Number(value));
}

/* Competência com ano completo ("ago/2026"); diária sem período (data-sentinela)
   aparece como "Sem período". */
function monthYearText(entry) {
  if (entry.meta && entry.meta.semPeriodo) return "Sem período";
  const ym = String(entry.date || "").slice(0, 7);
  return ym ? ymLabel(ym).toLowerCase() : "—";
}

function cellText(entry, col) {
  if (col.value) return formatValue(entry);
  if (col.date) return formatDate(entry.date);
  if (col.month) return entry.meta && entry.meta.semPeriodo ? "Sem período" : ymShortLabel(entry.date);
  if (col.monthYear) return monthYearText(entry);
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
  if (col.month) return entry.date || "";
  if (col.monthYear) return monthYearText(entry);
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
  if (indicator.value.type === "hours") return formatHoursClock(num);
  return num.toLocaleString("pt-BR", { maximumFractionDigits: indicator.value.decimals ?? 1 });
}

/* ---------- Linhas ---------- */

/* Lançamentos filtrados por estado, período (mês do filtro global do
   dashboard) e busca — ANTES do filtro de filial. */
function filteredByEstadoPeriodoBusca() {
  let list = getEntriesFor(props.indicatorId, form.estado).slice();

  if (dateFilter.start) list = list.filter((e) => e.date >= dateFilter.start);
  if (dateFilter.end) list = list.filter((e) => e.date <= dateFilter.end);

  const q = normalizeText(form.search).trim();
  if (q) {
    list = list.filter((e) => {
      const hay = normalizeText(props.columns.map((c) => rawCell(e, c)).join(" "));
      return hay.includes(q);
    });
  }

  return list;
}

/* Filiais que de fato aparecem nos lançamentos filtrados (estado, período e
   busca — nunca a própria filial, senão selecionar uma a faria "sumir" das
   opções), em ordem alfabética pela sigla. */
const SEM_FILIAL = "__sem_filial__";

const filialOptions = computed(() => {
  const list = filteredByEstadoPeriodoBusca();
  const map = new Map();
  let hasSemFilial = false;
  list.forEach((e) => {
    const key = entryFilialKey(e);
    if (!key) {
      hasSemFilial = true;
      return;
    }
    if (!map.has(key)) map.set(key, entryFilialLabel(e));
  });
  const opts = Array.from(map, ([key, label]) => ({ key, label })).sort((a, b) =>
    a.label.localeCompare(b.label, "pt-BR")
  );
  if (hasSemFilial) opts.push({ key: SEM_FILIAL, label: "Sem filial" });
  return opts;
});

const preFilialEntries = computed(() => filteredByEstadoPeriodoBusca());

/* Se a filial selecionada deixar de aparecer nas opções (filtros mudaram),
   volta para "Todas". */
watch(filialOptions, (opts) => {
  if (form.filial !== "todos" && !opts.some((f) => f.key === form.filial)) {
    form.filial = "todos";
  }
});

const rows = computed(() => {
  let list = preFilialEntries.value;

  if (form.filial !== "todos") {
    list =
      form.filial === SEM_FILIAL
        ? list.filter((e) => !entryFilialKey(e))
        : list.filter((e) => entryFilialKey(e) === form.filial);
  }

  list = list
    .slice()
    .sort((a, b) => compareDateDesc(a.date, b.date) || String(b.id || "").localeCompare(String(a.id || "")));
  return list;
});

/* Soma dos valores exibidos (só faz sentido para indicadores monetários). */
const totalValue = computed(() => rows.value.reduce((sum, e) => sum + (Number(e.value) || 0), 0));

/* Quantidade de colaboradores distintos nos registros exibidos (só quando o
   indicador tem coluna de colaborador, ex.: Diárias e Treinamento). */
const hasEmployeeColumn = computed(() => props.columns.some((c) => c.meta === "employeeName"));
const employeeCount = computed(() => uniqueEmployeeCount(rows.value));

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

/* ---------- Barra de rolagem horizontal fixa (acompanha a tabela) ----------
   A tabela rola na vertical dentro do card; uma barra horizontal separada,
   logo abaixo da área rolável, fica sempre visível e sincroniza o scrollLeft
   com a tabela (nos dois sentidos). */
const tableWrapRef = ref(null);
const tableElRef = ref(null);
const hScrollRef = ref(null);
const tableWidth = ref(0);
const hasOverflowX = ref(false);
let resizeObserver = null;

function updateTableWidths() {
  const wrap = tableWrapRef.value;
  const table = tableElRef.value;
  if (!wrap || !table) return;
  tableWidth.value = table.scrollWidth || table.offsetWidth;
  hasOverflowX.value = table.scrollWidth > wrap.clientWidth + 1;
  if (!hasOverflowX.value && hScrollRef.value) hScrollRef.value.scrollLeft = 0;
}

function onTableScroll() {
  const wrap = tableWrapRef.value;
  const bar = hScrollRef.value;
  if (!wrap || !bar || wrap.scrollLeft === bar.scrollLeft) return;
  bar.scrollLeft = wrap.scrollLeft;
}

function onBarScroll() {
  const wrap = tableWrapRef.value;
  const bar = hScrollRef.value;
  if (!wrap || !bar || bar.scrollLeft === wrap.scrollLeft) return;
  wrap.scrollLeft = bar.scrollLeft;
}

onMounted(() => {
  nextTick(updateTableWidths);
  if (typeof ResizeObserver !== "undefined") {
    resizeObserver = new ResizeObserver(updateTableWidths);
    if (tableWrapRef.value) resizeObserver.observe(tableWrapRef.value);
    if (tableElRef.value) resizeObserver.observe(tableElRef.value);
  }
  window.addEventListener("resize", updateTableWidths);
});

onBeforeUnmount(() => {
  if (resizeObserver) resizeObserver.disconnect();
  window.removeEventListener("resize", updateTableWidths);
});

watch(rows, () => nextTick(updateTableWidths));
</script>

<template>
  <Modal
    :title="title || indicator.name"
    :subtitle="indicator.calc || ''"
    :open="open"
    max-width="max-w-7xl"
    @close="close"
  >
    <div class="flex flex-col gap-3">
      <div v-if="indicator.type === 'currency' || hasEmployeeColumn" class="flex flex-wrap gap-2">
        <div
          v-if="indicator.type === 'currency'"
          class="flex w-fit flex-col gap-0.5 rounded-xl border border-accent/25 bg-accent/5 px-4 py-2.5 dark:border-accent/25 dark:bg-accent/10"
        >
          <span class="text-[11px] font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">Total no filtro</span>
          <span class="text-xl font-bold tabular-nums text-zinc-900 dark:text-zinc-100">{{ formatCurrency(totalValue) }}</span>
        </div>
        <div
          v-if="hasEmployeeColumn"
          class="flex w-fit flex-col gap-0.5 rounded-xl border border-zinc-200 bg-zinc-50 px-4 py-2.5 dark:border-zinc-800 dark:bg-zinc-900"
        >
          <span class="text-[11px] font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">Colaboradores</span>
          <span class="text-xl font-bold tabular-nums text-zinc-900 dark:text-zinc-100">{{ employeeCount }}</span>
        </div>
      </div>

      <div class="flex flex-col gap-3 sm:flex-row sm:items-end">
        <div class="flex flex-col gap-1.5 sm:w-56">
          <label class="text-sm font-medium text-zinc-700 dark:text-zinc-200">Estado</label>
          <select v-model="form.estado" class="input-field">
            <option value="todos">Todos Estados</option>
            <option v-for="s in STATES" :key="s" :value="s">{{ s }} — {{ STATE_NAMES[s] }}</option>
          </select>
        </div>

        <div class="flex flex-col gap-1.5 sm:w-40">
          <label class="text-sm font-medium text-zinc-700 dark:text-zinc-200">Filial</label>
          <select v-model="form.filial" class="input-field">
            <option value="todos">Todas</option>
            <option v-for="f in filialOptions" :key="f.key" :value="f.key">{{ f.label }}</option>
          </select>
        </div>

        <div class="flex flex-1 flex-col gap-1.5">
          <label class="text-sm font-medium text-zinc-700 dark:text-zinc-200">Buscar</label>
          <input v-model="form.search" type="search" class="input-field" placeholder="Pesquisar por colaborador, filial, tema, motivo..." />
        </div>

        <div class="flex gap-2">
          <button type="button" class="btn-ghost" @click="clearFilters">Limpar</button>
        </div>
      </div>

      <div class="flex items-center gap-2 rounded-xl border border-zinc-200 px-3 py-2.5 text-xs text-zinc-500 dark:border-zinc-800 dark:text-zinc-400">
        <span class="font-semibold uppercase tracking-wide text-zinc-400">Período</span>
        <span>
          Mês selecionado no filtro do dashboard{{ selectedMonthLabel ? ":" : "." }}
          <strong v-if="selectedMonthLabel" class="text-zinc-800 dark:text-zinc-100 capitalize">{{ selectedMonthLabel }}</strong>
        </span>
      </div>

      <div v-if="canEdit && selectedRows.length" class="flex flex-wrap items-center gap-2 rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-2 dark:border-zinc-800 dark:bg-zinc-900">
        <span class="rounded-full bg-accent/10 px-2.5 py-1 text-xs font-semibold text-accent-hover dark:text-accent-light">
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
        <div
          ref="tableWrapRef"
          class="max-h-[28rem] overflow-y-auto overflow-x-hidden"
          @scroll="onTableScroll"
        >
          <table ref="tableElRef" class="w-full min-w-max text-left text-sm">
              <thead class="sticky top-0 z-10 bg-white dark:bg-zinc-900">
                <tr class="border-b border-zinc-100 text-xs uppercase tracking-wide text-zinc-400 dark:border-zinc-800 dark:text-zinc-400">
                  <th v-if="canEdit" class="w-10 px-4 py-2.5 font-semibold">
                    <input
                      type="checkbox"
                      class="h-4 w-4 cursor-pointer accent-accent"
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
                      class="h-4 w-4 cursor-pointer accent-accent"
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
        <div
          v-if="hasOverflowX"
          ref="hScrollRef"
          class="table-hscroll"
          aria-hidden="true"
          @scroll="onBarScroll"
        >
          <div :style="{ width: tableWidth + 'px' }"></div>
        </div>
        <div class="border-t border-zinc-100 px-4 py-2 text-xs text-zinc-400 dark:border-zinc-800 dark:text-zinc-400">
          {{ rows.length === 1 ? "1 registro" : `${rows.length} registros` }}
        </div>
      </div>

      <div v-else>
        <EmptyState title="Nenhum registro encontrado" text="Ajuste o estado, a filial ou a busca, ou troque o mês no filtro do dashboard." />
      </div>
    </div>
  </Modal>
</template>

<style scoped>
.table-hscroll {
  overflow-x: auto;
  overflow-y: hidden;
}
.table-hscroll > div {
  height: 1px;
}
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
  border-color: #E8AF3E;
  box-shadow: 0 0 0 2px rgb(232 175 62 / 0.2);
}
:global(.dark) .input-field {
  border-color: rgb(63 63 70);
  background-color: rgb(9 9 11);
  color: rgb(244 244 245);
}
.btn-primary {
  border-radius: 0.5rem;
  background-color: #E8AF3E;
  padding: 0.5rem 1rem;
  font-size: 0.875rem;
  font-weight: 600;
  color: #fff;
  transition: background-color 0.15s;
}
.btn-primary:hover {
  background-color: #B7791F;
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
  border-color: rgb(232 175 62);
  background-color: rgb(232 175 62);
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
