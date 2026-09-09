<script setup>
import { ref, reactive, computed, watch, onMounted, onUnmounted } from "vue";
import Modal from "@/components/ui/Modal.vue";
import Badge from "@/components/ui/Badge.vue";
import EmployeePicker from "@/components/dashboard/EmployeePicker.vue";
import SalaryPicker from "@/components/dashboard/SalaryPicker.vue";
import { listBranches } from "@/lib/filiais";
import { hydrateState } from "@/lib/supabase";
import {
  MANUAL_INDICATORS,
  ABSENTEEISM_TYPES,
  ABSENTEEISM_OPTIONS,
  STATES,
  STATE_NAMES,
  DEFAULT_STATE,
  PAGAMENTO_OPTIONS,
  MODALIDADE_OPTIONS,
  getIndicatorById
} from "@/lib/config";
import {
  addEntry,
  updateEntry,
  getLatestForMeta,
  getEmployeeById,
  getVacancyById,
  getEmployees,
  getDepartmentById,
  getBranchById
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

/* ---------- Diária ---------- */
const diaria = reactive({
  query: "",
  employeeId: null,
  departamento: "",
  filial: "",
  liderImediato: "",
  gerenteRegional: "",
  regional: "",
  inicio: "",
  fim: "",
  pagamento: "",
  motivo: "",
  value: ""
});

/* ---------- Treinamento ---------- */
const treinamento = reactive({
  query: "",
  employeeId: null,
  cargo: "",
  filial: "",
  data: "",
  tema: "",
  cargaHoraria: "",
  modalidade: "presencial",
  valorPago: ""
});

/* ---------- Custos Totais (por filial) ---------- */
const custosTot = reactive({
  estado: filters.current !== "todos" ? filters.current : "todos",
  query: "",
  branchId: null,
  data: todayISO(),
  custos: "",
  percent: ""
});

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
  resetDiaria();
  resetTreinamento();
  resetCustosTot();
  vaga.nome = "";
  vaga.data = "";
  vaga.hora = "";
  buildForm();
}

function resetDiaria() {
  diaria.query = "";
  diaria.employeeId = null;
  diaria.departamento = "";
  diaria.filial = "";
  diaria.liderImediato = "";
  diaria.gerenteRegional = "";
  diaria.regional = "";
  diaria.inicio = todayISO();
  diaria.fim = todayISO();
  diaria.pagamento = "";
  diaria.motivo = "";
  diaria.value = "";
}

function resetTreinamento() {
  treinamento.query = "";
  treinamento.employeeId = null;
  treinamento.cargo = "";
  treinamento.filial = "";
  treinamento.data = todayISO();
  treinamento.tema = "";
  treinamento.cargaHoraria = "";
  treinamento.modalidade = "presencial";
  treinamento.valorPago = "";
}

function resetCustosTot() {
  custosTot.estado = filters.current !== "todos" ? filters.current : "todos";
  custosTot.query = "";
  custosTot.branchId = null;
  custosTot.data = todayISO();
  custosTot.custos = "";
  custosTot.percent = "";
}

/* Carrega os dados do estado escolhido para listar suas filiais. */
watch(
  () => custosTot.estado,
  async (state) => {
    custosTot.branchId = null;
    custosTot.query = "";
    try {
      await hydrateState(state === "todos" ? "todos" : state);
    } catch (err) {
      console.warn("[LaunchModal] Falha ao carregar filiais do estado:", err);
    }
  }
);

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
    case "diaria":
      return [
        { id: "colaborador", label: "Colaborador" },
        { id: "diaria", label: "Diária" }
      ];
    case "treinamento":
      return [
        { id: "colaborador", label: "Colaborador" },
        { id: "treinamento", label: "Treinamento" }
      ];
    case "custo_total":
      return [
        { id: "filial", label: "Filial" },
        { id: "custos", label: "Custos" }
      ];
    default:
      return [];
  }
});

const submitLabel = computed(() => {
  if (!indicator.value) return "Salvar lançamento";
  switch (indicator.value.form) {
    case "vaga":
      return "Concluir";
    case "diaria":
      return "Salvar diária";
    case "treinamento":
      return "Salvar treinamento";
    case "custo_total":
      return "Salvar custos";
    default:
      return "Salvar lançamento";
  }
});

const canSubmitForm = computed(() => {
  const f = indicator.value && indicator.value.form;
  return f === "vaga" || f === "custo" || f === "diaria" || f === "treinamento" || f === "custo_total";
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

/* Define o período da ocorrência como o dia de hoje. */
function setOccurrenceToday() {
  occ.inicio = todayISO();
  occ.fim = todayISO();
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

/* ---------- Diária ---------- */

const diariaResults = computed(() => {
  const q = diaria.query.trim().toLowerCase();
  const employees = getEmployees();
  if (!q) return employees;
  return employees.filter((e) => `${e.name} ${e.sector} ${e.user}`.toLowerCase().includes(q));
});

const diariaEmployeeName = computed(() => {
  if (!diaria.employeeId) return "";
  const emp = getEmployeeById(diaria.employeeId);
  return emp ? `${emp.name} · ${emp.sector}` : "";
});

function pickDiariaEmployee(e) {
  diaria.employeeId = e.id;
  fillDiariaContext(e);
  showTab("diaria");
}

/* Preenche o contexto organizacional automaticamente a partir do cadastro do
   colaborador (departamento, filial e líder). O "regional" é o estado. */
function fillDiariaContext(emp) {
  const dep = emp.departmentId ? getDepartmentById(emp.departmentId) : null;
  diaria.departamento = dep ? dep.name : emp.sector || "";
  const filial = emp.filialId ? getBranchById(emp.filialId) : null;
  diaria.filial = filial ? `${filial.shortName} ${filial.name}`.trim() : "";
  diaria.liderImediato = emp.liderImediato || "";
  diaria.gerenteRegional = emp.gerenteRegional || "";
  diaria.regional = emp.estado || "";
}

function setDiariaToday() {
  diaria.inicio = todayISO();
  diaria.fim = todayISO();
}

function submitDiaria() {
  const emp = diaria.employeeId ? getEmployeeById(diaria.employeeId) : null;
  if (!emp) return toast("Selecione um colaborador na aba Colaborador.");
  if (!diaria.inicio) return toast("Informe o período da diária.");
  if (diaria.fim && diaria.fim < diaria.inicio) {
    return toast("A data fim deve ser posterior à data início.");
  }
  const valueRaw = String(diaria.value).trim();
  if (valueRaw === "" || isNaN(Number(valueRaw)) || Number(valueRaw) < 0) {
    return toast("Informe o valor pago na diária (R$).");
  }
  const value = Number(valueRaw);

  addEntry("custo_diaria", {
    date: diaria.inicio,
    value,
    state: emp.estado || null,
    meta: {
      employeeId: emp.id,
      employeeName: emp.name,
      departamento: diaria.departamento.trim() || null,
      filial: diaria.filial.trim() || null,
      liderImediato: diaria.liderImediato.trim() || null,
      gerenteRegional: diaria.gerenteRegional.trim() || null,
      regional: diaria.regional.trim() || null,
      pagamento: diaria.pagamento.trim() || null,
      motivo: diaria.motivo.trim() || null,
      inicio: diaria.inicio,
      fim: diaria.fim || diaria.inicio
    }
  });

  emit("saved");
  toast(`Diária lançada para ${emp.name}: ${formatCurrency(value)}.`);

  /* Mantém o colaborador selecionado para o próximo lançamento, apenas
     limpando os dados específicos da diária. */
  diaria.value = "";
  diaria.pagamento = "";
  diaria.motivo = "";
  diaria.inicio = todayISO();
  diaria.fim = todayISO();
  fillDiariaContext(emp);
}

/* ---------- Treinamento ---------- */

const treinamentoResults = computed(() => {
  const q = treinamento.query.trim().toLowerCase();
  const employees = getEmployees();
  if (!q) return employees;
  return employees.filter((e) => `${e.name} ${e.cargo || ""} ${e.sector} ${e.user}`.toLowerCase().includes(q));
});

const treinamentoEmployeeName = computed(() => {
  if (!treinamento.employeeId) return "";
  const emp = getEmployeeById(treinamento.employeeId);
  return emp ? `${emp.name} · ${emp.cargo || emp.sector}` : "";
});

function pickTreinamentoEmployee(e) {
  treinamento.employeeId = e.id;
  fillTreinamentoContext(e);
  showTab("treinamento");
}

/* Preenche cargo, loja (filial) e estado automaticamente do colaborador. */
function fillTreinamentoContext(emp) {
  treinamento.cargo = emp.cargo || "";
  const filial = emp.filialId ? getBranchById(emp.filialId) : null;
  treinamento.filial = filial ? `${filial.shortName} ${filial.name}`.trim() : "";
}

function submitTreinamento() {
  const emp = treinamento.employeeId ? getEmployeeById(treinamento.employeeId) : null;
  if (!emp) return toast("Selecione um colaborador na aba Colaborador.");
  if (!treinamento.data) return toast("Informe a data do treinamento.");
  const cargaRaw = String(treinamento.cargaHoraria).trim();
  if (cargaRaw === "" || isNaN(Number(cargaRaw)) || Number(cargaRaw) < 0) {
    return toast("Informe a carga horária do treinamento (horas).");
  }
  const carga = Number(cargaRaw);

  let valorPago = null;
  const valorRaw = String(treinamento.valorPago).trim();
  if (valorRaw !== "") {
    if (isNaN(Number(valorRaw)) || Number(valorRaw) < 0) {
      return toast("Informe um valor pago válido (R$) ou deixe em branco.");
    }
    valorPago = Number(valorRaw);
  }

  const filial = treinamento.filial.trim() || null;
  const mod =
    (MODALIDADE_OPTIONS.find((o) => o.value === treinamento.modalidade) || {}).label ||
    treinamento.modalidade;
  addEntry("treinamento", {
    date: treinamento.data,
    value: carga,
    state: emp.estado || null,
    meta: {
      employeeId: emp.id,
      employeeName: emp.name,
      cargo: treinamento.cargo.trim() || null,
      filial,
      tema: treinamento.tema.trim() || null,
      cargaHoraria: carga,
      modalidade: mod,
      valorPago
    }
  });

  emit("saved");
  toast(`Treinamento lançado para ${emp.name}: ${carga} h.`);

  /* Mantém o colaborador selecionado, limpando os dados do treinamento. */
  treinamento.data = todayISO();
  treinamento.tema = "";
  treinamento.cargaHoraria = "";
  treinamento.modalidade = "presencial";
  treinamento.valorPago = "";
  fillTreinamentoContext(emp);
}

/* ---------- Custos Totais (por filial) ---------- */

const custosTotResults = computed(() => {
  const q = custosTot.query.trim().toLowerCase();
  let list = listBranches(custosTot.estado);
  if (q) {
    list = list.filter((b) =>
      `${b.branchId} ${b.cnpj} ${b.name} ${b.shortName} ${b.manager || ""}`
        .toLowerCase()
        .includes(q)
    );
  }
  return list.slice().sort((a, b) => (a.name || "").localeCompare(b.name || ""));
});

const custosTotBranch = computed(() =>
  custosTot.branchId ? getBranchById(custosTot.branchId) : null
);

const custosTotSelectedLabel = computed(() => {
  const b = custosTotBranch.value;
  return b ? `${b.name} · ${b.cnpj}` : "";
});

function pickCustosTotBranch(b) {
  custosTot.branchId = b.id;
  showTab("custos");
}

function setCustosTotToday() {
  custosTot.data = todayISO();
}

function submitCustosTotal() {
  const b = custosTotBranch.value;
  if (!b) return toast("Selecione uma filial na aba Filial.");
  if (!custosTot.data) return toast("Informe a data dos custos.");

  const custosRaw = String(custosTot.custos).trim();
  if (custosRaw === "" || isNaN(Number(custosRaw)) || Number(custosRaw) < 0) {
    return toast("Informe o valor dos custos (R$).");
  }
  const custos = Number(custosRaw);

  let percent = null;
  const percentRaw = String(custosTot.percent).trim();
  if (percentRaw !== "") {
    const p = Number(percentRaw.replace(",", "."));
    if (isNaN(p) || p < 0) {
      return toast("Informe um percentual (%) válido ou deixe em branco.");
    }
    percent = p;
  }

  addEntry("custo_total", {
    date: custosTot.data,
    value: custos,
    state: b.estado || null,
    meta: {
      filialId: b.id,
      branchId: b.branchId || null,
      cnpj: b.cnpj || null,
      razaoSocial: b.name || null,
      shortName: b.shortName || null,
      filial: [b.shortName, b.name].filter(Boolean).join(" ").trim() || null,
      percent
    }
  });

  emit("saved");
  toast(`Custos lançados para ${b.name}: ${formatCurrency(custos)}.`);

  /* Mantém a filial selecionada para o próximo lançamento, limpando apenas
     os dados específicos do custo. */
  custosTot.data = todayISO();
  custosTot.custos = "";
  custosTot.percent = "";
}

/* ---------- Submit ---------- */

function handleSubmit() {
  if (!indicator.value) return;
  const form = indicator.value.form;
  if (form === "absenteismo" || form === "salario") return; // ações nos submodais
  if (form === "custo") return submitCusto();
  if (form === "diaria") return submitDiaria();
  if (form === "treinamento") return submitTreinamento();
  if (form === "custo_total") return submitCustosTotal();
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

      <!-- ===== DIÁRIA ===== -->
      <template v-if="indicator.form === 'diaria'">
        <div v-show="activeTab === 'colaborador'" class="flex flex-col gap-3">
          <div class="flex flex-col gap-1.5">
            <label for="diariaSearch" class="text-sm font-medium text-zinc-700 dark:text-zinc-200">Buscar colaborador</label>
            <input id="diariaSearch" v-model="diaria.query" type="search" class="input-field" placeholder="Nome, setor ou usuário..." />
          </div>
          <div class="flex max-h-56 flex-col gap-1 overflow-y-auto">
            <p v-if="!diariaResults.length" class="py-2 text-sm text-zinc-500 dark:text-zinc-400">
              Nenhum colaborador encontrado.
            </p>
            <button
              v-for="e in diariaResults"
              :key="e.id"
              type="button"
              class="flex items-center justify-between gap-2 rounded-lg px-3 py-2 text-left transition hover:bg-zinc-100 dark:hover:bg-zinc-800"
              :class="diaria.employeeId === e.id ? 'bg-accent/10 dark:bg-red-500/10' : ''"
              @click="pickDiariaEmployee(e)"
            >
              <strong class="text-sm text-zinc-900 dark:text-zinc-100">{{ e.name }}</strong>
              <span class="text-xs text-zinc-500 dark:text-zinc-400">{{ e.sector }}</span>
            </button>
          </div>
          <p class="text-xs text-zinc-500 dark:text-zinc-400">
            Ao selecionar, departamento, filial e líder são preenchidos do cadastro do colaborador; o regional é o estado.
          </p>
        </div>

        <div v-show="activeTab === 'diaria'" class="flex flex-col gap-4">
          <div class="flex flex-col gap-1.5">
            <label for="diariaSelected" class="text-sm font-medium text-zinc-700 dark:text-zinc-200">Colaborador selecionado</label>
            <input id="diariaSelected" class="input-field cursor-default bg-zinc-100 dark:bg-zinc-800" readonly :value="diariaEmployeeName" placeholder="Nenhum selecionado" />
            <p v-if="diaria.employeeId" class="text-xs">
              <button type="button" class="font-medium text-accent-hover dark:text-red-400" @click="showTab('colaborador')">Trocar colaborador</button>
            </p>
          </div>

          <fieldset class="rounded-xl border border-zinc-200 p-3 dark:border-zinc-800">
            <legend class="px-1 text-xs font-semibold uppercase tracking-wide text-zinc-400">Contexto do colaborador (auto-preenchido)</legend>
            <div class="grid gap-3 sm:grid-cols-2">
              <div class="flex flex-col gap-1.5">
                <label for="diariaDep" class="text-sm font-medium text-zinc-700 dark:text-zinc-200">Departamento</label>
                <input id="diariaDep" v-model="diaria.departamento" type="text" class="input-field" />
              </div>
              <div class="flex flex-col gap-1.5">
                <label for="diariaFilial" class="text-sm font-medium text-zinc-700 dark:text-zinc-200">Filial</label>
                <input id="diariaFilial" v-model="diaria.filial" type="text" class="input-field" />
              </div>
              <div class="flex flex-col gap-1.5">
                <label for="diariaLider" class="text-sm font-medium text-zinc-700 dark:text-zinc-200">Líder imediato</label>
                <input id="diariaLider" v-model="diaria.liderImediato" type="text" class="input-field" />
              </div>
              <div class="flex flex-col gap-1.5">
                <label for="diariaGerente" class="text-sm font-medium text-zinc-700 dark:text-zinc-200">Gerente regional</label>
                <input id="diariaGerente" v-model="diaria.gerenteRegional" type="text" class="input-field" />
              </div>
              <div class="flex flex-col gap-1.5">
                <label for="diariaRegional" class="text-sm font-medium text-zinc-700 dark:text-zinc-200">Regional</label>
                <input id="diariaRegional" v-model="diaria.regional" type="text" class="input-field" />
              </div>
            </div>
          </fieldset>

          <div class="flex flex-wrap items-end gap-4">
            <div class="flex min-w-[150px] flex-1 flex-col gap-1.5">
              <label for="diariaInicio" class="text-sm font-medium text-zinc-700 dark:text-zinc-200">Período — início</label>
              <input id="diariaInicio" v-model="diaria.inicio" type="date" class="input-field" />
            </div>
            <div class="flex min-w-[150px] flex-1 flex-col gap-1.5">
              <label for="diariaFim" class="text-sm font-medium text-zinc-700 dark:text-zinc-200">Período — fim</label>
              <input id="diariaFim" v-model="diaria.fim" type="date" class="input-field" />
            </div>
            <button type="button" class="btn-ghost" @click="setDiariaToday">Hoje</button>
          </div>

          <div class="grid gap-4 sm:grid-cols-2">
            <div class="flex flex-col gap-1.5">
              <label for="diariaPagamento" class="text-sm font-medium text-zinc-700 dark:text-zinc-200">Pagamento</label>
              <input id="diariaPagamento" v-model="diaria.pagamento" type="text" list="diariaPagamentoList" class="input-field" placeholder="Ex.: Diária, Alimentação..." />
              <datalist id="diariaPagamentoList">
                <option v-for="opt in PAGAMENTO_OPTIONS" :key="opt" :value="opt"></option>
              </datalist>
            </div>
            <div class="flex flex-col gap-1.5">
              <label for="diariaMotivo" class="text-sm font-medium text-zinc-700 dark:text-zinc-200">Motivo da diária</label>
              <input id="diariaMotivo" v-model="diaria.motivo" type="text" class="input-field" placeholder="Ex.: Visita à loja..." />
            </div>
          </div>

          <div class="flex flex-col gap-1.5">
            <label for="diariaValue" class="text-sm font-medium text-zinc-700 dark:text-zinc-200">Valor pago na diária (R$)</label>
            <input id="diariaValue" v-model="diaria.value" type="number" min="0" step="any" class="input-field" placeholder="0,00" />
          </div>
        </div>
      </template>

      <!-- ===== TREINAMENTO ===== -->
      <template v-if="indicator.form === 'treinamento'">
        <div v-show="activeTab === 'colaborador'" class="flex flex-col gap-3">
          <div class="flex flex-col gap-1.5">
            <label for="trSearch" class="text-sm font-medium text-zinc-700 dark:text-zinc-200">Buscar colaborador</label>
            <input id="trSearch" v-model="treinamento.query" type="search" class="input-field" placeholder="Nome, cargo, setor ou usuário..." />
          </div>
          <div class="flex max-h-56 flex-col gap-1 overflow-y-auto">
            <p v-if="!treinamentoResults.length" class="py-2 text-sm text-zinc-500 dark:text-zinc-400">
              Nenhum colaborador encontrado.
            </p>
            <button
              v-for="e in treinamentoResults"
              :key="e.id"
              type="button"
              class="flex items-center justify-between gap-2 rounded-lg px-3 py-2 text-left transition hover:bg-zinc-100 dark:hover:bg-zinc-800"
              :class="treinamento.employeeId === e.id ? 'bg-accent/10 dark:bg-red-500/10' : ''"
              @click="pickTreinamentoEmployee(e)"
            >
              <strong class="text-sm text-zinc-900 dark:text-zinc-100">{{ e.name }}</strong>
              <span class="text-xs text-zinc-500 dark:text-zinc-400">{{ e.cargo || e.sector }}</span>
            </button>
          </div>
          <p class="text-xs text-zinc-500 dark:text-zinc-400">
            Ao selecionar, cargo e loja (filial) são preenchidos automaticamente do cadastro do colaborador.
          </p>
        </div>

        <div v-show="activeTab === 'treinamento'" class="flex flex-col gap-4">
          <div class="flex flex-col gap-1.5">
            <label for="trSelected" class="text-sm font-medium text-zinc-700 dark:text-zinc-200">Colaborador selecionado</label>
            <input id="trSelected" class="input-field cursor-default bg-zinc-100 dark:bg-zinc-800" readonly :value="treinamentoEmployeeName" placeholder="Nenhum selecionado" />
            <p v-if="treinamento.employeeId" class="text-xs">
              <button type="button" class="font-medium text-accent-hover dark:text-red-400" @click="showTab('colaborador')">Trocar colaborador</button>
            </p>
          </div>

          <div class="grid gap-4 sm:grid-cols-3">
            <div class="flex flex-col gap-1.5">
              <label for="trCargo" class="text-sm font-medium text-zinc-700 dark:text-zinc-200">Cargo</label>
              <input id="trCargo" v-model="treinamento.cargo" type="text" class="input-field" />
            </div>
            <div class="flex flex-col gap-1.5">
              <label for="trFilial" class="text-sm font-medium text-zinc-700 dark:text-zinc-200">Loja (Filial)</label>
              <input id="trFilial" v-model="treinamento.filial" type="text" class="input-field" />
            </div>
            <div class="flex flex-col gap-1.5">
              <label for="trData" class="text-sm font-medium text-zinc-700 dark:text-zinc-200">Data do treinamento</label>
              <input id="trData" v-model="treinamento.data" type="date" class="input-field" />
            </div>
          </div>

          <div class="flex flex-col gap-1.5">
            <label for="trTema" class="text-sm font-medium text-zinc-700 dark:text-zinc-200">Tema do treinamento</label>
            <input id="trTema" v-model="treinamento.tema" type="text" class="input-field" placeholder="Ex.: Excel, Atendimento, NR 35..." />
          </div>

          <div class="grid gap-4 sm:grid-cols-3">
            <div class="flex flex-col gap-1.5">
              <label for="trCarga" class="text-sm font-medium text-zinc-700 dark:text-zinc-200">Carga horária (horas)</label>
              <input id="trCarga" v-model="treinamento.cargaHoraria" type="number" min="0" step="any" class="input-field" placeholder="0" />
            </div>
            <div class="flex flex-col gap-1.5">
              <label for="trModalidade" class="text-sm font-medium text-zinc-700 dark:text-zinc-200">Modalidade</label>
              <select id="trModalidade" v-model="treinamento.modalidade" class="input-field">
                <option v-for="m in MODALIDADE_OPTIONS" :key="m.value" :value="m.value">{{ m.label }}</option>
              </select>
            </div>
            <div class="flex flex-col gap-1.5">
              <label for="trValor" class="text-sm font-medium text-zinc-700 dark:text-zinc-200">Valor pago (R$)</label>
              <input id="trValor" v-model="treinamento.valorPago" type="number" min="0" step="any" class="input-field" placeholder="0,00 (opcional)" />
            </div>
          </div>
        </div>
      </template>

      <!-- ===== CUSTOS TOTAIS (por filial) ===== -->
      <template v-if="indicator.form === 'custo_total'">
        <div v-show="activeTab === 'filial'" class="flex flex-col gap-3">
          <div class="grid gap-4 sm:grid-cols-2">
            <div class="flex flex-col gap-1.5">
              <label for="ctEstado" class="text-sm font-medium text-zinc-700 dark:text-zinc-200">Estado</label>
              <select id="ctEstado" v-model="custosTot.estado" class="input-field">
                <option v-for="s in stateOptions" :key="s" :value="s">{{ stateLabel(s) }}</option>
              </select>
            </div>
            <div class="flex flex-col gap-1.5">
              <label for="ctSearch" class="text-sm font-medium text-zinc-700 dark:text-zinc-200">Buscar filial</label>
              <input id="ctSearch" v-model="custosTot.query" type="search" class="input-field" placeholder="CNPJ, razão social ou abreviado..." />
            </div>
          </div>
          <div class="flex max-h-56 flex-col gap-1 overflow-y-auto">
            <p v-if="!custosTotResults.length" class="py-2 text-sm text-zinc-500 dark:text-zinc-400">
              Nenhuma filial encontrada. Cadastre filiais na aba Filiais.
            </p>
            <button
              v-for="b in custosTotResults"
              :key="b.id"
              type="button"
              class="flex items-center justify-between gap-2 rounded-lg px-3 py-2 text-left transition hover:bg-zinc-100 dark:hover:bg-zinc-800"
              :class="custosTot.branchId === b.id ? 'bg-accent/10 dark:bg-red-500/10' : ''"
              @click="pickCustosTotBranch(b)"
            >
              <span class="flex min-w-0 flex-col">
                <strong class="truncate text-sm text-zinc-900 dark:text-zinc-100">{{ b.name }}</strong>
                <span class="text-xs text-zinc-500 dark:text-zinc-400">{{ b.cnpj }}</span>
              </span>
              <span class="flex shrink-0 items-center gap-2 text-xs text-zinc-500 dark:text-zinc-400">
                <Badge v-if="b.shortName" tone="muted">{{ b.shortName }}</Badge>
                <span>{{ b.estado || "—" }}</span>
                <span aria-hidden="true">→</span>
              </span>
            </button>
          </div>
          <p class="text-xs text-zinc-500 dark:text-zinc-400">
            Ao selecionar, CNPJ, razão social e estado serão preenchidos do cadastro da filial.
          </p>
        </div>

        <div v-show="activeTab === 'custos'" class="flex flex-col gap-4">
          <div class="flex flex-col gap-1.5">
            <label for="ctSelected" class="text-sm font-medium text-zinc-700 dark:text-zinc-200">Filial selecionada</label>
            <input id="ctSelected" class="input-field cursor-default bg-zinc-100 dark:bg-zinc-800" readonly :value="custosTotSelectedLabel" placeholder="Nenhuma filial selecionada" />
            <p v-if="custosTot.branchId" class="text-xs">
              <button type="button" class="font-medium text-accent-hover dark:text-red-400" @click="showTab('filial')">Trocar filial</button>
            </p>
          </div>

          <div class="grid gap-4 sm:grid-cols-3">
            <div class="flex flex-col gap-1.5">
              <label for="ctCnpj" class="text-sm font-medium text-zinc-700 dark:text-zinc-200">Filial CNPJ</label>
              <input id="ctCnpj" class="input-field cursor-default bg-zinc-100 dark:bg-zinc-800" readonly :value="custosTotBranch?.cnpj || ''" />
            </div>
            <div class="flex flex-col gap-1.5">
              <label for="ctRazao" class="text-sm font-medium text-zinc-700 dark:text-zinc-200">Razão Social</label>
              <input id="ctRazao" class="input-field cursor-default bg-zinc-100 dark:bg-zinc-800" readonly :value="custosTotBranch?.name || ''" />
            </div>
            <div class="flex flex-col gap-1.5">
              <label for="ctEstadoInfo" class="text-sm font-medium text-zinc-700 dark:text-zinc-200">Estado</label>
              <input id="ctEstadoInfo" class="input-field cursor-default bg-zinc-100 dark:bg-zinc-800" readonly :value="custosTotBranch?.estado || ''" />
            </div>
          </div>

          <div class="grid gap-4 sm:grid-cols-3">
            <div class="flex flex-col gap-1.5">
              <label for="ctData" class="text-sm font-medium text-zinc-700 dark:text-zinc-200">Data dos custos</label>
              <input id="ctData" v-model="custosTot.data" type="date" class="input-field" />
            </div>
            <div class="flex flex-col gap-1.5">
              <label for="ctCustos" class="text-sm font-medium text-zinc-700 dark:text-zinc-200">Custos (R$)</label>
              <input id="ctCustos" v-model="custosTot.custos" type="number" min="0" step="any" class="input-field" placeholder="0,00" />
            </div>
            <div class="flex flex-col gap-1.5">
              <label for="ctPercent" class="text-sm font-medium text-zinc-700 dark:text-zinc-200">%</label>
              <input id="ctPercent" v-model="custosTot.percent" type="number" min="0" step="any" class="input-field" placeholder="0,00 (informativo)" />
            </div>
          </div>
          <p class="text-xs text-zinc-500 dark:text-zinc-400">
            O campo % é informativo (ex.: participação da filial) e aparece nos registros do indicador.
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
            <div class="flex flex-wrap items-end gap-x-4 gap-y-2">
              <div class="flex min-w-[150px] flex-1 flex-col gap-1.5">
                <label for="occInicio" class="text-sm font-medium text-zinc-700 dark:text-zinc-200">Data início</label>
                <input id="occInicio" v-model="occ.inicio" type="date" class="input-field" />
              </div>
              <div class="flex min-w-[150px] flex-1 flex-col gap-1.5">
                <label for="occFim" class="text-sm font-medium text-zinc-700 dark:text-zinc-200">Data fim</label>
                <input id="occFim" v-model="occ.fim" type="date" class="input-field" />
              </div>
              <button type="button" class="btn-ghost" @click="setOccurrenceToday">Hoje</button>
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
