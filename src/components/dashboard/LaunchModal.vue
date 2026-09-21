<script setup>
import { ref, reactive, computed, watch, onMounted, onUnmounted } from "vue";
import Modal from "@/components/ui/Modal.vue";
import Badge from "@/components/ui/Badge.vue";
import LoadingOverlay from "@/components/ui/LoadingOverlay.vue";
import SalaryPicker from "@/components/dashboard/SalaryPicker.vue";
import { listBranches } from "@/lib/filiais";
import { hydrateState } from "@/lib/db";
import { employeeNameKey } from "@/lib/metrics";
import {
  MANUAL_INDICATORS,
  STATES,
  STATE_NAMES,
  DEFAULT_STATE,
  MODALIDADE_OPTIONS,
  getIndicatorById
} from "@/lib/config";
import {
  addEntry,
  updateEntry,
  removeEntries,
  getEntriesFor,
  getLatestForMeta,
  getEmployeeById,
  getVacancyById,
  getTurnoverById,
  getHeadcountById,
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
  findBranchByShortName,
  listTurnoverEntries,
  addTurnoverEntry,
  updateTurnoverEntry,
  deleteTurnoverEntry,
  deleteTurnoverEntries,
  listHeadcountRecords,
  addHeadcountRecord,
  updateHeadcountRecord,
  markHeadcountDemitido,
  findHeadcountByCodigo,
  findHeadcountMatches,
  deleteHeadcountRecord,
  deleteHeadcountRecords
} from "@/lib/employees";
import {
  readWorkbookFile,
  parseTreinamentoSheet,
  downloadTreinamentoTemplate,
  parseVagasSheet,
  downloadVagasTemplate,
  exportVagas,
  parseDiariaSheet,
  downloadDiariaTemplate,
  parseTurnoverSheet,
  downloadTurnoverTemplate,
  exportTurnover,
  parseHeadcountSheet,
  downloadHeadcountTemplate,
  exportHeadcount,
  parseHeadcountDemitidosSheet,
  downloadHeadcountDemitidosTemplate
} from "@/lib/export";
import {
  todayISO,
  formatDate,
  formatValue,
  formatCurrency,
  currentYm,
  MONTHS_SHORT,
  yearOptions,
  maskCurrencyInput,
  normalizeCurrencyInput,
  parseCurrencyBR,
  parseHoursBR,
  formatHoursClock,
  normalizeText,
  daysBetween,
  singleMonthOfRange,
  ymLabel
} from "@/lib/utils";
import { useToast } from "@/composables/useToast";
import { useDialog } from "@/composables/useDialog";
import { useFilters } from "@/composables/useFilters";
import { dateFilter } from "@/composables/useDateFilter";

const props = defineProps({
  open: { type: Boolean, default: false },
  editEntry: { type: Object, default: null },
  editVacancyId: { type: String, default: null },
  /* Abre direto na aba Histórico de um indicador (ex.: Turnover, vindo do
     botão direito no card do KPI), sem pré-selecionar nenhum registro. */
  viewIndicatorId: { type: String, default: null }
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
  /* Lançamento importado da planilha (sem vínculo com a Equipe): guarda o
     nome e o estado gravados, para que ele continue editável. */
  employeeName: "",
  estado: "",
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
const sub = reactive({ kind: null, employee: null }); // kind: "salario"
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
  vacancySearch.value = "";
  vacancyOnlyNegative.value = false;
  selectedVacancyIds.value = new Set();
  Object.keys(closeDates).forEach((k) => delete closeDates[k]);
  bulkCloseDate.value = todayISO();
  resetTurnoverForm();
  turnoverSearch.value = "";
  turnoverKindFilter.value = null;
  selectedTurnoverIds.value = new Set();
  resetHeadcountForm();
  headcountSearch.value = "";
  headcountFilterFilialId.value = null;
  headcountAdmissaoStart.value = "";
  headcountAdmissaoEnd.value = "";
  headcountDemitidosResult.value = null;
  headcountDemitidosPending.value = [];
  selectedHeadcountIds.value = new Set();
  resetMensalForm();

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

  /* Abre direto no histórico de um indicador (botão direito no KPI, clique
     na pizza do Turnover). O histórico segue o Estado do formulário (ver
     turnoverList), que aqui parte do filtro do dashboard — inclusive "Todos
     Estados"; antes caía sempre em RO e escondia AM e PA. */
  if (props.viewIndicatorId) {
    indicatorId.value = props.viewIndicatorId;
    buildForm();
    estado.value = filters.current;
    showTab("historico");
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
    treinamento.employeeName = m.employeeName || "";
    treinamento.estado = m.estado || "";
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

  if (getIndicatorById(indId) && getIndicatorById(indId).form === "mensal") {
    editingMensalId.value = entry.id;
    mensal.estado = m.estado || (filters.current !== "todos" ? filters.current : DEFAULT_STATE);
    mensal.mes = entry.date ? String(entry.date).slice(0, 7) : currentYm();
    mensal.valor = entry.value != null ? String(entry.value) : "";
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
  treinamento.employeeName = "";
  treinamento.estado = "";
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
    case "turnover":
    case "headcount":
      return [
        { id: "novo", label: "Novo" },
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
    case "turnover":
    case "headcount":
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
  return (
    f === "vaga" ||
    f === "turnover" ||
    f === "headcount" ||
    f === "custo" ||
    f === "diaria" ||
    f === "treinamento" ||
    f === "custo_total" ||
    f === "mensal"
  );
});

function buildForm() {
  activeTab.value = tabs.value.length ? tabs.value[0].id : "";
}

function showTab(id) {
  activeTab.value = id;
}

/* ---------- Salário dos Colaboradores ---------- */

const pickerDefaultState = computed(() =>
  filters.current === "todos" ? DEFAULT_STATE : filters.current
);

function closeSub() {
  sub.kind = null;
  sub.employee = null;
}

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

/* Busca da aba Histórico (vaga, tipo, filial, estado). */
const vacancySearch = ref("");
/* Dias de contratação de uma vaga fechada; null se ainda em aberto ou sem
   datas válidas. Pode ser negativo quando o fechamento foi lançado antes da
   abertura (erro de digitação) — é o que o filtro abaixo identifica. */
function vacancyDays(v) {
  if (!v || !v.openAt || !v.closeAt) return null;
  const days = daysBetween(v.openAt, v.closeAt);
  return days === null || isNaN(days) ? null : days;
}
/* Mostra só vagas com tempo de contratação negativo (data de fechamento
   anterior à de abertura), para facilitar achar e corrigir esses lançamentos. */
const vacancyOnlyNegative = ref(false);
const filteredVacancies = computed(() => {
  const q = normalizeText(vacancySearch.value).trim();
  let list = vacancies.value;
  if (q) {
    list = list.filter((v) =>
      normalizeText(
        [v.name, tipoContratacaoLabel(v.tipoContratacao), vacancyFilial(v), v.estado || ""].join(" ")
      ).includes(q)
    );
  }
  if (vacancyOnlyNegative.value) {
    list = list.filter((v) => {
      const days = vacancyDays(v);
      return days !== null && days < 0;
    });
  }
  return list;
});

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

/* Exporta as vagas conforme os filtros atuais da aba Histórico (busca e
   "somente dias negativos"). */
function handleExportVagas() {
  if (!filteredVacancies.value.length) return toast("Nenhuma vaga para exportar com os filtros atuais.");
  exportVagas(filteredVacancies.value);
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
    filteredVacancies.value.length > 0 &&
    filteredVacancies.value.every((v) => selectedVacancyIds.value.has(v.id))
);

function toggleVacancy(id) {
  const next = new Set(selectedVacancyIds.value);
  if (next.has(id)) next.delete(id);
  else next.add(id);
  selectedVacancyIds.value = next;
}

function toggleVacanciesAll() {
  if (allVacanciesSelected.value) selectedVacancyIds.value = new Set();
  else selectedVacancyIds.value = new Set(filteredVacancies.value.map((v) => v.id));
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

/* ---------- Turnover (quantidade lançada manualmente) ----------
   Não depende mais de colaboradores individuais: cada lançamento é só a
   quantidade de admitidos/demitidos de uma filial num mês de referência
   (lançado à mão ou importado por planilha) — puramente visual no KPI de
   Turnover, mas usada no cálculo de Turnover (%) e Retenção (ver
   turnoverRateStats/retentionRate em lib/employees.js). */
const turnover = reactive({
  filialId: null,
  mesReferencia: "",
  admitidos: "",
  demitidos: "",
  ativos: ""
});
const editingTurnoverId = ref(null);
const turnoverImportInput = ref(null);
const turnoverSearch = ref("");
/* Filtro pelos cards do Histórico: "admissoes" mostra só as empresas com
   admissões, "demissoes" só as com demissões (clicar de novo remove). */
const turnoverKindFilter = ref(null);
const selectedTurnoverIds = ref(new Set());

function resetTurnoverForm() {
  turnover.filialId = null;
  turnover.mesReferencia = "";
  turnover.admitidos = "";
  turnover.demitidos = "";
  turnover.ativos = "";
  editingTurnoverId.value = null;
}

const turnoverBranches = computed(() =>
  listBranches(estado.value === "todos" ? "todos" : estado.value)
);

function submitTurnover() {
  if (!turnover.mesReferencia) return toast("Informe o mês de referência.");
  const st = effectiveVagaEstado();
  const payload = {
    filialId: turnover.filialId,
    mesReferencia: turnover.mesReferencia,
    admitidos: Number(turnover.admitidos) || 0,
    demitidos: Number(turnover.demitidos) || 0,
    ativos: Number(turnover.ativos) || 0,
    estado: st
  };

  if (editingTurnoverId.value) {
    updateTurnoverEntry(editingTurnoverId.value, payload);
    toast("Turnover atualizado.");
  } else {
    addTurnoverEntry(payload);
    toast("Turnover lançado.");
  }

  resetTurnoverForm();
  showTab("historico");
  emit("saved");
}

function editTurnover(id) {
  const t = getTurnoverById(id);
  if (!t) return;
  editingTurnoverId.value = id;
  turnover.filialId = t.filialId || null;
  turnover.mesReferencia = t.mesReferencia || "";
  turnover.admitidos = t.admitidos != null ? String(t.admitidos) : "";
  turnover.demitidos = t.demitidos != null ? String(t.demitidos) : "";
  turnover.ativos = t.ativos != null ? String(t.ativos) : "";
  if (t.estado && t.estado !== estado.value) estado.value = t.estado;
  showTab("novo");
}

async function removeTurnover(id) {
  const t = getTurnoverById(id);
  if (!t) return;
  const ok = await confirm({
    title: "Excluir lançamento?",
    message: "O registro de Turnover será removido permanentemente.",
    confirmText: "Excluir",
    danger: true
  });
  if (!ok) return;
  deleteTurnoverEntry(id);
  emit("saved");
  toast("Registro excluído.");
}

/* ---------- Histórico (aba Histórico) ----------
   Segue o filtro de Estado do próprio formulário de Turnover (`estado`,
   selecionado na aba "Novo"), não o filtro global do dashboard — assim
   trocar o Estado ali também atualiza o que aparece no Histórico. */
const turnoverList = computed(() => listTurnoverEntries(estado.value));

function turnoverFilial(t) {
  const b = t && t.filialId ? getBranchById(t.filialId) : null;
  return b ? b.name || b.shortName : "";
}

const filteredTurnover = computed(() => {
  const q = normalizeText(turnoverSearch.value).trim();
  let list = turnoverList.value;
  if (q) {
    list = list.filter((t) =>
      normalizeText([turnoverFilial(t), t.mesReferencia || "", t.estado || ""].join(" ")).includes(q)
    );
  }
  if (turnoverKindFilter.value === "admissoes") list = list.filter((t) => (Number(t.admitidos) || 0) > 0);
  else if (turnoverKindFilter.value === "demissoes") list = list.filter((t) => (Number(t.demitidos) || 0) > 0);
  return list;
});

function toggleTurnoverKind(kind) {
  turnoverKindFilter.value = turnoverKindFilter.value === kind ? null : kind;
}

/* Totais de Admitidos/Demitidos somados sobre os registros exibidos no
   Histórico (respeitando a busca e o filtro dos cards) — mostrados como KPI
   acima da lista: com "Total admissões" ativo, o total de demissões passa a
   ser só o das empresas que têm admissões (e vice-versa). */
const turnoverTotals = computed(() =>
  filteredTurnover.value.reduce(
    (acc, t) => {
      acc.admitidos += Number(t.admitidos) || 0;
      acc.demitidos += Number(t.demitidos) || 0;
      return acc;
    },
    { admitidos: 0, demitidos: 0 }
  )
);

/* ---------- Seleção múltipla de turnover (aba Histórico) ---------- */
const selectedTurnovers = computed(() => turnoverList.value.filter((t) => selectedTurnoverIds.value.has(t.id)));
const allTurnoverSelected = computed(
  () =>
    filteredTurnover.value.length > 0 &&
    filteredTurnover.value.every((t) => selectedTurnoverIds.value.has(t.id))
);

function toggleTurnoverRow(id) {
  const next = new Set(selectedTurnoverIds.value);
  if (next.has(id)) next.delete(id);
  else next.add(id);
  selectedTurnoverIds.value = next;
}

function toggleTurnoverAll() {
  if (allTurnoverSelected.value) selectedTurnoverIds.value = new Set();
  else selectedTurnoverIds.value = new Set(filteredTurnover.value.map((t) => t.id));
}

async function handleBulkTurnoverDelete() {
  const list = selectedTurnovers.value;
  const n = list.length;
  if (!n) return;
  const ok = await confirm({
    title: `Excluir ${n} registro(s)?`,
    message: "Os registros selecionados serão removidos permanentemente.",
    confirmText: `Excluir ${n}`,
    danger: true
  });
  if (!ok) return;
  deleteTurnoverEntries(list.map((t) => t.id));
  selectedTurnoverIds.value = new Set();
  emit("saved");
  toast(`${n} registro(s) excluído(s).`);
}

/* ---------- Importação de turnover por planilha ---------- */
function turnoverSheetToUse(wb) {
  if (wb.Sheets["Turnover"]) return wb.Sheets["Turnover"];
  const keys = Object.keys(wb.Sheets || {});
  return keys.length ? wb.Sheets[keys[0]] : null;
}

async function onTurnoverImportFile(e) {
  const file = e.target.files && e.target.files[0];
  e.target.value = "";
  if (!file) return;
  try {
    await hydrateState("todos");
    const wb = await readWorkbookFile(file);
    const sheet = turnoverSheetToUse(wb);
    const parsed = sheet ? parseTurnoverSheet(sheet) : [];
    if (!parsed.length) {
      toast("Nenhum registro encontrado na planilha. Use o template de turnover.");
      return;
    }
    const toImport = [];
    const duplicates = [];
    let skipped = 0;
    parsed.forEach((row) => {
      if (!row.mesReferencia) {
        skipped++;
        return;
      }
      const est = row.estado || (filters.current !== "todos" ? filters.current : DEFAULT_STATE);
      /* Cruza a Filial com o Estado definitivo da linha — evita achar a
         filial errada quando o nome abreviado se repete em outro estado. */
      const branch = row.filialText ? findBranchByShortName(row.filialText, est) : null;
      const filialId = branch ? branch.id : null;
      const item = {
        filialId,
        mesReferencia: row.mesReferencia,
        admitidos: row.admitidos,
        demitidos: row.demitidos,
        ativos: row.ativos,
        estado: est
      };
      /* Duplicado: já existe um lançamento para a mesma filial + mês de
         referência (mesmo critério usado pela edição manual). */
      const dup = listTurnoverEntries(est).some(
        (t) => (t.filialId || null) === filialId && t.mesReferencia === row.mesReferencia
      );
      if (dup) duplicates.push(item);
      else toImport.push(item);
    });

    if (duplicates.length) {
      /* "Cancelar importação" e clicar fora do modal levam ao mesmo
         resultado (ConfirmDialog resolve `false` nos dois casos): aborta a
         importação inteira, sem lançar nem os registros novos. */
      const importDuplicates = await confirm({
        title: "Lançamentos já cadastrados",
        message: `${duplicates.length} registro(s) já existem no turnover (mesma filial e mês de referência). Deseja importar mesmo assim?`,
        confirmText: "Importar mesmo assim",
        cancelText: "Cancelar importação"
      });
      if (!importDuplicates) {
        toast("Importação cancelada.");
        return;
      }
    }

    const finalList = toImport.concat(duplicates);
    finalList.forEach((item) => addTurnoverEntry(item));

    emit("saved");
    const parts = [`${finalList.length} registro(s) lançado(s)`];
    if (duplicates.length) parts.push(`${duplicates.length} duplicado(s) importado(s) mesmo assim`);
    if (skipped) parts.push(`${skipped} ignorado(s)`);
    toast("Importação concluída — " + parts.join(" · "));
    showTab("historico");
  } catch (err) {
    console.error(err);
    toast("Não foi possível ler a planilha de turnover.");
  }
}

function handleExportTurnover() {
  if (!filteredTurnover.value.length) return toast("Nenhum registro para exportar com os filtros atuais.");
  exportTurnover(filteredTurnover.value, "turnover");
}

/* ---------- Headcount (quadro de colaboradores lançado por mês) ---------- */
const headcount = reactive({
  codigo: "",
  colaborador: "",
  funcao: "",
  remuneracao: "",
  dataAdmissao: "",
  filialId: null
});
const editingHeadcountId = ref(null);
const headcountImportInput = ref(null);
const headcountDemitidosImportInput = ref(null);
const headcountDemitidosResult = ref(null);
const headcountDemitidosPending = ref([]);
/* Linhas ignoradas na importação de novos colaboradores (sem Data de admissão
   válida): { items, resolve } enquanto o modal pergunta se devem ser importadas. */
const headcountIgnoredReview = ref(null);
const headcountDemitidosTotal = ref(0);
const headcountDemitidosCounts = ref(null);
const headcountSearch = ref("");
const headcountFilterFilialId = ref(null);
/* Filtro por Data de admissão (De/Até) na aba Histórico — independente do
   mês travado pelo filtro do dashboard (headcountViewMonth). */
const headcountAdmissaoStart = ref("");
const headcountAdmissaoEnd = ref("");
const selectedHeadcountIds = ref(new Set());

/* Empresas (filiais) disponíveis para o headcount, conforme o estado selecionado. */
const headcountBranches = computed(() =>
  listBranches(estado.value === "todos" ? "todos" : estado.value)
);

/* Empresas do filtro do Histórico — só as que realmente têm colaborador na
   tabela (mês/estado do filtro do dashboard), não o cadastro inteiro de
   filiais. */
const headcountFilterBranches = computed(() => {
  const seen = new Map();
  headcountList.value.forEach((h) => {
    if (!h.filialId || seen.has(h.filialId)) return;
    const b = getBranchById(h.filialId);
    if (b) seen.set(h.filialId, b);
  });
  return Array.from(seen.values()).sort((a, b) =>
    String(a.shortName || "").localeCompare(String(b.shortName || ""))
  );
});

function resetHeadcountForm() {
  headcount.codigo = "";
  headcount.colaborador = "";
  headcount.funcao = "";
  headcount.remuneracao = "";
  headcount.dataAdmissao = "";
  headcount.filialId = null;
  editingHeadcountId.value = null;
}

function onHeadcountSalaryInput(ev) {
  headcount.remuneracao = maskCurrencyInput(ev.target.value);
}
function onHeadcountSalaryBlur() {
  headcount.remuneracao = normalizeCurrencyInput(headcount.remuneracao);
}

function submitHeadcount() {
  const nome = headcount.colaborador.trim();
  if (!nome) return toast("Informe o colaborador.");
  if (!headcount.dataAdmissao) return toast("Informe a data de admissão.");
  const st = effectiveVagaEstado();
  const remuneracaoText = normalizeCurrencyInput(headcount.remuneracao);
  const remuneracao = remuneracaoText === "" ? null : parseCurrencyBR(remuneracaoText);
  if (remuneracao !== null && isNaN(remuneracao)) return toast("Informe uma remuneração válida (R$).");

  const payload = {
    codigo: headcount.codigo,
    colaborador: nome,
    funcao: headcount.funcao,
    remuneracao,
    dataAdmissao: headcount.dataAdmissao,
    /* O quadro não tem mais "mês de lançamento" próprio — o filtro por mês
       usa a Data de admissão como base (ver activeInMonth em employees.js). */
    mesReferencia: String(headcount.dataAdmissao).slice(0, 7),
    filialId: headcount.filialId,
    estado: st
  };

  if (editingHeadcountId.value) {
    updateHeadcountRecord(editingHeadcountId.value, payload);
    toast(`Headcount atualizado para ${nome}.`);
  } else {
    addHeadcountRecord(payload);
    toast(`Headcount lançado para ${nome} (admissão em ${formatDate(headcount.dataAdmissao)}).`);
  }

  resetHeadcountForm();
  showTab("historico");
  emit("saved");
}

function editHeadcount(id) {
  const h = getHeadcountById(id);
  if (!h) return;
  editingHeadcountId.value = id;
  headcount.codigo = h.codigo || "";
  headcount.colaborador = h.colaborador || "";
  headcount.funcao = h.funcao || "";
  headcount.remuneracao = h.remuneracao != null ? normalizeCurrencyInput(String(h.remuneracao)) : "";
  headcount.dataAdmissao = h.dataAdmissao ? String(h.dataAdmissao).slice(0, 10) : "";
  headcount.filialId = h.filialId || null;
  if (h.estado && h.estado !== estado.value) estado.value = h.estado;
  showTab("novo");
}

async function removeHeadcount(id) {
  const h = getHeadcountById(id);
  if (!h) return;
  const ok = await confirm({
    title: "Excluir registro?",
    message: `O registro de "${h.colaborador}" será removido permanentemente.`,
    confirmText: "Excluir",
    danger: true
  });
  if (!ok) return;
  deleteHeadcountRecord(id);
  emit("saved");
  toast("Registro excluído.");
}

/* ---------- Histórico (aba Histórico) ----------
   Sempre travado no mês selecionado no filtro global do dashboard (sem
   filtro de data manual aqui) — "mostrando os colaboradores desse mês". */
const headcountViewMonth = computed(() => singleMonthOfRange(dateFilter.start, dateFilter.end) || currentYm());
const headcountViewMonthLabel = computed(() => ymLabel(headcountViewMonth.value));

const headcountList = computed(() => listHeadcountRecords(filters.current, headcountViewMonth.value));

function headcountBranchLabel(h) {
  const b = h && h.filialId ? getBranchById(h.filialId) : null;
  return b ? `${b.shortName} — ${b.name}` : "";
}

/* Histórico: só o nome completo da empresa (sem a sigla). A busca continua
   usando headcountBranchLabel, então ainda encontra pela sigla. */
function headcountBranchName(h) {
  const b = h && h.filialId ? getBranchById(h.filialId) : null;
  return b ? b.name : "";
}

const filteredHeadcount = computed(() => {
  let list = headcountList.value;
  if (headcountFilterFilialId.value) {
    list = list.filter((h) => h.filialId === headcountFilterFilialId.value);
  }
  if (headcountAdmissaoStart.value) {
    list = list.filter((h) => h.dataAdmissao && String(h.dataAdmissao).slice(0, 10) >= headcountAdmissaoStart.value);
  }
  if (headcountAdmissaoEnd.value) {
    list = list.filter((h) => h.dataAdmissao && String(h.dataAdmissao).slice(0, 10) <= headcountAdmissaoEnd.value);
  }
  const q = normalizeText(headcountSearch.value).trim();
  if (!q) return list;
  return list.filter((h) =>
    normalizeText([h.codigo, h.colaborador, h.funcao, h.estado || "", headcountBranchLabel(h)].join(" ")).includes(q)
  );
});

/* ---------- Seleção múltipla de headcount (aba Histórico) ---------- */
const selectedHeadcounts = computed(() => headcountList.value.filter((h) => selectedHeadcountIds.value.has(h.id)));
const allHeadcountSelected = computed(
  () =>
    filteredHeadcount.value.length > 0 &&
    filteredHeadcount.value.every((h) => selectedHeadcountIds.value.has(h.id))
);

function toggleHeadcountRow(id) {
  const next = new Set(selectedHeadcountIds.value);
  if (next.has(id)) next.delete(id);
  else next.add(id);
  selectedHeadcountIds.value = next;
}

function toggleHeadcountAll() {
  if (allHeadcountSelected.value) selectedHeadcountIds.value = new Set();
  else selectedHeadcountIds.value = new Set(filteredHeadcount.value.map((h) => h.id));
}

async function handleBulkHeadcountDelete() {
  const list = selectedHeadcounts.value;
  const n = list.length;
  if (!n) return;
  const ok = await confirm({
    title: `Excluir ${n} registro(s)?`,
    message: "Os registros selecionados serão removidos permanentemente.",
    confirmText: `Excluir ${n}`,
    danger: true
  });
  if (!ok) return;
  deleteHeadcountRecords(list.map((h) => h.id));
  selectedHeadcountIds.value = new Set();
  emit("saved");
  toast(`${n} registro(s) excluído(s).`);
}

/* ---------- Importação de headcount por planilha ---------- */
function headcountSheetToUse(wb) {
  if (wb.Sheets["Headcount"]) return wb.Sheets["Headcount"];
  const keys = Object.keys(wb.Sheets || {});
  return keys.length ? wb.Sheets[keys[0]] : null;
}

/* "Novos colaboradores": só cria registro para quem ainda não existe no
   headcount (verificado por Empresa + Código) — evita duplicar quem já foi
   lançado antes, já que o headcount agora é um quadro persistente, não
   reimportado todo mês. Quando encontra duplicidade, avisa e pergunta se
   quer importar mesmo assim (em vez de ignorar direto). */
async function onHeadcountImportFile(e) {
  const file = e.target.files && e.target.files[0];
  e.target.value = "";
  if (!file) return;
  try {
    const wb = await readWorkbookFile(file);
    const sheet = headcountSheetToUse(wb);
    const parsed = sheet ? parseHeadcountSheet(sheet) : [];
    if (!parsed.length) {
      toast("Nenhum registro encontrado na planilha. Use o template de headcount.");
      return;
    }

    const toImport = [];
    const duplicates = [];
    const ignored = [];
    parsed.forEach((row) => {
      const est = row.estado || (filters.current !== "todos" ? filters.current : DEFAULT_STATE);
      /* Cruza a Empresa com o Estado definitivo da linha — evita achar a
         filial errada quando o nome abreviado se repete em outro estado. */
      const empresa = row.empresaText ? findBranchByShortName(row.empresaText, est) : null;
      const filialId = empresa ? empresa.id : null;
      /* Sem Data de admissão válida a linha é separada: o modal abaixo mostra
         o motivo e pergunta se ela deve ser importada mesmo assim. */
      if (!row.dataAdmissao) {
        ignored.push({
          linha: row.linha,
          colaborador: row.colaboradorText,
          codigo: row.codigo,
          motivo: headcountIgnoreReason(row),
          item: {
            codigo: row.codigo,
            colaborador: row.colaboradorText,
            funcao: row.funcaoText,
            remuneracao: row.remuneracao,
            dataAdmissao: null,
            filialId,
            estado: est
          }
        });
        return;
      }
      const dup = row.codigo && findHeadcountByCodigo(est, row.codigo, filialId);
      const item = {
        codigo: row.codigo,
        colaborador: row.colaboradorText,
        funcao: row.funcaoText,
        remuneracao: row.remuneracao,
        dataAdmissao: row.dataAdmissao,
        mesReferencia: String(row.dataAdmissao).slice(0, 7),
        filialId,
        estado: est
      };
      if (dup) duplicates.push(item);
      else toImport.push(item);
    });

    if (duplicates.length) {
      /* "Cancelar importação" e clicar fora do modal levam ao mesmo
         resultado (ConfirmDialog resolve `false` nos dois casos): aborta a
         importação inteira, sem lançar nem os registros novos. */
      const importDuplicates = await confirm({
        title: "Colaboradores já cadastrados",
        message: `${duplicates.length} registro(s) já existem no headcount (mesma empresa e código). Deseja importar mesmo assim?`,
        confirmText: "Importar mesmo assim",
        cancelText: "Cancelar importação"
      });
      if (!importDuplicates) {
        toast("Importação cancelada.");
        return;
      }
    }

    /* Linhas ignoradas (sem Data de admissão válida): mostra o motivo de cada
       uma e pergunta se devem ser importadas. Sem data, o registro vai para o
       mês do filtro atual do dashboard (o banco exige um mês de referência). */
    let ignoredImported = 0;
    if (ignored.length) {
      const importIgnored = await askImportIgnoredHeadcount(ignored);
      if (importIgnored) {
        const fallbackYm = headcountIgnoredFallbackYm();
        ignored.forEach(({ item }) => toImport.push({ ...item, mesReferencia: fallbackYm }));
        ignoredImported = ignored.length;
      }
    }
    const skipped = ignored.length - ignoredImported;

    const finalList = toImport.concat(duplicates);
    finalList.forEach((item) => addHeadcountRecord(item));

    emit("saved");
    const parts = [`${finalList.length} colaborador(es) lançado(s)`];
    if (duplicates.length) parts.push(`${duplicates.length} duplicado(s) importado(s) mesmo assim`);
    if (ignoredImported) parts.push(`${ignoredImported} importado(s) sem data de admissão`);
    if (skipped) parts.push(`${skipped} ignorado(s)`);
    toast("Importação concluída — " + parts.join(" · "));
    showTab("historico");
  } catch (err) {
    console.error(err);
    toast("Não foi possível ler a planilha de headcount.");
  }
}

/* Motivo pelo qual uma linha do headcount é ignorada (Data de admissão). */
function headcountIgnoreReason(row) {
  const raw = String(row.dataAdmissaoTexto ?? "").trim();
  return raw
    ? `Data de admissão inválida ("${raw}") — use aaaa-mm-dd ou dd/mm/aaaa`
    : "Data de admissão não preenchida";
}

/* Mês de referência das linhas importadas sem Data de admissão: o mês do
   filtro do dashboard (ou o atual, se o filtro não for um mês fechado). */
function headcountIgnoredFallbackYm() {
  return singleMonthOfRange(dateFilter.start, dateFilter.end) || currentYm();
}

/* Abre o modal de linhas ignoradas e espera a resposta (true = importar). */
function askImportIgnoredHeadcount(items) {
  return new Promise((resolve) => {
    headcountIgnoredReview.value = { items, resolve };
  });
}

function answerIgnoredHeadcount(answer) {
  const review = headcountIgnoredReview.value;
  headcountIgnoredReview.value = null;
  if (review) review.resolve(answer);
}

/* "Demitidos": não cria registro novo — localiza o colaborador pelo Código +
   Nome (sem depender mais de Empresa) e muda o status para "demitido" a
   partir do mês de desligamento da própria linha. A planilha traz demitidos
   de todos os meses de uma vez (sem mês único escolhido na tela); quem já
   estiver demitido simplesmente é pulado. Quando Código + Nome batem em mais
   de um colaborador do headcount (duplicidade), a linha fica pendente e a
   tela abre um modal pedindo para escolher qual é qual antes de fechar o
   resumo final. */
function headcountDemitidosSheetToUse(wb) {
  if (wb.Sheets["Demitidos"]) return wb.Sheets["Demitidos"];
  const keys = Object.keys(wb.Sheets || {});
  return keys.length ? wb.Sheets[keys[0]] : null;
}

/* Aplica o desligamento a um registro já resolvido do headcount (seja pelo
   match direto, seja pela escolha manual na duplicidade) — soma nos
   contadores do resumo final. Só altera o status do headcount: não cria mais
   nada no Turnover (que virou lançamento de quantidade, não por colaborador)
   nem no Tempo médio de permanência (que agora tem seu próprio modal e
   importação, ver PermanenciaModal.vue). */
function applyHeadcountDemitido(match, demitidoMes, counts) {
  if (match.status === "demitido") {
    counts.jaDemitidos++;
    return;
  }
  markHeadcountDemitido(match.id, demitidoMes);
  counts.alterados++;
}

function finishHeadcountDemitidosImport() {
  emit("saved");
  headcountDemitidosResult.value = {
    total: headcountDemitidosTotal.value,
    ...headcountDemitidosCounts.value
  };
  showTab("historico");
}

async function onHeadcountDemitidosImportFile(e) {
  const file = e.target.files && e.target.files[0];
  e.target.value = "";
  if (!file) return;
  try {
    const wb = await readWorkbookFile(file);
    const sheet = headcountDemitidosSheetToUse(wb);
    const parsed = sheet ? parseHeadcountDemitidosSheet(sheet) : [];
    if (!parsed.length) {
      toast("Nenhum colaborador encontrado na planilha. Use o template de demitidos.");
      return;
    }
    const est = effectiveVagaEstado();

    const counts = {
      alterados: 0,
      jaDemitidos: 0,
      semData: 0,
      naoEncontrado: 0,
      naoResolvidos: 0
    };
    const pending = [];

    parsed.forEach((row) => {
      /* A "Data de desligamento" vem de cada linha da planilha — sem seletor
         de mês na tela, linha sem data é ignorada. */
      if (!row.demitidoMes) {
        counts.semData++;
        return;
      }
      const matches = findHeadcountMatches(est, row.codigo, row.colaboradorText);
      if (!matches.length) {
        counts.naoEncontrado++;
        return;
      }
      if (matches.length > 1) {
        pending.push({
          codigo: row.codigo,
          colaboradorText: row.colaboradorText,
          demitidoMes: row.demitidoMes,
          candidates: matches,
          selectedId: null
        });
        return;
      }
      applyHeadcountDemitido(matches[0], row.demitidoMes, counts);
    });

    headcountDemitidosTotal.value = parsed.length;
    headcountDemitidosCounts.value = counts;

    if (pending.length) {
      headcountDemitidosPending.value = pending;
    } else {
      finishHeadcountDemitidosImport();
    }
  } catch (err) {
    console.error(err);
    toast("Não foi possível ler a planilha de demitidos.");
  }
}

/* Resolve as duplicidades (Código + Nome batendo em mais de um colaborador):
   aplica o desligamento à opção escolhida em cada uma; quem ficou sem
   escolha entra em "naoResolvidos" no resumo final. */
function confirmHeadcountDemitidosPending() {
  const counts = { ...headcountDemitidosCounts.value };
  headcountDemitidosPending.value.forEach((item) => {
    const match = item.selectedId ? item.candidates.find((c) => c.id === item.selectedId) : null;
    if (!match) {
      counts.naoResolvidos++;
      return;
    }
    applyHeadcountDemitido(match, item.demitidoMes, counts);
  });
  headcountDemitidosCounts.value = counts;
  headcountDemitidosPending.value = [];
  finishHeadcountDemitidosImport();
}

/* Pula todas as duplicidades pendentes sem aplicar nada. */
function skipHeadcountDemitidosPending() {
  const counts = { ...headcountDemitidosCounts.value };
  counts.naoResolvidos += headcountDemitidosPending.value.length;
  headcountDemitidosCounts.value = counts;
  headcountDemitidosPending.value = [];
  finishHeadcountDemitidosImport();
}

function handleExportHeadcount() {
  if (!filteredHeadcount.value.length) return toast("Nenhum registro para exportar com os filtros atuais.");
  exportHeadcount(filteredHeadcount.value);
}

/* ---------- Lançamento mensal (Absenteísmo, Tempo de
   permanência, Retenção) ---------- */
const mensal = reactive({
  estado: DEFAULT_STATE,
  mes: currentYm(),
  valor: ""
});
const editingMensalId = ref(null);
const mensalYearOptions = yearOptions(4, 1);

const mensalMonthNum = computed(() => (mensal.mes ? Number(mensal.mes.split("-")[1]) : new Date().getMonth() + 1));
const mensalYearNum = computed(() => (mensal.mes ? Number(mensal.mes.split("-")[0]) : new Date().getFullYear()));

function setMensalMonth(m) {
  mensal.mes = `${mensalYearNum.value}-${String(m).padStart(2, "0")}`;
}
function setMensalYear(y) {
  mensal.mes = `${y}-${String(mensalMonthNum.value).padStart(2, "0")}`;
}
function setMensalCurrentMonth() {
  mensal.mes = currentYm();
}

function resetMensalForm() {
  mensal.estado = filters.current !== "todos" ? filters.current : DEFAULT_STATE;
  mensal.mes = currentYm();
  mensal.valor = "";
  editingMensalId.value = null;
}

function submitMensal() {
  const ind = indicator.value;
  if (!ind) return;
  if (!mensal.mes) return toast("Informe o mês.");
  const raw = String(mensal.valor).trim();
  if (raw === "" || isNaN(Number(raw)) || Number(raw) < 0) {
    return toast(`Informe um valor válido para ${ind.name}.`);
  }
  const value = Number(raw);
  const payload = {
    date: `${mensal.mes}-01`,
    value,
    state: mensal.estado,
    meta: { estado: mensal.estado, competencia: mensal.mes }
  };

  if (editingMensalId.value) {
    updateEntry(ind.id, editingMensalId.value, payload);
    toast(`${ind.name} atualizado para ${MONTHS_SHORT[mensalMonthNum.value - 1]}/${mensalYearNum.value}.`);
  } else {
    /* Um lançamento por mês/estado: lançar de novo no mesmo mês substitui o
       valor anterior em vez de duplicar a linha. */
    const existing = getEntriesFor(ind.id, mensal.estado).find(
      (e) => e.date === payload.date && e.meta && e.meta.estado === mensal.estado
    );
    if (existing) {
      updateEntry(ind.id, existing.id, payload);
    } else {
      addEntry(ind.id, payload);
    }
    toast(`${ind.name} lançado para ${MONTHS_SHORT[mensalMonthNum.value - 1]}/${mensalYearNum.value}: ${value}.`);
  }

  emit("saved");
  resetMensalForm();
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
    toast(`Custo médio de contratação atualizado para ${emp.name}.`);
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
  toast(`Custo médio de contratação lançado para ${emp.name}.`);
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
/* Cada linha válida vira exatamente uma diária (lançada no mês informado).
   Os colaboradores NÃO são cruzados com a Equipe: entram como estão na
   planilha, só para visualização nas diárias (não contam no Headcount). Nomes
   iguais (sem acento, caixa e espaços) são juntados num único colaborador. */
/* Chave de uma diária: colaborador, mês, motivo e valor. Não inclui estado nem
   filial (podem variar entre importações da mesma planilha). */
function diKey(name, mes, motivo, valor) {
  const flat = (v) => normalizeText(v).replace(/\s+/g, "");
  return [employeeNameKey(name), mes || "", flat(motivo), Math.round(Number(valor) * 100)].join("|");
}

/* Diárias já lançadas, contadas por chave. A diária é por MÊS (sem dia), então
   linhas iguais na mesma planilha podem ser legítimas (3 diárias de R$ 150 no
   mês). Por isso a comparação é por QUANTIDADE: cada diária já existente
   "consome" uma linha igual da planilha — importar a mesma planilha de novo não
   duplica, mas linhas repetidas de propósito continuam valendo. */
const diExistingCounts = computed(() => {
  const counts = new Map();
  getEntriesFor("custo_diaria").forEach((e) => {
    const m = e.meta || {};
    const mes = m.semPeriodo ? "" : String(e.date || "").slice(0, 7);
    const key = diKey(m.employeeName, mes, m.motivo, e.value);
    counts.set(key, (counts.get(key) || 0) + 1);
  });
  return counts;
});

const diDupRows = computed(() => {
  const counts = new Map(diExistingCounts.value);
  const dup = new Set();
  diValidRows.value.forEach((r) => {
    const key = diKey(r.colaboradorText, r.periodo.ok ? r.periodo.mes : "", r.motivoText, r.pagamento);
    const left = counts.get(key) || 0;
    if (left > 0) {
      counts.set(key, left - 1);
      dup.add(r);
    }
  });
  return dup;
});

const diEntriesCount = computed(() => diValidRows.value.length - diDupRows.value.size);
const diDistinctCount = computed(
  () => new Set(diValidRows.value.map((r) => employeeNameKey(r.colaboradorText))).size
);

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
    /* Periodo só com o nome do mês ("agosto") assume o ano do mês filtrado no dashboard. */
    const defaultYear = Number(String(singleMonthOfRange(dateFilter.start, dateFilter.end) || currentYm()).slice(0, 4));
    const parsed = sheet ? parseDiariaSheet(sheet, { defaultYear }) : [];
    if (!parsed.length) {
      toast("Nenhuma diária encontrada na planilha. Use o template de diária.");
      return;
    }
    diRows.value = parsed.map((row) => {
      /* Só invalida a linha (não importa) quando falta colaborador ou
         pagamento. Filial e período em branco/não reconhecidos são apenas
         avisos — a diária é lançada mesmo assim, sem esses dados. */
      const errors = [];
      const warnings = [];
      if (!row.filialText) warnings.push("Filial não informada.");
      if (!row.colaboradorText) errors.push("Colaborador não informado.");
      if (!row.periodo.ok) warnings.push(row.periodo.reason);
      if (row.pagamento === null) errors.push("Pagamento inválido ou não informado.");
      /* Estado: coluna opcional da planilha; sem ela (ou inválido), o do
         filtro atual do dashboard. */
      const estadoRow = String(row.estadoText || "").toUpperCase().trim();
      const estado = STATES.includes(estadoRow)
        ? estadoRow
        : filters.current !== "todos"
          ? filters.current
          : DEFAULT_STATE;
      /* Sem Estado na planilha e com o filtro em "Todos", tudo cairia em RO sem
         ninguém perceber — avisa, para a soma por estado não ficar errada. */
      if (!STATES.includes(estadoRow) && filters.current === "todos") {
        warnings.push(`Estado não informado — será lançada em ${DEFAULT_STATE}.`);
      }
      return {
        ...row,
        estado,
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

  /* Nomes iguais viram um só colaborador: a primeira grafia vale para todas as
     linhas — inclusive as de diárias já lançadas antes (mesma pessoa em
     importações diferentes). */
  const canonical = new Map();
  getEntriesFor("custo_diaria").forEach((e) => {
    const name = e.meta && e.meta.employeeName;
    const key = employeeNameKey(name);
    if (key && !canonical.has(key)) canonical.set(key, name);
  });

  let duplicated = 0;
  diValidRows.value.forEach((r) => {
    if (diDupRows.value.has(r)) {
      duplicated++;
      return;
    }
    const key = employeeNameKey(r.colaboradorText);
    if (!canonical.has(key)) canonical.set(key, String(r.colaboradorText).replace(/\s+/g, " ").trim().toUpperCase());
    const employeeName = canonical.get(key);
    /* Filial e estado entram como vêm na planilha (sem cruzar com o cadastro
       de Filiais). */
    const state = r.estado;
    const mes = r.periodo.ok ? r.periodo.mes : null;

    const meta = {
      employeeId: null,
      employeeName,
      funcao: up(r.funcaoText),
      departamento: null,
      filial: up(r.filialText),
      liderImediato: null,
      gerenteRegional: null,
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
  if (duplicated) parts.push(`${duplicated} já lançada(s) (não repetida(s))`);
  if (errorCount) parts.push(`${errorCount} linha(s) com erro não importada(s)`);
  toast("Importação concluída — " + parts.join(" · "));
}

/* ---------- Treinamento ---------- */

const treinamentoEmployeeName = computed(() => {
  if (!treinamento.employeeId) return treinamento.employeeName;
  const emp = getEmployeeById(treinamento.employeeId);
  return emp ? `${emp.name} · ${emp.cargo || emp.sector}` : "";
});

function pickTreinamentoEmployee(e) {
  treinamento.employeeId = e.id;
  treinamento.employeeName = "";
  treinamento.estado = "";
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
  const found = treinamento.employeeId ? getEmployeeById(treinamento.employeeId) : null;
  /* Lançamento importado da planilha não tem vínculo com a Equipe: ao editar,
     mantém o nome e o estado gravados. */
  const emp = found
    ? { id: found.id, name: found.name, estado: found.estado }
    : editingEntryId.value && treinamento.employeeName
      ? { id: null, name: treinamento.employeeName, estado: treinamento.estado || null }
      : null;
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
  fillTreinamentoContext(found);
}

/* ---------- Lista única de colaboradores (aba Colaborador do Treinamento) ----------
   Uma só lista: colaboradores da Equipe (com ou sem treinamento) e os
   importados da planilha (treinamentos sem vínculo com a Equipe, agrupados por
   nome). Clicar num colaborador lança/edita o treinamento dele; marcar e
   excluir remove os treinamentos (e as horas) no estado do filtro atual, em
   todos os meses — o cadastro da Equipe nunca é alterado. */
const trPeople = computed(() => {
  const byEmployee = new Map();
  const byName = new Map();
  const push = (map, key, entry) => {
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(entry);
  };
  getEntriesFor("treinamento", filters.current).forEach((e) => {
    const m = e.meta || {};
    if (m.employeeId) push(byEmployee, m.employeeId, e);
    else push(byName, m.employeeName || "Sem colaborador", e);
  });

  const build = (key, name, employee, list, cargo, search) => {
    const entries = list.slice().sort((a, b) => String(b.date).localeCompare(String(a.date)));
    return {
      key,
      name,
      employee,
      cargo: String(cargo || ""),
      search,
      entries,
      count: entries.length,
      horas: entries.reduce((sum, e) => sum + (Number(e.value) || 0), 0)
    };
  };

  const people = [];
  getEmployees().forEach((emp) => {
    const list = byEmployee.get(emp.id) || [];
    byEmployee.delete(emp.id);
    people.push(
      build(`emp:${emp.id}`, emp.name, emp, list, emp.cargo || emp.sector, `${emp.name} ${emp.cargo || ""} ${emp.sector || ""} ${emp.user || ""}`)
    );
  });
  /* Treinamentos de um colaborador que já não existe na Equipe entram como
     importados (só o nome gravado no lançamento). */
  byEmployee.forEach((list, id) => {
    const name = (list[0].meta && list[0].meta.employeeName) || "Sem colaborador";
    people.push(build(`orphan:${id}`, name, null, list, list[0].meta && list[0].meta.cargo, name));
  });
  byName.forEach((list, name) => {
    const cargo = (list.find((e) => e.meta && e.meta.cargo) || {}).meta;
    people.push(build(`name:${name}`, name, null, list, cargo && cargo.cargo, `${name} ${(cargo && cargo.cargo) || ""}`));
  });

  /* Quem já tem treinamento primeiro; depois por nome. */
  return people.sort(
    (a, b) => Number(b.count > 0) - Number(a.count > 0) || a.name.localeCompare(b.name, "pt-BR")
  );
});

const trPeopleVisible = computed(() => {
  const q = normalizeText(treinamento.query).trim();
  if (!q) return trPeople.value;
  return trPeople.value.filter((x) => normalizeText(x.search).includes(q));
});

/* Só quem tem treinamento pode ser marcado para exclusão. */
const trSelectable = computed(() => trPeopleVisible.value.filter((x) => x.count > 0));
const trSelected = ref(new Set());
const trAllSelected = computed(
  () => trSelectable.value.length > 0 && trSelectable.value.every((x) => trSelected.value.has(x.key))
);
const trExpanded = ref(null);

function toggleTrPerson(key) {
  const next = new Set(trSelected.value);
  if (next.has(key)) next.delete(key);
  else next.add(key);
  trSelected.value = next;
}

function toggleTrAll() {
  trSelected.value = trAllSelected.value ? new Set() : new Set(trSelectable.value.map((x) => x.key));
}

/* Novo treinamento para um colaborador da Equipe (descarta uma edição em
   andamento e limpa os campos do treinamento). */
function newTreinamentoFor(emp) {
  if (!emp) return;
  editingEntryId.value = null;
  treinamento.month = currentYm();
  treinamento.tema = "";
  treinamento.cargaHoraria = "";
  treinamento.modalidade = "presencial";
  pickTreinamentoEmployee(emp);
}

/* Clique no colaborador: sem treinamento → novo; com um só → edita; com vários
   → expande a lista para escolher qual editar. Com uma edição em andamento, o
   clique num colaborador sem treinamento só troca o colaborador do lançamento. */
function onTrPersonClick(x) {
  if (!x.count) {
    if (editingEntryId.value) pickTreinamentoEmployee(x.employee);
    else newTreinamentoFor(x.employee);
    return;
  }
  if (x.count === 1) {
    prefillEdit("treinamento", x.entries[0]);
    return;
  }
  trExpanded.value = trExpanded.value === x.key ? null : x.key;
}

async function deleteTrSelected() {
  const chosen = trPeople.value.filter((x) => trSelected.value.has(x.key));
  const entries = chosen.flatMap((x) => x.entries);
  if (!entries.length) return;
  const horas = chosen.reduce((sum, x) => sum + x.horas, 0);
  const ok = await confirm({
    title: `Excluir os treinamentos de ${chosen.length} colaborador(es)?`,
    message: `Serão removidos definitivamente ${entries.length} treinamento(s) (${formatHoursClock(horas)} h) desses colaboradores, em todos os meses. O cadastro da Equipe não é alterado e os totais serão recalculados.`,
    confirmText: `Excluir ${chosen.length}`,
    danger: true
  });
  if (!ok) return;
  removeEntries(entries.map((entry) => ({ indicatorId: "treinamento", entry })));
  trSelected.value = new Set();
  trExpanded.value = null;
  emit("saved");
  toast(`${chosen.length} colaborador(es) e ${entries.length} treinamento(s) excluído(s).`);
}

/* ---------- Importação de treinamentos por planilha ----------
   Os colaboradores são lançados exatamente como vêm na planilha — sem cruzar
   com o cadastro da Equipe. Cargo, Filial e Estado são colunas opcionais; sem
   Estado, vale o estado do filtro atual do dashboard. */
const trImportInput = ref(null);
const trReviewOpen = ref(false);
const trRows = ref([]);
const trImporting = ref(false);

function trHasCarga(r) {
  return r.carga !== null && r.carga !== undefined && !isNaN(Number(r.carga));
}

/* Detecta linhas já lançadas: mesmo estado, colaborador, tema, carga horária e
   mês de competência. Sem isso, importar a mesma planilha duas vezes dobrava as
   horas de Treinamento (a soma do KPI conta cada lançamento). */
function trKey(estado, name, tema, carga, ym) {
  const flat = (v) => normalizeText(v).replace(/\s+/g, "");
  return [String(estado || "").toUpperCase(), flat(name), flat(tema), Math.round(Number(carga) * 60), ym].join("|");
}

const trExistingKeys = computed(() => {
  const keys = new Set();
  getEntriesFor("treinamento").forEach((e) => {
    const m = e.meta || {};
    keys.add(trKey(m.estado, m.employeeName, m.tema, e.value, String(e.date || "").slice(0, 7)));
  });
  return keys;
});

function trIsDuplicate(r) {
  return trHasCarga(r) && trExistingKeys.value.has(trKey(r.estado, r.name, r.tema, r.carga, trMonth.value));
}

const trDupCount = computed(() => trRows.value.filter(trIsDuplicate).length);
const trValidCount = computed(() => trRows.value.filter((r) => trHasCarga(r) && !trIsDuplicate(r)).length);
const trInvalidCount = computed(() => trRows.value.filter((r) => !trHasCarga(r)).length);

/* Linhas sem carga horária (não serão lançadas) primeiro; depois por nome. */
const visibleTrRows = computed(() =>
  trRows.value
    .slice()
    .sort(
      (a, b) =>
        Number(trHasCarga(a)) - Number(trHasCarga(b)) || String(a.name || "").localeCompare(String(b.name || ""))
    )
);

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
    const defaultEstado = filters.current !== "todos" ? filters.current : DEFAULT_STATE;
    const up = (v) => String(v == null ? "" : v).toUpperCase().trim();
    trRows.value = parsed.map((row) => {
      const estadoRow = up(row.estado);
      const estado = STATES.includes(estadoRow) ? estadoRow : defaultEstado;
      /* A filial da planilha é resolvida pelo nome abreviado (no estado da
         linha); se não existir no cadastro de Filiais, o texto digitado vale
         como está. */
      const branch = row.filialText ? findBranchByShortName(row.filialText, estado) : null;
      const filial = branch ? up(`${branch.shortName} ${branch.name}`) : up(row.filialText);
      return {
        ...row,
        estado,
        filial: filial || null,
        shortName: branch && branch.shortName ? up(branch.shortName) : null
      };
    });
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
  let invalid = 0;
  let duplicated = 0;
  const dataTreinamento = trMonth.value ? `${trMonth.value}-01` : todayISO();
  const up = (v) => String(v == null ? "" : v).toUpperCase().trim();
  trRows.value.forEach((r) => {
    if (!trHasCarga(r)) {
      invalid++;
      return;
    }
    if (trIsDuplicate(r)) {
      duplicated++;
      return;
    }
    addEntry("treinamento", {
      date: dataTreinamento,
      value: Number(r.carga),
      state: r.estado,
      meta: {
        employeeName: up(r.name),
        cargo: up(r.cargo) || null,
        filial: r.filial,
        shortName: r.shortName,
        estado: r.estado,
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
  if (duplicated) parts.push(`${duplicated} já lançado(s) neste mês (não repetido(s))`);
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

  /* Um lançamento por filial/mês: lançar de novo no mesmo mês substitui o
     valor anterior em vez de duplicar a linha (a soma dos custos contaria a
     filial duas vezes). */
  const existingCusto = getEntriesFor("custo_total").find(
    (e) => e.date === dataCompetencia && e.meta && e.meta.filialId === b.id
  );
  if (existingCusto) {
    updateEntry("custo_total", existingCusto.id, payload);
    emit("saved");
    toast(`Custos de ${custosTotMonthLabel.value} de ${b.name} já existiam e foram atualizados para ${formatCurrency(custos)}.`);
  } else {
    addEntry("custo_total", payload);
    emit("saved");
    toast(`Custos de ${custosTotMonthLabel.value} lançados para ${b.name}: ${formatCurrency(custos)}.`);
  }

  /* Mantém a filial selecionada para o próximo lançamento, limpando apenas
     os dados específicos do custo. */
  custosTot.custos = "";
  custosTot.percent = "";
}

/* ---------- Submit ---------- */

function handleSubmit() {
  if (!indicator.value) return;
  const form = indicator.value.form;
  if (form === "salario") return; // ações no submodal
  if (form === "custo") return submitCusto();
  if (form === "diaria") return submitDiaria();
  if (form === "treinamento") return submitTreinamento();
  if (form === "custo_total") return submitCustosTotal();
  if (form === "vaga") emit("close");
  if (form === "turnover") emit("close");
  if (form === "headcount") emit("close");
  if (form === "mensal") emit("close");
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
    :subtitle="indicator ? indicator.calc : ''"
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

      <!-- ===== LANÇAMENTO MENSAL (Headcount, Absenteísmo, Tempo de permanência, Retenção) ===== -->
      <template v-if="indicator.form === 'mensal'">
        <div class="flex flex-col gap-4">
          <div class="grid gap-4 sm:grid-cols-2">
            <div class="flex flex-col gap-1.5">
              <label for="mensalEstado" class="text-sm font-medium text-zinc-700 dark:text-zinc-200">Estado</label>
              <select id="mensalEstado" v-model="mensal.estado" class="input-field">
                <option v-for="s in STATES" :key="s" :value="s">{{ s }} — {{ STATE_NAMES[s] }}</option>
              </select>
            </div>
            <div class="flex flex-col gap-1.5">
              <label class="text-sm font-medium text-zinc-700 dark:text-zinc-200">Mês</label>
              <div class="flex items-center gap-2">
                <select class="input-field" :value="mensalMonthNum" @change="setMensalMonth(Number($event.target.value))">
                  <option v-for="(m, i) in MONTHS_SHORT" :key="m" :value="i + 1">{{ m }}</option>
                </select>
                <select class="input-field" :value="mensalYearNum" @change="setMensalYear(Number($event.target.value))">
                  <option v-for="y in mensalYearOptions" :key="y" :value="y">{{ y }}</option>
                </select>
                <button type="button" class="btn-ghost btn-sm shrink-0" @click="setMensalCurrentMonth">Atual</button>
              </div>
            </div>
          </div>

          <div class="flex flex-col gap-1.5 sm:w-64">
            <label for="mensalValor" class="text-sm font-medium text-zinc-700 dark:text-zinc-200">
              {{ indicator.name }} ({{ indicator.unit }})
            </label>
            <input
              id="mensalValor"
              v-model="mensal.valor"
              type="number"
              min="0"
              step="any"
              class="input-field"
              :placeholder="indicator.type === 'percent' ? '0,0' : '0'"
            />
          </div>

          <div class="flex flex-wrap gap-2">
            <button type="button" class="btn-primary" @click="submitMensal">
              {{ editingMensalId ? "Salvar alterações" : "+ Lançar" }}
            </button>
          </div>
          <p class="text-xs text-zinc-500 dark:text-zinc-400">
            Um lançamento por mês/estado — lançar de novo no mesmo mês substitui o valor anterior.
            Clique com o botão direito no card do indicador para ver o histórico.
          </p>
        </div>
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
            O salário informado entra no KPI "Custo médio de contratação" tanto para vagas abertas quanto fechadas.
          </p>
        </div>

        <div v-show="activeTab === 'historico'" class="flex flex-col gap-3">
          <p v-if="!vacancies.length" class="py-4 text-center text-sm text-zinc-500 dark:text-zinc-400">
            Nenhuma vaga cadastrada. Adicione uma vaga na aba "Nova vaga".
          </p>

          <div v-if="vacancies.length" class="flex flex-col gap-3 sm:flex-row sm:items-end">
            <div class="flex flex-1 flex-col gap-1.5">
              <label for="vacancySearch" class="text-sm font-medium text-zinc-700 dark:text-zinc-200">Buscar</label>
              <input
                id="vacancySearch"
                v-model="vacancySearch"
                type="search"
                class="input-field"
                placeholder="Vaga, tipo, filial, estado..."
              />
            </div>
            <label class="flex items-center gap-2 pb-2 text-sm font-medium text-zinc-700 dark:text-zinc-200">
              <input
                type="checkbox"
                class="h-4 w-4 cursor-pointer accent-accent"
                v-model="vacancyOnlyNegative"
              />
              Somente dias negativos (ex.: -10)
            </label>
            <button type="button" class="btn-ghost btn-sm" @click="handleExportVagas">Exportar vagas</button>
          </div>

          <div v-if="vacancies.length" class="grid grid-cols-3 gap-2">
            <div class="rounded-xl border border-zinc-200 px-3 py-2 dark:border-zinc-800">
              <span class="text-[11px] font-semibold uppercase tracking-wide text-zinc-400">Total de vagas</span>
              <p class="text-xl font-bold tabular-nums text-zinc-900 dark:text-zinc-100">{{ vacancyStats.total }}</p>
            </div>
            <div class="rounded-xl border border-zinc-200 px-3 py-2 dark:border-zinc-800">
              <span class="text-[11px] font-semibold uppercase tracking-wide text-zinc-400">Abertas</span>
              <p class="text-xl font-bold tabular-nums text-accent-hover dark:text-accent-light">{{ vacancyStats.abertas }}</p>
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
                class="h-4 w-4 cursor-pointer accent-accent"
                :checked="allVacanciesSelected"
                aria-label="Selecionar todas as vagas"
                @change="toggleVacanciesAll"
              />
              Selecionar todas
            </label>
            <div v-if="selectedVacancies.length" class="flex flex-wrap items-center gap-2">
              <span class="rounded-full bg-accent/10 px-2.5 py-1 text-xs font-semibold text-accent-hover dark:text-accent-light">
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

          <p
            v-if="vacancies.length && !filteredVacancies.length"
            class="py-4 text-center text-sm text-zinc-500 dark:text-zinc-400"
          >
            {{ vacancyOnlyNegative
              ? "Nenhuma vaga com dias negativos encontrada."
              : "Nenhuma vaga encontrada para essa busca." }}
          </p>

          <div
            v-for="v in filteredVacancies"
            :key="v.id"
            class="flex items-start gap-3 rounded-xl border border-zinc-200 p-3 dark:border-zinc-800"
            :class="selectedVacancyIds.has(v.id) ? 'bg-accent/5 dark:bg-accent/5' : ''"
          >
            <input
              type="checkbox"
              class="mt-1 h-4 w-4 shrink-0 cursor-pointer accent-accent"
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
                <span
                  v-if="v.closeAt"
                  class="text-xs"
                  :class="vacancyDays(v) < 0 ? 'font-semibold text-red-600 dark:text-red-400' : 'text-zinc-500 dark:text-zinc-400'"
                >
                  Fechamento: {{ formatDate(v.closeAt) }} · Tempo: {{ formatVacancyTempo(v) }}
                  <span v-if="vacancyDays(v) < 0">⚠</span>
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

      <!-- ===== TURNOVER / TURNOVER (EXP) ===== -->
      <template v-if="indicator.form === 'turnover'">
        <div v-show="activeTab === 'novo'" class="flex flex-col gap-4">
          <div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <div class="flex flex-col gap-1.5">
              <label for="turnoverEstado" class="text-sm font-medium text-zinc-700 dark:text-zinc-200">Estado</label>
              <select id="turnoverEstado" v-model="estado" class="input-field">
                <option v-for="s in stateOptions" :key="s" :value="s">{{ stateLabel(s) }}</option>
              </select>
            </div>
            <div class="flex flex-col gap-1.5">
              <label for="turnoverFilial" class="text-sm font-medium text-zinc-700 dark:text-zinc-200">Filial</label>
              <select id="turnoverFilial" v-model="turnover.filialId" class="input-field">
                <option :value="null">— Sem filial —</option>
                <option v-for="b in turnoverBranches" :key="b.id" :value="b.id">{{ b.name }}</option>
              </select>
            </div>
            <div class="flex flex-col gap-1.5">
              <label for="turnoverMes" class="text-sm font-medium text-zinc-700 dark:text-zinc-200">Mês de referência</label>
              <input id="turnoverMes" v-model="turnover.mesReferencia" type="month" class="input-field" />
            </div>
          </div>

          <div class="grid gap-4 sm:grid-cols-3">
            <div class="flex flex-col gap-1.5">
              <label for="turnoverAdmitidos" class="text-sm font-medium text-zinc-700 dark:text-zinc-200">Admitidos no período</label>
              <input id="turnoverAdmitidos" v-model="turnover.admitidos" type="number" min="0" step="1" class="input-field" placeholder="0" />
            </div>
            <div class="flex flex-col gap-1.5">
              <label for="turnoverDemitidos" class="text-sm font-medium text-zinc-700 dark:text-zinc-200">Demitidos no período</label>
              <input id="turnoverDemitidos" v-model="turnover.demitidos" type="number" min="0" step="1" class="input-field" placeholder="0" />
            </div>
            <div class="flex flex-col gap-1.5">
              <label for="turnoverAtivos" class="text-sm font-medium text-zinc-700 dark:text-zinc-200">Ativos no período</label>
              <input id="turnoverAtivos" v-model="turnover.ativos" type="number" min="0" step="1" class="input-field" placeholder="0" />
            </div>
          </div>
          <p class="text-xs text-zinc-500 dark:text-zinc-400">
            Não é preciso informar colaboradores — só a quantidade admitida, demitida e ativa no mês, por filial. "Ativos"
            substitui o Headcount no cálculo: Turnover (%) = ((Admitidos + Demitidos) / 2) / Ativos × 100 — não depende mais do
            KPI de Headcount. Admitidos também alimenta as Novas contratações da Retenção.
          </p>

          <div class="rounded-xl border border-dashed border-zinc-300 p-3 dark:border-zinc-700">
            <div class="flex flex-wrap items-center justify-between gap-3">
              <div class="flex min-w-0 flex-col gap-0.5">
                <strong class="text-sm text-zinc-800 dark:text-zinc-100">Importar por planilha</strong>
                <p class="text-xs text-zinc-500 dark:text-zinc-400">
                  Colunas: Filial · Mês de referência · Admitidos · Demitidos · Ativos · Estado.
                  A filial é cruzada com o cadastro da aba Filiais.
                </p>
              </div>
              <div class="flex flex-wrap gap-2">
                <button type="button" class="btn-ghost btn-sm" @click="downloadTurnoverTemplate">Baixar template</button>
                <button type="button" class="btn-primary btn-sm" @click="turnoverImportInput?.click()">Importar planilha</button>
                <input ref="turnoverImportInput" type="file" hidden accept=".xlsx,.xls,.csv" @change="onTurnoverImportFile" />
              </div>
            </div>
          </div>

          <div class="flex flex-wrap gap-2">
            <button type="button" class="btn-primary" @click="submitTurnover">
              {{ editingTurnoverId ? "Salvar alterações" : "+ Lançar turnover" }}
            </button>
          </div>
        </div>

        <!-- Importar demitidos: só muda o status no headcount — fica fora da aba "Novo"/"Histórico", visível nas duas. -->
        <div class="rounded-xl border border-dashed border-red-300 p-3 dark:border-red-900/50">
          <div class="flex flex-wrap items-center justify-between gap-3">
            <div class="flex min-w-0 flex-col gap-0.5">
              <strong class="text-sm text-zinc-800 dark:text-zinc-100">Importar demitidos</strong>
              <p class="text-xs text-zinc-500 dark:text-zinc-400">
                Colunas: Colaborador · Data de admissão (opcional) · Data de desligamento. Pode trazer demitidos de todos os meses
                numa planilha só — cada linha usa a própria data. Localiza pelo Nome quem já está no headcount (a Empresa não é
                necessária). Se o nome bater em mais de um colaborador, a tela pede para escolher qual é qual. Só muda o status
                para "demitido" no headcount — quem já estiver demitido é pulado sem alterar nada, e nome que não bater com
                ninguém no headcount é ignorado (não cria lançamento novo). Para registrar o tempo de permanência, use o modal
                próprio "Tempo médio de permanência".
              </p>
            </div>
            <div class="flex flex-wrap items-center gap-2">
              <button type="button" class="btn-ghost btn-sm" @click="downloadHeadcountDemitidosTemplate">Baixar template</button>
              <button type="button" class="btn-danger-ghost btn-sm" @click="headcountDemitidosImportInput?.click()">Importar planilha</button>
              <input
                ref="headcountDemitidosImportInput"
                type="file"
                hidden
                accept=".xlsx,.xls,.csv"
                @change="onHeadcountDemitidosImportFile"
              />
            </div>
          </div>
        </div>

        <div v-show="activeTab === 'historico'" class="flex flex-col gap-3">
          <p v-if="!turnoverList.length" class="py-4 text-center text-sm text-zinc-500 dark:text-zinc-400">
            Nenhum registro lançado. Adicione um lançamento na aba "Novo".
          </p>

          <div v-if="turnoverList.length" class="flex flex-wrap items-center gap-2">
            <button
              type="button"
              class="flex w-fit cursor-pointer flex-col gap-0.5 rounded-xl border border-accent/25 bg-accent/5 px-4 py-2.5 text-left transition hover:bg-accent/10 dark:border-accent/25 dark:bg-accent/10"
              :class="turnoverKindFilter === 'admissoes' ? 'ring-2 ring-accent' : ''"
              :aria-pressed="turnoverKindFilter === 'admissoes'"
              title="Filtrar só as empresas com admissões"
              @click="toggleTurnoverKind('admissoes')"
            >
              <span class="text-[11px] font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">Total admissões</span>
              <span class="text-xl font-bold tabular-nums text-zinc-900 dark:text-zinc-100">{{ turnoverTotals.admitidos }}</span>
            </button>
            <button
              type="button"
              class="flex w-fit cursor-pointer flex-col gap-0.5 rounded-xl border border-zinc-200 bg-zinc-50 px-4 py-2.5 text-left transition hover:bg-zinc-100 dark:border-zinc-800 dark:bg-zinc-900 dark:hover:bg-zinc-800"
              :class="turnoverKindFilter === 'demissoes' ? 'ring-2 ring-accent' : ''"
              :aria-pressed="turnoverKindFilter === 'demissoes'"
              title="Filtrar só as empresas com demissões"
              @click="toggleTurnoverKind('demissoes')"
            >
              <span class="text-[11px] font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">Total demissões</span>
              <span class="text-xl font-bold tabular-nums text-zinc-900 dark:text-zinc-100">{{ turnoverTotals.demitidos }}</span>
            </button>
            <p v-if="turnoverKindFilter" class="text-xs text-zinc-500 dark:text-zinc-400">
              Mostrando só as empresas com
              {{ turnoverKindFilter === "admissoes" ? "admissões" : "demissões" }} —
              <button type="button" class="font-medium text-accent-hover dark:text-accent-light" @click="turnoverKindFilter = null">
                remover filtro
              </button>
            </p>
          </div>

          <div v-if="turnoverList.length" class="flex flex-col gap-3 sm:flex-row sm:items-end">
            <div class="flex flex-1 flex-col gap-1.5">
              <label for="turnoverSearch" class="text-sm font-medium text-zinc-700 dark:text-zinc-200">Buscar</label>
              <input
                id="turnoverSearch"
                v-model="turnoverSearch"
                type="search"
                class="input-field"
                placeholder="Filial, mês, estado..."
              />
            </div>
            <button type="button" class="btn-ghost btn-sm" @click="handleExportTurnover">Exportar</button>
          </div>

          <div v-if="turnoverList.length" class="flex flex-wrap items-center justify-between gap-2">
            <label class="flex items-center gap-2 text-xs font-medium text-zinc-500 dark:text-zinc-400">
              <input
                type="checkbox"
                class="h-4 w-4 cursor-pointer accent-accent"
                :checked="allTurnoverSelected"
                aria-label="Selecionar todos os registros"
                @change="toggleTurnoverAll"
              />
              Selecionar todos
            </label>
            <div v-if="selectedTurnovers.length" class="flex flex-wrap items-center gap-2">
              <span class="rounded-full bg-accent/10 px-2.5 py-1 text-xs font-semibold text-accent-hover dark:text-accent-light">
                {{ selectedTurnovers.length }} selecionado(s)
              </span>
              <button type="button" class="btn-danger-ghost btn-sm" @click="handleBulkTurnoverDelete">Excluir selecionados</button>
            </div>
          </div>

          <p
            v-if="turnoverList.length && !filteredTurnover.length"
            class="py-4 text-center text-sm text-zinc-500 dark:text-zinc-400"
          >
            Nenhum registro encontrado para essa busca.
          </p>

          <div
            v-for="t in filteredTurnover"
            :key="t.id"
            class="flex items-start gap-3 rounded-xl border border-zinc-200 p-3 dark:border-zinc-800"
            :class="selectedTurnoverIds.has(t.id) ? 'bg-accent/5 dark:bg-accent/5' : ''"
          >
            <input
              type="checkbox"
              class="mt-1 h-4 w-4 shrink-0 cursor-pointer accent-accent"
              :checked="selectedTurnoverIds.has(t.id)"
              aria-label="Selecionar registro"
              @change="toggleTurnoverRow(t.id)"
            />
            <div class="flex min-w-0 flex-1 flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div class="flex flex-col gap-0.5">
                <strong class="text-sm text-zinc-900 dark:text-zinc-100">{{ turnoverFilial(t) || "— Sem filial —" }}</strong>
                <span v-if="t.mesReferencia || t.estado" class="text-xs text-zinc-500 dark:text-zinc-400">
                  {{ [t.mesReferencia ? ymLabel(t.mesReferencia) : "", t.estado].filter(Boolean).join(" · ") }}
                </span>
                <span class="text-xs text-zinc-500 dark:text-zinc-400">
                  Admitidos: {{ t.admitidos || 0 }} · Demitidos: {{ t.demitidos || 0 }}
                </span>
              </div>
              <div class="flex flex-wrap items-center gap-2">
                <button type="button" class="btn-ghost btn-sm" @click="editTurnover(t.id)">Editar</button>
                <button type="button" class="btn-danger-ghost btn-sm" @click="removeTurnover(t.id)">Excluir</button>
              </div>
            </div>
          </div>
        </div>
      </template>

      <!-- ===== HEADCOUNT ===== -->
      <template v-if="indicator.form === 'headcount'">
        <div v-show="activeTab === 'novo'" class="flex flex-col gap-4">
          <div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <div class="flex flex-col gap-1.5">
              <label for="hcCodigo" class="text-sm font-medium text-zinc-700 dark:text-zinc-200">Código</label>
              <input id="hcCodigo" v-model="headcount.codigo" type="text" class="input-field" placeholder="Ex.: 3375" />
            </div>
            <div class="flex flex-col gap-1.5 sm:col-span-1 lg:col-span-2">
              <label for="hcColaborador" class="text-sm font-medium text-zinc-700 dark:text-zinc-200">Colaborador</label>
              <input id="hcColaborador" v-model="headcount.colaborador" v-upper type="text" class="input-field uppercase" placeholder="Nome do colaborador" />
            </div>
          </div>

          <div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <div class="flex flex-col gap-1.5">
              <label for="hcEmpresa" class="text-sm font-medium text-zinc-700 dark:text-zinc-200">Empresa</label>
              <select id="hcEmpresa" v-model="headcount.filialId" class="input-field">
                <option :value="null">— Sem empresa —</option>
                <option v-for="b in headcountBranches" :key="b.id" :value="b.id">{{ b.shortName }} — {{ b.name }}</option>
              </select>
            </div>
            <div class="flex flex-col gap-1.5">
              <label for="hcFuncao" class="text-sm font-medium text-zinc-700 dark:text-zinc-200">Função</label>
              <input id="hcFuncao" v-model="headcount.funcao" v-upper type="text" class="input-field uppercase" placeholder="Ex.: ANALISTA DE RH" />
            </div>
            <div class="flex flex-col gap-1.5">
              <label for="hcRemuneracao" class="text-sm font-medium text-zinc-700 dark:text-zinc-200">Remuneração (R$)</label>
              <input
                id="hcRemuneracao"
                class="input-field text-right tabular-nums"
                type="text"
                inputmode="decimal"
                autocomplete="off"
                placeholder="0,00"
                :value="headcount.remuneracao"
                @input="onHeadcountSalaryInput"
                @blur="onHeadcountSalaryBlur"
              />
            </div>
            <div class="flex flex-col gap-1.5">
              <label for="hcAdmissao" class="text-sm font-medium text-zinc-700 dark:text-zinc-200">Data de admissão</label>
              <input id="hcAdmissao" v-model="headcount.dataAdmissao" type="date" class="input-field" required />
            </div>
          </div>

          <div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <div class="flex flex-col gap-1.5">
              <label for="hcEstado" class="text-sm font-medium text-zinc-700 dark:text-zinc-200">Estado</label>
              <select id="hcEstado" v-model="estado" class="input-field">
                <option v-for="s in STATES" :key="s" :value="s">{{ s }} — {{ STATE_NAMES[s] }}</option>
              </select>
            </div>
          </div>

          <p class="text-xs text-zinc-500 dark:text-zinc-400">
            O quadro traz sempre todos os colaboradores lançados — o filtro por mês do dashboard usa a Data de admissão
            como base: mostra quem já tinha sido admitido até aquele mês e ainda não foi desligado.
          </p>

          <div class="rounded-xl border border-dashed border-zinc-300 p-3 dark:border-zinc-700">
            <div class="flex flex-wrap items-center justify-between gap-3">
              <div class="flex min-w-0 flex-col gap-0.5">
                <strong class="text-sm text-zinc-800 dark:text-zinc-100">Importar novos colaboradores</strong>
                <p class="text-xs text-zinc-500 dark:text-zinc-400">
                  Colunas: Código · Colaborador · Empresa · Função · Remuneração · Data de admissão · Estado.
                  Obrigatórias: Colaborador e Data de admissão — as demais (inclusive o Código) são opcionais.
                  Quem já existir (mesma Empresa e Código) é avisado antes de importar; sem Código, não há essa verificação.
                </p>
              </div>
              <div class="flex flex-wrap gap-2">
                <button type="button" class="btn-ghost btn-sm" @click="downloadHeadcountTemplate">Baixar template</button>
                <button type="button" class="btn-primary btn-sm" @click="headcountImportInput?.click()">Importar planilha</button>
                <input ref="headcountImportInput" type="file" hidden accept=".xlsx,.xls,.csv" @change="onHeadcountImportFile" />
              </div>
            </div>
          </div>

          <div class="flex flex-wrap gap-2">
            <button type="button" class="btn-primary" @click="submitHeadcount">
              {{ editingHeadcountId ? "Salvar alterações" : "+ Lançar headcount" }}
            </button>
          </div>
        </div>

        <div v-show="activeTab === 'historico'" class="flex flex-col gap-3">
          <div class="rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-2 text-xs text-zinc-500 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-400">
            Mostrando colaboradores de <strong class="text-zinc-800 dark:text-zinc-100 capitalize">{{ headcountViewMonthLabel }}</strong>
            — mesmo mês selecionado no filtro do dashboard.
          </div>

          <p v-if="!headcountList.length" class="py-4 text-center text-sm text-zinc-500 dark:text-zinc-400">
            Nenhum colaborador lançado para este mês. Adicione um lançamento na aba "Novo" ou ajuste o mês no filtro do dashboard.
          </p>

          <div v-if="headcountList.length" class="flex flex-col gap-3 sm:flex-row sm:items-end">
            <div class="flex flex-1 flex-col gap-1.5">
              <label for="headcountSearch" class="text-sm font-medium text-zinc-700 dark:text-zinc-200">Buscar</label>
              <input
                id="headcountSearch"
                v-model="headcountSearch"
                type="search"
                class="input-field"
                placeholder="Código, colaborador, função, estado..."
              />
            </div>
            <div class="flex flex-col gap-1.5 sm:w-56">
              <label for="headcountFilterEmpresa" class="text-sm font-medium text-zinc-700 dark:text-zinc-200">Empresa</label>
              <select id="headcountFilterEmpresa" v-model="headcountFilterFilialId" class="input-field">
                <option :value="null">Todas as empresas</option>
                <option v-for="b in headcountFilterBranches" :key="b.id" :value="b.id">{{ b.name }}</option>
              </select>
            </div>
            <div class="flex flex-col gap-1.5 sm:w-40">
              <label for="headcountAdmissaoStart" class="text-sm font-medium text-zinc-700 dark:text-zinc-200">Admissão de</label>
              <input id="headcountAdmissaoStart" v-model="headcountAdmissaoStart" type="date" class="input-field" />
            </div>
            <div class="flex flex-col gap-1.5 sm:w-40">
              <label for="headcountAdmissaoEnd" class="text-sm font-medium text-zinc-700 dark:text-zinc-200">Admissão até</label>
              <input id="headcountAdmissaoEnd" v-model="headcountAdmissaoEnd" type="date" class="input-field" />
            </div>
            <button type="button" class="btn-ghost btn-sm" @click="handleExportHeadcount">Exportar</button>
          </div>

          <div v-if="headcountList.length" class="flex flex-wrap items-center justify-between gap-2">
            <label class="flex items-center gap-2 text-xs font-medium text-zinc-500 dark:text-zinc-400">
              <input
                type="checkbox"
                class="h-4 w-4 cursor-pointer accent-accent"
                :checked="allHeadcountSelected"
                aria-label="Selecionar todos os registros"
                @change="toggleHeadcountAll"
              />
              Selecionar todos
            </label>
            <div v-if="selectedHeadcounts.length" class="flex flex-wrap items-center gap-2">
              <span class="rounded-full bg-accent/10 px-2.5 py-1 text-xs font-semibold text-accent-hover dark:text-accent-light">
                {{ selectedHeadcounts.length }} selecionado(s)
              </span>
              <button type="button" class="btn-danger-ghost btn-sm" @click="handleBulkHeadcountDelete">Excluir selecionados</button>
            </div>
          </div>

          <p
            v-if="headcountList.length && !filteredHeadcount.length"
            class="py-4 text-center text-sm text-zinc-500 dark:text-zinc-400"
          >
            Nenhum registro encontrado para essa busca.
          </p>

          <div
            v-for="h in filteredHeadcount"
            :key="h.id"
            class="flex items-start gap-3 rounded-xl border border-zinc-200 p-3 dark:border-zinc-800"
            :class="selectedHeadcountIds.has(h.id) ? 'bg-accent/5 dark:bg-accent/5' : ''"
          >
            <input
              type="checkbox"
              class="mt-1 h-4 w-4 shrink-0 cursor-pointer accent-accent"
              :checked="selectedHeadcountIds.has(h.id)"
              aria-label="Selecionar registro"
              @change="toggleHeadcountRow(h.id)"
            />
            <div class="flex min-w-0 flex-1 flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div class="flex flex-col gap-0.5">
                <div class="flex flex-wrap items-center gap-1.5">
                  <strong class="text-sm text-zinc-900 dark:text-zinc-100">{{ h.colaborador }}</strong>
                  <Badge v-if="h.status === 'demitido'" tone="dark">Demitido em {{ ymLabel(h.demitidoMes) }}</Badge>
                </div>
                <span v-if="h.codigo || h.funcao || h.estado || headcountBranchName(h)" class="text-xs text-zinc-500 dark:text-zinc-400">
                  {{ [h.codigo, headcountBranchName(h), h.funcao, h.estado].filter(Boolean).join(" · ") }}
                </span>
                <span v-if="h.remuneracao != null" class="text-xs text-zinc-500 dark:text-zinc-400">
                  Remuneração: {{ formatCurrency(h.remuneracao) }}
                </span>
                <span v-if="h.dataAdmissao" class="text-xs text-zinc-500 dark:text-zinc-400">
                  Admissão: {{ formatDate(h.dataAdmissao) }}
                </span>
              </div>
              <div class="flex flex-wrap items-center gap-2">
                <button type="button" class="btn-ghost btn-sm" @click="editHeadcount(h.id)">Editar</button>
                <button type="button" class="btn-danger-ghost btn-sm" @click="removeHeadcount(h.id)">Excluir</button>
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
              :class="custo.employeeId === e.id ? 'bg-accent/10 dark:bg-accent/10' : ''"
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
            <label for="custoValue" class="text-sm font-medium text-zinc-700 dark:text-zinc-200">Custo médio de contratação (R$)</label>
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
              :class="diaria.employeeId === e.id ? 'bg-accent/10 dark:bg-accent/10' : ''"
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
            <button type="button" class="font-medium text-accent-hover dark:text-accent-light" @click="pickDiariaEmployeeManual">
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
                  Colunas: Filial · Colaborador · Função · Periodo · Motivo · Pagamento (opcional: Estado).
                  Periodo é o mês da diária: 08/2026, ago/26, agosto (sem ano vale o do mês filtrado) ou uma data.
                  Filial e colaborador entram como estão na planilha; sem Estado, vale o do filtro atual.
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
              <button type="button" class="font-medium text-accent-hover dark:text-accent-light" @click="showTab('colaborador')">
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
          <div class="flex flex-col gap-2 rounded-xl border border-zinc-200 p-3 dark:border-zinc-800">
            <div class="flex flex-wrap items-center justify-between gap-2">
              <div class="flex min-w-0 flex-col">
                <strong class="text-sm text-zinc-800 dark:text-zinc-100">Colaboradores</strong>
                <span class="text-xs text-zinc-500 dark:text-zinc-400">
                  Clique em um colaborador para lançar ou editar o treinamento. Marque para excluir os treinamentos
                  (e as horas) deles — o cadastro da Equipe não é alterado.
                </span>
              </div>
              <label class="flex cursor-pointer items-center gap-2 text-xs font-medium text-zinc-600 dark:text-zinc-300">
                <input
                  type="checkbox"
                  class="h-4 w-4 cursor-pointer accent-accent"
                  :checked="trAllSelected"
                  :disabled="!trSelectable.length"
                  @change="toggleTrAll"
                />
                Selecionar todos
              </label>
            </div>

            <div
              v-if="trSelected.size"
              class="flex flex-wrap items-center gap-2 rounded-lg bg-zinc-50 px-3 py-2 dark:bg-zinc-800/60"
            >
              <span class="rounded-full bg-accent/10 px-2.5 py-1 text-xs font-semibold text-accent-hover dark:text-accent-light">
                {{ trSelected.size }} selecionado(s)
              </span>
              <button
                type="button"
                class="rounded-lg bg-red-600 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-red-700"
                @click="deleteTrSelected"
              >
                Excluir selecionados
              </button>
            </div>

            <div class="flex max-h-72 flex-col gap-1 overflow-y-auto">
              <p v-if="!trPeopleVisible.length" class="py-2 text-sm text-zinc-500 dark:text-zinc-400">
                Nenhum colaborador encontrado.
              </p>
              <div v-for="x in trPeopleVisible" :key="x.key">
                <div
                  class="flex cursor-pointer items-center gap-3 rounded-lg px-3 py-2 transition hover:bg-zinc-100 dark:hover:bg-zinc-800"
                  :class="
                    trSelected.has(x.key) || (x.employee && treinamento.employeeId === x.employee.id)
                      ? 'bg-accent/10 dark:bg-accent/10'
                      : ''
                  "
                  role="button"
                  tabindex="0"
                  @click="onTrPersonClick(x)"
                  @keydown.enter.self.prevent="onTrPersonClick(x)"
                >
                  <input
                    v-if="x.count"
                    type="checkbox"
                    class="h-4 w-4 shrink-0 cursor-pointer accent-accent"
                    :checked="trSelected.has(x.key)"
                    :aria-label="'Selecionar ' + x.name"
                    @click.stop
                    @change="toggleTrPerson(x.key)"
                  />
                  <span v-else class="h-4 w-4 shrink-0"></span>
                  <strong class="min-w-0 flex-1 truncate text-sm text-zinc-900 dark:text-zinc-100">{{ x.name }}</strong>
                  <span class="shrink-0 text-xs text-zinc-500 dark:text-zinc-400">
                    {{ x.cargo }}<template v-if="x.count"> · {{ x.count }} treinamento(s) · {{ formatHoursClock(x.horas) }}</template>
                  </span>
                  <button
                    v-if="x.employee && x.count"
                    type="button"
                    class="shrink-0 rounded-md border border-zinc-300 px-2 py-0.5 text-xs font-medium text-zinc-600 transition hover:bg-zinc-200 dark:border-zinc-600 dark:text-zinc-300 dark:hover:bg-zinc-700"
                    @click.stop="newTreinamentoFor(x.employee)"
                  >
                    + Novo
                  </button>
                </div>
                <div
                  v-if="trExpanded === x.key"
                  class="ml-9 mt-1 flex flex-col gap-0.5 border-l-2 border-zinc-200 pl-3 dark:border-zinc-700"
                >
                  <button
                    v-for="e in x.entries"
                    :key="e.id"
                    type="button"
                    class="flex items-center justify-between gap-2 rounded-md px-2 py-1 text-left text-xs transition hover:bg-zinc-100 dark:hover:bg-zinc-800"
                    @click="prefillEdit('treinamento', e)"
                  >
                    <span class="min-w-0 truncate text-zinc-700 dark:text-zinc-200">
                      {{ ymLabel(String(e.date).slice(0, 7)) }} · {{ (e.meta && e.meta.tema) || "Sem tema" }}
                    </span>
                    <span class="shrink-0 font-medium tabular-nums text-zinc-900 dark:text-zinc-100">{{ formatHoursClock(e.value) }}</span>
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div v-show="activeTab === 'treinamento'" class="flex flex-col gap-4">
          <div class="rounded-xl border border-dashed border-zinc-300 p-3 dark:border-zinc-700">
            <div class="flex flex-wrap items-center justify-between gap-3">
              <div class="flex min-w-0 flex-col gap-0.5">
                <strong class="text-sm text-zinc-800 dark:text-zinc-100">Importar treinamentos por planilha</strong>
                <p class="text-xs text-zinc-500 dark:text-zinc-400">
                  Colunas: Colaborador · Tema do treinamento · Carga horária (horas) · Modalidade
                  (opcionais: Cargo · Filial · Estado). Os colaboradores são lançados como estão na planilha.
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
              <button type="button" class="font-medium text-accent-hover dark:text-accent-light" @click="showTab('colaborador')">Trocar colaborador</button>
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
              :class="custosTot.branchId === b.id ? 'bg-accent/10 dark:bg-accent/10' : ''"
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
              <button type="button" class="font-medium text-accent-hover dark:text-accent-light" @click="showTab('filial')">Trocar filial</button>
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

    <!-- ===== Submodal: Salário do colaborador ===== -->
    <Teleport to="body">
      <Transition name="mac-modal" :duration="{ enter: 320, leave: 170 }">
      <div
        v-if="sub.kind === 'salario' && sub.employee"
        class="fixed inset-0 z-[80] flex items-start justify-center bg-black/50 p-4 py-10"
        @click.self="closeSub"
      >
        <form class="mac-panel w-full max-w-md rounded-2xl border border-zinc-200 bg-white shadow-2xl dark:border-zinc-800 dark:bg-zinc-900" novalidate @submit.prevent="saveSalary">
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
      </Transition>
    </Teleport>

    <!-- ===== Revisão de importação de diárias ===== -->
    <Teleport to="body">
      <Transition name="mac-modal" :duration="{ enter: 320, leave: 170 }">
      <div
        v-if="diReviewOpen"
        class="fixed inset-0 z-[90] flex items-start justify-center bg-black/50 p-4 py-10"
      >
        <div class="mac-panel flex max-h-[90vh] w-full max-w-4xl flex-col overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-2xl dark:border-zinc-800 dark:bg-zinc-900">
          <div class="flex items-start justify-between gap-4 border-b border-zinc-100 px-6 py-4 dark:border-zinc-800">
            <div>
              <h3 class="text-lg font-bold text-zinc-900 dark:text-zinc-100">Revisar diárias importadas</h3>
              <p class="mt-0.5 text-sm text-zinc-500 dark:text-zinc-400">
                {{ diRows.length }} linha(s) · {{ diEntriesCount }} lançamento(s) a criar ·
                {{ diDistinctCount }} colaborador(es) · {{ diDupRows.size }} já lançada(s) ·
                {{ diErrorCount }} linha(s) com erro
              </p>
            </div>
            <button type="button" class="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-xl leading-none text-zinc-400 transition hover:bg-zinc-100 hover:text-zinc-700 dark:hover:bg-zinc-800 dark:hover:text-zinc-200" aria-label="Fechar" @click="diReviewOpen = false">&times;</button>
          </div>

          <div class="flex flex-1 flex-col gap-2 overflow-y-auto px-6 py-4">
            <p class="text-xs text-zinc-500 dark:text-zinc-400">
              Os colaboradores são lançados exatamente como estão na planilha, sem vínculo com a Equipe (só para
              visualização nas diárias — não contam no Headcount). Nomes iguais são juntados num único colaborador.
            </p>

            <div
              v-for="(r, idx) in diRows"
              :key="idx"
              class="rounded-xl border border-zinc-200 p-3 dark:border-zinc-800"
              :class="r.errors.length ? 'border-red-400 bg-red-50/60 dark:border-red-500/40 dark:bg-red-500/5' : r.warnings.length ? 'border-amber-400 bg-amber-50/60 dark:border-amber-500/40 dark:bg-amber-500/5' : ''"
            >
              <div class="flex flex-wrap items-start justify-between gap-2">
                <div class="flex min-w-0 flex-col gap-0.5">
                  <div class="flex flex-wrap items-center gap-2">
                    <strong class="text-sm text-zinc-900 dark:text-zinc-100">Linha {{ r.rowNumber }} — {{ r.colaboradorText || "Sem colaborador" }}</strong>
                  </div>
                  <p class="text-xs text-zinc-500 dark:text-zinc-400">
                    {{ r.filialText || "Sem filial" }} · {{ r.estado }}<span v-if="r.funcaoText"> · {{ r.funcaoText }}</span> ·
                    {{ diPeriodoLabel(r) }}<span v-if="r.motivoText"> · {{ r.motivoText }}</span> ·
                    {{ r.pagamento != null ? formatCurrency(r.pagamento) : "sem pagamento" }}
                  </p>
                </div>
              </div>

              <p v-if="diDupRows.has(r)" class="mt-2 text-xs font-semibold text-amber-600 dark:text-amber-400">
                Já lançada (mesmo colaborador, mês, motivo e valor) — não será lançada de novo.
              </p>

              <ul v-if="r.errors.length" class="mt-2 list-disc pl-4 text-xs font-medium text-red-600 dark:text-red-400">
                <li v-for="(msg, i) in r.errors" :key="'err' + i">{{ msg }}</li>
              </ul>

              <ul v-if="r.warnings.length" class="mt-2 list-disc pl-4 text-xs font-medium text-amber-600 dark:text-amber-400">
                <li v-for="(msg, i) in r.warnings" :key="'warn' + i">{{ msg }}</li>
              </ul>

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
      </Transition>
    </Teleport>

    <LoadingOverlay :show="diImporting" label="Importando diárias..." />

    <!-- ===== Revisão de importação de treinamentos ===== -->
    <Teleport to="body">
      <Transition name="mac-modal" :duration="{ enter: 320, leave: 170 }">
      <div
        v-if="trReviewOpen"
        class="fixed inset-0 z-[90] flex items-start justify-center bg-black/50 p-4 py-10"
      >
        <div class="mac-panel flex max-h-[90vh] w-full max-w-4xl flex-col overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-2xl dark:border-zinc-800 dark:bg-zinc-900">
          <div class="flex items-start justify-between gap-4 border-b border-zinc-100 px-6 py-4 dark:border-zinc-800">
            <div>
              <h3 class="text-lg font-bold text-zinc-900 dark:text-zinc-100">Revisar treinamentos importados</h3>
              <p class="mt-0.5 text-sm text-zinc-500 dark:text-zinc-400">
                {{ trRows.length }} linha(s) · {{ trInvalidCount }} sem carga horária · {{ trDupCount }} já lançada(s)
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

            <p class="text-xs text-zinc-500 dark:text-zinc-400">
              Os colaboradores são lançados exatamente como estão na planilha. Linhas sem carga horária, ou já lançadas no
              mesmo mês (mesmo colaborador, tema e carga horária), não são lançadas — para não duplicar as horas.
            </p>

            <div
              v-for="(r, idx) in visibleTrRows"
              :key="idx"
              class="rounded-xl border border-zinc-200 p-3 dark:border-zinc-800"
            >
              <div class="flex flex-wrap items-start justify-between gap-2">
                <div class="flex min-w-0 flex-col gap-0.5">
                  <strong class="text-sm text-zinc-900 dark:text-zinc-100">{{ r.name }}</strong>
                  <p class="text-xs text-zinc-500 dark:text-zinc-400">
                    {{ r.tema || "Sem tema" }} · {{ r.carga != null ? formatHoursClock(r.carga) : "sem carga horária" }} ·
                    {{ r.modalidadeLabel || "Presencial" }}
                  </p>
                  <p class="text-xs text-zinc-400 dark:text-zinc-500">
                    {{ [r.cargo, r.filial, r.estado].filter(Boolean).join(" · ") }}
                  </p>
                </div>
                <span v-if="!trHasCarga(r)" class="text-xs font-semibold text-amber-600 dark:text-amber-400">
                  Sem carga horária — não será lançado
                </span>
                <span v-else-if="trIsDuplicate(r)" class="text-xs font-semibold text-amber-600 dark:text-amber-400">
                  Já lançado neste mês — não será lançado de novo
                </span>
              </div>
            </div>
          </div>

          <div class="flex justify-end gap-2 border-t border-zinc-100 px-6 py-4 dark:border-zinc-800">
            <button type="button" class="btn-ghost" @click="trReviewOpen = false">Cancelar</button>
            <button type="button" class="btn-primary" :disabled="!trValidCount" @click="confirmTrImport">
              Lançar {{ trValidCount }} treinamento(s) em {{ trMonthLabel }}
            </button>
          </div>
        </div>
      </div>
      </Transition>
    </Teleport>

    <LoadingOverlay :show="trImporting" label="Importando treinamentos..." />
  </Modal>

  <!-- Duplicidade na importação de demitidos: mesmo Código + Nome batendo em
       mais de um colaborador do headcount — escolher qual é qual. -->
  <Modal
    v-if="headcountDemitidosPending.length"
    title="Duplicidade encontrada"
    subtitle="Esse nome (e código, quando informado) apareceu em mais de um colaborador do headcount — escolha qual é qual para cada um."
    max-width="max-w-xl"
    @close="skipHeadcountDemitidosPending"
  >
    <div class="flex flex-col gap-4">
      <div
        v-for="(item, idx) in headcountDemitidosPending"
        :key="idx"
        class="rounded-xl border border-zinc-200 p-3 dark:border-zinc-800"
      >
        <p class="text-sm font-semibold text-zinc-800 dark:text-zinc-100">
          {{ item.colaboradorText }} <span class="font-normal text-zinc-400"><template v-if="item.codigo">· código {{ item.codigo }} </template><template v-if="item.dataAdmissao">· admissão {{ formatDate(item.dataAdmissao) }} </template>· desligamento {{ formatDate(item.demitidoMes + "-01") }}</span>
        </p>
        <div class="mt-2 flex flex-col gap-2">
          <label
            v-for="c in item.candidates"
            :key="c.id"
            class="flex cursor-pointer items-start gap-2 rounded-lg border px-3 py-2 text-sm transition"
            :class="item.selectedId === c.id
              ? 'border-accent bg-accent/5 dark:border-accent dark:bg-accent/10'
              : 'border-zinc-200 dark:border-zinc-700'"
          >
            <input
              type="radio"
              class="mt-0.5 accent-accent"
              :name="'headcount-demitido-dup-' + idx"
              :value="c.id"
              v-model="item.selectedId"
            />
            <span class="flex flex-col">
              <span class="font-medium text-zinc-800 dark:text-zinc-100">
                {{ headcountBranchLabel(c) || "Sem empresa" }}<span v-if="c.funcao"> · {{ c.funcao }}</span>
              </span>
              <span class="text-xs text-zinc-500 dark:text-zinc-400">
                Admissão: {{ c.dataAdmissao ? formatDate(c.dataAdmissao) : "—" }} · Estado: {{ c.estado || "—" }}
              </span>
            </span>
          </label>
        </div>
      </div>
    </div>
    <div class="mt-5 flex justify-end gap-2">
      <button type="button" class="btn-ghost" @click="skipHeadcountDemitidosPending">Pular todos</button>
      <button type="button" class="btn-primary" @click="confirmHeadcountDemitidosPending">Confirmar</button>
    </div>
  </Modal>

  <!-- Linhas ignoradas na importação de novos colaboradores do Headcount: mostra
       o motivo e pergunta se devem ser importadas mesmo assim. -->
  <Modal
    v-if="headcountIgnoredReview"
    title="Linhas ignoradas na importação"
    subtitle="Estas linhas da planilha não foram importadas. Veja o motivo e escolha o que fazer."
    max-width="max-w-3xl"
    @close="answerIgnoredHeadcount(false)"
  >
    <div class="flex flex-col gap-3">
      <p class="text-sm text-zinc-700 dark:text-zinc-200">
        <strong>{{ headcountIgnoredReview.items.length }}</strong> linha(s) estão sem uma Data de admissão válida.
        Deseja importá-las mesmo assim?
      </p>

      <div class="overflow-hidden rounded-xl border border-zinc-200 dark:border-zinc-800">
        <div class="max-h-[20rem] overflow-auto">
          <table class="w-full min-w-max text-left text-sm">
            <thead class="sticky top-0 z-10 bg-white dark:bg-zinc-900">
              <tr class="border-b border-zinc-100 text-xs uppercase tracking-wide text-zinc-400 dark:border-zinc-800">
                <th class="whitespace-nowrap px-4 py-2.5 font-semibold">Linha</th>
                <th class="whitespace-nowrap px-4 py-2.5 font-semibold">Colaborador</th>
                <th class="whitespace-nowrap px-4 py-2.5 font-semibold">Código</th>
                <th class="whitespace-nowrap px-4 py-2.5 font-semibold">Motivo</th>
              </tr>
            </thead>
            <tbody>
              <tr
                v-for="it in headcountIgnoredReview.items"
                :key="it.linha"
                class="border-b border-zinc-100 last:border-0 dark:border-zinc-800"
              >
                <td class="whitespace-nowrap px-4 py-2.5 tabular-nums text-zinc-500 dark:text-zinc-400">{{ it.linha }}</td>
                <td class="whitespace-nowrap px-4 py-2.5 font-medium text-zinc-900 dark:text-zinc-100">{{ it.colaborador }}</td>
                <td class="whitespace-nowrap px-4 py-2.5 text-zinc-600 dark:text-zinc-300">{{ it.codigo || "—" }}</td>
                <td class="px-4 py-2.5 text-amber-700 dark:text-amber-400">{{ it.motivo }}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <p class="rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-xs text-amber-700 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-400">
        Se importar, os colaboradores entram <strong>sem Data de admissão</strong>, no mês de referência
        {{ ymLabel(headcountIgnoredFallbackYm()) }} (mês do filtro atual), e passam a contar no Headcount
        <strong>a partir desse mês</strong>. Depois você pode editar cada registro no Histórico para informar a data
        real de admissão.
      </p>
    </div>
    <div class="mt-5 flex justify-end gap-2">
      <button type="button" class="btn-ghost" @click="answerIgnoredHeadcount(false)">Não importar</button>
      <button type="button" class="btn-primary" @click="answerIgnoredHeadcount(true)">
        Importar {{ headcountIgnoredReview.items.length }} mesmo assim
      </button>
    </div>
  </Modal>

  <!-- Resumo da importação de demitidos do Headcount -->
  <Modal
    v-if="headcountDemitidosResult"
    title="Importação de demitidos concluída"
    max-width="max-w-md"
    @close="headcountDemitidosResult = null"
  >
    <div class="flex flex-col gap-3">
      <div class="flex items-center justify-between rounded-xl border border-zinc-200 px-4 py-3 dark:border-zinc-800">
        <span class="text-sm text-zinc-600 dark:text-zinc-300">Alterados para demitido</span>
        <strong class="text-lg text-accent-hover dark:text-accent-light">{{ headcountDemitidosResult.alterados }}</strong>
      </div>
      <div class="flex items-center justify-between rounded-xl border border-zinc-200 px-4 py-3 dark:border-zinc-800">
        <span class="text-sm text-zinc-600 dark:text-zinc-300">Já estavam demitidos (ignorados)</span>
        <strong class="text-lg text-zinc-800 dark:text-zinc-100">{{ headcountDemitidosResult.jaDemitidos }}</strong>
      </div>
      <div v-if="headcountDemitidosResult.naoEncontrado" class="flex items-center justify-between rounded-xl border border-zinc-200 px-4 py-3 dark:border-zinc-800">
        <span class="text-sm text-zinc-600 dark:text-zinc-300">Colaborador não encontrado no headcount</span>
        <strong class="text-lg text-zinc-800 dark:text-zinc-100">{{ headcountDemitidosResult.naoEncontrado }}</strong>
      </div>
      <div v-if="headcountDemitidosResult.semData" class="flex items-center justify-between rounded-xl border border-zinc-200 px-4 py-3 dark:border-zinc-800">
        <span class="text-sm text-zinc-600 dark:text-zinc-300">Sem data de desligamento (ignorados)</span>
        <strong class="text-lg text-zinc-800 dark:text-zinc-100">{{ headcountDemitidosResult.semData }}</strong>
      </div>
      <div v-if="headcountDemitidosResult.naoResolvidos" class="flex items-center justify-between rounded-xl border border-zinc-200 px-4 py-3 dark:border-zinc-800">
        <span class="text-sm text-zinc-600 dark:text-zinc-300">Duplicidade não resolvida (ignorados)</span>
        <strong class="text-lg text-zinc-800 dark:text-zinc-100">{{ headcountDemitidosResult.naoResolvidos }}</strong>
      </div>
      <p class="text-xs text-zinc-500 dark:text-zinc-400">{{ headcountDemitidosResult.total }} linha(s) lida(s) na planilha.</p>
    </div>
    <div class="mt-5 flex justify-end">
      <button type="button" class="btn-primary" @click="headcountDemitidosResult = null">Entendi</button>
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
