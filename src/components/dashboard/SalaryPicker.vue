<script setup>
import { ref, reactive, computed, watch } from "vue";
import { STATES, STATE_NAMES, STATUS_LABELS, TYPE_LABELS } from "@/lib/config";
import { listEmployees, listDepartments, syncAll } from "@/lib/employees";
import { getDepartmentById, getBranchById } from "@/lib/store";
import { hydrateState } from "@/lib/db";
import { formatDate, formatCurrency, normalizeText } from "@/lib/utils";
import Badge from "@/components/ui/Badge.vue";
import EmptyState from "@/components/ui/EmptyState.vue";

const props = defineProps({
  defaultState: { type: String, default: "RO" },
  helper: { type: String, default: "" }
});

const emit = defineEmits(["select"]);

/* Tabela espelhada na aba Equipe: inicia vazia e só carrega após aplicar filtros. */
const applied = ref(false);
const form = reactive({
  estado: props.defaultState,
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
      console.warn("[SalaryPicker] Falha ao carregar dados do estado:", err);
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
  form.estado = props.defaultState;
  form.department = "todos";
  form.search = "";
  applied.value = false;
}

function branchShort(employee) {
  if (!employee.filialId) return "";
  const b = getBranchById(employee.filialId);
  return b ? b.shortName : "";
}

const results = computed(() => {
  if (!applied.value) return [];
  let list = listEmployees(form.estado);

  if (form.department !== "todos") {
    const dep = getDepartmentById(form.department);
    const depName = dep ? dep.name : null;
    list = list.filter(
      (e) => e.departmentId === form.department || (depName && e.sector === depName)
    );
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

function statusTone(status) {
  return status === "desligado" ? "dark" : status === "afastado" ? "muted" : "default";
}
</script>

<template>
  <div class="flex flex-col gap-3">
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

    <div class="flex flex-wrap items-center gap-2">
      <input
        v-model="form.search"
        type="search"
        class="input-field flex-1"
        placeholder="Buscar por nome, setor, usuário ou filial..."
      />
      <button type="button" class="btn-primary" @click="apply">Buscar colaboradores</button>
      <button type="button" class="btn-ghost" @click="clearFilters">Limpar</button>
    </div>

    <p v-if="helper" class="text-xs text-zinc-500 dark:text-zinc-400">{{ helper }}</p>

    <!-- Tabela (espelha a aba Equipe) -->
    <div v-if="results.length" class="overflow-x-auto rounded-xl border border-zinc-200 dark:border-zinc-800">
      <table class="w-full text-left text-sm">
        <thead class="bg-white dark:bg-zinc-900">
          <tr class="border-b border-zinc-100 text-xs uppercase tracking-wide text-zinc-400 dark:border-zinc-800 dark:text-zinc-400">
            <th class="px-4 py-2.5 font-semibold">Colaborador</th>
            <th class="px-4 py-2.5 font-semibold">Setor</th>
            <th class="px-4 py-2.5 font-semibold">Filial</th>
            <th class="px-4 py-2.5 font-semibold">Usuário</th>
            <th class="px-4 py-2.5 font-semibold">Status</th>
            <th class="px-4 py-2.5 font-semibold">Tipo</th>
            <th class="px-4 py-2.5 font-semibold">Entrada</th>
            <th class="px-4 py-2.5 text-right font-semibold">Salário (R$)</th>
            <th class="px-4 py-2.5"></th>
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="e in results"
            :key="e.id"
            class="cursor-pointer border-b border-zinc-100 transition last:border-0 hover:bg-zinc-50 dark:border-zinc-800 dark:hover:bg-zinc-800/60"
            @click="emit('select', e)"
          >
            <td class="px-4 py-2.5 font-medium whitespace-nowrap text-zinc-900 dark:text-zinc-100">{{ e.name }}</td>
            <td class="px-4 py-2.5 whitespace-nowrap text-zinc-600 dark:text-zinc-300">{{ e.sector }}</td>
            <td class="px-4 py-2.5">
              <Badge v-if="branchShort(e)" tone="muted">{{ branchShort(e) }}</Badge>
              <span v-else>—</span>
            </td>
            <td class="px-4 py-2.5 whitespace-nowrap text-zinc-600 dark:text-zinc-300">{{ e.user }}</td>
            <td class="px-4 py-2.5"><Badge :tone="statusTone(e.status)">{{ STATUS_LABELS[e.status] || e.status }}</Badge></td>
            <td class="px-4 py-2.5 whitespace-nowrap text-zinc-600 dark:text-zinc-300">{{ TYPE_LABELS[e.type] || e.type }}</td>
            <td class="px-4 py-2.5 whitespace-nowrap text-zinc-600 dark:text-zinc-300">{{ e.hiredAt ? formatDate(e.hiredAt) : "—" }}</td>
            <td class="px-4 py-2.5 text-right font-medium tabular-nums whitespace-nowrap text-zinc-900 dark:text-zinc-100">
              {{ e.salario != null ? formatCurrency(e.salario) : "—" }}
            </td>
            <td class="px-4 py-2.5 text-right text-zinc-400 dark:text-zinc-500">
              <span class="text-xs font-medium text-accent-hover dark:text-accent-light">Editar</span>
              <span class="ml-1" aria-hidden="true">→</span>
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <div v-else-if="applied">
      <EmptyState
        title="Nenhum colaborador encontrado"
        text="Ajuste os filtros e clique em “Buscar colaboradores” novamente."
      />
    </div>

    <div v-else>
      <EmptyState
        title="Aguardando filtros"
        text="Selecione estado e departamento (opcionais) e clique em “Buscar colaboradores” para carregar a lista da equipe."
      />
    </div>
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
</style>
