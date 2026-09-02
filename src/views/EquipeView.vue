<script setup>
import { ref, reactive, computed, watch, onMounted } from "vue";
import Badge from "@/components/ui/Badge.vue";
import EmptyState from "@/components/ui/EmptyState.vue";
import FilterDrawer from "@/components/dashboard/FilterDrawer.vue";
import { useToast } from "@/composables/useToast";
import { useDialog } from "@/composables/useDialog";
import { useFilters } from "@/composables/useFilters";
import { useEquipeFilters, equipeFilter } from "@/composables/useEquipeFilters";
import { DEFAULT_STATE, STATES, STATUS_LABELS, TYPE_LABELS } from "@/lib/config";
import {
  getEmployeeById,
  getBranchById,
  getDepartmentById
} from "@/lib/store";
import { listDepartments, saveEmployee, removeEmployee, syncAll, listEmployees } from "@/lib/employees";
import { listBranches } from "@/lib/filiais";
import { todayISO, formatDate, formatDateTime } from "@/lib/utils";

const { show: toast } = useToast();
const { confirm } = useDialog();
const { state: filters } = useFilters();
const { equipeFilter: ef } = useEquipeFilters();

const form = reactive({
  id: null,
  name: "",
  sector: "",
  user: "",
  branch: "",
  hiredAt: todayISO(),
  status: "ativo",
  firedAt: "",
  type: "experiencia",
  estado: ""
});

const departmentOptions = computed(() => {
  const state = form.estado || (filters.current !== "todos" ? filters.current : DEFAULT_STATE);
  return listDepartments(state);
});

const branchOptions = computed(() => {
  const state = form.estado || (filters.current !== "todos" ? filters.current : DEFAULT_STATE);
  return listBranches(state);
});

const showFiredAt = computed(() => form.status === "desligado");

const tableList = computed(() => {
  let list = listEmployees(filters.current);
  const q = ef.search.trim().toLowerCase();
  if (q) {
    list = list.filter((e) => {
      const filial = e.filialId ? getBranchById(e.filialId) : null;
      const filialText = filial ? `${filial.shortName} ${filial.name}` : "";
      return `${e.name} ${e.sector} ${e.user} ${filialText}`.toLowerCase().includes(q);
    });
  }
  if (ef.department && ef.department !== "todos") {
    const dep = getDepartmentById(ef.department);
    const depName = dep ? dep.name : null;
    list = list.filter((e) => e.departmentId === ef.department || (depName && e.sector === depName));
  }
  if (ef.status !== "todos") {
    list = list.filter((e) => e.status === ef.status);
  }
  if (ef.start || ef.end) {
    list = list.filter((e) => {
      const d = e.hiredAt ? e.hiredAt.split("T")[0] : "";
      if (ef.start && (!d || d < ef.start)) return false;
      if (ef.end && (!d || d > ef.end)) return false;
      return true;
    });
  }
  return list.slice().sort((a, b) => b.createdAt.localeCompare(a.createdAt));
});

const total = computed(() => listEmployees(filters.current).length);
const ativos = computed(() => listEmployees(filters.current).filter((e) => e.status === "ativo").length);
const desligados = computed(() => listEmployees(filters.current).filter((e) => e.status === "desligado").length);

function resetForm() {
  form.id = null;
  form.name = "";
  form.sector = "";
  form.user = "";
  form.branch = "";
  form.hiredAt = todayISO();
  form.status = "ativo";
  form.firedAt = "";
  form.type = "experiencia";
  form.estado = filters.current !== "todos" ? filters.current : DEFAULT_STATE;
}

onMounted(resetForm);

watch(
  () => form.status,
  () => {
    if (form.status === "desligado" && !form.firedAt) form.firedAt = todayISO();
  }
);

function fillForm(employee) {
  form.id = employee.id;
  form.name = employee.name;
  form.sector = employee.sector;
  form.user = employee.user;
  form.hiredAt = employee.hiredAt ? employee.hiredAt.split("T")[0] : "";
  form.status = employee.status;
  form.firedAt = employee.firedAt ? employee.firedAt.split("T")[0] : "";
  form.type = employee.type;
  form.estado = employee.estado || "";
  const filial = employee.filialId ? getBranchById(employee.filialId) : null;
  form.branch = filial ? filial.shortName : "";
}

function resolveBranch(value) {
  const v = String(value || "").trim();
  if (!v) return null;
  return branchOptions.value.find((f) => f.shortName === v) || null;
}

function handleSubmit() {
  const filial = resolveBranch(form.branch);
  const sectorOption = form.sector;
  const data = {
    id: form.id || undefined,
    name: form.name.trim(),
    sector: sectorOption.trim(),
    departmentId: null,
    filialId: filial ? filial.id : null,
    user: form.user.trim(),
    hiredAt: form.hiredAt || null,
    status: form.status,
    type: form.type,
    estado: form.estado || null
  };

  if (departmentOptions.value.length) {
    const dep = departmentOptions.value.find((d) => d.name === sectorOption);
    if (dep) data.departmentId = dep.id;
  }

  if (!data.id) data.countsTurnover = true;
  if (data.status === "desligado" && form.firedAt) {
    data.firedAt = form.firedAt + "T00:00:00";
  }

  if (!data.name || !data.sector || !data.user) return toast("Preencha todos os campos obrigatórios.");
  if (!data.estado) return toast("Selecione o estado do colaborador.");
  data.hiredAt = data.hiredAt ? data.hiredAt + "T00:00:00" : null;

  saveEmployee(data);
  syncAll();
  resetForm();
  toast(data.id ? "Colaborador atualizado." : "Colaborador cadastrado.");
}

async function handleDelete(id) {
  const ok = await confirm({
    title: "Excluir colaborador?",
    message: "Os indicadores da equipe serão recalculados. Essa ação não pode ser desfeita.",
    confirmText: "Excluir",
    danger: true
  });
  if (!ok) return;
  removeEmployee(id);
  resetForm();
  toast("Colaborador excluído.");
}

function edit(id) {
  const employee = getEmployeeById(id);
  if (employee) fillForm(employee);
}

function statusTone(status) {
  return status === "desligado" ? "dark" : status === "afastado" ? "muted" : "default";
}
</script>

<template>
  <div class="fade-in">
    <FilterDrawer page="equipe" />

    <!-- ===== HERO ===== -->
    <div class="mb-6 flex flex-wrap items-center justify-between gap-4">
      <h1 class="text-2xl font-bold text-zinc-900 dark:text-zinc-100">Equipe</h1>
      <Badge tone="accent">{{ total === 1 ? "1 colaborador" : `${total} colaboradores` }}</Badge>
    </div>

    <!-- ===== CADASTRO ===== -->
    <section class="rounded-2xl border border-zinc-200 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
      <div class="border-b border-zinc-100 px-5 py-4 dark:border-zinc-800">
        <h2 class="text-sm font-bold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
          {{ form.id ? "Editar colaborador" : "Novo colaborador" }}
        </h2>
        <p class="mt-0.5 text-xs text-zinc-400 dark:text-zinc-400">
          Headcount, Turnover, Retenção e demais indicadores são calculados automaticamente.
        </p>
      </div>
      <form class="grid gap-4 p-5 sm:grid-cols-2 lg:grid-cols-3" novalidate @submit.prevent="handleSubmit">
        <div class="flex flex-col gap-1.5">
          <label for="employeeName" class="text-sm font-medium text-zinc-700 dark:text-zinc-200">Colaborador</label>
          <input id="employeeName" v-model="form.name" type="text" class="input-field uppercase" required placeholder="Nome completo" />
        </div>

        <div class="flex flex-col gap-1.5">
          <label for="employeeSector" class="text-sm font-medium text-zinc-700 dark:text-zinc-200">Setor (Departamento)</label>
          <select id="employeeSector" v-model="form.sector" class="input-field" required>
            <option v-if="!departmentOptions.length" value="">— Cadastre um departamento (aba Departamentos) —</option>
            <option value="">— Selecione —</option>
            <option v-for="d in departmentOptions" :key="d.id" :value="d.name">
              {{ d.name }}{{ d.shortName ? ` (${d.shortName})` : "" }}
            </option>
          </select>
          <p class="text-xs text-zinc-400 dark:text-zinc-400">Os departamentos são cadastrados na aba Departamentos.</p>
        </div>

        <div class="flex flex-col gap-1.5">
          <label for="employeeBranch" class="text-sm font-medium text-zinc-700 dark:text-zinc-200">Filial</label>
          <input
            id="employeeBranch"
            v-model="form.branch"
            type="text"
            class="input-field"
            list="filiaisDatalist"
            placeholder="Digite a sigla da filial..."
            autocomplete="off"
          />
          <datalist id="filiaisDatalist">
            <option v-for="f in branchOptions" :key="f.id" :value="f.shortName"></option>
          </datalist>
          <p class="text-xs text-zinc-400 dark:text-zinc-400">Busque e selecione pela sigla (nome abreviado) da filial.</p>
        </div>

        <div class="flex flex-col gap-1.5">
          <label for="employeeUser" class="text-sm font-medium text-zinc-700 dark:text-zinc-200">Usuário</label>
          <input id="employeeUser" v-model="form.user" type="text" class="input-field" required placeholder="Ex.: 3375" />
        </div>

        <div class="flex flex-col gap-1.5">
          <label for="employeeHiredAt" class="text-sm font-medium text-zinc-700 dark:text-zinc-200">Data de entrada</label>
          <input id="employeeHiredAt" v-model="form.hiredAt" type="date" class="input-field" />
        </div>

        <div class="flex flex-col gap-1.5">
          <label for="employeeStatus" class="text-sm font-medium text-zinc-700 dark:text-zinc-200">Status</label>
          <select id="employeeStatus" v-model="form.status" class="input-field">
            <option value="ativo">Ativo</option>
            <option value="desligado">Desligado</option>
            <option value="afastado">Afastado</option>
          </select>
        </div>

        <div v-if="showFiredAt" class="flex flex-col gap-1.5">
          <label for="employeeFiredAt" class="text-sm font-medium text-zinc-700 dark:text-zinc-200">Data do desligamento</label>
          <input id="employeeFiredAt" v-model="form.firedAt" type="date" class="input-field" />
        </div>

        <div class="flex flex-col gap-1.5">
          <label for="employeeType" class="text-sm font-medium text-zinc-700 dark:text-zinc-200">Tipo</label>
          <select id="employeeType" v-model="form.type" class="input-field">
            <option value="experiencia">Em experiência</option>
            <option value="efetivado">Efetivado</option>
          </select>
        </div>

        <div class="flex flex-col gap-1.5">
          <label for="employeeEstado" class="text-sm font-medium text-zinc-700 dark:text-zinc-200">Estado</label>
          <select id="employeeEstado" v-model="form.estado" class="input-field">
            <option value="">—</option>
            <option v-for="s in STATES" :key="s" :value="s">{{ s }}</option>
          </select>
        </div>

        <div class="flex items-end gap-2 sm:col-span-2 lg:col-span-3">
          <button type="button" class="btn-ghost" @click="resetForm">Limpar</button>
          <button type="submit" class="btn-primary">Salvar colaborador</button>
        </div>
      </form>
    </section>

    <!-- ===== LISTA ===== -->
    <section class="mt-8 rounded-2xl border border-zinc-200 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
      <div class="flex flex-wrap items-center justify-between gap-3 border-b border-zinc-100 p-5 dark:border-zinc-800">
        <div>
          <h2 class="text-sm font-bold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">Colaboradores</h2>
          <p class="text-xs text-zinc-400 dark:text-zinc-400">{{ ativos }} ativos · {{ desligados }} desligados</p>
        </div>
        <div class="flex flex-wrap items-center gap-2">
          <select v-model="ef.status" class="input-sm" aria-label="Filtrar por status">
            <option value="todos">Status: Todos</option>
            <option value="ativo">Status: Ativos</option>
            <option value="desligado">Status: Desligados</option>
            <option value="afastado">Status: Afastados</option>
          </select>
          <input v-model="ef.search" type="search" class="input-sm" placeholder="Buscar colaborador..." aria-label="Buscar colaborador" />
        </div>
      </div>

      <div v-if="tableList.length" class="max-h-[420px] overflow-auto">
        <table class="w-full text-left text-sm">
          <thead class="sticky top-0 z-10 bg-white dark:bg-zinc-900">
            <tr class="border-b border-zinc-100 text-xs uppercase tracking-wide text-zinc-400 dark:border-zinc-800 dark:text-zinc-400">
              <th class="px-5 py-3 font-semibold">Colaborador</th>
              <th class="px-5 py-3 font-semibold">Setor</th>
              <th class="px-5 py-3 font-semibold">Filial</th>
              <th class="px-5 py-3 font-semibold">Usuário</th>
              <th class="px-5 py-3 font-semibold">Status</th>
              <th class="px-5 py-3 font-semibold">Tipo</th>
              <th class="px-5 py-3 font-semibold">Entrada</th>
              <th class="px-5 py-3 font-semibold">Registro</th>
              <th class="px-5 py-3 font-semibold">Última atualização</th>
              <th class="px-5 py-3 font-semibold">Turnover</th>
              <th class="px-5 py-3"></th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="e in tableList" :key="e.id" class="border-b border-zinc-100 last:border-0 dark:border-zinc-800">
              <td class="px-5 py-3 font-medium text-zinc-900 dark:text-zinc-100">{{ e.name }}</td>
              <td class="px-5 py-3 text-zinc-600 dark:text-zinc-300">{{ e.sector }}</td>
              <td class="px-5 py-3">
                <Badge v-if="e.filialId && getBranchById(e.filialId)" tone="muted">{{ getBranchById(e.filialId).shortName }}</Badge>
                <span v-else>—</span>
              </td>
              <td class="px-5 py-3 text-zinc-600 dark:text-zinc-300">{{ e.user }}</td>
              <td class="px-5 py-3"><Badge :tone="statusTone(e.status)">{{ STATUS_LABELS[e.status] || e.status }}</Badge></td>
              <td class="px-5 py-3 text-zinc-600 dark:text-zinc-300">{{ TYPE_LABELS[e.type] || e.type }}</td>
              <td class="px-5 py-3 text-zinc-600 dark:text-zinc-300">{{ e.hiredAt ? formatDate(e.hiredAt) : "—" }}</td>
              <td class="px-5 py-3 text-zinc-600 dark:text-zinc-300">{{ formatDateTime(e.createdAt) }}</td>
              <td class="px-5 py-3 text-zinc-600 dark:text-zinc-300">{{ formatDateTime(e.updatedAt) }}</td>
              <td class="px-5 py-3">
                <span v-if="e.countsTurnover" class="text-green-600 dark:text-green-400" title="Conta no turnover">✓</span>
                <span v-else>—</span>
              </td>
              <td class="px-5 py-3 text-right">
                <div class="flex justify-end gap-2">
                  <button type="button" class="btn-ghost-sm" @click="edit(e.id)">Editar</button>
                  <button type="button" class="icon-btn-sm" aria-label="Excluir colaborador" @click="handleDelete(e.id)">&times;</button>
                </div>
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <div v-else class="p-5">
        <EmptyState
          title="Nenhum colaborador cadastrado"
          text="Preencha o formulário acima para começar a montar sua equipe."
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
