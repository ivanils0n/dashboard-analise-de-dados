<script setup>
import { ref, reactive, computed, watch } from "vue";
import Modal from "@/components/ui/Modal.vue";
import Badge from "@/components/ui/Badge.vue";
import EmptyState from "@/components/ui/EmptyState.vue";
import { STATES, STATE_NAMES, DEFAULT_STATE } from "@/lib/config";
import { listEmployees, listDepartments, syncAll } from "@/lib/employees";
import { getBranchById } from "@/lib/store";
import { hydrateState } from "@/lib/supabase";
import { formatCurrency } from "@/lib/utils";
import { useFilters } from "@/composables/useFilters";

const props = defineProps({
  open: { type: Boolean, default: false }
});
const emit = defineEmits(["close"]);

const { state: filters } = useFilters();

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
      syncAll();
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

  const q = form.search.trim().toLowerCase();
  if (q) {
    list = list.filter((e) => {
      const filial = e.filialId ? getBranchById(e.filialId) : null;
      const filialText = filial ? `${filial.shortName} ${filial.name}` : "";
      return `${e.name} ${e.sector} ${e.user} ${filialText}`.toLowerCase().includes(q);
    });
  }

  return list.slice().sort((a, b) => (a.name || "").localeCompare(b.name || ""));
});

const totalSalaries = computed(() =>
  rows.value.reduce((sum, e) => sum + (e.salario != null ? Number(e.salario) : 0), 0)
);

const employeesWithSalary = computed(() => rows.value.filter((e) => e.salario != null).length);

function branchShort(employee) {
  if (!employee.filialId) return "";
  const b = getBranchById(employee.filialId);
  return b ? b.shortName : "";
}

function close() {
  emit("close");
}
</script>

<template>
  <Modal
    title="Headcount — Salários dos Colaboradores"
    subtitle="Soma total das remunerações dos colaboradores ativos por estado, departamento e busca"
    :open="open"
    max-width="max-w-3xl"
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
          Soma total dos salários
        </p>
        <p class="text-3xl font-bold text-zinc-900 tabular-nums dark:text-zinc-100">{{ formatCurrency(totalSalaries) }}</p>
      </div>
      <div class="text-right text-xs text-zinc-500 dark:text-zinc-400">
        <p>{{ employeesWithSalary }} colaborador(es) com salário lançado</p>
        <p>{{ rows.length }} colaborador(es) ativo(s) na seleção</p>
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
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="e in rows"
              :key="e.id"
              class="border-b border-zinc-100 last:border-0 dark:border-zinc-800"
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
        text="Selecione estado e departamento (opcionais) e clique em “Buscar colaboradores” para carregar os salários."
      />
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
</style>
