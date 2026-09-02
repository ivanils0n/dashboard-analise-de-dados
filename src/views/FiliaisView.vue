<script setup>
import { ref, reactive, computed } from "vue";
import Badge from "@/components/ui/Badge.vue";
import EmptyState from "@/components/ui/EmptyState.vue";
import { useToast } from "@/composables/useToast";
import { useDialog } from "@/composables/useDialog";
import { useFilters } from "@/composables/useFilters";
import { STATES } from "@/lib/config";
import { getBranches } from "@/lib/store";
import { listBranches, saveBranch, deleteBranchRecord } from "@/lib/filiais";
import { DEFAULT_STATE } from "@/lib/config";

const { show: toast } = useToast();
const { confirm } = useDialog();
const { state: filters } = useFilters();

const form = reactive({
  id: null,
  branchId: "",
  cnpj: "",
  name: "",
  shortName: "",
  manager: "",
  estado: ""
});

const search = ref("");

const tableList = computed(() => {
  const q = search.value.trim().toLowerCase();
  let list = listBranches(filters.current);
  if (q) {
    list = list.filter((b) =>
      `${b.branchId} ${b.cnpj} ${b.name} ${b.shortName} ${b.manager || ""}`.toLowerCase().includes(q)
    );
  }
  return list.slice().sort((a, b) => (b.createdAt || "").localeCompare(a.createdAt || ""));
});

const total = computed(() => listBranches(filters.current).length);
const summaryText = computed(() =>
  total.value === 0
    ? "Nenhuma filial no estado selecionado"
    : `${total.value} filial(ais) · ${filters.current === "todos" ? "todos os estados" : "estado " + filters.current}`
);

function resetForm() {
  form.id = null;
  form.branchId = "";
  form.cnpj = "";
  form.name = "";
  form.shortName = "";
  form.manager = "";
  form.estado = filters.current !== "todos" ? filters.current : DEFAULT_STATE;
}

function fillForm(branch) {
  form.id = branch.id;
  form.branchId = branch.branchId;
  form.cnpj = branch.cnpj;
  form.name = branch.name;
  form.shortName = branch.shortName;
  form.manager = branch.manager || "";
  form.estado = branch.estado || "";
}

function handleSubmit() {
  const data = {
    id: form.id || undefined,
    branchId: form.branchId.trim().toUpperCase(),
    cnpj: form.cnpj.trim(),
    name: form.name.trim(),
    shortName: form.shortName.trim().toUpperCase(),
    manager: form.manager.trim() || null,
    estado: form.estado || null
  };

  if (!data.branchId || !data.cnpj || !data.name || !data.shortName) {
    return toast("Preencha os campos obrigatórios (Id, CNPJ, Nome e Abreviado).");
  }
  if (!data.estado) return toast("Selecione o estado da filial.");

  saveBranch(data);
  resetForm();
  toast(data.id ? "Filial atualizada." : "Filial cadastrada.");
}

async function handleDelete(id) {
  const ok = await confirm({
    title: "Excluir filial?",
    message: "A filial será removida permanentemente. Essa ação não pode ser desfeita.",
    confirmText: "Excluir",
    danger: true
  });
  if (!ok) return;
  deleteBranchRecord(id);
  resetForm();
  toast("Filial excluída.");
}

function edit(id) {
  const branch = getBranches().find((b) => b.id === id);
  if (branch) fillForm(branch);
}
</script>

<template>
  <div class="fade-in">
    <!-- ===== HERO ===== -->
    <div class="mb-6 flex flex-wrap items-center justify-between gap-4">
      <h1 class="text-2xl font-bold text-zinc-900 dark:text-zinc-100">Filiais</h1>
      <Badge tone="accent">{{ total === 1 ? "1 filial" : `${total} filiais` }}</Badge>
    </div>

    <!-- ===== CADASTRO ===== -->
    <section class="rounded-2xl border border-zinc-200 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
      <div class="border-b border-zinc-100 px-5 py-4 dark:border-zinc-800">
        <h2 class="text-sm font-bold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
          {{ form.id ? "Editar filial" : "Nova filial" }}
        </h2>
        <p class="mt-0.5 text-xs text-zinc-400 dark:text-zinc-400">
          Cadastre as filiais e associe cada uma ao estado correspondente.
        </p>
      </div>
      <form class="grid gap-4 p-5 sm:grid-cols-2 lg:grid-cols-3" novalidate @submit.prevent="handleSubmit">
        <div class="flex flex-col gap-1.5">
          <label for="branchIdFilial" class="text-sm font-medium text-zinc-700 dark:text-zinc-200">Id Filial</label>
          <input id="branchIdFilial" v-model="form.branchId" type="text" class="input-field" required placeholder="Ex.: 8" />
        </div>
        <div class="flex flex-col gap-1.5">
          <label for="branchCnpj" class="text-sm font-medium text-zinc-700 dark:text-zinc-200">CNPJ Filial</label>
          <input id="branchCnpj" v-model="form.cnpj" type="text" class="input-field" required placeholder="00.000.000/0000-00" />
        </div>
        <div class="flex flex-col gap-1.5">
          <label for="branchName" class="text-sm font-medium text-zinc-700 dark:text-zinc-200">Nome Filial</label>
          <input id="branchName" v-model="form.name" type="text" class="input-field uppercase" required placeholder="Ex.: DROGARIA ULTRA POPULAR PVH1" />
        </div>
        <div class="flex flex-col gap-1.5">
          <label for="branchShort" class="text-sm font-medium text-zinc-700 dark:text-zinc-200">Filial Abreviado</label>
          <input id="branchShort" v-model="form.shortName" type="text" class="input-field uppercase" required placeholder="Ex.: PVH 1" />
        </div>
        <div class="flex flex-col gap-1.5">
          <label for="branchManager" class="text-sm font-medium text-zinc-700 dark:text-zinc-200">Gerente</label>
          <input id="branchManager" v-model="form.manager" type="text" class="input-field" placeholder="Opcional" />
        </div>
        <div class="flex flex-col gap-1.5">
          <label for="branchEstado" class="text-sm font-medium text-zinc-700 dark:text-zinc-200">Estado</label>
          <select id="branchEstado" v-model="form.estado" class="input-field">
            <option value="">—</option>
            <option v-for="s in STATES" :key="s" :value="s">{{ s }}</option>
          </select>
        </div>

        <div class="flex items-end gap-2 sm:col-span-2 lg:col-span-3">
          <button type="button" class="btn-ghost" @click="resetForm">Limpar</button>
          <button type="submit" class="btn-primary">Salvar filial</button>
        </div>
      </form>
    </section>

    <!-- ===== LISTA ===== -->
    <section class="mt-8 rounded-2xl border border-zinc-200 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
      <div class="flex flex-wrap items-center justify-between gap-3 border-b border-zinc-100 p-5 dark:border-zinc-800">
        <div>
          <h2 class="text-sm font-bold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">Filiais cadastradas</h2>
          <p class="text-xs text-zinc-400 dark:text-zinc-400">{{ summaryText }}</p>
        </div>
        <input v-model="search" type="search" class="input-sm" placeholder="Buscar filial..." aria-label="Buscar filial" />
      </div>

      <div v-if="tableList.length" class="max-h-[420px] overflow-auto">
        <table class="w-full text-left text-sm">
          <thead class="sticky top-0 z-10 bg-white dark:bg-zinc-900">
            <tr class="border-b border-zinc-100 text-xs uppercase tracking-wide text-zinc-400 dark:border-zinc-800 dark:text-zinc-400">
              <th class="px-5 py-3 font-semibold">Id</th>
              <th class="px-5 py-3 font-semibold">CNPJ</th>
              <th class="px-5 py-3 font-semibold">Nome</th>
              <th class="px-5 py-3 font-semibold">Abreviado</th>
              <th class="px-5 py-3 font-semibold">Gerente</th>
              <th class="px-5 py-3 font-semibold">Estado</th>
              <th class="px-5 py-3"></th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="b in tableList" :key="b.id" class="border-b border-zinc-100 last:border-0 dark:border-zinc-800">
              <td class="px-5 py-3 font-medium text-zinc-900 dark:text-zinc-100">{{ b.branchId }}</td>
              <td class="px-5 py-3 text-zinc-600 dark:text-zinc-300">{{ b.cnpj }}</td>
              <td class="px-5 py-3 text-zinc-600 dark:text-zinc-300">{{ b.name }}</td>
              <td class="px-5 py-3"><Badge tone="muted">{{ b.shortName }}</Badge></td>
              <td class="px-5 py-3 text-zinc-600 dark:text-zinc-300">{{ b.manager || "—" }}</td>
              <td class="px-5 py-3">
                <Badge v-if="b.estado">{{ b.estado }}</Badge>
                <span v-else>—</span>
              </td>
              <td class="px-5 py-3 text-right">
                <div class="flex justify-end gap-2">
                  <button type="button" class="btn-ghost-sm" @click="edit(b.id)">Editar</button>
                  <button type="button" class="icon-btn-sm" aria-label="Excluir filial" @click="handleDelete(b.id)">&times;</button>
                </div>
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <div v-else class="p-5">
        <EmptyState
          title="Nenhuma filial cadastrada"
          text="Preencha o formulário acima para cadastrar sua primeira filial."
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
