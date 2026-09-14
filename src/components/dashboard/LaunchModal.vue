<script setup>
import { ref, reactive, computed, watch, onMounted, onUnmounted } from "vue";
import Modal from "@/components/ui/Modal.vue";
import Badge from "@/components/ui/Badge.vue";
import LoadingOverlay from "@/components/ui/LoadingOverlay.vue";
import EmployeePicker from "@/components/dashboard/EmployeePicker.vue";
import SalaryPicker from "@/components/dashboard/SalaryPicker.vue";
import { listBranches } from "@/lib/filiais";
import { hydrateState } from "@/lib/db";
import {
  MANUAL_INDICATORS,
  ABSENTEEISM_TYPES,
  ABSENTEEISM_OPTIONS,
  STATES,
  STATE_NAMES,
  DEFAULT_STATE,
  MODALIDADE_OPTIONS,
  getIndicatorById
} from "@/lib/config";
import {
  addEntry,
  updateEntry,
  getEntriesFor,
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
  deleteVacancies,
  closeVacancies,
  listVacancies,
  formatVacancyTempo,
  findEmployeesByName,
  findBranchByShortName
} from "@/lib/employees";
import {
  readWorkbookFile,
  parseTreinamentoSheet,
  downloadTreinamentoTemplate,
  parseVagasSheet,
  downloadVagasTemplate,
  parseDiariaSheet,
  downloadDiariaTemplate
} from "@/lib/export";
import { todayISO, firstDayOfMonthISO, formatDate, formatValue, formatCurrency, currentYm, MONTHS_SHORT, yearOptions, maskCurrencyInput, normalizeCurrencyInput, parseCurrencyBR, parseHoursBR, formatHoursClock, normalizeText } from "@/lib/utils";
import { useToast } from "@/composables/useToast";
import { useDialog } from "@/composables/useDialog";
import { useFilters } from "@/composables/useFilters";

const props = defineProps({
  open: { type: Boolean, default: false },
  editEntry: { type: Object, default: null },
  editVacancyId: { type: String, default: null }
});
const emit = defineEmits(["close", "saved"]);

const { show: toast } = useToast();
const { confirm } = useDialog();
const { state: filters } = useFilters();

/* Quando preenchido, o modal está editando um lançamento existente
   (custo_diaria, treinamento ou custo_total). */
const editingEntryId = ref(null);

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

/* ---------- Vaga (Tempo médio de contratação) ---------- */
const vaga = reactive({
  nome: "",
  abertura: "",
  fechamento: "",
  salario: "",
  tipo: "clt",
  filialId: null
});
const editingVacancyId = ref(null);
const vagaImportInput = ref(null);

/* Datas de fechamento escolhidas na aba Histórico (padrão: hoje). */
const closeDates = reactive({});
const bulkCloseDate = ref(todayISO());

function closeDateFor(id) {
  return closeDates[id] || todayISO();
}

function setCloseDate(id, value) {
  closeDates[id] = value;
}

/* ---------- Custo ---------- */
const custo = reactive({ query: "", employeeId: null, value: "" });
const custoExisting = ref(null);

/* ---------- Diária ---------- */
/* A diária é vinculada a MÊS/ANO (competência), não a um dia — o registro é
   gravado no 1º dia do mês escolhido, igual ao Treinamento. */
const diaria = reactive({
  query: "",
  employeeId: null,
  employeeName: "",
  funcao: "",
  departamento: "",
  filial: "",
  liderImediato: "",
  gerenteRegional: "",
  regional: "",
  mes: currentYm(),
  motivo: "",
  value: ""
});

/* ---------- Treinamento ---------- */
/* O treinamento é vinculado a MÊS/ANO (competência), não a um dia. O registro
   é gravado no 1º dia do mês escolhido para manter compatibilidade com as
   consultas por data existentes. */
const treinamento = reactive({
  query: "",
  employeeId: null,
  cargo: "",
  filial: "",
  filialShort: "",
  month: currentYm(),
  tema: "",
  cargaHoraria: "",
  modalidade: "presencial"
});

/* ---------- Custos Totais (por filial) ---------- */
/* O lançamento de Custos Totais é vinculado a MÊS/ANO (competência), não a
   um dia. Internamente o registro é gravado no 1º dia do mês escolhido para
   manter compatibilidade com as consultas por data existentes. */
const custosTot = reactive({
  estado: filters.current !== "todos" ? filters.current : "todos",
  query: "",
  branchId: null,
  month: currentYm(),
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
  editingEntryId.value = null;
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
  resetVagaForm();
  selectedVacancyIds.value = new Set();
  Object.keys(closeDates).forEach((k) => delete closeDates[k]);
  bulkCloseDate.value = todayISO();

  /* Modo edição: pré-preenche o formulário do lançamento selecionado. */
  if (props.editEntry && props.editEntry.entry && props.editEntry.indicatorId) {
    indicatorId.value = props.editEntry.indicatorId;
    buildForm();
    prefillEdit(props.editEntry.indicatorId, props.editEntry.entry);
    return;
  }

  /* Modo edição de vaga (aberto pelo histórico do KPI de contratação). */
  if (props.editVacancyId) {
    indicatorId.value = "tempo_contratacao";
    buildForm();
    editVacancy(props.editVacancyId);
    return;
  }

  buildForm();
}

/* Pré-preenche o formulário a partir de um lançamento existente (edição). */
function prefillEdit(indId, entry) {
  const m = entry.meta || {};
  editingEntryId.value = entry.id;

  if (indId === "custo_diaria") {
    diaria.employeeId = m.employeeId || null;
    diaria.employeeName = m.employeeName || "";
    diaria.funcao = m.funcao || "";
    diaria.query = "";
    diaria.departamento = m.departamento || "";
    diaria.filial = m.filial || "";
    diaria.liderImediato = m.liderImediato || "";
    diaria.gerenteRegional = m.gerenteRegional || "";
    diaria.regional = m.regional || "";
    diaria.mes = m.competencia || (entry.date ? String(entry.date).slice(0, 7) : currentYm());
    diaria.motivo = m.motivo || "";
    diaria.value = entry.value != null ? String(entry.value) : "";
    showTab("diaria");
    return;
  }

  if (indId === "treinamento") {
    treinamento.employeeId = m.employeeId || null;
    treinamento.query = "";
    treinamento.cargo = m.cargo || "";
    treinamento.filial = m.filial || "";
    treinamento.filialShort = m.shortName || "";
    treinamento.month = entry.date ? String(entry.date).slice(0, 7) : currentYm();
    treinamento.tema = m.tema || "";
    treinamento.cargaHoraria = entry.value != null ? String(entry.value) : "";
    treinamento.modalidade = /online/i.test(String(m.modalidade || "")) ? "online" : "presencial";
    showTab("treinamento");
    return;
  }

  if (indId === "custo_total") {
    const nextEstado = m.estado || (filters.current !== "todos" ? filters.current : "todos");
    if (nextEstado !== custosTot.estado) {
      skipCustosEstadoWatch = true;
      custosTot.estado = nextEstado;
    }
    custosTot.query = "";
    custosTot.branchId = m.filialId || null;
    custosTot.month = entry.date ? String(entry.date).slice(0, 7) : currentYm();
    custosTot.custos = normalizeCurrencyInput(entry.value != null ? String(entry.value) : "");
    custosTot.percent = m.percent != null ? String(m.percent) : "";
    showTab("custos");
    return;
  }
}

function resetDiaria() {
  diaria.query = "";
  diaria.employeeId = null;
  diaria.employeeName = "";
  diaria.funcao = "";
  diaria.departamento = "";
  diaria.filial = "";
  diaria.liderImediato = "";
  diaria.gerenteRegional = "";
  diaria.regional = filters.current !== "todos" ? filters.current : DEFAULT_STATE;
  diaria.mes = currentYm();
  diaria.motivo = "";
  diaria.value = "";
}

function resetTreinamento() {
  treinamento.query = "";
  treinamento.employeeId = null;
  treinamento.cargo = "";
  treinamento.filial = "";
  treinamento.filialShort = "";
  treinamento.month = currentYm();
  treinamento.tema = "";
  treinamento.cargaHoraria = "";
  treinamento.modalidade = "presencial";
}

function resetCustosTot() {
  custosTot.estado = filters.current !== "todos" ? filters.current : "todos";
  custosTot.query = "";
  custosTot.branchId = null;
  custosTot.month = currentYm();
  custosTot.custos = "";
  custosTot.percent = "";
}

/* Carrega os dados do estado escolhido para listar suas filiais. */
let skipCustosEstadoWatch = false;
watch(
  () => custosTot.estado,
  async (state) => {
    if (skipCustosEstadoWatch) {
      skipCustosEstadoWatch = false;
      return;
    }
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
        employeeName: String(emp.name).toUpperCase()
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
      meta: { employeeId: emp.id, employeeName: String(emp.name).toUpperCase() }
    });
  }

  emit("saved");
  toast(`Salário atualizado para ${emp.name}: ${formatCurrency(value)}.`);
  closeSub();
}

/* ---------- Vaga ---------- */

const vacancies = computed(() => listVacancies(filters.current));

/* Totais do histórico de vagas (abertas x fechadas). */
const vacancyStats = computed(() => {
  const list = vacancies.value;
  const fechadas = list.filter((v) => v.closeAt).length;
  return { total: list.length, abertas: list.length - fechadas, fechadas };
});

/* Filiais disponíveis para a vaga, conforme o estado selecionado. */
const vagaBranches = computed(() =>
  listBranches(estado.value === "todos" ? "todos" : estado.value)
);

/* Limpa a filial escolhida quando ela deixa de existir no estado selecionado e
   garante que as filiais do estado estejam carregadas para o seletor. */
watch(
  () => estado.value,
  async (state) => {
    try {
      await hydrateState(state === "todos" ? "todos" : state);
    } catch (err) {
      console.warn("[LaunchModal] Falha ao carregar filiais do estado:", err);
    }
    if (vaga.filialId && !vagaBranches.value.some((b) => b.id === vaga.filialId)) {
      vaga.filialId = null;
    }
  }
);

function resetVagaForm() {
  vaga.nome = "";
  vaga.abertura = "";
  vaga.fechamento = "";
  vaga.salario = "";
  vaga.tipo = "clt";
  vaga.filialId = null;
}

function vacancyFilial(v) {
  const b = v && v.filialId ? getBranchById(v.filialId) : null;
  return b ? b.shortName || b.name : "";
}

function tipoContratacaoLabel(t) {
  if (!t) return "";
  return String(t).toUpperCase();
}

function setVagaNow() {
  vaga.abertura = todayISO();
}

/* Valor da vaga (R$) com máscara brasileira. */
function onVagaSalaryInput(ev) {
  vaga.salario = maskCurrencyInput(ev.target.value);
}

function onVagaSalaryBlur() {
  vaga.salario = normalizeCurrencyInput(vaga.salario);
}

/* Converte o salário digitado em número (null quando vazio/inválido). */
function vagaSalarioValue() {
  const text = normalizeCurrencyInput(vaga.salario);
  if (text === "") return null;
  const value = parseCurrencyBR(text);
  return isNaN(value) || value < 0 ? NaN : value;
}

/* Estado efetivo do lançamento (fallback para o filtro/estado padrão). */
function effectiveVagaEstado() {
  if (estado.value && estado.value !== "todos") return estado.value;
  return filters.current !== "todos" ? filters.current : DEFAULT_STATE;
}

function handleVacancyAdd() {
  const name = vaga.nome.trim();
  if (!name || !vaga.abertura) return toast("Preencha o nome e a data de abertura da vaga.");
  if (vaga.fechamento && vaga.fechamento < vaga.abertura) {
    return toast("A data de fechamento deve ser posterior à data de abertura.");
  }
  const salario = vagaSalarioValue();
  if (Number.isNaN(salario)) return toast("Informe um salário válido (R$).");
  const openAt = `${vaga.abertura}T00:00:00`;
  const closeAt = vaga.fechamento ? `${vaga.fechamento}T00:00:00` : null;
  const st = effectiveVagaEstado();

  if (editingVacancyId.value) {
    updateVacancy(editingVacancyId.value, {
      name,
      openAt,
      closeAt,
      salario,
      tipoContratacao: vaga.tipo,
      estado: st,
      filialId: vaga.filialId
    });
    editingVacancyId.value = null;
    toast("Vaga atualizada.");
  } else {
    addVacancy({
      name,
      openAt,
      closeAt,
      salario,
      tipoContratacao: vaga.tipo,
      estado: st,
      filialId: vaga.filialId
    });
    toast(`Vaga adicionada${closeAt ? " e fechada" : " — aguardando fechamento"}.${st ? ` (${st})` : ""}`);
  }

  resetVagaForm();
  showTab("historico");
  emit("saved");
}

async function editVacancy(id) {
  const v = getVacancyById(id);
  if (!v) return;
  editingVacancyId.value = id;
  vaga.nome = v.name;
  vaga.abertura = v.openAt ? String(v.openAt).slice(0, 10) : "";
  vaga.fechamento = v.closeAt ? String(v.closeAt).slice(0, 10) : "";
  vaga.salario = v.salario != null ? normalizeCurrencyInput(String(v.salario)) : "";
  vaga.tipo = v.tipoContratacao || "clt";
  if (v.estado && v.estado !== estado.value) {
    estado.value = v.estado;
    try {
      await hydrateState(v.estado);
    } catch (err) {
      console.warn("[LaunchModal] Falha ao carregar filiais do estado:", err);
    }
  }
  vaga.filialId = v.filialId || null;
  showTab("nova");
}

/* ---------- Importação de vagas por planilha ---------- */
function vagaSheetToUse(wb) {
  if (wb.Sheets["Vagas"]) return wb.Sheets["Vagas"];
  const keys = Object.keys(wb.Sheets || {});
  return keys.length ? wb.Sheets[keys[0]] : null;
}

async function onVagaImportFile(e) {
  const file = e.target.files && e.target.files[0];
  e.target.value = "";
  if (!file) return;
  try {
    const wb = await readWorkbookFile(file);
    const sheet = vagaSheetToUse(wb);
    const parsed = sheet ? parseVagasSheet(sheet) : [];
    if (!parsed.length) {
      toast("Nenhuma vaga encontrada na planilha. Use o template de vagas.");
      return;
    }
    let ok = 0;
    let skipped = 0;
    parsed.forEach((row) => {
      if (!row.name || !row.openAt) {
        skipped++;
        return;
      }
      const branch = row.filialText ? findBranchByShortName(row.filialText) : null;
      const est =
        row.estado ||
        (branch && branch.estado) ||
        (filters.current !== "todos" ? filters.current : DEFAULT_STATE);
      addVacancy({
        name: String(row.name).toUpperCase(),
        openAt: row.openAt,
        closeAt: row.closeAt,
        salario: row.salario,
        tipoContratacao: row.tipo,
        estado: est,
        filialId: branch ? branch.id : null
      });
      ok++;
    });
    emit("saved");
    toast(
      `Importação concluída — ${ok} vaga(s) lançada(s)${skipped ? ` · ${skipped} ignorada(s)` : ""}.`
    );
    showTab("historico");
  } catch (err) {
    console.error(err);
    toast("Não foi possível ler a planilha de vagas.");
  }
}

function closeVacancyById(id) {
  const date = closeDateFor(id);
  const vacancy = getVacancyById(id);
  if (vacancy && vacancy.openAt && date < String(vacancy.openAt).slice(0, 10)) {
    return toast("A data de fechamento deve ser posterior à data de abertura.");
  }
  closeVacancy(id, date);
  emit("saved");
  toast("Vaga fechada — tempo de contratação e custo registrados.");
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

/* ---------- Seleção múltipla de vagas (aba Histórico) ---------- */
const selectedVacancyIds = ref(new Set());

const selectedVacancies = computed(() =>
  vacancies.value.filter((v) => selectedVacancyIds.value.has(v.id))
);
const allVacanciesSelected = computed(
  () =>
    vacancies.value.length > 0 &&
    vacancies.value.every((v) => selectedVacancyIds.value.has(v.id))
);

function toggleVacancy(id) {
  const next = new Set(selectedVacancyIds.value);
  if (next.has(id)) next.delete(id);
  else next.add(id);
  selectedVacancyIds.value = next;
}

function toggleVacanciesAll() {
  if (allVacanciesSelected.value) selectedVacancyIds.value = new Set();
  else selectedVacancyIds.value = new Set(vacancies.value.map((v) => v.id));
}

async function handleBulkVacancyDelete() {
  const list = selectedVacancies.value;
  const n = list.length;
  if (!n) return;
  const ok = await confirm({
    title: `Excluir ${n} vaga(s)?`,
    message: "As vagas selecionadas serão removidas permanentemente.",
    confirmText: `Excluir ${n}`,
    danger: true
  });
  if (!ok) return;
  deleteVacancies(list.map((v) => v.id));
  selectedVacancyIds.value = new Set();
  emit("saved");
  toast(`${n} vaga(s) excluída(s).`);
}

function handleBulkVacancyClose() {
  const list = selectedVacancies.value.filter((v) => !v.closeAt);
  if (!list.length) {
    toast("Nenhuma vaga em aberto entre as selecionadas.");
    return;
  }
  const date = bulkCloseDate.value || todayISO();
  const invalid = list.find((v) => v.openAt && date < String(v.openAt).slice(0, 10));
  if (invalid) {
    return toast(`A data de fechamento é anterior à abertura da vaga "${invalid.name}".`);
  }
  closeVacancies(list.map((v) => v.id), date);
  selectedVacancyIds.value = new Set();
  emit("saved");
  toast(`${list.length} vaga(s) fechada(s) — tempo de contratação e custo registrados.`);
}

/* ---------- Custo ---------- */

const custoResults = computed(() => {
  const q = normalizeText(custo.query).trim();
  const employees = getEmployees();
  const filtered = q
    ? employees.filter((e) => normalizeText(`${e.name} ${e.sector} ${e.user}`).includes(q))
    : employees;
  /* Índice único employeeId -> último custo de contratação (evita reler e
     reordenar a lista completa para cada colaborador). */
  const latestByEmployee = new Map();
  getEntriesFor("custo_contratacao").forEach((entry) => {
    const id = entry.meta && entry.meta.employeeId;
    if (id) latestByEmployee.set(id, entry);
  });
  return filtered.map((e) => ({ employee: e, existing: latestByEmployee.get(e.id) || null }));
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
    meta: { employeeId: emp.id, employeeName: String(emp.name).toUpperCase() }
  });
  emit("saved");
  toast(`Custo de contratação lançado para ${emp.name}.`);
  close();
}

/* ---------- Diária ---------- */

const diariaResults = computed(() => {
  const q = normalizeText(diaria.query).trim();
  const employees = getEmployees();
  if (!q) return employees;
  return employees.filter((e) => normalizeText(`${e.name} ${e.sector} ${e.user}`).includes(q));
});

function pickDiariaEmployee(e) {
  diaria.employeeId = e.id;
  diaria.employeeName = e.name;
  fillDiariaContext(e);
  showTab("diaria");
}

/* Colaborador não cadastrado (ou ainda não importado): lança a diária mesmo
   assim, sem vínculo, usando o nome digitado na busca. */
function pickDiariaEmployeeManual() {
  const name = diaria.query.trim();
  if (!name) return;
  diaria.employeeId = null;
  diaria.employeeName = name;
  diaria.query = "";
  showTab("diaria");
}

/* Preenche o contexto organizacional automaticamente a partir do cadastro do
   colaborador (departamento, filial e líder). O "regional" é o estado. */
function fillDiariaContext(emp) {
  const up = (v) => String(v == null ? "" : v).toUpperCase();
  diaria.funcao = up(emp.cargo);
  const dep = emp.departmentId ? getDepartmentById(emp.departmentId) : null;
  diaria.departamento = dep ? up(dep.name) : up(emp.sector);
  const filial = emp.filialId ? getBranchById(emp.filialId) : null;
  diaria.filial = filial ? up(`${filial.shortName} ${filial.name}`.trim()) : "";
  diaria.liderImediato = up(emp.liderImediato);
  diaria.gerenteRegional = up(emp.gerenteRegional);
  diaria.regional = up(emp.estado);
}

/* ---------- Mês/ano da diária (competência) ---------- */
const diariaYearOptions = yearOptions(4, 1);

const diariaMonthNum = computed(() =>
  diaria.mes ? Number(diaria.mes.split("-")[1]) : new Date().getMonth() + 1
);
const diariaYearNum = computed(() =>
  diaria.mes ? Number(diaria.mes.split("-")[0]) : new Date().getFullYear()
);
const diariaMonthLabel = computed(() => {
  if (!diaria.mes) return "";
  const [y, m] = diaria.mes.split("-");
  return `${MONTHS_SHORT[Number(m) - 1] || m}/${y}`;
});

function setDiariaMonth(m) {
  diaria.mes = `${diariaYearNum.value}-${String(m).padStart(2, "0")}`;
}
function setDiariaYear(y) {
  diaria.mes = `${y}-${String(diariaMonthNum.value).padStart(2, "0")}`;
}
function setDiariaCurrentMonth() {
  diaria.mes = currentYm();
}

function submitDiaria() {
  /* O colaborador cadastrado não é mais obrigatório: se não houver vínculo,
     lança mesmo assim usando o nome digitado (útil também para a futura
     importação por planilha, que pode não encontrar todo mundo cadastrado). */
  const emp = diaria.employeeId ? getEmployeeById(diaria.employeeId) : null;
  const up = (v) => String(v == null ? "" : v).toUpperCase().trim() || null;
  const employeeName = up(emp ? emp.name : diaria.employeeName);
  if (!employeeName) return toast("Informe o colaborador (selecione um cadastrado ou digite o nome).");
  if (!diaria.mes) return toast("Informe o mês da diária.");
  const valueRaw = String(diaria.value).trim();
  if (valueRaw === "" || isNaN(Number(valueRaw)) || Number(valueRaw) < 0) {
    return toast("Informe o valor pago na diária (R$).");
  }
  const value = Number(valueRaw);

  const payload = {
    date: `${diaria.mes}-01`,
    value,
    state: emp ? emp.estado || null : diaria.regional || null,
    meta: {
      employeeId: emp ? emp.id : null,
      employeeName,
      funcao: up(diaria.funcao),
      departamento: up(diaria.departamento),
      filial: up(diaria.filial),
      liderImediato: up(diaria.liderImediato),
      gerenteRegional: up(diaria.gerenteRegional),
      regional: up(diaria.regional),
      motivo: up(diaria.motivo),
      competencia: diaria.mes
    }
  };

  if (editingEntryId.value) {
    updateEntry("custo_diaria", editingEntryId.value, payload);
    editingEntryId.value = null;
    emit("saved");
    toast(`Diária atualizada para ${employeeName}.`);
    close();
    return;
  }

  addEntry("custo_diaria", payload);

  emit("saved");
  toast(`Diária lançada para ${employeeName} em ${diariaMonthLabel.value}: ${formatCurrency(value)}.`);

  /* Mantém o colaborador selecionado para o próximo lançamento, apenas
     limpando os dados específicos da diária. */
  diaria.value = "";
  diaria.motivo = "";
  diaria.mes = currentYm();
  if (emp) fillDiariaContext(emp);
}

/* ---------- Importação de diárias por planilha ---------- */
const diImportInput = ref(null);
const diReviewOpen = ref(false);
const diRows = ref([]);
const diImporting = ref(false);

const diValidRows = computed(() => diRows.value.filter((r) => !r.errors.length));
const diErrorCount = computed(() => diRows.value.length - diValidRows.value.length);
/* Cada linha válida vira exatamente uma diária (lançada no mês informado). */
const diEntriesCount = computed(() => diValidRows.value.length);

/* Monta o registro do candidato exibido na escolha (usuário · setor · filial · cargo · estado). */
function diCandidateRecord(emp) {
  const filial = emp.filialId ? getBranchById(emp.filialId) : null;
  return {
    id: emp.id,
    user: emp.user || "",
    name: emp.name || "",
    sector: emp.sector || "",
    cargo: emp.cargo || "",
    estado: emp.estado || "",
    filial: filial ? String(`${filial.shortName} ${filial.name}`.trim()) : "",
    shortName: filial ? filial.shortName || "" : ""
  };
}

function diCandidateLabel(c) {
  const parts = [c.user, c.sector];
  if (c.filial) parts.push(c.filial);
  if (c.cargo) parts.push(c.cargo);
  if (c.estado) parts.push(c.estado);
  return parts.filter(Boolean).join(" · ");
}

function diPeriodoLabel(r) {
  if (!r.periodo.ok) return "Sem período";
  const [y, m] = r.periodo.mes.split("-");
  return `${MONTHS_SHORT[Number(m) - 1] || m}/${y}`;
}

function diSheetToUse(wb) {
  if (wb.Sheets["Diária"]) return wb.Sheets["Diária"];
  if (wb.Sheets["Diaria"]) return wb.Sheets["Diaria"];
  const keys = Object.keys(wb.Sheets || {});
  return keys.length ? wb.Sheets[keys[0]] : null;
}

async function onDiImportFile(e) {
  const file = e.target.files && e.target.files[0];
  e.target.value = "";
  if (!file) return;
  diImporting.value = true;
  try {
    /* Filiais e colaboradores podem ser de qualquer estado — garante que
       tudo esteja carregado antes de tentar casar a planilha. */
    await hydrateState("todos");
    const wb = await readWorkbookFile(file);
    const sheet = diSheetToUse(wb);
    const parsed = sheet ? parseDiariaSheet(sheet) : [];
    if (!parsed.length) {
      toast("Nenhuma diária encontrada na planilha. Use o template de diária.");
      return;
    }
    diRows.value = parsed.map((row) => {
      const candidates = row.colaboradorText ? findEmployeesByName(row.colaboradorText).map(diCandidateRecord) : [];
      /* Só invalida a linha (não importa) quando falta colaborador ou
         pagamento. Filial e período em branco/não reconhecidos são apenas
         avisos — a diária é lançada mesmo assim, sem esses dados. */
      const errors = [];
      const warnings = [];
      if (!row.filialText) warnings.push("Filial não informada.");
      else if (!row.filial) warnings.push(`Filial "${row.filialText}" não encontrada no cadastro.`);
      if (!row.colaboradorText) errors.push("Colaborador não informado.");
      if (!row.periodo.ok) warnings.push(row.periodo.reason);
      if (row.pagamento === null) errors.push("Pagamento inválido ou não informado.");
      return {
        ...row,
        candidates,
        chosen: candidates.length === 1 ? candidates[0].id : "",
        errors,
        warnings
      };
    });
    diReviewOpen.value = true;
  } catch (err) {
    console.error(err);
    toast("Não foi possível ler a planilha de diárias.");
  } finally {
    diImporting.value = false;
  }
}

/* Sentinela gravada como `date` das diárias sem período (ver monthlyBarData
   em KpiChartCard.vue, que isola esse grupo numa barra "Sem período"). */
const NO_PERIODO_DATE = "0001-01-01";

function confirmDiImport() {
  const up = (v) => String(v == null ? "" : v).toUpperCase().trim() || null;
  const errorCount = diErrorCount.value;
  let entriesOk = 0;

  diValidRows.value.forEach((r) => {
    const candidate = r.chosen ? r.candidates.find((c) => c.id === r.chosen) : null;
    const emp = candidate ? getEmployeeById(candidate.id) : null;
    const employeeName = up(emp ? emp.name : r.colaboradorText);
    /* Filial pode não ter sido informada ou não ter sido encontrada — nesse
       caso a região vem do colaborador vinculado ou do filtro de estado atual. */
    const filial = r.filial;
    const state = filial
      ? filial.estado || null
      : emp
        ? emp.estado || null
        : filters.current !== "todos"
          ? filters.current
          : DEFAULT_STATE;
    const dep = emp && emp.departmentId ? getDepartmentById(emp.departmentId) : null;
    const mes = r.periodo.ok ? r.periodo.mes : null;

    const meta = {
      employeeId: emp ? emp.id : null,
      employeeName,
      funcao: up(r.funcaoText) || (emp ? up(emp.cargo) : null),
      departamento: emp ? (dep ? up(dep.name) : up(emp.sector)) : null,
      filial: filial ? up(`${filial.shortName} ${filial.name}`.trim()) : up(r.filialText),
      liderImediato: emp ? up(emp.liderImediato) : null,
      gerenteRegional: emp ? up(emp.gerenteRegional) : null,
      regional: state,
      motivo: up(r.motivoText),
      competencia: mes,
      semPeriodo: !mes
    };

    addEntry("custo_diaria", {
      date: mes ? `${mes}-01` : NO_PERIODO_DATE,
      value: Number(r.pagamento),
      state,
      meta
    });
    entriesOk++;
  });

  diReviewOpen.value = false;
  diRows.value = [];
  emit("saved");
  const parts = [`${entriesOk} diária(s) lançada(s)`];
  if (errorCount) parts.push(`${errorCount} linha(s) com erro não importada(s)`);
  toast("Importação concluída — " + parts.join(" · "));
}

/* ---------- Treinamento ---------- */

const treinamentoResults = computed(() => {
  const q = normalizeText(treinamento.query).trim();
  const employees = getEmployees();
  if (!q) return employees;
  return employees.filter((e) => normalizeText(`${e.name} ${e.cargo || ""} ${e.sector} ${e.user}`).includes(q));
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
  treinamento.cargo = String(emp.cargo || "").toUpperCase();
  const filial = emp.filialId ? getBranchById(emp.filialId) : null;
  treinamento.filial = filial ? String(`${filial.shortName} ${filial.name}`.trim()).toUpperCase() : "";
  treinamento.filialShort = filial && filial.shortName ? String(filial.shortName).toUpperCase() : "";
}

/* ---------- Mês/ano do treinamento (competência) ---------- */
const treinamentoYearOptions = yearOptions(4, 1);

const treinamentoMonthNum = computed(() =>
  treinamento.month ? Number(treinamento.month.split("-")[1]) : new Date().getMonth() + 1
);
const treinamentoYearNum = computed(() =>
  treinamento.month ? Number(treinamento.month.split("-")[0]) : new Date().getFullYear()
);
const treinamentoMonthLabel = computed(() => {
  if (!treinamento.month) return "";
  const [y, m] = treinamento.month.split("-");
  return `${MONTHS_SHORT[Number(m) - 1] || m}/${y}`;
});

function setTreinamentoMonth(m) {
  treinamento.month = `${treinamentoYearNum.value}-${String(m).padStart(2, "0")}`;
}
function setTreinamentoYear(y) {
  treinamento.month = `${y}-${String(treinamentoMonthNum.value).padStart(2, "0")}`;
}
function setTreinamentoCurrentMonth() {
  treinamento.month = currentYm();
}

function submitTreinamento() {
  const emp = treinamento.employeeId ? getEmployeeById(treinamento.employeeId) : null;
  if (!emp) return toast("Selecione um colaborador na aba Colaborador.");
  if (!treinamento.month) return toast("Informe o mês/ano do treinamento.");
  const carga = parseHoursBR(treinamento.cargaHoraria);
  if (carga === null || carga < 0) {
    return toast("Informe a carga horária do treinamento (ex.: 8, 12:00 ou 12:30).");
  }

  const up = (v) => String(v == null ? "" : v).toUpperCase().trim() || null;
  const filial = up(treinamento.filial);
  const mod =
    (MODALIDADE_OPTIONS.find((o) => o.value === treinamento.modalidade) || {}).label ||
    treinamento.modalidade;
  const payload = {
    date: `${treinamento.month}-01`,
    value: carga,
    state: emp.estado || null,
    meta: {
      employeeId: emp.id,
      employeeName: up(emp.name),
      cargo: up(treinamento.cargo),
      filial,
      shortName: up(treinamento.filialShort),
      estado: emp.estado || null,
      tema: up(treinamento.tema),
      cargaHoraria: carga,
      modalidade: mod,
      competencia: treinamento.month
    }
  };

  if (editingEntryId.value) {
    updateEntry("treinamento", editingEntryId.value, payload);
    editingEntryId.value = null;
    emit("saved");
    toast(`Treinamento atualizado para ${emp.name}: ${formatHoursClock(carga)}.`);
    close();
    return;
  }

  addEntry("treinamento", payload);

  emit("saved");
  toast(`Treinamento lançado para ${emp.name}: ${formatHoursClock(carga)}.`);

  /* Mantém o colaborador selecionado, limpando os dados do treinamento. */
  treinamento.month = currentYm();
  treinamento.tema = "";
  treinamento.cargaHoraria = "";
  treinamento.modalidade = "presencial";
  fillTreinamentoContext(emp);
}

/* ---------- Importação de treinamentos por planilha ---------- */
const trImportInput = ref(null);
const trReviewOpen = ref(false);
const trRows = ref([]);
const trImporting = ref(false);

const trSelectedCount = computed(
  () => trRows.value.filter((r) => r.chosen && r.candidates.some((c) => c.id === r.chosen)).length
);
const trAmbiguousCount = computed(
  () => trRows.value.filter((r) => r.candidates.length > 1 && !r.missing).length
);
const trMissingCount = computed(() => trRows.value.filter((r) => r.missing).length);

/* ---------- Filtro por causa (problemas no topo) ---------- */
const TR_CAUSE_LABELS = {
  sem_colaborador: "Colaborador não encontrado",
  sem_carga: "Sem carga horária",
  ambiguo: "Nome ambíguo (2 ou + colaboradores)",
  ok: "OK"
};
const TR_CAUSE_ORDER = ["sem_colaborador", "sem_carga", "ambiguo", "ok"];

const trFilter = ref("todos");

function trCauseOf(r) {
  if (r.missing) return "sem_colaborador";
  if (r.carga === null || r.carga === undefined || isNaN(Number(r.carga))) return "sem_carga";
  if (r.candidates.length > 1) return "ambiguo";
  return "ok";
}

function trProblemRank(r) {
  const idx = TR_CAUSE_ORDER.indexOf(trCauseOf(r));
  return idx < 0 ? 99 : idx;
}

const trFilterOptions = computed(() => {
  const present = new Set(trRows.value.map(trCauseOf));
  const options = [{ value: "todos", label: "Todas as causas" }];
  TR_CAUSE_ORDER.forEach((k) => {
    if (present.has(k)) options.push({ value: k, label: TR_CAUSE_LABELS[k] });
  });
  return options;
});

/* Problemas primeiro; dentro de cada causa, ordena por nome. */
const visibleTrRows = computed(() => {
  const rows = trRows.value.filter((r) => trFilter.value === "todos" || trCauseOf(r) === trFilter.value);
  return rows
    .slice()
    .sort((a, b) => trProblemRank(a) - trProblemRank(b) || String(a.name || "").localeCompare(String(b.name || "")));
});

/* Mês/competência dos treinamentos importados. */
const trMonth = ref(currentYm());
const trYearOptions = yearOptions(4, 1);

const trMonthNum = computed(() =>
  trMonth.value ? Number(trMonth.value.split("-")[1]) : new Date().getMonth() + 1
);
const trYearNum = computed(() =>
  trMonth.value ? Number(trMonth.value.split("-")[0]) : new Date().getFullYear()
);
const trMonthLabel = computed(() => {
  if (!trMonth.value) return "";
  const [y, m] = trMonth.value.split("-");
  return `${MONTHS_SHORT[Number(m) - 1] || m}/${y}`;
});

function setTrMonth(m) {
  trMonth.value = `${trYearNum.value}-${String(m).padStart(2, "0")}`;
}
function setTrYear(y) {
  trMonth.value = `${y}-${String(trMonthNum.value).padStart(2, "0")}`;
}

/* Monta o registro do candidato exibido na escolha (usuário · setor · filial · cargo · estado). */
function trCandidateRecord(emp) {
  const filial = emp.filialId ? getBranchById(emp.filialId) : null;
  return {
    id: emp.id,
    user: emp.user || "",
    name: emp.name || "",
    sector: emp.sector || "",
    cargo: emp.cargo || "",
    estado: emp.estado || "",
    filial: filial ? String(`${filial.shortName} ${filial.name}`.trim()) : "",
    shortName: filial ? filial.shortName || "" : ""
  };
}

function trCandidateLabel(c) {
  const parts = [c.user, c.sector];
  if (c.filial) parts.push(c.filial);
  if (c.cargo) parts.push(c.cargo);
  if (c.estado) parts.push(c.estado);
  return parts.filter(Boolean).join(" · ");
}

function trSheetToUse(wb) {
  if (wb.Sheets["Treinamento"]) return wb.Sheets["Treinamento"];
  const keys = Object.keys(wb.Sheets || {});
  return keys.length ? wb.Sheets[keys[0]] : null;
}

async function onTrImportFile(e) {
  const file = e.target.files && e.target.files[0];
  e.target.value = "";
  if (!file) return;
  trImporting.value = true;
  try {
    const wb = await readWorkbookFile(file);
    const sheet = trSheetToUse(wb);
    const parsed = sheet ? parseTreinamentoSheet(sheet) : [];
    if (!parsed.length) {
      toast("Nenhum treinamento encontrado na planilha. Use o template de treinamento.");
      return;
    }
    trRows.value = parsed.map((row) => {
      const matches = findEmployeesByName(row.name).map(trCandidateRecord);
      return {
        ...row,
        candidates: matches,
        missing: matches.length === 0,
        chosen: matches.length === 1 ? matches[0].id : null
      };
    });
    trFilter.value = "todos";
    trMonth.value = currentYm();
    trReviewOpen.value = true;
  } catch (err) {
    console.error(err);
    toast("Não foi possível ler a planilha de treinamentos.");
  } finally {
    trImporting.value = false;
  }
}

function confirmTrImport() {
  let ok = 0;
  let skipped = 0;
  let invalid = 0;
  const dataTreinamento = trMonth.value ? `${trMonth.value}-01` : todayISO();
  trRows.value.forEach((r) => {
    if (r.carga === null || r.carga === undefined || isNaN(Number(r.carga))) {
      invalid++;
      return;
    }
    const emp = r.candidates.find((c) => c.id === r.chosen);
    if (!emp) {
      skipped++;
      return;
    }
    const up = (v) => String(v == null ? "" : v).toUpperCase().trim();
    const filial = up(emp.filial) || null;
    const shortName = up(emp.shortName) || null;
    addEntry("treinamento", {
      date: dataTreinamento,
      value: Number(r.carga),
      state: emp.estado || null,
      meta: {
        employeeId: emp.id,
        employeeName: up(emp.name),
        cargo: up(emp.cargo) || null,
        filial,
        shortName,
        estado: emp.estado || null,
        competencia: trMonth.value || null,
        tema: up(r.tema) || null,
        cargaHoraria: Number(r.carga),
        modalidade: r.modalidadeLabel || "Presencial"
      }
    });
    ok++;
  });
  trReviewOpen.value = false;
  trRows.value = [];
  emit("saved");
  const parts = [`${ok} treinamento(s) lançado(s) em ${trMonthLabel.value}`];
  if (skipped) parts.push(`${skipped} não lançado(s)`);
  if (invalid) parts.push(`${invalid} sem carga horária`);
  toast("Importação concluída — " + parts.join(" · "));
}

/* ---------- Custos Totais (por filial) ---------- */

const custosTotResults = computed(() => {
  const q = normalizeText(custosTot.query).trim();
  let list = listBranches(custosTot.estado);
  if (q) {
    list = list.filter((b) =>
      normalizeText(`${b.branchId} ${b.cnpj} ${b.name} ${b.shortName} ${b.manager || ""}`)
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

/* ---------- Mês de competência (Custos Totais) ---------- */
const custosYearOptions = yearOptions(4, 1);

const custosMonthNum = computed(() =>
  custosTot.month ? Number(custosTot.month.split("-")[1]) : 1
);
const custosYearNum = computed(() =>
  custosTot.month ? Number(custosTot.month.split("-")[0]) : new Date().getFullYear()
);

const custosTotMonthLabel = computed(() => {
  if (!custosTot.month) return "";
  const [y, m] = custosTot.month.split("-");
  const idx = Number(m) - 1;
  return `${MONTHS_SHORT[idx] || m}/${y}`;
});

function setCustosMonth(m) {
  const y = custosYearNum.value;
  custosTot.month = `${y}-${String(m).padStart(2, "0")}`;
}

function setCustosYear(y) {
  const m = String(custosMonthNum.value).padStart(2, "0");
  custosTot.month = `${y}-${m}`;
}

function setCustosCurrentMonth() {
  custosTot.month = currentYm();
}

/* ---------- Valor monetário (R$) com máscara brasileira ---------- */
function onCustosMoneyInput(ev) {
  custosTot.custos = maskCurrencyInput(ev.target.value);
}

function onCustosMoneyBlur() {
  custosTot.custos = normalizeCurrencyInput(custosTot.custos);
}

function submitCustosTotal() {
  const b = custosTotBranch.value;
  if (!b) return toast("Selecione uma filial na aba Filial.");
  if (!custosTot.month) return toast("Informe o mês/ano de referência dos custos.");

  const custosText = normalizeCurrencyInput(custosTot.custos);
  if (custosText === "") return toast("Informe o valor dos custos (R$).");
  const custos = parseCurrencyBR(custosText);
  if (isNaN(custos) || custos < 0) {
    return toast("Informe um valor de custos válido em Reais (R$).");
  }

  let percent = null;
  const percentRaw = String(custosTot.percent).trim();
  if (percentRaw !== "") {
    const p = Number(percentRaw.replace(",", "."));
    if (isNaN(p) || p < 0) {
      return toast("Informe um percentual (%) válido ou deixe em branco.");
    }
    percent = p;
  }

  /* O lançamento é gravado no 1º dia do mês/ano escolhido. */
  const dataCompetencia = `${custosTot.month}-01`;

  const payload = {
    date: dataCompetencia,
    value: custos,
    state: b.estado || null,
    meta: {
      filialId: b.id,
      branchId: b.branchId || null,
      cnpj: b.cnpj || null,
      razaoSocial: b.name || null,
      shortName: b.shortName || null,
      filial: [b.shortName, b.name].filter(Boolean).join(" ").trim() || null,
      percent,
      competencia: custosTot.month
    }
  };

  if (editingEntryId.value) {
    updateEntry("custo_total", editingEntryId.value, payload);
    editingEntryId.value = null;
    emit("saved");
    toast(`Custos de ${custosTotMonthLabel.value} atualizados para ${b.name}.`);
    close();
    return;
  }

  addEntry("custo_total", payload);

  emit("saved");
  toast(`Custos de ${custosTotMonthLabel.value} lançados para ${b.name}: ${formatCurrency(custos)}.`);

  /* Mantém a filial selecionada para o próximo lançamento, limpando apenas
     os dados específicos do custo. */
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

/* Escape fecha apenas a revisão de importação de treinamentos (não o modal). */
function onTrReviewKeydown(e) {
  if (e.key === "Escape") {
    e.preventDefault();
    e.stopPropagation();
    trReviewOpen.value = false;
  }
}

watch(
  () => trReviewOpen.value,
  (open) => {
    if (open) window.addEventListener("keydown", onTrReviewKeydown, true);
    else window.removeEventListener("keydown", onTrReviewKeydown, true);
  }
);

onUnmounted(() => {
  window.removeEventListener("keydown", onSubKeydown, true);
  window.removeEventListener("keydown", onTrReviewKeydown, true);
});
</script>

<template>
  <Modal
    :title="indicator ? indicator.name : 'Lançar dados'"
    :subtitle="indicator ? indicator.desc : ''"
    :open="open"
    max-width="max-w-4xl"
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
            <input id="vagaNome" v-model="vaga.nome" v-upper type="text" class="input-field uppercase" placeholder="Ex.: ANALISTA DE RH" />
          </div>

          <div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <div class="flex flex-col gap-1.5">
              <label for="vagaTipo" class="text-sm font-medium text-zinc-700 dark:text-zinc-200">Tipo de contratação</label>
              <select id="vagaTipo" v-model="vaga.tipo" class="input-field">
                <option value="clt">CLT</option>
                <option value="pj">PJ</option>
              </select>
            </div>
            <div class="flex flex-col gap-1.5">
              <label for="vagaEstado" class="text-sm font-medium text-zinc-700 dark:text-zinc-200">Estado</label>
              <select id="vagaEstado" v-model="estado" class="input-field">
                <option v-for="s in stateOptions" :key="s" :value="s">{{ stateLabel(s) }}</option>
              </select>
            </div>
            <div class="flex flex-col gap-1.5">
              <label for="vagaFilial" class="text-sm font-medium text-zinc-700 dark:text-zinc-200">Filial</label>
              <select id="vagaFilial" v-model="vaga.filialId" class="input-field">
                <option :value="null">— Sem filial —</option>
                <option v-for="b in vagaBranches" :key="b.id" :value="b.id">{{ b.shortName }} — {{ b.name }}</option>
              </select>
            </div>
          </div>

          <div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <div class="flex flex-col gap-1.5">
              <label for="vagaAbertura" class="text-sm font-medium text-zinc-700 dark:text-zinc-200">Data de abertura</label>
              <input id="vagaAbertura" v-model="vaga.abertura" type="date" class="input-field" />
            </div>
            <div class="flex flex-col gap-1.5">
              <label for="vagaFechamento" class="text-sm font-medium text-zinc-700 dark:text-zinc-200">Data de fechamento</label>
              <input id="vagaFechamento" v-model="vaga.fechamento" type="date" class="input-field" />
            </div>
            <div class="flex flex-col gap-1.5">
              <label for="vagaSalario" class="text-sm font-medium text-zinc-700 dark:text-zinc-200">Salário da vaga (R$)</label>
              <input
                id="vagaSalario"
                class="input-field text-right tabular-nums"
                type="text"
                inputmode="decimal"
                autocomplete="off"
                placeholder="0,00"
                :value="vaga.salario"
                @input="onVagaSalaryInput"
                @blur="onVagaSalaryBlur"
              />
            </div>
          </div>

          <div class="rounded-xl border border-dashed border-zinc-300 p-3 dark:border-zinc-700">
            <div class="flex flex-wrap items-center justify-between gap-3">
              <div class="flex min-w-0 flex-col gap-0.5">
                <strong class="text-sm text-zinc-800 dark:text-zinc-100">Importar vagas por planilha</strong>
                <p class="text-xs text-zinc-500 dark:text-zinc-400">
                  Colunas: Nome da vaga · Data de abertura · Data de fechamento · Tipo de contratação (CLT/PJ) · Salário (R$) · Estado · Filial.
                  A filial é cruzada com o cadastro da aba Filiais.
                </p>
              </div>
              <div class="flex flex-wrap gap-2">
                <button type="button" class="btn-ghost btn-sm" @click="downloadVagasTemplate">Baixar template</button>
                <button type="button" class="btn-primary btn-sm" @click="vagaImportInput?.click()">Importar planilha</button>
                <input ref="vagaImportInput" type="file" hidden accept=".xlsx,.xls,.csv" @change="onVagaImportFile" />
              </div>
            </div>
          </div>

          <div class="flex flex-wrap gap-2">
            <button type="button" class="btn-ghost" @click="setVagaNow">Abrir hoje</button>
            <button type="button" class="btn-primary" @click="handleVacancyAdd">
              {{ editingVacancyId ? "Salvar alterações" : "+ Adicionar vaga" }}
            </button>
          </div>
          <p class="text-xs text-zinc-500 dark:text-zinc-400">
            Preencha a data de fechamento para calcular o tempo de contratação; se ficar vazia, a vaga permanece "em aberto".
            O salário informado entra no KPI "Custo de contratação" tanto para vagas abertas quanto fechadas.
          </p>
        </div>

        <div v-show="activeTab === 'historico'" class="flex flex-col gap-3">
          <p v-if="!vacancies.length" class="py-4 text-center text-sm text-zinc-500 dark:text-zinc-400">
            Nenhuma vaga cadastrada. Adicione uma vaga na aba "Nova vaga".
          </p>

          <div v-if="vacancies.length" class="grid grid-cols-3 gap-2">
            <div class="rounded-xl border border-zinc-200 px-3 py-2 dark:border-zinc-800">
              <span class="text-[11px] font-semibold uppercase tracking-wide text-zinc-400">Total de vagas</span>
              <p class="text-xl font-bold tabular-nums text-zinc-900 dark:text-zinc-100">{{ vacancyStats.total }}</p>
            </div>
            <div class="rounded-xl border border-zinc-200 px-3 py-2 dark:border-zinc-800">
              <span class="text-[11px] font-semibold uppercase tracking-wide text-zinc-400">Abertas</span>
              <p class="text-xl font-bold tabular-nums text-accent-hover dark:text-red-400">{{ vacancyStats.abertas }}</p>
            </div>
            <div class="rounded-xl border border-zinc-200 px-3 py-2 dark:border-zinc-800">
              <span class="text-[11px] font-semibold uppercase tracking-wide text-zinc-400">Fechadas</span>
              <p class="text-xl font-bold tabular-nums text-zinc-900 dark:text-zinc-100">{{ vacancyStats.fechadas }}</p>
            </div>
          </div>

          <div v-if="vacancies.length" class="flex flex-wrap items-center justify-between gap-2">
            <label class="flex items-center gap-2 text-xs font-medium text-zinc-500 dark:text-zinc-400">
              <input
                type="checkbox"
                class="h-4 w-4 cursor-pointer accent-red-600"
                :checked="allVacanciesSelected"
                aria-label="Selecionar todas as vagas"
                @change="toggleVacanciesAll"
              />
              Selecionar todas
            </label>
            <div v-if="selectedVacancies.length" class="flex flex-wrap items-center gap-2">
              <span class="rounded-full bg-accent/10 px-2.5 py-1 text-xs font-semibold text-accent-hover dark:text-red-400">
                {{ selectedVacancies.length }} selecionada(s)
              </span>
              <input
                type="date"
                class="input-field w-[150px] px-2 py-1 text-xs"
                :value="bulkCloseDate"
                aria-label="Data de fechamento das vagas selecionadas"
                @input="bulkCloseDate = $event.target.value"
              />
              <button type="button" class="btn-ghost btn-sm" @click="handleBulkVacancyClose">Fechar selecionadas</button>
              <button type="button" class="btn-danger-ghost btn-sm" @click="handleBulkVacancyDelete">Excluir selecionadas</button>
            </div>
          </div>

          <div
            v-for="v in vacancies"
            :key="v.id"
            class="flex items-start gap-3 rounded-xl border border-zinc-200 p-3 dark:border-zinc-800"
            :class="selectedVacancyIds.has(v.id) ? 'bg-accent/5 dark:bg-red-500/5' : ''"
          >
            <input
              type="checkbox"
              class="mt-1 h-4 w-4 shrink-0 cursor-pointer accent-red-600"
              :checked="selectedVacancyIds.has(v.id)"
              aria-label="Selecionar vaga"
              @change="toggleVacancy(v.id)"
            />
            <div class="flex min-w-0 flex-1 flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div class="flex flex-col gap-0.5">
                <strong class="text-sm text-zinc-900 dark:text-zinc-100">{{ v.name }}</strong>
                <span
                  v-if="v.tipoContratacao || vacancyFilial(v) || v.estado"
                  class="text-xs text-zinc-500 dark:text-zinc-400"
                >
                  {{ [tipoContratacaoLabel(v.tipoContratacao), vacancyFilial(v), v.estado].filter(Boolean).join(" · ") }}
                </span>
                <span class="text-xs text-zinc-500 dark:text-zinc-400">Abertura: {{ formatDate(v.openAt) }}</span>
                <span v-if="v.salario != null" class="text-xs text-zinc-500 dark:text-zinc-400">
                  Salário: {{ formatCurrency(v.salario) }}
                </span>
                <span v-if="v.closeAt" class="text-xs text-zinc-500 dark:text-zinc-400">
                  Fechamento: {{ formatDate(v.closeAt) }} · Tempo: {{ formatVacancyTempo(v) }}
                </span>
              </div>
              <div class="flex flex-wrap items-center gap-2">
                <Badge :tone="v.closeAt ? 'dark' : 'accent'">{{ v.closeAt ? "Fechado" : "Em aberto" }}</Badge>
                <button type="button" class="btn-ghost btn-sm" @click="editVacancy(v.id)">Editar</button>
                <input
                  v-if="!v.closeAt"
                  type="date"
                  class="input-field w-[150px] px-2 py-1 text-xs"
                  :value="closeDateFor(v.id)"
                  aria-label="Data de fechamento da vaga"
                  @input="setCloseDate(v.id, $event.target.value)"
                />
                <button v-if="!v.closeAt" type="button" class="btn-primary btn-sm" @click="closeVacancyById(v.id)">Fechar vaga</button>
                <button type="button" class="btn-danger-ghost btn-sm" @click="removeVacancy(v.id)">Excluir</button>
              </div>
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
          <p v-if="diaria.query.trim()" class="text-xs">
            Colaborador não cadastrado?
            <button type="button" class="font-medium text-accent-hover dark:text-red-400" @click="pickDiariaEmployeeManual">
              Lançar mesmo assim para "{{ diaria.query.trim() }}"
            </button>
          </p>
        </div>

        <div v-show="activeTab === 'diaria'" class="flex flex-col gap-4">
          <div class="rounded-xl border border-dashed border-zinc-300 p-3 dark:border-zinc-700">
            <div class="flex flex-wrap items-center justify-between gap-3">
              <div class="flex min-w-0 flex-col gap-0.5">
                <strong class="text-sm text-zinc-800 dark:text-zinc-100">Importar diárias por planilha</strong>
                <p class="text-xs text-zinc-500 dark:text-zinc-400">
                  Colunas: Filial · Colaborador · Função · Periodo · Motivo · Pagamento.
                  Periodo aceita dd/mm/aaaa, mm/aaaa, m/aa ou mm/aa (lançamento por mês).
                  A região é definida pela filial; o colaborador não precisa estar cadastrado.
                </p>
              </div>
              <div class="flex flex-wrap gap-2">
                <button type="button" class="btn-ghost btn-sm" @click="downloadDiariaTemplate">Baixar template</button>
                <button type="button" class="btn-primary btn-sm" @click="diImportInput?.click()">Importar planilha</button>
                <input ref="diImportInput" type="file" hidden accept=".xlsx,.xls,.csv" @change="onDiImportFile" />
              </div>
            </div>
          </div>

          <div class="flex flex-col gap-1.5">
            <label for="diariaSelected" class="text-sm font-medium text-zinc-700 dark:text-zinc-200">Colaborador</label>
            <input
              id="diariaSelected"
              v-model="diaria.employeeName"
              v-upper
              type="text"
              class="input-field"
              :class="diaria.employeeId ? 'cursor-default bg-zinc-100 dark:bg-zinc-800' : ''"
              :readonly="!!diaria.employeeId"
              placeholder="Nome do colaborador"
            />
            <p class="text-xs">
              <span v-if="!diaria.employeeId" class="text-zinc-400 dark:text-zinc-500">Sem vínculo com o cadastro da Equipe. </span>
              <button type="button" class="font-medium text-accent-hover dark:text-red-400" @click="showTab('colaborador')">
                {{ diaria.employeeId ? "Trocar colaborador" : "Buscar colaborador cadastrado" }}
              </button>
            </p>
          </div>

          <fieldset class="rounded-xl border border-zinc-200 p-3 dark:border-zinc-800">
            <legend class="px-1 text-xs font-semibold uppercase tracking-wide text-zinc-400">Contexto do colaborador (auto-preenchido)</legend>
            <div class="grid gap-3 sm:grid-cols-2">
              <div class="flex flex-col gap-1.5">
                <label for="diariaFuncao" class="text-sm font-medium text-zinc-700 dark:text-zinc-200">Função</label>
                <input id="diariaFuncao" v-model="diaria.funcao" v-upper type="text" class="input-field" />
              </div>
              <div class="flex flex-col gap-1.5">
                <label for="diariaDep" class="text-sm font-medium text-zinc-700 dark:text-zinc-200">Departamento</label>
                <input id="diariaDep" v-model="diaria.departamento" v-upper type="text" class="input-field" />
              </div>
              <div class="flex flex-col gap-1.5">
                <label for="diariaFilial" class="text-sm font-medium text-zinc-700 dark:text-zinc-200">Filial</label>
                <input id="diariaFilial" v-model="diaria.filial" v-upper type="text" class="input-field" />
              </div>
              <div class="flex flex-col gap-1.5">
                <label for="diariaLider" class="text-sm font-medium text-zinc-700 dark:text-zinc-200">Líder imediato</label>
                <input id="diariaLider" v-model="diaria.liderImediato" v-upper type="text" class="input-field" />
              </div>
              <div class="flex flex-col gap-1.5">
                <label for="diariaGerente" class="text-sm font-medium text-zinc-700 dark:text-zinc-200">Gerente regional</label>
                <input id="diariaGerente" v-model="diaria.gerenteRegional" v-upper type="text" class="input-field" />
              </div>
              <div class="flex flex-col gap-1.5">
                <label for="diariaRegional" class="text-sm font-medium text-zinc-700 dark:text-zinc-200">Regional</label>
                <input id="diariaRegional" v-model="diaria.regional" v-upper type="text" class="input-field" />
              </div>
            </div>
          </fieldset>

          <div class="grid gap-4 sm:grid-cols-2">
            <div class="flex flex-col gap-1.5">
              <label for="diariaMonth" class="text-sm font-medium text-zinc-700 dark:text-zinc-200">Mês da diária</label>
              <select id="diariaMonth" class="input-field" :value="diariaMonthNum" @change="setDiariaMonth(Number($event.target.value))">
                <option v-for="(mName, i) in MONTHS_SHORT" :key="i + 1" :value="i + 1">{{ mName }}</option>
              </select>
            </div>
            <div class="flex flex-col gap-1.5">
              <label for="diariaYear" class="text-sm font-medium text-zinc-700 dark:text-zinc-200">Ano</label>
              <select id="diariaYear" class="input-field" :value="diariaYearNum" @change="setDiariaYear(Number($event.target.value))">
                <option v-for="y in diariaYearOptions" :key="y" :value="y">{{ y }}</option>
              </select>
            </div>
          </div>

          <div class="flex flex-wrap items-center justify-between gap-2">
            <button type="button" class="btn-ghost btn-sm" @click="setDiariaCurrentMonth">Mês atual</button>
            <span class="text-xs text-zinc-500 dark:text-zinc-400">
              Competência: <strong>{{ diariaMonthLabel }}</strong>
            </span>
          </div>

          <div class="grid gap-4">
            <div class="flex flex-col gap-1.5">
              <label for="diariaMotivo" class="text-sm font-medium text-zinc-700 dark:text-zinc-200">Diária</label>
              <input id="diariaMotivo" v-model="diaria.motivo" v-upper type="text" class="input-field" placeholder="Ex.: VISITA À LOJA..." />
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
          <div class="rounded-xl border border-dashed border-zinc-300 p-3 dark:border-zinc-700">
            <div class="flex flex-wrap items-center justify-between gap-3">
              <div class="flex min-w-0 flex-col gap-0.5">
                <strong class="text-sm text-zinc-800 dark:text-zinc-100">Importar treinamentos por planilha</strong>
                <p class="text-xs text-zinc-500 dark:text-zinc-400">
                  Colunas: Colaborador · Tema do treinamento · Carga horária (horas) · Modalidade.
                  Os nomes são cruzados com a equipe (ignorando maiúsculas/minúsculas, acentos e espaços).
                </p>
              </div>
              <div class="flex flex-wrap gap-2">
                <button type="button" class="btn-ghost btn-sm" @click="downloadTreinamentoTemplate">Baixar template</button>
                <button type="button" class="btn-primary btn-sm" @click="trImportInput?.click()">Importar planilha</button>
                <input ref="trImportInput" type="file" hidden accept=".xlsx,.xls,.csv" @change="onTrImportFile" />
              </div>
            </div>
          </div>

          <div class="flex flex-col gap-1.5">
            <label for="trSelected" class="text-sm font-medium text-zinc-700 dark:text-zinc-200">Colaborador selecionado</label>
            <input id="trSelected" class="input-field cursor-default bg-zinc-100 dark:bg-zinc-800" readonly :value="treinamentoEmployeeName" placeholder="Nenhum selecionado" />
            <p v-if="treinamento.employeeId" class="text-xs">
              <button type="button" class="font-medium text-accent-hover dark:text-red-400" @click="showTab('colaborador')">Trocar colaborador</button>
            </p>
          </div>

          <div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <div class="flex flex-col gap-1.5">
              <label for="trCargo" class="text-sm font-medium text-zinc-700 dark:text-zinc-200">Cargo</label>
              <input id="trCargo" v-model="treinamento.cargo" v-upper type="text" class="input-field" />
            </div>
            <div class="flex flex-col gap-1.5">
              <label for="trFilial" class="text-sm font-medium text-zinc-700 dark:text-zinc-200">Loja (Filial)</label>
              <input id="trFilial" v-model="treinamento.filial" v-upper type="text" class="input-field" />
            </div>
            <div class="flex flex-col gap-1.5">
              <label for="trMonth" class="text-sm font-medium text-zinc-700 dark:text-zinc-200">Mês do treinamento</label>
              <select id="trMonth" class="input-field" :value="treinamentoMonthNum" @change="setTreinamentoMonth(Number($event.target.value))">
                <option v-for="(mName, i) in MONTHS_SHORT" :key="i + 1" :value="i + 1">{{ mName }}</option>
              </select>
            </div>
            <div class="flex flex-col gap-1.5">
              <label for="trYear" class="text-sm font-medium text-zinc-700 dark:text-zinc-200">Ano</label>
              <select id="trYear" class="input-field" :value="treinamentoYearNum" @change="setTreinamentoYear(Number($event.target.value))">
                <option v-for="y in treinamentoYearOptions" :key="y" :value="y">{{ y }}</option>
              </select>
            </div>
          </div>

          <div class="flex flex-wrap items-center justify-between gap-2">
            <button type="button" class="btn-ghost btn-sm" @click="setTreinamentoCurrentMonth">Mês atual</button>
            <span class="text-xs text-zinc-500 dark:text-zinc-400">
              Competência: <strong>{{ treinamentoMonthLabel }}</strong>
            </span>
          </div>

          <div class="flex flex-col gap-1.5">
            <label for="trTema" class="text-sm font-medium text-zinc-700 dark:text-zinc-200">Tema do treinamento</label>
            <input id="trTema" v-model="treinamento.tema" v-upper type="text" class="input-field" placeholder="Ex.: EXCEL, ATENDIMENTO, NR 35..." />
          </div>

          <div class="grid gap-4 sm:grid-cols-2">
            <div class="flex flex-col gap-1.5">
              <label for="trCarga" class="text-sm font-medium text-zinc-700 dark:text-zinc-200">Carga horária</label>
              <input id="trCarga" v-model="treinamento.cargaHoraria" type="text" inputmode="decimal" class="input-field" placeholder="Ex.: 8, 12:00 ou 12:30" />
            </div>
            <div class="flex flex-col gap-1.5">
              <label for="trModalidade" class="text-sm font-medium text-zinc-700 dark:text-zinc-200">Modalidade</label>
              <select id="trModalidade" v-model="treinamento.modalidade" class="input-field">
                <option v-for="m in MODALIDADE_OPTIONS" :key="m.value" :value="m.value">{{ m.label }}</option>
              </select>
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

          <div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <div class="flex flex-col gap-1.5">
              <label for="ctMonth" class="text-sm font-medium text-zinc-700 dark:text-zinc-200">Mês de referência</label>
              <select id="ctMonth" class="input-field" :value="custosMonthNum" @change="setCustosMonth(Number($event.target.value))">
                <option v-for="(mName, i) in MONTHS_SHORT" :key="i + 1" :value="i + 1">{{ mName }}</option>
              </select>
            </div>
            <div class="flex flex-col gap-1.5">
              <label for="ctYear" class="text-sm font-medium text-zinc-700 dark:text-zinc-200">Ano</label>
              <select id="ctYear" class="input-field" :value="custosYearNum" @change="setCustosYear(Number($event.target.value))">
                <option v-for="y in custosYearOptions" :key="y" :value="y">{{ y }}</option>
              </select>
            </div>
            <div class="flex flex-col gap-1.5">
              <label for="ctCustos" class="text-sm font-medium text-zinc-700 dark:text-zinc-200">Custos (R$)</label>
              <input
                id="ctCustos"
                class="input-field text-right tabular-nums"
                type="text"
                inputmode="decimal"
                autocomplete="off"
                placeholder="0,00"
                :value="custosTot.custos"
                @input="onCustosMoneyInput"
                @blur="onCustosMoneyBlur"
              />
            </div>
            <div class="flex flex-col gap-1.5">
              <label for="ctPercent" class="text-sm font-medium text-zinc-700 dark:text-zinc-200">%</label>
              <input id="ctPercent" v-model="custosTot.percent" type="number" min="0" step="any" class="input-field" placeholder="0,00 (informativo)" />
            </div>
          </div>
          <div class="flex flex-wrap items-center justify-between gap-2">
            <button type="button" class="btn-ghost btn-sm" @click="setCustosCurrentMonth">Mês atual</button>
            <span class="text-xs text-zinc-500 dark:text-zinc-400">
              Competência: <strong>{{ custosTotMonthLabel }}</strong> · O valor é armazenado como número (ex.: 1.500,50).
            </span>
          </div>
          <p class="text-xs text-zinc-500 dark:text-zinc-400">
            O campo % é informativo (ex.: participação da filial) e aparece nos registros do indicador.
          </p>
        </div>
      </template>

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

    <!-- ===== Revisão de importação de diárias ===== -->
    <Teleport to="body">
      <div
        v-if="diReviewOpen"
        class="fixed inset-0 z-[90] flex items-start justify-center bg-black/50 p-4 py-10"
      >
        <div class="slide-up flex max-h-[90vh] w-full max-w-4xl flex-col overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-2xl dark:border-zinc-800 dark:bg-zinc-900">
          <div class="flex items-start justify-between gap-4 border-b border-zinc-100 px-6 py-4 dark:border-zinc-800">
            <div>
              <h3 class="text-lg font-bold text-zinc-900 dark:text-zinc-100">Revisar diárias importadas</h3>
              <p class="mt-0.5 text-sm text-zinc-500 dark:text-zinc-400">
                {{ diRows.length }} linha(s) · {{ diEntriesCount }} lançamento(s) a criar ·
                {{ diErrorCount }} linha(s) com erro
              </p>
            </div>
            <button type="button" class="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-xl leading-none text-zinc-400 transition hover:bg-zinc-100 hover:text-zinc-700 dark:hover:bg-zinc-800 dark:hover:text-zinc-200" aria-label="Fechar" @click="diReviewOpen = false">&times;</button>
          </div>

          <div class="flex flex-1 flex-col gap-2 overflow-y-auto px-6 py-4">
            <p class="text-xs text-zinc-500 dark:text-zinc-400">
              Quando houver dois ou mais colaboradores com o mesmo nome, escolha qual é qual abaixo — colaboradores não
              cadastrados são lançados mesmo assim, usando o nome da planilha.
            </p>

            <div
              v-for="(r, idx) in diRows"
              :key="idx"
              class="rounded-xl border border-zinc-200 p-3 dark:border-zinc-800"
              :class="r.errors.length ? 'border-red-400 bg-red-50/60 dark:border-red-500/40 dark:bg-red-500/5' : (r.warnings.length || r.candidates.length > 1) ? 'border-amber-400 bg-amber-50/60 dark:border-amber-500/40 dark:bg-amber-500/5' : ''"
            >
              <div class="flex flex-wrap items-start justify-between gap-2">
                <div class="flex min-w-0 flex-col gap-0.5">
                  <div class="flex flex-wrap items-center gap-2">
                    <strong class="text-sm text-zinc-900 dark:text-zinc-100">Linha {{ r.rowNumber }} — {{ r.colaboradorText || "Sem colaborador" }}</strong>
                    <Badge v-if="r.candidates.length === 1" tone="accent">1 colaborador</Badge>
                    <Badge v-else-if="r.candidates.length > 1" tone="muted">{{ r.candidates.length }} colaboradores</Badge>
                    <Badge v-else-if="r.colaboradorText" tone="muted">sem cadastro</Badge>
                  </div>
                  <p class="text-xs text-zinc-500 dark:text-zinc-400">
                    {{ r.filialText || "Sem filial" }}<span v-if="r.funcaoText"> · {{ r.funcaoText }}</span> ·
                    {{ diPeriodoLabel(r) }}<span v-if="r.motivoText"> · {{ r.motivoText }}</span> ·
                    {{ r.pagamento != null ? formatCurrency(r.pagamento) : "sem pagamento" }}
                  </p>
                </div>
              </div>

              <ul v-if="r.errors.length" class="mt-2 list-disc pl-4 text-xs font-medium text-red-600 dark:text-red-400">
                <li v-for="(msg, i) in r.errors" :key="'err' + i">{{ msg }}</li>
              </ul>

              <ul v-if="r.warnings.length" class="mt-2 list-disc pl-4 text-xs font-medium text-amber-600 dark:text-amber-400">
                <li v-for="(msg, i) in r.warnings" :key="'warn' + i">{{ msg }}</li>
              </ul>

              <div v-if="!r.errors.length && r.colaboradorText" class="mt-2 flex flex-col gap-1">
                <label class="text-[11px] font-semibold uppercase tracking-wide text-zinc-400">Vincular a qual colaborador?</label>
                <select v-model="r.chosen" class="input-field" :disabled="!r.candidates.length">
                  <option value="">— Não vincular (lançar com o nome da planilha) —</option>
                  <option v-for="c in r.candidates" :key="c.id" :value="c.id">
                    {{ diCandidateLabel(c) }}
                  </option>
                </select>
              </div>
            </div>
          </div>

          <div class="flex justify-end gap-2 border-t border-zinc-100 px-6 py-4 dark:border-zinc-800">
            <button type="button" class="btn-ghost" @click="diReviewOpen = false">Cancelar</button>
            <button type="button" class="btn-primary" :disabled="!diEntriesCount" @click="confirmDiImport">
              Lançar {{ diEntriesCount }} diária(s)
            </button>
          </div>
        </div>
      </div>
    </Teleport>

    <LoadingOverlay :show="diImporting" label="Importando diárias..." />

    <!-- ===== Revisão de importação de treinamentos ===== -->
    <Teleport to="body">
      <div
        v-if="trReviewOpen"
        class="fixed inset-0 z-[90] flex items-start justify-center bg-black/50 p-4 py-10"
      >
        <div class="slide-up flex max-h-[90vh] w-full max-w-4xl flex-col overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-2xl dark:border-zinc-800 dark:bg-zinc-900">
          <div class="flex items-start justify-between gap-4 border-b border-zinc-100 px-6 py-4 dark:border-zinc-800">
            <div>
              <h3 class="text-lg font-bold text-zinc-900 dark:text-zinc-100">Revisar treinamentos importados</h3>
              <p class="mt-0.5 text-sm text-zinc-500 dark:text-zinc-400">
                {{ trRows.length }} linha(s) · {{ trAmbiguousCount }} com nomes ambíguos ·
                {{ trMissingCount }} sem colaborador correspondente
              </p>
            </div>
            <button type="button" class="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-xl leading-none text-zinc-400 transition hover:bg-zinc-100 hover:text-zinc-700 dark:hover:bg-zinc-800 dark:hover:text-zinc-200" aria-label="Fechar" @click="trReviewOpen = false">&times;</button>
          </div>

          <div class="flex flex-1 flex-col gap-2 overflow-y-auto px-6 py-4">
            <div class="flex flex-wrap items-center gap-2 rounded-xl border border-zinc-200 px-3 py-2 dark:border-zinc-800">
              <span class="text-xs font-semibold uppercase tracking-wide text-zinc-400">Mês do treinamento</span>
              <select
                class="input-field w-auto"
                :value="trMonthNum"
                aria-label="Mês do treinamento"
                @change="setTrMonth(Number($event.target.value))"
              >
                <option v-for="(mName, i) in MONTHS_SHORT" :key="i + 1" :value="i + 1">{{ mName }}</option>
              </select>
              <select
                class="input-field w-auto"
                :value="trYearNum"
                aria-label="Ano do treinamento"
                @change="setTrYear(Number($event.target.value))"
              >
                <option v-for="y in trYearOptions" :key="y" :value="y">{{ y }}</option>
              </select>
              <span class="text-xs text-zinc-500 dark:text-zinc-400">
                Competência: <strong class="text-zinc-700 dark:text-zinc-200">{{ trMonthLabel }}</strong>
              </span>
            </div>

            <div class="flex flex-wrap items-center justify-between gap-2">
              <p class="text-xs text-zinc-500 dark:text-zinc-400">
                Quando houver dois ou mais colaboradores com o mesmo nome, escolha qual é qual abaixo — ou “Não lançar”.
              </p>
              <select v-model="trFilter" class="input-field w-auto" aria-label="Filtrar por causa">
                <option v-for="opt in trFilterOptions" :key="opt.value" :value="opt.value">{{ opt.label }}</option>
              </select>
            </div>

            <div
              v-for="(r, idx) in visibleTrRows"
              :key="idx"
              class="rounded-xl border border-zinc-200 p-3 dark:border-zinc-800"
              :class="r.candidates.length > 1 && !r.missing ? 'border-amber-400 bg-amber-50/60 dark:border-amber-500/40 dark:bg-amber-500/5' : ''"
            >
              <div class="flex flex-wrap items-start justify-between gap-2">
                <div class="flex min-w-0 flex-col gap-0.5">
                  <div class="flex flex-wrap items-center gap-2">
                    <strong class="text-sm text-zinc-900 dark:text-zinc-100">{{ r.name }}</strong>
                    <Badge v-if="r.candidates.length === 1 && !r.missing" tone="accent">1 colaborador</Badge>
                    <Badge v-else-if="r.candidates.length > 1 && !r.missing" tone="muted">{{ r.candidates.length }} colaboradores</Badge>
                  </div>
                  <p class="text-xs text-zinc-500 dark:text-zinc-400">
                    {{ r.tema || "Sem tema" }} · {{ r.carga != null ? formatHoursClock(r.carga) : "sem carga horária" }} ·
                    {{ r.modalidadeLabel || "Presencial" }}
                  </p>
                </div>
                <span v-if="r.missing" class="text-xs font-semibold text-red-600 dark:text-red-400">
                  Colaborador não encontrado na equipe
                </span>
                <span v-else-if="r.carga === null || r.carga === undefined" class="text-xs font-semibold text-amber-600 dark:text-amber-400">
                  Sem carga horária — não será lançado
                </span>
              </div>

              <div class="mt-2 flex flex-col gap-1">
                <label class="text-[11px] font-semibold uppercase tracking-wide text-zinc-400">Lançar para qual colaborador?</label>
                <select
                  v-model="r.chosen"
                  class="input-field"
                  :disabled="r.missing || r.candidates.length === 0"
                >
                  <option value="">— Não lançar —</option>
                  <option v-for="c in r.candidates" :key="c.id" :value="c.id">
                    {{ trCandidateLabel(c) }}
                  </option>
                </select>
              </div>
            </div>
          </div>

          <div class="flex justify-end gap-2 border-t border-zinc-100 px-6 py-4 dark:border-zinc-800">
            <button type="button" class="btn-ghost" @click="trReviewOpen = false">Cancelar</button>
            <button type="button" class="btn-primary" :disabled="!trSelectedCount" @click="confirmTrImport">
              Lançar {{ trSelectedCount }} treinamento(s) em {{ trMonthLabel }}
            </button>
          </div>
        </div>
      </div>
    </Teleport>

    <LoadingOverlay :show="trImporting" label="Importando treinamentos..." />
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
