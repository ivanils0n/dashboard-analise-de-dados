<script setup>
import { ref, reactive, computed, watch, onMounted, onUnmounted } from "vue";
import Modal from "@/components/ui/Modal.vue";
import Badge from "@/components/ui/Badge.vue";
import EmployeePicker from "@/components/dashboard/EmployeePicker.vue";
import SalaryPicker from "@/components/dashboard/SalaryPicker.vue";
import {
  MANUAL_INDICATORS,
  ABSENTEEISM_TYPES,
  ABSENTEEISM_OPTIONS,
  STATES,
  STATE_NAMES,
  DEFAULT_STATE,
  getIndicatorById
} from "@/lib/config";
import {
  addEntry,
  updateEntry,
  getLatestForMeta,
  getEmployeeById,
  getVacancyById,
  getEmployees
} from "@/lib/store";
import {
  saveEmployee,
  addVacancy,
  updateVacancy,
  closeVacancy,
  deleteVacancyRecord,
  listVacancies,
  formatVacancyTempo
} from "@/lib/employees";
import { todayISO, firstDayOfMonthISO, formatDateTime, formatValue, formatCurrency } from "@/lib/utils";
import { useToast } from "@/composables/useToast";
import { useDialog } from "@/composables/useDialog";
import { useFilters } from "@/composables/useFilters";

const props = defineProps({
  open: { type: Boolean, default: false }
});
const emit = defineEmits(["close", "saved"]);

const { show: toast } = useToast();
const { confirm } = useDialog();
const { state: filters } = useFilters();

/* "Salário dos Colaboradores" entra no menu de lançamentos sem virar um
   indicador/KPI — a remuneração é gravada no próprio colaborador. */
const SALARIO_OPTION = {
  id: "salario_colaborador",
  name: "Salário dos Colaboradores",
  desc: "Preenchimento e edição da remuneração individual de cada colaborador",
  form: "salario",
  type: "currency",
  decimals: 2
};

const indicatorId = ref(MANUAL_INDICATORS[0].id);
const activeTab = ref("");

const indicatorOptions = computed(() => [...MANUAL_INDICATORS, SALARIO_OPTION]);

const indicator = computed(() =>
  indicatorId.value === SALARIO_OPTION.id ? SALARIO_OPTION : getIndicatorById(indicatorId.value)
);

/* ---------- Vaga ---------- */
const vaga = reactive({ nome: "", data: "", hora: "" });
const editingVacancyId = ref(null);

/* ---------- Custo ---------- */
const custo = reactive({ query: "", employeeId: null, value: "" });
const custoExisting = ref(null);

/* ---------- Absenteísmo (ocorrência) ---------- */
const sub = reactive({ kind: null, employee: null }); // kind: "ocorrencia" | "salario"
const occ = reactive({ motivo: "falta", inicio: "", fim: "" });
const salario = reactive({ value: "" });

const estado = ref("");

const stateOptions = computed(() => ["todos", ...STATES]);

function stateLabel(s) {
  return s === "todos" ? "Todos Estados" : `${s} — ${STATE_NAMES[s]}`;
}

watch(
  () => props.open,
  (open) => {
    if (open) initModal();
  }
);

function initModal() {
  indicatorId.value = MANUAL_INDICATORS[0].id;
  estado.value = filters.current === "todos" ? DEFAULT_STATE : filters.current;
  editingVacancyId.value = null;
  custo.employeeId = null;
  custo.query = "";
  custo.value = "";
  custoExisting.value = null;
  closeSub();
  vaga.nome = "";
  vaga.data = "";
  vaga.hora = "";
  buildForm();
}

onMounted(initModal);

const tabs = computed(() => {
  if (!indicator.value) return [];
  switch (indicator.value.form) {
    case "vaga":
      return [
        { id: "nova", label: "Nova vaga" },
        { id: "historico", label: "Histórico" }
      ];
    case "custo":
      return [
        { id: "colaborador", label: "Colaborador" },
        { id: "custo", label: "Custo" }
      ];
    default:
      return [];
  }
});

const submitLabel = computed(() => (indicator.value && indicator.value.form === "vaga" ? "Concluir" : "Salvar lançamento"));

const canSubmitForm = computed(() => {
  const f = indicator.value && indicator.value.form;
  return f === "vaga" || f === "custo";
});

function buildForm() {
  activeTab.value = tabs.value.length ? tabs.value[0].id : "";
}

function showTab(id) {
  activeTab.value = id;
}

/* ---------- Absenteísmo (evento por colaborador) ---------- */

const pickerDefaultState = computed(() =>
  filters.current === "todos" ? DEFAULT_STATE : filters.current
);

function openOccurrence(employee) {
  if (!employee) return;
  sub.employee = employee;
  occ.motivo = "falta";
  occ.inicio = firstDayOfMonthISO();
  occ.fim = todayISO();
  sub.kind = "ocorrencia";
}

function closeSub() {
  sub.kind = null;
  sub.employee = null;
}

function saveOccurrence() {
  const emp = sub.employee;
  if (!emp) return toast("Selecione um colaborador na lista.");
  if (!occ.inicio || !occ.fim) return toast("Informe o período da ocorrência.");
  if (occ.fim < occ.inicio) return toast("A data fim deve ser posterior à data início.");

  const state = emp.estado || null;
  addEntry("absenteismo", {
    date: occ.inicio,
    value: 1,
    state,
    meta: {
      type: occ.motivo,
      periodEnd: occ.fim,
      employeeId: emp.id,
      employeeName: emp.name
    }
  });
  emit("saved");
  const motivo = ABSENTEEISM_TYPES[occ.motivo] || occ.motivo;
  toast(`Ocorrência registrada para ${emp.name} (${motivo}).`);
  closeSub();
}

/* ---------- Salário dos Colaboradores ---------- */

function openSalary(employee) {
  if (!employee) return;
  sub.employee = employee;
  salario.value = employee.salario != null ? String(employee.salario) : "";
  sub.kind = "salario";
}

function saveSalary() {
  const emp = sub.employee;
  if (!emp) return toast("Selecione um colaborador na lista.");
  const raw = String(salario.value).trim();
  if (raw === "" || isNaN(Number(raw)) || Number(raw) < 0) {
    return toast("Informe um salário mensal válido (R$).");
  }
  const value = Number(raw);

  saveEmployee({ id: emp.id, salario: value });

  /* Registra o lançamento do salário (um por colaborador) para aparecer
     em "Lançamentos recentes", como os demais lançamentos manuais. */
  const existing = getLatestForMeta("salario_colaborador", "employeeId", emp.id);
  if (existing) {
    updateEntry("salario_colaborador", existing.id, { value, date: todayISO() });
  } else {
    addEntry("salario_colaborador", {
      date: todayISO(),
      value,
      state: emp.estado || null,
      meta: { employeeId: emp.id, employeeName: emp.name }
    });
  }

  emit("saved");
  toast(`Salário atualizado para ${emp.name}: ${formatCurrency(value)}.`);
  closeSub();
}

/* ---------- Vaga ---------- */

const vacancies = computed(() => listVacancies(filters.current));

function setVagaNow() {
  const now = new Date();
  const pad = (n) => String(n).padStart(2, "0");
  vaga.data = todayISO();
  vaga.hora = `${pad(now.getHours())}:${pad(now.getMinutes())}`;
}

function handleVacancyAdd() {
  const name = vaga.nome.trim();
  if (!name || !vaga.data || !vaga.hora) return toast("Preencha nome, data e hora da vaga.");
  const openAt = `${vaga.data}T${vaga.hora}:00`;

  if (editingVacancyId.value) {
    updateVacancy(editingVacancyId.value, { name, openAt });
    editingVacancyId.value = null;
    toast("Vaga atualizada.");
  } else {
    const st =
      estado.value === "todos"
        ? filters.current !== "todos"
          ? filters.current
          : DEFAULT_STATE
        : estado.value;
    addVacancy({ name, openAt, estado: st });
    toast(`Vaga adicionada — aguardando fechamento.${st ? ` (${st})` : ""}`);
  }

  vaga.nome = "";
  vaga.data = "";
  vaga.hora = "";
  showTab("historico");
  emit("saved");
}

function editVacancy(id) {
  const v = getVacancyById(id);
  if (!v) return;
  editingVacancyId.value = id;
  vaga.nome = v.name;
  vaga.data = v.openAt.slice(0, 10);
  vaga.hora = v.openAt.slice(11, 16);
  showTab("nova");
}

function closeVacancyById(id) {
  closeVacancy(id);
  emit("saved");
  toast("Vaga fechada — tempo de contratação registrado.");
}

async function removeVacancy(id) {
  const vacancy = getVacancyById(id);
  if (!vacancy) return;
  const ok = await confirm({
    title: "Excluir vaga?",
    message: `A vaga "${vacancy.name}" será removida permanentemente.`,
    confirmText: "Excluir",
    danger: true
  });
  if (!ok) return;
  deleteVacancyRecord(id);
  emit("saved");
  toast("Vaga excluída.");
}

/* ---------- Custo ---------- */

const custoResults = computed(() => {
  const q = custo.query.trim().toLowerCase();
  const employees = getEmployees();
  const filtered = q
    ? employees.filter((e) => `${e.name} ${e.sector} ${e.user}`.toLowerCase().includes(q))
    : employees;
  return filtered.map((e) => {
    const existing = getLatestForMeta("custo_contratacao", "employeeId", e.id);
    return { employee: e, existing };
  });
});

const custoEmployeeName = computed(() => {
  if (!custo.employeeId) return "";
  const emp = getEmployeeById(custo.employeeId);
  return emp ? `${emp.name} · ${emp.sector}` : "";
});

function pickEmployee(e) {
  custo.employeeId = e.id;
  const existing = getLatestForMeta("custo_contratacao", "employeeId", e.id);
  custoExisting.value = existing || null;
  custo.value = existing ? existing.value : "";
  showTab("custo");
}

function submitCusto() {
  if (!custo.employeeId) return toast("Selecione um colaborador na aba Colaborador.");
  const value = custo.value;
  if (value === "" || isNaN(Number(value))) return toast("Informe o custo de contratação.");

  const emp = getEmployeeById(custo.employeeId);
  const existing = getLatestForMeta("custo_contratacao", "employeeId", emp.id);

  if (existing) {
    updateEntry("custo_contratacao", existing.id, { value: Number(value), date: todayISO() });
    emit("saved");
    toast(`Custo de contratação atualizado para ${emp.name}.`);
    close();
    return;
  }

  const st = emp.estado || null;
  addEntry("custo_contratacao", {
    date: todayISO(),
    value,
    state: st,
    meta: { employeeId: emp.id, employeeName: emp.name }
  });
  emit("saved");
  toast(`Custo de contratação lançado para ${emp.name}.`);
  close();
}

/* ---------- Submit ---------- */

function handleSubmit() {
  if (!indicator.value) return;
  const form = indicator.value.form;
  if (form === "absenteismo" || form === "salario") return; // ações nos submodais
  if (form === "custo") return submitCusto();
  if (form === "vaga") emit("close");
}

function close() {
  emit("close");
}

/* Impede que o Escape feche o modal principal enquanto um submodal está aberto. */
function onSubKeydown(e) {
  if (e.key === "Escape") {
    e.preventDefault();
    e.stopPropagation();
    closeSub();
  }
}

watch(
  () => sub.kind,
  (kind) => {
    if (kind) window.addEventListener("keydown", onSubKeydown, true);
    else window.removeEventListener("keydown", onSubKeydown, true);
  }
);

onUnmounted(() => window.removeEventListener("keydown", onSubKeydown, true));
</script>

<template>
  <Modal
    :title="indicator ? indicator.name : 'Lançar dados'"
    :subtitle="indicator ? indicator.desc : ''"
    :open="open"
    @close="close"
  >
    <form v-if="indicator" class="flex flex-col gap-5" novalidate @submit.prevent="handleSubmit">
      <div class="flex flex-col gap-1.5">
        <label for="entryIndicator" class="text-sm font-medium text-zinc-700 dark:text-zinc-200">Indicador</label>
        <select
          id="entryIndicator"
          v-model="indicatorId"
          class="rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 outline-none transition focus:border-accent focus:ring-2 focus:ring-accent/20 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100"
          @change="buildForm"
        >
          <option v-for="ind in indicatorOptions" :key="ind.id" :value="ind.id">{{ ind.name }}</option>
        </select>
      </div>

      <!-- Abas -->
      <div v-if="tabs.length" class="flex gap-1 rounded-xl bg-zinc-100 p-1 dark:bg-zinc-800">
        <button
          v-for="(t, i) in tabs"
          :key="t.id"
          type="button"
          class="flex-1 rounded-lg px-3 py-2 text-sm font-medium transition"
          :class="activeTab === t.id
            ? 'bg-white text-zinc-900 shadow-sm dark:bg-zinc-900 dark:text-zinc-100'
            : 'text-zinc-500 hover:text-zinc-700 dark:text-zinc-400 dark:hover:text-zinc-200'"
          @click="showTab(t.id)"
        >
          <span class="mr-1 inline-flex h-5 w-5 items-center justify-center rounded-full bg-accent text-[11px] font-bold text-white">{{ i + 1 }}</span>
          {{ t.label }}
        </button>
      </div>

      <!-- ===== ABSENTEÍSMO ===== -->
      <template v-if="indicator.form === 'absenteismo'">
        <EmployeePicker
          :default-state="pickerDefaultState"
          helper="Clique em um colaborador para registrar a ocorrência (motivo e período)."
          @select="openOccurrence"
        />
      </template>

      <!-- ===== SALÁRIO DOS COLABORADORES ===== -->
      <template v-if="indicator.form === 'salario'">
        <SalaryPicker
          :default-state="pickerDefaultState"
          helper="Clique em um colaborador para preencher ou editar a remuneração individual."
          @select="openSalary"
        />
      </template>

      <!-- ===== VAGA ===== -->
      <template v-if="indicator.form === 'vaga'">
        <div v-show="activeTab === 'nova'" class="flex flex-col gap-4">
          <div class="flex flex-col gap-1.5">
            <label for="vagaNome" class="text-sm font-medium text-zinc-700 dark:text-zinc-200">Nome da vaga</label>
            <input id="vagaNome" v-model="vaga.nome" type="text" class="input-field uppercase" placeholder="Ex.: Analista de RH" />
          </div>
          <div class="grid gap-4 sm:grid-cols-2">
            <div class="flex flex-col gap-1.5">
              <label for="vagaData" class="text-sm font-medium text-zinc-700 dark:text-zinc-200">Data de abertura</label>
              <input id="vagaData" v-model="vaga.data" type="date" class="input-field" />
            </div>
            <div class="flex flex-col gap-1.5">
              <label for="vagaHora" class="text-sm font-medium text-zinc-700 dark:text-zinc-200">Hora</label>
              <input id="vagaHora" v-model="vaga.hora" type="time" class="input-field" />
            </div>
          </div>
          <div class="flex flex-wrap gap-2">
            <button type="button" class="btn-ghost" @click="setVagaNow">Abrir Vaga</button>
            <button type="button" class="btn-primary" @click="handleVacancyAdd">
              {{ editingVacancyId ? "Salvar alterações" : "+ Adicionar vaga" }}
            </button>
          </div>
          <p class="text-xs text-zinc-500 dark:text-zinc-400">
            Ao adicionar, a vaga fica "em aberto" no histórico. Use "Fechar" quando for contratado.
          </p>
        </div>

        <div v-show="activeTab === 'historico'" class="flex flex-col gap-3">
          <p v-if="!vacancies.length" class="py-4 text-center text-sm text-zinc-500 dark:text-zinc-400">
            Nenhuma vaga cadastrada. Adicione uma vaga na aba "Nova vaga".
          </p>
          <div
            v-for="v in vacancies"
            :key="v.id"
            class="flex flex-col gap-3 rounded-xl border border-zinc-200 p-3 sm:flex-row sm:items-center sm:justify-between dark:border-zinc-800"
          >
            <div class="flex flex-col gap-0.5">
              <strong class="text-sm text-zinc-900 dark:text-zinc-100">{{ v.name }}</strong>
              <span class="text-xs text-zinc-500 dark:text-zinc-400">Abertura: {{ formatDateTime(v.openAt) }}</span>
              <span v-if="v.closeAt" class="text-xs text-zinc-500 dark:text-zinc-400">
                Fechamento: {{ formatDateTime(v.closeAt) }} · Tempo: {{ formatVacancyTempo(v) }}
              </span>
            </div>
            <div class="flex flex-wrap items-center gap-2">
              <Badge :tone="v.closeAt ? 'dark' : 'accent'">{{ v.closeAt ? "Fechado" : "Em aberto" }}</Badge>
              <button type="button" class="btn-ghost btn-sm" @click="editVacancy(v.id)">Editar</button>
              <button type="button" class="btn-primary btn-sm" :disabled="!!v.closeAt" @click="closeVacancyById(v.id)">Fechar</button>
              <button type="button" class="btn-danger-ghost btn-sm" @click="removeVacancy(v.id)">Excluir</button>
            </div>
          </div>
        </div>
      </template>

      <!-- ===== CUSTO ===== -->
      <template v-if="indicator.form === 'custo'">
        <div v-show="activeTab === 'colaborador'" class="flex flex-col gap-3">
          <div class="flex flex-col gap-1.5">
            <label for="custoSearch" class="text-sm font-medium text-zinc-700 dark:text-zinc-200">Buscar colaborador</label>
            <input id="custoSearch" v-model="custo.query" type="search" class="input-field" placeholder="Nome, setor ou usuário..." />
          </div>
          <div class="flex max-h-56 flex-col gap-1 overflow-y-auto">
            <p v-if="!custoResults.length" class="py-2 text-sm text-zinc-500 dark:text-zinc-400">
              Nenhum colaborador encontrado.
            </p>
            <button
              v-for="{ employee: e, existing } in custoResults"
              :key="e.id"
              type="button"
              class="flex items-center justify-between gap-2 rounded-lg px-3 py-2 text-left transition hover:bg-zinc-100 dark:hover:bg-zinc-800"
              :class="custo.employeeId === e.id ? 'bg-accent/10 dark:bg-red-500/10' : ''"
              @click="pickEmployee(e)"
            >
              <strong class="text-sm text-zinc-900 dark:text-zinc-100">{{ e.name }}</strong>
              <span class="text-xs text-zinc-500 dark:text-zinc-400">
                {{ existing
                  ? `Já lançado: ${formatValue(getIndicatorById('custo_contratacao'), existing.value)}`
                  : e.sector }}
              </span>
            </button>
          </div>
        </div>

        <div v-show="activeTab === 'custo'" class="flex flex-col gap-4">
          <div class="flex flex-col gap-1.5">
            <label for="custoSelected" class="text-sm font-medium text-zinc-700 dark:text-zinc-200">Colaborador selecionado</label>
            <input id="custoSelected" class="input-field cursor-default bg-zinc-100 dark:bg-zinc-800" readonly :value="custoEmployeeName" placeholder="Nenhum selecionado" />
          </div>
          <div class="flex flex-col gap-1.5">
            <label for="custoValue" class="text-sm font-medium text-zinc-700 dark:text-zinc-200">Custo de contratação (R$)</label>
            <input id="custoValue" v-model="custo.value" type="number" min="0" step="any" class="input-field" placeholder="0,00" />
          </div>
          <p v-if="custoExisting" class="text-xs text-amber-600 dark:text-amber-400">
            Já existe um lançamento. Salvar substituirá o valor anterior.
          </p>
        </div>
      </template>

      <!-- ===== ESTADO (somente quando o lançamento não está atrelado a um colaborador) ===== -->
      <div v-if="indicator.form === 'vaga'" class="flex flex-col gap-1.5">
        <label for="entryEstado" class="text-sm font-medium text-zinc-700 dark:text-zinc-200">Estado do lançamento</label>
        <select id="entryEstado" v-model="estado" class="input-field">
          <option v-for="s in stateOptions" :key="s" :value="s">{{ stateLabel(s) }}</option>
        </select>
        <p class="text-xs text-zinc-500 dark:text-zinc-400">
          O lançamento será vinculado ao estado selecionado e usado nos filtros por estado.
        </p>
      </div>

      <div class="flex justify-end gap-2 border-t border-zinc-100 pt-4 dark:border-zinc-800">
        <button type="button" class="btn-ghost" @click="close">Cancelar</button>
        <button v-if="canSubmitForm" type="submit" class="btn-primary">{{ submitLabel }}</button>
      </div>
    </form>

    <!-- ===== Submodal: ocorrência de Absenteísmo ===== -->
    <Teleport to="body">
      <div
        v-if="sub.kind === 'ocorrencia' && sub.employee"
        class="fixed inset-0 z-[80] flex items-start justify-center bg-black/50 p-4 py-10"
        @click.self="closeSub"
      >
        <form class="slide-up w-full max-w-md rounded-2xl border border-zinc-200 bg-white shadow-2xl dark:border-zinc-800 dark:bg-zinc-900" novalidate @submit.prevent="saveOccurrence">
          <div class="flex items-start justify-between gap-4 border-b border-zinc-100 px-6 py-4 dark:border-zinc-800">
            <div>
              <h3 class="text-lg font-bold text-zinc-900 dark:text-zinc-100">Registrar ocorrência</h3>
              <p class="mt-0.5 text-sm text-zinc-500 dark:text-zinc-400">
                {{ sub.employee.name }} · {{ sub.employee.sector }}
              </p>
            </div>
            <button type="button" class="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-xl leading-none text-zinc-400 transition hover:bg-zinc-100 hover:text-zinc-700 dark:hover:bg-zinc-800 dark:hover:text-zinc-200" aria-label="Fechar" @click="closeSub">&times;</button>
          </div>

          <div class="flex flex-col gap-4 px-6 py-5">
            <div class="flex flex-col gap-1.5">
              <label for="occMotivo" class="text-sm font-medium text-zinc-700 dark:text-zinc-200">Motivo</label>
              <select id="occMotivo" v-model="occ.motivo" class="input-field">
                <option v-for="key in ABSENTEEISM_OPTIONS" :key="key" :value="key">{{ ABSENTEEISM_TYPES[key] }}</option>
              </select>
            </div>
            <div class="grid gap-4 sm:grid-cols-2">
              <div class="flex flex-col gap-1.5">
                <label for="occInicio" class="text-sm font-medium text-zinc-700 dark:text-zinc-200">Data início</label>
                <input id="occInicio" v-model="occ.inicio" type="date" class="input-field" />
              </div>
              <div class="flex flex-col gap-1.5">
                <label for="occFim" class="text-sm font-medium text-zinc-700 dark:text-zinc-200">Data fim</label>
                <input id="occFim" v-model="occ.fim" type="date" class="input-field" />
              </div>
            </div>
          </div>

          <div class="flex justify-end gap-2 border-t border-zinc-100 px-6 py-4 dark:border-zinc-800">
            <button type="button" class="btn-ghost" @click="closeSub">Cancelar</button>
            <button type="submit" class="btn-primary">Salvar ocorrência</button>
          </div>
        </form>
      </div>
    </Teleport>

    <!-- ===== Submodal: Salário do colaborador ===== -->
    <Teleport to="body">
      <div
        v-if="sub.kind === 'salario' && sub.employee"
        class="fixed inset-0 z-[80] flex items-start justify-center bg-black/50 p-4 py-10"
        @click.self="closeSub"
      >
        <form class="slide-up w-full max-w-md rounded-2xl border border-zinc-200 bg-white shadow-2xl dark:border-zinc-800 dark:bg-zinc-900" novalidate @submit.prevent="saveSalary">
          <div class="flex items-start justify-between gap-4 border-b border-zinc-100 px-6 py-4 dark:border-zinc-800">
            <div>
              <h3 class="text-lg font-bold text-zinc-900 dark:text-zinc-100">Remuneração do colaborador</h3>
              <p class="mt-0.5 text-sm text-zinc-500 dark:text-zinc-400">
                {{ sub.employee.name }} · {{ sub.employee.sector }}
              </p>
            </div>
            <button type="button" class="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-xl leading-none text-zinc-400 transition hover:bg-zinc-100 hover:text-zinc-700 dark:hover:bg-zinc-800 dark:hover:text-zinc-200" aria-label="Fechar" @click="closeSub">&times;</button>
          </div>

          <div class="flex flex-col gap-4 px-6 py-5">
            <div class="flex flex-col gap-1.5">
              <label for="salValue" class="text-sm font-medium text-zinc-700 dark:text-zinc-200">Salário mensal (R$)</label>
              <input id="salValue" v-model="salario.value" type="number" min="0" step="any" class="input-field" placeholder="0,00" />
            </div>
            <p v-if="sub.employee.salario != null" class="text-xs text-amber-600 dark:text-amber-400">
              Salário atual: {{ formatCurrency(sub.employee.salario) }}. Salvar substituirá o valor.
            </p>
          </div>

          <div class="flex justify-end gap-2 border-t border-zinc-100 px-6 py-4 dark:border-zinc-800">
            <button type="button" class="btn-ghost" @click="closeSub">Cancelar</button>
            <button type="submit" class="btn-primary">Salvar salário</button>
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
.btn-primary:disabled {
  opacity: 0.6;
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
.btn-sm {
  padding: 0.3rem 0.65rem;
  font-size: 0.75rem;
}
.btn-danger-ghost {
  border-radius: 0.5rem;
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
  color: rgb(248 113 113);
}
:global(.dark) .btn-danger-ghost:hover {
  background-color: rgb(69 10 10);
}
</style>
