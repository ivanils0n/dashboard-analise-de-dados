<script setup>
import { reactive, computed, watch, ref, nextTick, onMounted, onBeforeUnmount } from "vue";
import Modal from "@/components/ui/Modal.vue";
import EmptyState from "@/components/ui/EmptyState.vue";
import Badge from "@/components/ui/Badge.vue";
import HiringGoalsLegend from "@/components/dashboard/HiringGoalsLegend.vue";
import { STATES, STATE_NAMES, getIndicatorById } from "@/lib/config";
import { listVacancies, formatVacancyTempo, deleteVacancies } from "@/lib/employees";
import { hydrateState } from "@/lib/db";
import { formatDate, formatCurrency, singleMonthOfRange, ymLabel, normalizeText } from "@/lib/utils";
import { useFilters } from "@/composables/useFilters";
import { dateFilter } from "@/composables/useDateFilter";
import { useDialog } from "@/composables/useDialog";
import { canEditData } from "@/lib/auth";

const props = defineProps({
  open: { type: Boolean, default: false },
  /* KPI de origem. Nos dois casos segue sempre o mês selecionado no filtro
     global do dashboard, sem opção de sobrepor aqui, com a mesma regra do
     KPI/gráfico:
       tempo_contratacao  vagas abertas no mês (data de abertura)
       custo_contratacao  vagas fechadas com salário no mês (data de fechamento) */
  indicatorId: { type: String, default: "tempo_contratacao" }
});
const emit = defineEmits(["close", "edit"]);

const isCost = computed(() => props.indicatorId === "custo_contratacao");
const kpi = computed(() => getIndicatorById(props.indicatorId) || {});

const { state: filters } = useFilters();
const { confirm } = useDialog();
const canEdit = canEditData();

function editRow(v) {
  emit("edit", v.id);
}

const form = reactive({
  estado: filters.current !== "todos" ? filters.current : "todos",
  filial: "todos",
  recrutador: "todos",
  search: "",
  status: "todas"
});

const periodFrom = computed(() => dateFilter.start);
const periodTo = computed(() => dateFilter.end);

/* `immediate: true`: sem isso, o estado inicial do formulário nunca disparava
   o hydrate (só uma troca depois de aberto) — se o filtro do dashboard não
   tivesse carregado esse(s) estado(s) ainda, a tabela abria vazia até o
   usuário trocar o filtro de Estado manualmente. */
watch(
  () => form.estado,
  async (state) => {
    form.filial = "todos";
    try {
      await hydrateState(state === "todos" ? "todos" : state);
    } catch (err) {
      console.warn("[VacanciesModal] Falha ao carregar dados do estado:", err);
    }
  },
  { immediate: true }
);

function clearFilters() {
  form.estado = filters.current !== "todos" ? filters.current : "todos";
  form.filial = "todos";
  form.recrutador = "todos";
  form.search = "";
  form.status = "todas";
}

const selectedMonthLabel = computed(() => {
  const ym = singleMonthOfRange(periodFrom.value, periodTo.value);
  return ym ? ymLabel(ym) : "";
});

function tipoLabel(t) {
  return t ? String(t).toUpperCase() : "—";
}

/* Data usada no filtro de mês: fechamento no Custo de contratação (o custo
   é reconhecido quando a vaga fecha), abertura no Tempo de contratação. */
function periodDate(v) {
  const raw = isCost.value ? v && v.closeAt : v && v.openAt;
  return raw ? String(raw).slice(0, 10) : "";
}

/* Lista base (estado + período + busca), ANTES dos filtros de filial e de
   status. É a raiz tanto da tabela quanto da lista de filiais do dropdown. */
const scopedList = computed(() => {
  let list = listVacancies(form.estado);

  /* Custo: só vagas fechadas com salário, como o KPI e o gráfico. */
  if (isCost.value) list = list.filter((v) => v.closeAt && Number(v.salario) > 0);

  if (periodFrom.value) list = list.filter((v) => periodDate(v) >= periodFrom.value);
  if (periodTo.value) list = list.filter((v) => periodDate(v) <= periodTo.value);

  const q = normalizeText(form.search).trim();
  if (q) {
    list = list.filter((v) =>
      normalizeText(
        [v.name, tipoLabel(v.tipoContratacao), v.filial || "", v.estado || "", v.recrutador || ""].join(" ")
      ).includes(q)
    );
  }
  return list;
});

const SEM_FILIAL = "__sem_filial__";
const SEM_RECRUTADOR = "__sem_recrutador__";

/* + filtro de filial e de recrutador (mantém o mesmo escopo usado antes para
   os contadores de abertas/fechadas, que não consideram o filtro de status). */
const baseList = computed(() => {
  let list = scopedList.value;
  if (form.filial !== "todos") {
    list =
      form.filial === SEM_FILIAL
        ? list.filter((v) => !v.filial)
        : list.filter((v) => v.filial === form.filial);
  }
  if (form.recrutador !== "todos") {
    list =
      form.recrutador === SEM_RECRUTADOR
        ? list.filter((v) => !v.recrutador)
        : list.filter((v) => v.recrutador === form.recrutador);
  }
  return list;
});

/* Soma dos salários das vagas exibidas (Custo de contratação): mês e estado
   filtrados, mais filial e busca se aplicados. */
const totalSalarios = computed(() => baseList.value.reduce((sum, v) => sum + (Number(v.salario) || 0), 0));

const openCount = computed(() => baseList.value.filter((v) => !v.closeAt).length);
const closedCount = computed(() => baseList.value.filter((v) => v.closeAt).length);

/* Base para as opções de filial/recrutador: escopo + status, sem aplicar o
   próprio filtro de filial nem o de recrutador (senão escolher um valor
   faria as opções dos dois dropdowns encolherem/sumirem). */
const statusFilteredList = computed(() => {
  let list = scopedList.value;
  if (form.status === "abertas") list = list.filter((v) => !v.closeAt);
  else if (form.status === "fechadas") list = list.filter((v) => v.closeAt);
  return list;
});

/* Filiais que de fato aparecem na tabela (estado, período, busca, status e
   recrutador — mas não a própria filial, senão selecionar uma a faria sumir
   da lista), em ordem alfabética. "Filial" é texto livre digitado na vaga
   (sem FK pra Filiais, como recrutador). */
const filialOptions = computed(() => {
  let list = statusFilteredList.value;
  if (form.recrutador !== "todos") {
    list =
      form.recrutador === SEM_RECRUTADOR
        ? list.filter((v) => !v.recrutador)
        : list.filter((v) => v.recrutador === form.recrutador);
  }
  const set = new Set();
  let hasSemFilial = false;
  list.forEach((v) => {
    if (!v.filial) {
      hasSemFilial = true;
      return;
    }
    set.add(v.filial);
  });
  const opts = Array.from(set)
    .sort((a, b) => a.localeCompare(b, "pt-BR"))
    .map((f) => ({ id: f, label: f }));
  if (hasSemFilial) opts.push({ id: SEM_FILIAL, label: "Sem filial" });
  return opts;
});

/* Recrutadores que de fato aparecem na tabela, mesma regra da filialOptions
   acima (mas cruzando com o filtro de filial em vez do de recrutador). */
const recrutadorOptions = computed(() => {
  let list = statusFilteredList.value;
  if (form.filial !== "todos") {
    list =
      form.filial === SEM_FILIAL
        ? list.filter((v) => !v.filial)
        : list.filter((v) => v.filial === form.filial);
  }
  const set = new Set();
  let hasSemRecrutador = false;
  list.forEach((v) => {
    if (!v.recrutador) {
      hasSemRecrutador = true;
      return;
    }
    set.add(v.recrutador);
  });
  const opts = Array.from(set)
    .sort((a, b) => a.localeCompare(b, "pt-BR"))
    .map((r) => ({ id: r, label: r }));
  if (hasSemRecrutador) opts.push({ id: SEM_RECRUTADOR, label: "Sem recrutador" });
  return opts;
});

/* Se a filial/recrutador selecionado deixar de aparecer nas opções (filtros
   mudaram), volta para "Todas". */
watch(filialOptions, (opts) => {
  if (form.filial !== "todos" && !opts.some((b) => b.id === form.filial)) {
    form.filial = "todos";
  }
});
watch(recrutadorOptions, (opts) => {
  if (form.recrutador !== "todos" && !opts.some((r) => r.id === form.recrutador)) {
    form.recrutador = "todos";
  }
});

const rows = computed(() => {
  if (form.status === "abertas") return baseList.value.filter((v) => !v.closeAt);
  if (form.status === "fechadas") return baseList.value.filter((v) => v.closeAt);
  return baseList.value;
});

/* ---------- Seleção múltipla / exclusão em lote ---------- */
const selectedIds = ref(new Set());

const selectedRows = computed(() => rows.value.filter((v) => selectedIds.value.has(v.id)));
const allVisibleSelected = computed(
  () => rows.value.length > 0 && rows.value.every((v) => selectedIds.value.has(v.id))
);

function toggleRow(id) {
  const next = new Set(selectedIds.value);
  if (next.has(id)) next.delete(id);
  else next.add(id);
  selectedIds.value = next;
}

function toggleSelectAll() {
  if (allVisibleSelected.value) selectedIds.value = new Set();
  else selectedIds.value = new Set(rows.value.map((v) => v.id));
}

async function handleBulkDelete() {
  const list = selectedRows.value;
  const n = list.length;
  if (!n) return;
  const ok = await confirm({
    title: `Excluir ${n} vaga(s)?`,
    message: "As vagas selecionadas serão removidas definitivamente e o tempo médio será recalculado.",
    confirmText: `Excluir ${n}`,
    danger: true
  });
  if (!ok) return;
  await deleteVacancies(list.map((v) => v.id));
  selectedIds.value = new Set();
}

/* Limpa a seleção quando os filtros mudam (evita IDs fora da visão). */
watch(
  () => [form.estado, periodFrom.value, periodTo.value, form.search, form.status, form.recrutador],
  () => {
    selectedIds.value = new Set();
  }
);

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
    :title="`${kpi.name} — Vagas`"
    :subtitle="kpi.calc"
    :open="open"
    max-width="max-w-7xl"
    @close="close"
  >
    <div class="flex flex-col gap-3">
      <!-- Resumo -->
      <div class="grid gap-3 sm:grid-cols-2">
        <div v-if="!isCost" class="rounded-xl border border-zinc-200 px-4 py-3 dark:border-zinc-800">
          <span class="text-xs font-semibold uppercase tracking-wide text-zinc-400">Vagas abertas</span>
          <p class="text-2xl font-bold text-accent-hover dark:text-accent-light">{{ openCount }}</p>
        </div>
        <div class="rounded-xl border border-zinc-200 px-4 py-3 dark:border-zinc-800">
          <span class="text-xs font-semibold uppercase tracking-wide text-zinc-400">Vagas fechadas</span>
          <p class="text-2xl font-bold text-zinc-900 dark:text-zinc-100">{{ closedCount }}</p>
        </div>
        <div v-if="isCost" class="rounded-xl border border-accent/25 bg-accent/5 px-4 py-3 dark:border-accent/25 dark:bg-accent/10">
          <span class="text-xs font-semibold uppercase tracking-wide text-zinc-400">Total de salários</span>
          <p class="text-2xl font-bold tabular-nums text-zinc-900 dark:text-zinc-100">{{ formatCurrency(totalSalarios) }}</p>
        </div>
      </div>

      <HiringGoalsLegend v-if="!isCost" size="md" class="-mt-1" />

      <!-- Filtros -->
      <div class="rounded-xl border border-zinc-200 px-3 py-3 dark:border-zinc-800">
        <div class="flex flex-col gap-3">
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
                <option v-for="f in filialOptions" :key="f.id" :value="f.id">{{ f.label }}</option>
              </select>
            </div>
            <div class="flex flex-col gap-1.5 sm:w-44">
              <label class="text-sm font-medium text-zinc-700 dark:text-zinc-200">Recrutador</label>
              <select v-model="form.recrutador" class="input-field">
                <option value="todos">Todos</option>
                <option v-for="r in recrutadorOptions" :key="r.id" :value="r.id">{{ r.label }}</option>
              </select>
            </div>
            <div class="flex flex-1 flex-col gap-1.5">
              <label class="text-sm font-medium text-zinc-700 dark:text-zinc-200">Buscar</label>
              <input v-model="form.search" type="search" class="input-field" placeholder="Vaga, tipo, filial, recrutador..." />
            </div>
            <div v-if="!isCost" class="flex flex-col gap-1.5 sm:w-44">
              <label class="text-sm font-medium text-zinc-700 dark:text-zinc-200">Status</label>
              <select v-model="form.status" class="input-field">
                <option value="todas">Todas</option>
                <option value="abertas">Abertas</option>
                <option value="fechadas">Fechadas</option>
              </select>
            </div>
            <button type="button" class="btn-ghost" @click="clearFilters">Limpar</button>
          </div>

          <div class="flex items-center gap-2 text-xs text-zinc-500 dark:text-zinc-400">
            <span class="font-semibold uppercase tracking-wide text-zinc-400">Período</span>
            <span>
              {{ isCost ? "Vagas fechadas no mês selecionado no filtro do dashboard" : "Mês selecionado no filtro do dashboard" }}{{ selectedMonthLabel ? ":" : "." }}
              <strong v-if="selectedMonthLabel" class="text-zinc-800 dark:text-zinc-100 capitalize">{{ selectedMonthLabel }}</strong>
            </span>
          </div>
        </div>
      </div>

      <!-- Seleção em lote -->
      <div
        v-if="canEdit && selectedRows.length"
        class="flex flex-wrap items-center gap-2 rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-2 dark:border-zinc-800 dark:bg-zinc-900"
      >
        <span class="rounded-full bg-accent/10 px-2.5 py-1 text-xs font-semibold text-accent-hover dark:text-accent-light">
          {{ selectedRows.length }} selecionada(s)
        </span>
        <button
          type="button"
          class="rounded-lg bg-red-600 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-red-700"
          @click="handleBulkDelete"
        >
          Excluir selecionadas
        </button>
      </div>

      <!-- Tabela -->
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
                      aria-label="Selecionar todas as vagas visíveis"
                      @change="toggleSelectAll"
                    />
                  </th>
                  <th class="whitespace-nowrap px-4 py-2.5 font-semibold">Vaga</th>
                  <th class="whitespace-nowrap px-4 py-2.5 font-semibold">Tipo</th>
                  <th class="whitespace-nowrap px-4 py-2.5 font-semibold">Salário</th>
                  <th class="whitespace-nowrap px-4 py-2.5 font-semibold">Filial</th>
                  <th class="whitespace-nowrap px-4 py-2.5 font-semibold">Recrutador</th>
                  <th class="whitespace-nowrap px-4 py-2.5 font-semibold">Estado</th>
                  <th class="whitespace-nowrap px-4 py-2.5 font-semibold">Abertura</th>
                  <th class="whitespace-nowrap px-4 py-2.5 font-semibold">Fechamento</th>
                  <th class="whitespace-nowrap px-4 py-2.5 font-semibold">Tempo</th>
                  <th class="whitespace-nowrap px-4 py-2.5 font-semibold">Status</th>
                  <th v-if="canEdit" class="px-4 py-2.5"></th>
                </tr>
              </thead>
              <tbody class="uppercase">
                <tr
                  v-for="v in rows"
                  :key="v.id"
                  class="border-b border-zinc-100 last:border-0 dark:border-zinc-800"
                  :class="selectedIds.has(v.id) ? 'bg-accent/5 dark:bg-accent/5' : ''"
                >
                  <td v-if="canEdit" class="px-4 py-2.5">
                    <input
                      type="checkbox"
                      class="h-4 w-4 cursor-pointer accent-accent"
                      :checked="selectedIds.has(v.id)"
                      aria-label="Selecionar vaga"
                      @change="toggleRow(v.id)"
                    />
                  </td>
                  <td class="whitespace-nowrap px-4 py-2.5 font-medium text-zinc-900 dark:text-zinc-100">{{ v.name }}</td>
                  <td class="whitespace-nowrap px-4 py-2.5 text-zinc-700 dark:text-zinc-300">{{ tipoLabel(v.tipoContratacao) }}</td>
                  <td class="whitespace-nowrap px-4 py-2.5 text-zinc-700 dark:text-zinc-300">{{ v.salario != null ? formatCurrency(v.salario) : "—" }}</td>
                  <td class="whitespace-nowrap px-4 py-2.5 text-zinc-700 dark:text-zinc-300">{{ v.filial || "—" }}</td>
                  <td class="whitespace-nowrap px-4 py-2.5 text-zinc-700 dark:text-zinc-300">{{ v.recrutador || "—" }}</td>
                  <td class="whitespace-nowrap px-4 py-2.5 text-zinc-700 dark:text-zinc-300">{{ v.estado || "—" }}</td>
                  <td class="whitespace-nowrap px-4 py-2.5 text-zinc-700 dark:text-zinc-300">{{ formatDate(v.openAt) }}</td>
                  <td class="whitespace-nowrap px-4 py-2.5 text-zinc-700 dark:text-zinc-300">{{ v.closeAt ? formatDate(v.closeAt) : "—" }}</td>
                  <td class="whitespace-nowrap px-4 py-2.5 text-zinc-700 dark:text-zinc-300">{{ formatVacancyTempo(v) }}</td>
                  <td class="whitespace-nowrap px-4 py-2.5">
                    <Badge :tone="v.closeAt ? 'dark' : 'accent'">{{ v.closeAt ? "Fechada" : "Aberta" }}</Badge>
                  </td>
                  <td v-if="canEdit" class="normal-case whitespace-nowrap px-4 py-2.5 text-right">
                    <button type="button" class="btn-ghost-sm" @click="editRow(v)">Editar</button>
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
          {{ rows.length === 1 ? "1 vaga" : `${rows.length} vagas` }}
        </div>
      </div>

      <div v-else>
        <EmptyState title="Nenhuma vaga encontrada" text="Ajuste o período, o estado ou a busca e tente novamente." />
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
</style>
