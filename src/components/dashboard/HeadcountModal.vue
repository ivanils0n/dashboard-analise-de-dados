<script setup>
import { ref, reactive, computed, watch } from "vue";
import Modal from "@/components/ui/Modal.vue";
import Badge from "@/components/ui/Badge.vue";
import EmptyState from "@/components/ui/EmptyState.vue";
import { STATES, STATE_NAMES, DEFAULT_STATE, PERSONNEL_COST_FIELDS } from "@/lib/config";
import { listEmployees, listDepartments, saveEmployee, employeeMonthlyCost, moneyOrNull } from "@/lib/employees";
import { getBranchById, getEmployeeById, getLatestForMeta, addEntry, updateEntry, removeEntry } from "@/lib/store";
import { hydrateState } from "@/lib/supabase";
import { formatCurrency, todayISO, normalizeText } from "@/lib/utils";
import { useFilters } from "@/composables/useFilters";
import { useToast } from "@/composables/useToast";
import { canEditData } from "@/lib/auth";

const props = defineProps({
  open: { type: Boolean, default: false }
});
const emit = defineEmits(["close"]);

const { state: filters } = useFilters();
const { show: toast } = useToast();
const canEdit = canEditData();

/* Filtros locais: a tabela só carrega após "Buscar colaboradores". */
const applied = ref(false);
const form = reactive({
  estado: filters.current !== "todos" ? filters.current : DEFAULT_STATE,
  department: "todos",
  search: ""
});

const depOptions = computed(() => listDepartments(form.estado));

watch(
  () => form.estado,
  async (state) => {
    form.department = "todos";
    applied.value = false;
    try {
      await hydrateState(state === "todos" ? "todos" : state);
    } catch (err) {
      console.warn("[HeadcountModal] Falha ao carregar dados do estado:", err);
    }
  }
);

watch(
  () => [form.department, form.search],
  () => {
    applied.value = false;
  }
);

function apply() {
  applied.value = true;
}

function clearFilters() {
  form.estado = filters.current !== "todos" ? filters.current : DEFAULT_STATE;
  form.department = "todos";
  form.search = "";
  applied.value = false;
}

/* Headcount = colaboradores ativos. */
const rows = computed(() => {
  if (!applied.value) return [];
  let list = listEmployees(form.estado).filter((e) => e.status === "ativo");

  if (form.department !== "todos") {
    list = list.filter((e) => e.departmentId === form.department);
  }

  const q = normalizeText(form.search).trim();
  if (q) {
    list = list.filter((e) => {
      const filial = e.filialId ? getBranchById(e.filialId) : null;
      const filialText = filial ? `${filial.shortName} ${filial.name}` : "";
      return normalizeText(`${e.name} ${e.sector} ${e.user} ${filialText}`).includes(q);
    });
  }

  return list.slice().sort((a, b) => (a.name || "").localeCompare(b.name || ""));
});

const totalSalaries = computed(() =>
  rows.value.reduce((sum, e) => sum + (e.salario != null ? Number(e.salario) : 0), 0)
);

/* Custo mensal total = salário + benefícios/encargos/premiações/comissão. */
const totalMonthly = computed(() => rows.value.reduce((sum, e) => sum + employeeMonthlyCost(e), 0));

const employeesWithSalary = computed(() => rows.value.filter((e) => e.salario != null).length);

function branchShort(employee) {
  if (!employee.filialId) return "";
  const b = getBranchById(employee.filialId);
  return b ? b.shortName : "";
}

/* ---------- Detalhe dos custos de pessoal por colaborador ---------- */

const detailEmployeeId = ref(null);
const detail = reactive({ salario: "" });
PERSONNEL_COST_FIELDS.forEach((f) => {
  detail[f.key] = "";
});

const costRows = computed(() => [
  { key: "salario", label: "Salário (base)" },
  ...PERSONNEL_COST_FIELDS
]);

const detailEmployee = computed(() =>
  detailEmployeeId.value ? getEmployeeById(detailEmployeeId.value) : null
);

function parseAmount(value) {
  if (value === undefined || value === null || value === "") return null;
  const num = Number(value);
  return isNaN(num) ? null : num;
}

const detailTotal = computed(() => {
  if (!detailEmployee.value) return 0;
  let sum = 0;
  costRows.value.forEach((f) => {
    const v = detail[f.key];
    if (v !== "" && v !== null && v !== undefined && !isNaN(Number(v))) sum += Number(v);
  });
  return sum;
});

const detailOpen = computed(() => !!detailEmployee.value);

function openDetail(employee) {
  if (!employee) return;
  detailEmployeeId.value = employee.id;
  detail.salario = employee.salario != null ? String(employee.salario) : "";
  PERSONNEL_COST_FIELDS.forEach((f) => {
    const v = employee[f.key];
    detail[f.key] = v != null && v !== "" ? String(v) : "";
  });
}

function closeDetail() {
  detailEmployeeId.value = null;
}

function saveDetail() {
  const emp = detailEmployee.value;
  if (!emp) return;

  const data = { id: emp.id };
  costRows.value.forEach((f) => {
    data[f.key] = f.key === "salario" ? parseAmount(detail[f.key]) : moneyOrNull(detail[f.key]);
  });
  saveEmployee(data);

  /* Mantém o lançamento do salário sincronizado (exibido em "Lançamentos
     recentes"), seguindo o mesmo comportamento do Lançar dados. */
  const salaryEntry = getLatestForMeta("salario_colaborador", "employeeId", emp.id);
  if (data.salario != null) {
    if (salaryEntry) {
      updateEntry("salario_colaborador", salaryEntry.id, { value: data.salario, date: todayISO() });
    } else {
      addEntry("salario_colaborador", {
        date: todayISO(),
        value: data.salario,
        state: emp.estado || null,
        meta: { employeeId: emp.id, employeeName: emp.name }
      });
    }
  } else if (salaryEntry) {
    removeEntry("salario_colaborador", salaryEntry.id);
  }

  toast(`Custos de pessoal atualizados para ${emp.name}.`);
  closeDetail();
}

function close() {
  emit("close");
}
</script>

<template>
  <Modal
    title="Headcount — Custo de pessoal dos Colaboradores"
    subtitle="Clique em um colaborador para ver e editar os custos mensais de pessoal (salário, benefícios, encargos, premiações e comissão)"
    :open="open"
    max-width="max-w-4xl"
    @close="close"
  >
    <!-- Filtros -->
    <div class="grid gap-3 sm:grid-cols-2">
      <div class="flex flex-col gap-1.5">
        <label class="text-sm font-medium text-zinc-700 dark:text-zinc-200">Estado</label>
        <select v-model="form.estado" class="input-field">
          <option value="todos">Todos Estados</option>
          <option v-for="s in STATES" :key="s" :value="s">{{ s }} — {{ STATE_NAMES[s] }}</option>
        </select>
      </div>

      <div class="flex flex-col gap-1.5">
        <label class="text-sm font-medium text-zinc-700 dark:text-zinc-200">Departamento</label>
        <select v-model="form.department" class="input-field">
          <option value="todos">Departamentos: Todos</option>
          <option v-for="d in depOptions" :key="d.id" :value="d.id">{{ d.name }}</option>
        </select>
      </div>
    </div>

    <div class="mt-3 flex flex-wrap items-center gap-2">
      <input
        v-model="form.search"
        type="search"
        class="input-field flex-1"
        placeholder="Buscar por nome, setor, usuário ou filial..."
      />
      <button type="button" class="btn-primary" @click="apply">Buscar colaboradores</button>
      <button type="button" class="btn-ghost" @click="clearFilters">Limpar</button>
    </div>

    <!-- Indicador em destaque -->
    <div
      v-if="rows.length"
      class="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-accent/25 bg-accent/5 p-4 dark:border-red-500/25 dark:bg-red-500/10"
    >
      <div>
        <p class="text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
          Custo mensal total de pessoal
        </p>
        <p class="text-3xl font-bold text-zinc-900 tabular-nums dark:text-zinc-100">{{ formatCurrency(totalMonthly) }}</p>
      </div>
      <div class="text-right text-xs text-zinc-500 dark:text-zinc-400">
        <p>{{ rows.length }} colaborador(es) ativo(s) na seleção</p>
        <p>Salários somam {{ formatCurrency(totalSalaries) }} · {{ employeesWithSalary }} com salário lançado</p>
        <p class="mt-1">Clique em um colaborador para detalhar os custos de pessoal.</p>
      </div>
    </div>

    <!-- Tabela -->
    <div v-if="rows.length" class="mt-4 overflow-hidden rounded-xl border border-zinc-200 dark:border-zinc-800">
      <div class="max-h-80 overflow-y-auto">
        <table class="w-full text-left text-sm">
          <thead class="sticky top-0 z-10 bg-white dark:bg-zinc-900">
            <tr class="border-b border-zinc-100 text-xs uppercase tracking-wide text-zinc-400 dark:border-zinc-800 dark:text-zinc-400">
              <th class="px-4 py-2.5 font-semibold">Colaborador</th>
              <th class="px-4 py-2.5 font-semibold">Setor</th>
              <th class="px-4 py-2.5 font-semibold">Filial</th>
              <th class="px-4 py-2.5 text-right font-semibold">Salário</th>
              <th class="px-4 py-2.5 text-right font-semibold">Custo mensal</th>
              <th class="px-4 py-2.5"></th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="e in rows"
              :key="e.id"
              class="cursor-pointer border-b border-zinc-100 transition last:border-0 hover:bg-zinc-50 dark:border-zinc-800 dark:hover:bg-zinc-800/60"
              @click="openDetail(e)"
            >
              <td class="px-4 py-2.5 font-medium text-zinc-900 dark:text-zinc-100">{{ e.name }}</td>
              <td class="px-4 py-2.5 text-zinc-600 dark:text-zinc-300">{{ e.sector }}</td>
              <td class="px-4 py-2.5">
                <Badge v-if="branchShort(e)" tone="muted">{{ branchShort(e) }}</Badge>
                <span v-else>—</span>
              </td>
              <td class="px-4 py-2.5 text-right font-medium tabular-nums text-zinc-900 dark:text-zinc-100">
                {{ e.salario != null ? formatCurrency(e.salario) : "—" }}
              </td>
              <td class="px-4 py-2.5 text-right font-medium tabular-nums text-zinc-900 dark:text-zinc-100">
                {{ employeeMonthlyCost(e) > 0 ? formatCurrency(employeeMonthlyCost(e)) : "—" }}
              </td>
              <td class="px-4 py-2.5 text-right text-zinc-400 dark:text-zinc-500">
                <span class="text-xs font-medium text-accent-hover dark:text-red-400">Custos</span>
                <span class="ml-1" aria-hidden="true">→</span>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
      <div class="border-t border-zinc-100 px-4 py-2 text-xs text-zinc-400 dark:border-zinc-800 dark:text-zinc-400">
        {{ rows.length === 1 ? "1 colaborador" : `${rows.length} colaboradores` }}
      </div>
    </div>

    <div v-else-if="applied" class="mt-2">
      <EmptyState
        title="Nenhum colaborador ativo encontrado"
        text="Ajuste os filtros e clique em “Buscar colaboradores” novamente."
      />
    </div>

    <div v-else class="mt-2">
      <EmptyState
        title="Aguardando filtros"
        text="Selecione estado e departamento (opcionais) e clique em “Buscar colaboradores” para carregar os custos de pessoal."
      />
    </div>

    <!-- ===== Detalhe dos custos de pessoal do colaborador ===== -->
    <Teleport to="body">
      <div
        v-if="detailOpen && detailEmployee"
        class="fixed inset-0 z-[80] flex items-start justify-center overflow-y-auto bg-black/50 p-4 py-10"
        @click.self="closeDetail"
      >
        <form class="slide-up w-full max-w-2xl rounded-2xl border border-zinc-200 bg-white shadow-2xl dark:border-zinc-800 dark:bg-zinc-900" novalidate @submit.prevent="saveDetail">
          <div class="flex items-start justify-between gap-4 border-b border-zinc-100 px-6 py-4 dark:border-zinc-800">
            <div>
              <h3 class="text-lg font-bold text-zinc-900 dark:text-zinc-100">Custos de pessoal</h3>
              <p class="mt-0.5 text-sm text-zinc-500 dark:text-zinc-400">
                {{ detailEmployee.name }} · {{ detailEmployee.cargo || detailEmployee.sector }}
              </p>
            </div>
            <button type="button" class="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-xl leading-none text-zinc-400 transition hover:bg-zinc-100 hover:text-zinc-700 dark:hover:bg-zinc-800 dark:hover:text-zinc-200" aria-label="Fechar" @click="closeDetail">&times;</button>
          </div>

          <div class="flex flex-col gap-4 px-6 py-5">
            <div class="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-accent/25 bg-accent/5 p-4 dark:border-red-500/25 dark:bg-red-500/10">
              <div>
                <p class="text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
                  Custo mensal de pessoal
                </p>
                <p class="text-3xl font-bold tabular-nums text-zinc-900 dark:text-zinc-100">{{ formatCurrency(detailTotal) }}</p>
              </div>
              <div class="text-right text-xs text-zinc-500 dark:text-zinc-400">
                <p><Badge v-if="branchShort(detailEmployee)" tone="muted">{{ branchShort(detailEmployee) }}</Badge></p>
                <p>{{ detailEmployee.user }} · {{ detailEmployee.estado || "—" }}</p>
              </div>
            </div>

            <div class="grid gap-x-4 gap-y-3 sm:grid-cols-2">
              <div v-for="f in costRows" :key="f.key" class="flex flex-col gap-1.5">
                <label :for="`cost-${f.key}`" class="text-sm font-medium text-zinc-700 dark:text-zinc-200">{{ f.label }} (R$)</label>
                <input
                  :id="`cost-${f.key}`"
                  v-model="detail[f.key]"
                  type="number"
                  min="0"
                  step="any"
                  class="input-field"
                  :disabled="!canEdit"
                  placeholder="0,00"
                />
              </div>
            </div>

            <p v-if="!canEdit" class="text-xs text-zinc-500 dark:text-zinc-400">
              Seu perfil tem acesso somente leitura — os valores aparecem para consulta.
            </p>
          </div>

          <div class="flex justify-end gap-2 border-t border-zinc-100 px-6 py-4 dark:border-zinc-800">
            <button type="button" class="btn-ghost" @click="closeDetail">Cancelar</button>
            <button v-if="canEdit" type="submit" class="btn-primary">Salvar custos</button>
          </div>
        </form>
      </div>
    </Teleport>
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
.input-field:disabled {
  cursor: default;
  background-color: rgb(244 244 245);
}
:global(.dark) .input-field {
  border-color: rgb(63 63 70);
  background-color: rgb(9 9 11);
  color: rgb(244 244 245);
}
:global(.dark) .input-field:disabled {
  background-color: rgb(39 39 42);
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
</style>
