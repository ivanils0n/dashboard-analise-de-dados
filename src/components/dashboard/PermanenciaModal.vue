<script setup>
import { reactive, computed, ref, watch } from "vue";
import Modal from "@/components/ui/Modal.vue";
import EmptyState from "@/components/ui/EmptyState.vue";
import { STATES, STATE_NAMES, DEFAULT_STATE } from "@/lib/config";
import {
  listPermanenciaRecords,
  addPermanenciaRecord,
  updatePermanenciaRecord,
  deletePermanenciaRecord,
  deletePermanenciaRecords
} from "@/lib/employees";
import { getBranchById } from "@/lib/store";
import {
  readWorkbookFile,
  parsePermanenciaSheet,
  downloadPermanenciaTemplate,
  exportPermanencia
} from "@/lib/export";
import { hydrateState } from "@/lib/db";
import { formatDate, daysBetween, normalizeText } from "@/lib/utils";
import { useFilters } from "@/composables/useFilters";
import { useToast } from "@/composables/useToast";
import { useDialog } from "@/composables/useDialog";
import { canEditData } from "@/lib/auth";

const props = defineProps({
  open: { type: Boolean, default: false }
});
const emit = defineEmits(["close"]);

const { state: filters } = useFilters();
const { show: toast } = useToast();
const { confirm } = useDialog();
const canEdit = canEditData();

function close() {
  emit("close");
}

/* ---------- Formulário (Novo/Editar) ---------- */
const showForm = ref(false);
const editingId = ref(null);
const form = reactive({
  colaborador: "",
  dataAdmissao: "",
  dataDemissao: "",
  estado: filters.current !== "todos" ? filters.current : DEFAULT_STATE
});

function resetForm() {
  editingId.value = null;
  form.colaborador = "";
  form.dataAdmissao = "";
  form.dataDemissao = "";
  form.estado = filters.current !== "todos" ? filters.current : DEFAULT_STATE;
}

function openNewForm() {
  resetForm();
  showForm.value = true;
}

function editRecord(p) {
  editingId.value = p.id;
  form.colaborador = p.colaborador || "";
  form.dataAdmissao = p.dataAdmissao ? String(p.dataAdmissao).slice(0, 10) : "";
  form.dataDemissao = p.dataDemissao ? String(p.dataDemissao).slice(0, 10) : "";
  form.estado = p.estado || DEFAULT_STATE;
  showForm.value = true;
}

function submitForm() {
  const nome = form.colaborador.trim();
  if (!nome) return toast("Informe o colaborador.");
  if (!form.dataAdmissao) return toast("Informe a data de admissão.");
  if (!form.dataDemissao) return toast("Informe a data de demissão.");
  const payload = {
    colaborador: nome,
    dataAdmissao: form.dataAdmissao,
    dataDemissao: form.dataDemissao,
    estado: form.estado
  };
  if (editingId.value) {
    updatePermanenciaRecord(editingId.value, payload);
    toast("Registro atualizado.");
  } else {
    addPermanenciaRecord(payload);
    toast(`Registro lançado para ${nome}.`);
  }
  resetForm();
  showForm.value = false;
}

async function removeRecord(id) {
  const ok = await confirm({
    title: "Excluir registro?",
    message: "O registro de permanência será removido permanentemente.",
    confirmText: "Excluir",
    danger: true
  });
  if (!ok) return;
  deletePermanenciaRecord(id);
  toast("Registro excluído.");
}

/* ---------- Filtros / lista ---------- */
const search = ref("");

const list = computed(() => listPermanenciaRecords(filters.current));

const filteredList = computed(() => {
  const q = normalizeText(search.value).trim();
  if (!q) return list.value;
  return list.value.filter((p) => normalizeText([p.colaborador, p.estado || ""].join(" ")).includes(q));
});

function recordDays(p) {
  if (!p.dataAdmissao || !p.dataDemissao) return null;
  return daysBetween(p.dataAdmissao, p.dataDemissao);
}

const avgDays = computed(() => {
  const withDays = filteredList.value.map(recordDays).filter((d) => d !== null && !isNaN(d));
  if (!withDays.length) return null;
  return withDays.reduce((a, b) => a + b, 0) / withDays.length;
});

function recordFilial(p) {
  const b = p && p.filialId ? getBranchById(p.filialId) : null;
  return b ? b.shortName || b.name : "";
}

/* ---------- Seleção múltipla ---------- */
const selectedIds = ref(new Set());

const selectedRows = computed(() => filteredList.value.filter((p) => selectedIds.value.has(p.id)));
const allVisibleSelected = computed(
  () => filteredList.value.length > 0 && filteredList.value.every((p) => selectedIds.value.has(p.id))
);

function toggleRow(id) {
  const next = new Set(selectedIds.value);
  if (next.has(id)) next.delete(id);
  else next.add(id);
  selectedIds.value = next;
}

function toggleSelectAll() {
  if (allVisibleSelected.value) selectedIds.value = new Set();
  else selectedIds.value = new Set(filteredList.value.map((p) => p.id));
}

async function handleBulkDelete() {
  const rows = selectedRows.value;
  const n = rows.length;
  if (!n) return;
  const ok = await confirm({
    title: `Excluir ${n} registro(s)?`,
    message: "Os registros selecionados serão removidos permanentemente.",
    confirmText: `Excluir ${n}`,
    danger: true
  });
  if (!ok) return;
  deletePermanenciaRecords(rows.map((p) => p.id));
  selectedIds.value = new Set();
  toast(`${n} registro(s) excluído(s).`);
}

watch(search, () => {
  selectedIds.value = new Set();
});

/* ---------- Importação por planilha ---------- */
const importInput = ref(null);

function sheetToUse(wb) {
  if (wb.Sheets["Permanência"]) return wb.Sheets["Permanência"];
  const keys = Object.keys(wb.Sheets || {});
  return keys.length ? wb.Sheets[keys[0]] : null;
}

async function onImportFile(e) {
  const file = e.target.files && e.target.files[0];
  e.target.value = "";
  if (!file) return;
  try {
    await hydrateState("todos");
    const wb = await readWorkbookFile(file);
    const sheet = sheetToUse(wb);
    const parsed = sheet ? parsePermanenciaSheet(sheet) : [];
    if (!parsed.length) {
      toast("Nenhum registro encontrado na planilha. Use o template de permanência.");
      return;
    }
    let ok = 0;
    let skipped = 0;
    parsed.forEach((row) => {
      if (!row.colaboradorText || !row.dataAdmissao || !row.dataDemissao) {
        skipped++;
        return;
      }
      const est = row.estado || (filters.current !== "todos" ? filters.current : DEFAULT_STATE);
      addPermanenciaRecord({
        colaborador: row.colaboradorText,
        dataAdmissao: String(row.dataAdmissao).slice(0, 10),
        dataDemissao: String(row.dataDemissao).slice(0, 10),
        estado: est
      });
      ok++;
    });
    toast(`Importação concluída — ${ok} registro(s) lançado(s)${skipped ? ` · ${skipped} ignorado(s)` : ""}.`);
  } catch (err) {
    console.error(err);
    toast("Não foi possível ler a planilha de permanência.");
  }
}

function handleExport() {
  if (!filteredList.value.length) return toast("Nenhum registro para exportar com os filtros atuais.");
  exportPermanencia(filteredList.value);
}
</script>

<template>
  <Modal
    title="Tempo médio de permanência"
    subtitle="Colaborador, Data de admissão e Data de demissão — usados só para o cálculo do tempo médio de permanência"
    :open="open"
    max-width="max-w-4xl"
    @close="close"
  >
    <div class="flex flex-col gap-4">
      <div class="rounded-xl border border-zinc-200 px-4 py-3 dark:border-zinc-800">
        <span class="text-xs font-semibold uppercase tracking-wide text-zinc-400">Média no filtro atual</span>
        <p class="text-2xl font-bold text-zinc-900 dark:text-zinc-100">
          {{ avgDays != null ? `${avgDays.toFixed(1)} dias` : "—" }}
        </p>
      </div>

      <div v-if="canEdit" class="rounded-xl border border-dashed border-zinc-300 p-3 dark:border-zinc-700">
        <div class="flex flex-wrap items-center justify-between gap-3">
          <div class="flex min-w-0 flex-col gap-0.5">
            <strong class="text-sm text-zinc-800 dark:text-zinc-100">Importar por planilha</strong>
            <p class="text-xs text-zinc-500 dark:text-zinc-400">
              Colunas: Colaborador · Data de admissão · Data de demissão · Estado.
            </p>
          </div>
          <div class="flex flex-wrap gap-2">
            <button type="button" class="btn-ghost btn-sm" @click="downloadPermanenciaTemplate">Baixar template</button>
            <button type="button" class="btn-primary btn-sm" @click="importInput?.click()">Importar planilha</button>
            <input ref="importInput" type="file" hidden accept=".xlsx,.xls,.csv" @change="onImportFile" />
          </div>
        </div>
      </div>

      <div v-if="canEdit && showForm" class="rounded-xl border border-zinc-200 p-3 dark:border-zinc-800">
        <div class="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div class="flex flex-col gap-1.5 lg:col-span-2">
            <label class="text-sm font-medium text-zinc-700 dark:text-zinc-200">Colaborador</label>
            <input v-model="form.colaborador" type="text" class="input-field" placeholder="Nome do colaborador" />
          </div>
          <div class="flex flex-col gap-1.5">
            <label class="text-sm font-medium text-zinc-700 dark:text-zinc-200">Data de admissão</label>
            <input v-model="form.dataAdmissao" type="date" class="input-field" />
          </div>
          <div class="flex flex-col gap-1.5">
            <label class="text-sm font-medium text-zinc-700 dark:text-zinc-200">Data de demissão</label>
            <input v-model="form.dataDemissao" type="date" class="input-field" />
          </div>
          <div class="flex flex-col gap-1.5">
            <label class="text-sm font-medium text-zinc-700 dark:text-zinc-200">Estado</label>
            <select v-model="form.estado" class="input-field">
              <option v-for="s in STATES" :key="s" :value="s">{{ s }} — {{ STATE_NAMES[s] }}</option>
            </select>
          </div>
        </div>
        <div class="mt-3 flex flex-wrap gap-2">
          <button type="button" class="btn-primary btn-sm" @click="submitForm">
            {{ editingId ? "Salvar alterações" : "+ Lançar registro" }}
          </button>
          <button type="button" class="btn-ghost btn-sm" @click="showForm = false">Cancelar</button>
        </div>
      </div>

      <div class="flex flex-wrap items-center gap-2">
        <button v-if="canEdit && !showForm" type="button" class="btn-primary btn-sm" @click="openNewForm">+ Novo registro</button>
        <input v-model="search" type="search" class="input-field ml-auto w-full sm:w-64" placeholder="Buscar colaborador, estado..." />
        <button type="button" class="btn-ghost btn-sm" @click="handleExport">Exportar</button>
      </div>

      <div
        v-if="canEdit && filteredList.length"
        class="flex flex-wrap items-center justify-between gap-2"
      >
        <label class="flex items-center gap-2 text-xs font-medium text-zinc-500 dark:text-zinc-400">
          <input
            type="checkbox"
            class="h-4 w-4 cursor-pointer accent-red-600"
            :checked="allVisibleSelected"
            aria-label="Selecionar todos os registros"
            @change="toggleSelectAll"
          />
          Selecionar todos
        </label>
        <div v-if="selectedRows.length" class="flex flex-wrap items-center gap-2">
          <span class="rounded-full bg-accent/10 px-2.5 py-1 text-xs font-semibold text-accent-hover dark:text-red-400">
            {{ selectedRows.length }} selecionado(s)
          </span>
          <button type="button" class="btn-danger-ghost btn-sm" @click="handleBulkDelete">Excluir selecionados</button>
        </div>
      </div>

      <div v-if="filteredList.length" class="flex max-h-[24rem] flex-col gap-2 overflow-y-auto pr-1">
        <div
          v-for="p in filteredList"
          :key="p.id"
          class="flex items-start gap-3 rounded-xl border border-zinc-200 p-3 dark:border-zinc-800"
          :class="selectedIds.has(p.id) ? 'bg-accent/5 dark:bg-red-500/5' : ''"
        >
          <input
            v-if="canEdit"
            type="checkbox"
            class="mt-1 h-4 w-4 shrink-0 cursor-pointer accent-red-600"
            :checked="selectedIds.has(p.id)"
            aria-label="Selecionar registro"
            @change="toggleRow(p.id)"
          />
          <div class="flex min-w-0 flex-1 flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div class="flex flex-col gap-0.5">
              <strong class="text-sm text-zinc-900 dark:text-zinc-100">{{ p.colaborador }}</strong>
              <span class="text-xs text-zinc-500 dark:text-zinc-400">
                Admissão: {{ formatDate(p.dataAdmissao) }} · Demissão: {{ formatDate(p.dataDemissao) }}
                <template v-if="recordDays(p) !== null"> · {{ recordDays(p).toFixed(1) }} dias</template>
              </span>
              <span v-if="recordFilial(p) || p.estado" class="text-xs text-zinc-500 dark:text-zinc-400">
                {{ [recordFilial(p), p.estado].filter(Boolean).join(" · ") }}
              </span>
            </div>
            <div v-if="canEdit" class="flex flex-wrap items-center gap-2">
              <button type="button" class="btn-ghost btn-sm" @click="editRecord(p)">Editar</button>
              <button type="button" class="btn-danger-ghost btn-sm" @click="removeRecord(p.id)">Excluir</button>
            </div>
          </div>
        </div>
      </div>
      <div v-else>
        <EmptyState
          title="Nenhum registro encontrado"
          text="Importe uma planilha ou lance um registro para calcular o tempo médio de permanência."
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
  background-color: rgb(220 38 38);
  padding: 0.5rem 1rem;
  font-size: 0.875rem;
  font-weight: 600;
  color: #fff;
  transition: background-color 0.15s;
}
.btn-primary:hover {
  background-color: rgb(185 28 28);
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
.btn-danger-ghost {
  border-radius: 0.5rem;
  border: 1px solid rgb(252 165 165);
  padding: 0.5rem 1rem;
  font-size: 0.875rem;
  font-weight: 500;
  color: rgb(220 38 38);
  transition: background-color 0.15s;
}
.btn-danger-ghost:hover {
  background-color: rgb(254 242 242);
}
:global(.dark) .btn-danger-ghost {
  border-color: rgb(127 29 29);
  color: rgb(248 113 113);
}
:global(.dark) .btn-danger-ghost:hover {
  background-color: rgb(69 10 10);
}
.btn-sm {
  padding: 0.35rem 0.7rem;
  font-size: 0.8125rem;
}
</style>
