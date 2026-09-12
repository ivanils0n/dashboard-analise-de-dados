<script setup>
import { ref, reactive, computed, watch, onMounted } from "vue";
import Badge from "@/components/ui/Badge.vue";
import EmptyState from "@/components/ui/EmptyState.vue";
import DateRangeFilter from "@/components/dashboard/DateRangeFilter.vue";
import { useToast } from "@/composables/useToast";
import { useDialog } from "@/composables/useDialog";
import { useFilters } from "@/composables/useFilters";
import { STATES, DEFAULT_STATE } from "@/lib/config";
import { getDepartmentById, getBranchById } from "@/lib/store";
import { listDepartments, departmentMetrics } from "@/lib/employees";
import { listBranches } from "@/lib/filiais";
import { saveDepartment, deleteDepartmentRecord, nameInUse } from "@/lib/departamentos";
import { hydrateState } from "@/lib/db";
import { normalizeText } from "@/lib/utils";

const { show: toast } = useToast();
const { confirm } = useDialog();
const { state: filters } = useFilters();

const form = reactive({
  id: null,
  name: "",
  short: "",
  estado: ""
});

const search = ref("");
const branchInput = ref("");
const branchFilterId = ref("todos");
const range = reactive({ start: "", end: "" });

const tableList = computed(() => {
  const q = normalizeText(search.value).trim();
  let list = listDepartments(filters.current);
  if (q) {
    list = list.filter((d) => normalizeText(`${d.name} ${d.shortName || ""}`).includes(q));
  }
  return list.slice().sort((a, b) => (b.createdAt || "").localeCompare(a.createdAt || ""));
});

const total = computed(() => listDepartments(filters.current).length);

const branchOptions = computed(() => listBranches(filters.current));

/* Garante que os dados do estado selecionado estejam carregados ao abrir a aba. */
onMounted(() => {
  hydrateState(filters.current).catch(() => {});
});

/* Ao trocar de estado, limpa o filtro de filial (sigla pode não existir lá). */
watch(
  () => filters.current,
  () => {
    branchFilterId.value = "todos";
    branchInput.value = "";
  }
);

const dateRange = computed(() => {
  let start = range.start || null;
  let end = range.end || null;
  if (start && end && start > end) {
    const tmp = start;
    start = end;
    end = tmp;
  }
  return { start, end };
});

const summaryText = computed(() => {
  const branchName = branchFilterId.value !== "todos"
    ? (getBranchById(branchFilterId.value) || {}).shortName || ""
    : "";
  const filialText = branchName ? ` · filial ${branchName}` : "";
  const d = dateRange.value;
  const periodText = d.start || d.end ? ` · período ${d.start || "…"} a ${d.end || "…"}` : "";
  return `${total.value} departamento(s) · ${filters.current === "todos" ? "todos os estados" : "estado " + filters.current}${filialText}${periodText}`;
});

function resetForm() {
  form.id = null;
  form.name = "";
  form.short = "";
  form.estado = filters.current !== "todos" ? filters.current : DEFAULT_STATE;
}

function fillForm(department) {
  form.id = department.id;
  form.name = department.name;
  form.short = department.shortName || "";
  form.estado = department.estado || "";
}

/* Filtro por filial: só aplica quando o texto corresponde a uma sigla válida. */
function applyBranchFilter(onlyIfMatch) {
  const v = branchInput.value.trim();
  const match = v ? branchOptions.value.find((f) => f.shortName === v) : null;
  if (onlyIfMatch && v && !match) return;
  branchFilterId.value = match ? match.id : "todos";
}

/* Limpa todos os filtros da listagem (busca, filial e período). */
function clearFilters() {
  search.value = "";
  branchInput.value = "";
  branchFilterId.value = "todos";
  range.start = "";
  range.end = "";
}

function handleSubmit() {
  const up = (v) => String(v == null ? "" : v).trim().toUpperCase();
  const data = {
    id: form.id || undefined,
    name: up(form.name),
    shortName: up(form.short) || null,
    estado: form.estado || null
  };

  if (!data.name) return toast("Informe o nome do departamento.");
  if (!data.estado) return toast("Selecione o estado do departamento.");

  const dup = nameInUse(data.name, data.estado, data.id);
  if (dup) return toast(`Já existe o departamento "${dup.name}" no estado ${data.estado}.`);

  saveDepartment(data);
  resetForm();
  toast(data.id ? "Departamento atualizado." : "Departamento cadastrado.");
}

async function handleDelete(id) {
  const department = getDepartmentById(id);
  if (!department) return;
  const ok = await confirm({
    title: "Excluir departamento?",
    message: `O departamento "${department.name}" será removido. Colaboradores vinculados ficarão sem setor. Essa ação não pode ser desfeita.`,
    confirmText: "Excluir",
    danger: true
  });
  if (!ok) return;
  deleteDepartmentRecord(id);
  resetForm();
  toast("Departamento excluído.");
}

/* ---------- Seleção múltipla / exclusão em lote ---------- */
const selectedIds = ref(new Set());

const selectedDepartments = computed(() => tableList.value.filter((d) => selectedIds.value.has(d.id)));

const allVisibleSelected = computed(
  () => tableList.value.length > 0 && tableList.value.every((d) => selectedIds.value.has(d.id))
);

function toggleDepartment(id) {
  const next = new Set(selectedIds.value);
  if (next.has(id)) next.delete(id);
  else next.add(id);
  selectedIds.value = next;
}

function toggleSelectAll() {
  if (allVisibleSelected.value) {
    selectedIds.value = new Set();
  } else {
    selectedIds.value = new Set(tableList.value.map((d) => d.id));
  }
}

async function handleBulkDelete() {
  const list = selectedDepartments.value;
  const n = list.length;
  if (!n) return;
  const ok = await confirm({
    title: `Excluir ${n} departamento(s)?`,
    message: "Os departamentos selecionados serão removidos. Colaboradores vinculados ficarão sem setor. Essa ação não pode ser desfeita.",
    confirmText: `Excluir ${n}`,
    danger: true
  });
  if (!ok) return;
  list.forEach((d) => deleteDepartmentRecord(d.id));
  selectedIds.value = new Set();
  resetForm();
  toast(`${n} departamento(s) excluído(s).`);
}

function edit(id) {
  const department = getDepartmentById(id);
  if (department) fillForm(department);
}

/* Métricas por departamento com os filtros ativos. Calculadas uma única vez
   por render (o template lê 4 campos por linha, antes recalculava 4x). */
const metricsByDept = computed(() => {
  const filialId = branchFilterId.value !== "todos" ? branchFilterId.value : null;
  const range = dateRange.value;
  const map = new Map();
  tableList.value.forEach((d) => {
    map.set(d.id, departmentMetrics(d, filters.current, filialId, range));
  });
  return map;
});

function metrics(d) {
  return metricsByDept.value.get(d.id) || { total: 0, ativos: 0, entradas: 0, saidas: 0 };
}
</script>

<template>
  <div class="fade-in">
    <!-- ===== HERO ===== -->
    <div class="mb-6 flex flex-wrap items-center justify-between gap-4">
      <h1 class="text-2xl font-bold text-zinc-900 dark:text-zinc-100">Departamentos</h1>
      <Badge tone="accent">{{ total === 1 ? "1 departamento" : `${total} departamentos` }}</Badge>
    </div>

    <!-- ===== CADASTRO ===== -->
    <section class="rounded-2xl border border-zinc-200 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
      <div class="border-b border-zinc-100 px-5 py-4 dark:border-zinc-800">
        <h2 class="text-sm font-bold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
          {{ form.id ? "Editar departamento" : "Novo departamento" }}
        </h2>
        <p class="mt-0.5 text-xs text-zinc-400 dark:text-zinc-400">
          Cadastre os departamentos (setores) e associe cada um ao estado correspondente.
        </p>
      </div>
      <form class="grid gap-4 p-5 sm:grid-cols-2 lg:grid-cols-3" novalidate @submit.prevent="handleSubmit">
        <div class="flex flex-col gap-1.5">
          <label for="departmentName" class="text-sm font-medium text-zinc-700 dark:text-zinc-200">Nome do departamento</label>
          <input id="departmentName" v-model="form.name" v-upper type="text" class="input-field uppercase" required placeholder="Ex.: RECURSOS HUMANOS" />
        </div>
        <div class="flex flex-col gap-1.5">
          <label for="departmentShort" class="text-sm font-medium text-zinc-700 dark:text-zinc-200">Sigla</label>
          <input id="departmentShort" v-model="form.short" v-upper type="text" class="input-field uppercase" placeholder="Ex.: RH" />
        </div>
        <div class="flex flex-col gap-1.5">
          <label for="departmentEstado" class="text-sm font-medium text-zinc-700 dark:text-zinc-200">Estado</label>
          <select id="departmentEstado" v-model="form.estado" class="input-field">
            <option value="">—</option>
            <option v-for="s in STATES" :key="s" :value="s">{{ s }}</option>
          </select>
        </div>

        <div class="flex items-end gap-2 sm:col-span-2 lg:col-span-3">
          <button type="button" class="btn-ghost" @click="resetForm">Limpar</button>
          <button type="submit" class="btn-primary">Salvar departamento</button>
        </div>
      </form>
    </section>

    <!-- ===== LISTA ===== -->
    <section class="mt-8 rounded-2xl border border-zinc-200 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
      <div class="flex flex-wrap items-center justify-between gap-3 border-b border-zinc-100 p-5 dark:border-zinc-800">
        <div>
          <h2 class="text-sm font-bold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">Departamentos cadastrados</h2>
          <p class="text-xs text-zinc-400 dark:text-zinc-400">{{ summaryText }}</p>
        </div>
        <div class="flex flex-wrap items-center gap-2">
          <input v-model="search" type="search" class="input-sm" placeholder="Buscar departamento..." aria-label="Buscar departamento" />
          <input
            v-model="branchInput"
            type="text"
            class="input-sm"
            list="deptFiliaisList"
            placeholder="Filtrar por filial (sigla)..."
            aria-label="Filtrar por filial"
            autocomplete="off"
            @input="applyBranchFilter(true)"
            @change="applyBranchFilter(false)"
          />
          <datalist id="deptFiliaisList">
            <option v-for="f in branchOptions" :key="f.id" :value="f.shortName"></option>
          </datalist>
          <DateRangeFilter :range="range" title="Período" />
          <button type="button" class="btn-ghost-sm" @click="clearFilters">Limpar filtro</button>
        </div>
      </div>

      <div v-if="selectedDepartments.length" class="flex flex-wrap items-center gap-2 border-b border-zinc-100 bg-zinc-50 px-5 py-2 dark:border-zinc-800 dark:bg-zinc-900">
        <span class="rounded-full bg-accent/10 px-2.5 py-1 text-xs font-semibold text-accent-hover dark:text-red-400">
          {{ selectedDepartments.length }} selecionado(s)
        </span>
        <button
          type="button"
          class="rounded-lg bg-red-600 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-red-700"
          @click="handleBulkDelete"
        >
          Excluir selecionados
        </button>
      </div>

      <div v-if="tableList.length" class="max-h-[420px] overflow-auto">
        <table class="w-full text-left text-sm">
          <thead class="sticky top-0 z-10 bg-white dark:bg-zinc-900">
            <tr class="border-b border-zinc-100 text-xs uppercase tracking-wide text-zinc-400 dark:border-zinc-800 dark:text-zinc-400">
              <th class="w-10 px-4 py-3 font-semibold">
                <input
                  type="checkbox"
                  class="h-4 w-4 cursor-pointer accent-red-600"
                  :checked="allVisibleSelected"
                  aria-label="Selecionar todos os departamentos visíveis"
                  @change="toggleSelectAll"
                />
              </th>
              <th class="px-5 py-3 font-semibold">Departamento</th>
              <th class="px-5 py-3 font-semibold">Sigla</th>
              <th class="px-5 py-3 font-semibold">Estado</th>
              <th class="px-5 py-3 font-semibold">Ativos</th>
              <th class="px-5 py-3 font-semibold">Entradas</th>
              <th class="px-5 py-3 font-semibold">Saídas</th>
              <th class="px-5 py-3 font-semibold">Total</th>
              <th class="px-5 py-3"></th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="d in tableList"
              :key="d.id"
              class="border-b border-zinc-100 last:border-0 dark:border-zinc-800"
              :class="selectedIds.has(d.id) ? 'bg-accent/5 dark:bg-red-500/5' : ''"
            >
              <td class="px-4 py-3">
                <input
                  type="checkbox"
                  class="h-4 w-4 cursor-pointer accent-red-600"
                  :checked="selectedIds.has(d.id)"
                  :aria-label="`Selecionar ${d.name}`"
                  @change="toggleDepartment(d.id)"
                />
              </td>
              <td class="px-5 py-3 font-medium text-zinc-900 dark:text-zinc-100">{{ d.name }}</td>
              <td class="px-5 py-3">
                <Badge v-if="d.shortName" tone="muted">{{ d.shortName }}</Badge>
                <span v-else>—</span>
              </td>
              <td class="px-5 py-3">
                <Badge v-if="d.estado">{{ d.estado }}</Badge>
                <span v-else>—</span>
              </td>
              <td class="px-5 py-3">
                <Badge tone="accent">{{ metrics(d).ativos }}</Badge>
              </td>
              <td class="px-5 py-3 text-zinc-600 dark:text-zinc-300">{{ metrics(d).entradas }}</td>
              <td class="px-5 py-3 text-zinc-600 dark:text-zinc-300">{{ metrics(d).saidas }}</td>
              <td class="px-5 py-3 text-zinc-600 dark:text-zinc-300">{{ metrics(d).total }}</td>
              <td class="px-5 py-3 text-right">
                <div class="flex justify-end gap-2">
                  <button type="button" class="btn-ghost-sm" @click="edit(d.id)">Editar</button>
                  <button type="button" class="icon-btn-sm" aria-label="Excluir departamento" @click="handleDelete(d.id)">&times;</button>
                </div>
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <div v-else class="p-5">
        <EmptyState
          title="Nenhum departamento cadastrado"
          text="Preencha o formulário acima para cadastrar seu primeiro departamento."
        />
      </div>
    </section>
  </div>
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
.input-sm {
  border-radius: 0.5rem;
  border: 1px solid rgb(212 212 216);
  background-color: #fff;
  padding: 0.375rem 0.6rem;
  font-size: 0.8125rem;
  color: rgb(24 24 27);
  outline: none;
}
:global(.dark) .input-sm {
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
.btn-ghost-sm {
  border-radius: 0.5rem;
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
  color: rgb(228 228 231);
}
:global(.dark) .btn-ghost-sm:hover {
  background-color: rgb(39 39 42);
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
</style>
