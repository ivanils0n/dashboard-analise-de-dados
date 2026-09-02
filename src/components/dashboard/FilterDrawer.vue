<script setup>
import { reactive, watch } from "vue";
import { STATES, STATE_NAMES } from "@/lib/config";
import { useFilterDrawer } from "@/composables/useFilterDrawer";
import { useFilters } from "@/composables/useFilters";
import { useDateFilter, dateFilter } from "@/composables/useDateFilter";
import { useEquipeFilters, equipeFilter } from "@/composables/useEquipeFilters";
import { listDepartments } from "@/lib/employees";
import { firstDayOfMonthISO, lastDayOfMonthISO } from "@/lib/utils";

const props = defineProps({
  page: { type: String, default: "dashboard" } // "dashboard" | "equipe"
});

const emit = defineEmits(["applied"]);

const { state: drawer, closeDrawer } = useFilterDrawer();
const { state: filters, setState } = useFilters();
const { reset: resetDateFilter } = useDateFilter();
const { reset: resetEquipeFilter } = useEquipeFilters();

const form = reactive({
  estado: "",
  start: "",
  end: "",
  status: "todos",
  department: "todos",
  search: ""
});

const departments = reactive({ list: [] });

function syncDepartments() {
  departments.list = listDepartments(form.estado === "todos" ? filters.current : form.estado);
}

watch(
  () => drawer.open,
  (open) => {
    if (!open) return;
    form.estado = filters.current;
    if (props.page === "dashboard") {
      form.start = dateFilter.start;
      form.end = dateFilter.end;
      form.search = "";
    } else {
      form.start = equipeFilter.start;
      form.end = equipeFilter.end;
      form.status = equipeFilter.status;
      form.department = equipeFilter.department;
      form.search = equipeFilter.search;
    }
    syncDepartments();
  }
);

watch(
  () => form.estado,
  () => syncDepartments()
);

function apply() {
  if (form.estado !== filters.current) setState(form.estado);

  if (props.page === "dashboard") {
    dateFilter.start = form.start;
    dateFilter.end = form.end;
  } else {
    equipeFilter.start = form.start;
    equipeFilter.end = form.end;
    equipeFilter.status = form.status;
    equipeFilter.department = form.department;
    equipeFilter.search = form.search;
  }

  closeDrawer();
  emit("applied");
}

function clearAll() {
  form.estado = "RO";
  form.start = firstDayOfMonthISO();
  form.end = lastDayOfMonthISO();
  form.status = "todos";
  form.department = "todos";
  form.search = "";
  syncDepartments();
  apply();
}

function onBackdrop() {
  closeDrawer();
}
</script>

<template>
  <Teleport to="body">
    <div
      v-if="drawer.open"
      class="fixed inset-0 z-50 bg-black/40"
      @click="onBackdrop"
    ></div>
    <div
      v-if="drawer.open"
      class="fixed right-0 top-0 z-50 flex h-full w-full max-w-sm flex-col border-l border-zinc-200 bg-white shadow-2xl dark:border-zinc-800 dark:bg-zinc-900"
      role="dialog"
      aria-modal="true"
      aria-label="Filtros"
    >
      <div class="flex items-center justify-between border-b border-zinc-100 px-5 py-4 dark:border-zinc-800">
        <h2 class="text-lg font-bold text-zinc-900 dark:text-zinc-100">Filtros</h2>
        <button
          type="button"
          class="flex h-8 w-8 items-center justify-center rounded-lg text-xl leading-none text-zinc-400 transition hover:bg-zinc-100 hover:text-zinc-700 dark:hover:bg-zinc-800 dark:hover:text-zinc-200"
          aria-label="Fechar filtros"
          @click="closeDrawer"
        >
          &times;
        </button>
      </div>

      <div class="flex flex-1 flex-col gap-4 overflow-y-auto px-5 py-4">
        <div class="flex flex-col gap-1.5">
          <label class="text-sm font-medium text-zinc-700 dark:text-zinc-200">Estado</label>
          <select v-model="form.estado" class="input-field">
            <option value="todos">Todos Estados</option>
            <option v-for="s in STATES" :key="s" :value="s">{{ s }} — {{ STATE_NAMES[s] }}</option>
          </select>
        </div>

        <div class="flex flex-col gap-1.5">
          <label class="text-sm font-medium text-zinc-700 dark:text-zinc-200">Período</label>
          <div class="flex items-center gap-2">
            <input v-model="form.start" type="date" class="input-field flex-1" aria-label="Data início" />
            <span class="text-sm text-zinc-500 dark:text-zinc-400">até</span>
            <input v-model="form.end" type="date" class="input-field flex-1" aria-label="Data fim" />
          </div>
        </div>

        <div v-if="page === 'equipe'" class="flex flex-col gap-1.5">
          <label class="text-sm font-medium text-zinc-700 dark:text-zinc-200">Status</label>
          <select v-model="form.status" class="input-field">
            <option value="todos">Status: Todos</option>
            <option value="ativo">Status: Ativos</option>
            <option value="desligado">Status: Desligados</option>
            <option value="afastado">Status: Afastados</option>
          </select>
        </div>

        <div v-if="page === 'equipe'" class="flex flex-col gap-1.5">
          <label class="text-sm font-medium text-zinc-700 dark:text-zinc-200">Departamento</label>
          <select v-model="form.department" class="input-field">
            <option value="todos">Departamentos: Todos</option>
            <option v-for="d in departments.list" :key="d.id" :value="d.id">{{ d.name }}</option>
          </select>
        </div>

        <div class="flex flex-col gap-1.5">
          <label class="text-sm font-medium text-zinc-700 dark:text-zinc-200">Buscar</label>
          <input v-model="form.search" type="search" class="input-field" placeholder="Buscar..." aria-label="Buscar" />
        </div>
      </div>

      <div class="flex justify-end gap-2 border-t border-zinc-100 px-5 py-4 dark:border-zinc-800">
        <button type="button" class="btn-ghost" @click="clearAll">Limpar filtros</button>
        <button type="button" class="btn-primary" @click="apply">Aplicar filtros</button>
      </div>
    </div>
  </Teleport>
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
