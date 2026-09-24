<script setup>
import { ref, reactive, computed, watch, onMounted, onUnmounted } from "vue";
import Modal from "@/components/ui/Modal.vue";
import Badge from "@/components/ui/Badge.vue";
import HeadcountEditModal from "@/components/dashboard/HeadcountEditModal.vue";
import { listBranches } from "@/lib/filiais";
import { hydrateState } from "@/lib/db";
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
  getVacancyById,
  getTurnoverById,
  getHeadcountById,
  getBranchById
} from "@/lib/store";
import {
  addVacancy,
  updateVacancy,
  closeVacancy,
  deleteVacancyRecord,
  deleteVacancies,
  closeVacancies,
  listVacancies,
  formatVacancyTempo,
  listTurnoverEntries,
  addTurnoverEntry,
  updateTurnoverEntry,
  deleteTurnoverEntry,
  deleteTurnoverEntries,
  listHeadcountRecords,
  addHeadcountRecord,
  deleteHeadcountRecord,
  deleteHeadcountRecords,
  findBranchByShortName,
  normalizeBranchKey
} from "@/lib/employees";
import { exportVagas, exportTurnover, exportHeadcount } from "@/lib/export";
import {
  todayISO,
  formatDate,
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

const indicatorId = ref(MANUAL_INDICATORS[0].id);
const activeTab = ref("");

const indicatorOptions = computed(() => MANUAL_INDICATORS);

const indicator = computed(() => getIndicatorById(indicatorId.value));

/* ---------- Vaga (Tempo médio de contratação) ---------- */
const vaga = reactive({
  nome: "",
  abertura: "",
  fechamento: "",
  salario: "",
  tipo: "clt",
  filial: null,
  recrutador: ""
});
const editingVacancyId = ref(null);

/* Datas de fechamento escolhidas na aba Histórico (padrão: hoje). */
const closeDates = reactive({});
const bulkCloseDate = ref(todayISO());

function closeDateFor(id) {
  return closeDates[id] || todayISO();
}

function setCloseDate(id, value) {
  closeDates[id] = value;
}

/* ---------- Diária ---------- */
/* A diária é vinculada a MÊS/ANO (competência), não a um dia — o registro é
   gravado no 1º dia do mês escolhido, igual ao Treinamento. Sem cadastro de
   Colaboradores no sistema, o nome é sempre texto livre. */
const diaria = reactive({
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
   consultas por data existentes. Sem cadastro de Colaboradores, o nome é
   sempre texto livre. */
const treinamento = reactive({
  employeeName: "",
  estado: "",
  cargo: "",
  filial: "",
  gerenteRegional: "",
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
  headcountFilterFilial.value = null;
  headcountAdmissaoStart.value = "";
  headcountAdmissaoEnd.value = "";
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
    diaria.employeeName = m.employeeName || "";
    diaria.funcao = m.funcao || "";
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
    treinamento.employeeName = m.employeeName || "";
    treinamento.estado = m.estado || "";
    treinamento.cargo = m.cargo || "";
    treinamento.filial = m.filial || "";
    treinamento.gerenteRegional = m.gerenteRegional || "";
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
    // Sem FK gravada: reencontra a filial pelo CNPJ (só pra pré-selecionar
    // na aba Filial ao editar; o lançamento em si já tem CNPJ/razão social).
    custosTot.branchId = (m.cnpj && listBranches().find((b) => b.cnpj === m.cnpj)?.id) || null;
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
  treinamento.employeeName = "";
  treinamento.estado = filters.current !== "todos" ? filters.current : DEFAULT_STATE;
  treinamento.cargo = "";
  treinamento.filial = "";
  treinamento.gerenteRegional = "";
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
    case "treinamento":
      return [
        { id: "colaborador", label: "Histórico" },
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
        [v.name, tipoContratacaoLabel(v.tipoContratacao), v.filial || "", v.estado || "", v.recrutador || ""].join(" ")
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
    if (vaga.filial && !vagaBranches.value.some((b) => b.shortName === vaga.filial)) {
      vaga.filial = null;
    }
  }
);

function resetVagaForm() {
  vaga.nome = "";
  vaga.abertura = "";
  vaga.fechamento = "";
  vaga.salario = "";
  vaga.tipo = "clt";
  vaga.filial = null;
  vaga.recrutador = "";
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
      filial: vaga.filial,
      recrutador: vaga.recrutador.trim() || null
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
      filial: vaga.filial,
      recrutador: vaga.recrutador.trim() || null
    });
    toast(`Vaga adicionada${closeAt ? " e fechada" : " — aguardando fechamento"}.${st ? ` (${st})` : ""}`);
  }

  resetVagaForm();
  showTab("historico");
  emit("saved");
}

async function editVacancy(id) {
  const v = getVacancyById(id);
  if (!v) return toast("Vaga não encontrada — os dados podem ter mudado, recarregue e tente de novo.");
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
  vaga.filial = v.filial || null;
  vaga.recrutador = v.recrutador || "";
  showTab("nova");
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
  await deleteVacancyRecord(id);
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
  await deleteVacancies(list.map((v) => v.id));
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
  filial: null,
  mesReferencia: "",
  admitidos: "",
  demitidos: "",
  ativos: ""
});
const editingTurnoverId = ref(null);
const turnoverSearch = ref("");
/* Filtro pelos cards do Histórico: "admissoes" mostra só as empresas com
   admissões, "demissoes" só as com demissões (clicar de novo remove). */
const turnoverKindFilter = ref(null);
const selectedTurnoverIds = ref(new Set());

function resetTurnoverForm() {
  turnover.filial = null;
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
    filial: turnover.filial,
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
  turnover.filial = t.filial || null;
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
  await deleteTurnoverEntry(id);
  emit("saved");
  toast("Registro excluído.");
}

/* ---------- Histórico (aba Histórico) ----------
   Segue o filtro de Estado do próprio formulário de Turnover (`estado`,
   selecionado na aba "Novo"), não o filtro global do dashboard — assim
   trocar o Estado ali também atualiza o que aparece no Histórico. */
const turnoverList = computed(() => listTurnoverEntries(estado.value));

function turnoverFilial(t) {
  return (t && t.filial) || "";
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
  await deleteTurnoverEntries(list.map((t) => t.id));
  selectedTurnoverIds.value = new Set();
  emit("saved");
  toast(`${n} registro(s) excluído(s).`);
}

function handleExportTurnover() {
  if (!filteredTurnover.value.length) return toast("Nenhum registro para exportar com os filtros atuais.");
  exportTurnover(filteredTurnover.value, "turnover");
}

/* ---------- Headcount (quadro de colaboradores lançado por mês) ---------- */
const headcount = reactive({
  codigo: "",
  genero: "",
  tipoContrato: "",
  colaborador: "",
  funcao: "",
  remuneracao: "",
  dataAdmissao: "",
  filial: null
});
const headcountSearch = ref("");
const headcountFilterFilial = ref(null);
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
   filiais. Deduplica pela chave normalizada do nome abreviado lançado
   (h.filial pode variar de grafia entre registros — ver normalizeBranchKey
   em lib/employees.js) e usa o shortName do cadastro como valor canônico do
   filtro; filteredHeadcount compara por essa mesma chave normalizada. */
const headcountFilterBranches = computed(() => {
  const seen = new Map();
  headcountList.value.forEach((h) => {
    const key = normalizeBranchKey(h.filial);
    if (!key || seen.has(key)) return;
    const b = findBranchByShortName(h.filial, h.estado);
    if (b) seen.set(key, b);
  });
  return Array.from(seen.values()).sort((a, b) =>
    String(a.shortName || "").localeCompare(String(b.shortName || ""))
  );
});

function resetHeadcountForm() {
  headcount.codigo = "";
  headcount.genero = "";
  headcount.tipoContrato = "";
  headcount.colaborador = "";
  headcount.funcao = "";
  headcount.remuneracao = "";
  headcount.dataAdmissao = "";
  headcount.filial = null;
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
    codigo: headcount.codigo.trim(),
    genero: headcount.genero,
    tipoContrato: headcount.tipoContrato,
    colaborador: nome,
    funcao: headcount.funcao,
    remuneracao,
    dataAdmissao: headcount.dataAdmissao,
    /* O quadro não tem mais "mês de lançamento" próprio — o filtro por mês
       usa a Data de admissão como base (ver activeInMonth em employees.js). */
    mesReferencia: String(headcount.dataAdmissao).slice(0, 7),
    filial: headcount.filial,
    estado: st
  };

  addHeadcountRecord(payload);
  toast(`Headcount lançado para ${nome} (admissão em ${formatDate(headcount.dataAdmissao)}).`);

  resetHeadcountForm();
  showTab("historico");
  emit("saved");
}

/* Edição de um colaborador existente é feita clicando no nome dele na lista
   abaixo, que abre o HeadcountEditModal (autocontido) — não passa mais por
   esta aba "Novo". */
const headcountEditId = ref(null);
const headcountEditOpen = ref(false);

function openHeadcountEdit(id) {
  headcountEditId.value = id;
  headcountEditOpen.value = true;
}

function onHeadcountEdited() {
  headcountEditOpen.value = false;
  emit("saved");
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
  await deleteHeadcountRecord(id);
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
  const b = h && h.filial ? findBranchByShortName(h.filial, h.estado) : null;
  return b ? `${b.shortName} — ${b.name}` : "";
}

/* Histórico: só o nome completo da empresa (sem a sigla). A busca continua
   usando headcountBranchLabel, então ainda encontra pela sigla. */
function headcountBranchName(h) {
  const b = h && h.filial ? findBranchByShortName(h.filial, h.estado) : null;
  return b ? b.name : "";
}

const filteredHeadcount = computed(() => {
  let list = headcountList.value;
  if (headcountFilterFilial.value) {
    const key = normalizeBranchKey(headcountFilterFilial.value);
    list = list.filter((h) => normalizeBranchKey(h.filial) === key);
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
    normalizeText([h.colaborador, h.funcao, h.estado || "", headcountBranchLabel(h)].join(" ")).includes(q)
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
  await deleteHeadcountRecords(list.map((h) => h.id));
  selectedHeadcountIds.value = new Set();
  emit("saved");
  toast(`${n} registro(s) excluído(s).`);
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

/* ---------- Diária ---------- */

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
  // Sem cadastro de Colaboradores no sistema: o nome é sempre texto livre.
  const up = (v) => String(v == null ? "" : v).toUpperCase().trim() || null;
  const employeeName = up(diaria.employeeName);
  if (!employeeName) return toast("Informe o nome do colaborador.");
  if (!diaria.mes) return toast("Informe o mês da diária.");
  const valueRaw = String(diaria.value).trim();
  if (valueRaw === "" || isNaN(Number(valueRaw)) || Number(valueRaw) < 0) {
    return toast("Informe o valor pago na diária (R$).");
  }
  const value = Number(valueRaw);

  const payload = {
    date: `${diaria.mes}-01`,
    value,
    state: diaria.regional || null,
    meta: {
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

  /* Mantém o restante do contexto preenchido para o próximo lançamento,
     apenas limpando o valor. */
  diaria.value = "";
  diaria.motivo = "";
  diaria.mes = currentYm();
}

/* ---------- Treinamento ---------- */

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
  // Sem cadastro de Colaboradores no sistema: o nome é sempre texto livre.
  const up = (v) => String(v == null ? "" : v).toUpperCase().trim() || null;
  const employeeName = up(treinamento.employeeName);
  if (!employeeName) return toast("Informe o nome do colaborador.");
  if (!treinamento.month) return toast("Informe o mês/ano do treinamento.");
  const carga = parseHoursBR(treinamento.cargaHoraria);
  if (carga === null || carga < 0) {
    return toast("Informe a carga horária do treinamento (ex.: 8, 12:00 ou 12:30).");
  }

  const filial = up(treinamento.filial);
  const mod =
    (MODALIDADE_OPTIONS.find((o) => o.value === treinamento.modalidade) || {}).label ||
    treinamento.modalidade;
  const estado = up(treinamento.estado);
  const payload = {
    date: `${treinamento.month}-01`,
    value: carga,
    state: estado,
    meta: {
      employeeName,
      cargo: up(treinamento.cargo),
      filial,
      gerenteRegional: up(treinamento.gerenteRegional),
      tema: up(treinamento.tema),
      modalidade: mod,
      competencia: treinamento.month
    }
  };

  if (editingEntryId.value) {
    updateEntry("treinamento", editingEntryId.value, payload);
    editingEntryId.value = null;
    emit("saved");
    toast(`Treinamento atualizado para ${employeeName}: ${formatHoursClock(carga)}.`);
    close();
    return;
  }

  addEntry("treinamento", payload);

  emit("saved");
  toast(`Treinamento lançado para ${employeeName}: ${formatHoursClock(carga)}.`);

  /* Limpa os dados do treinamento, mantendo cargo/filial para o próximo. */
  treinamento.month = currentYm();
  treinamento.tema = "";
  treinamento.cargaHoraria = "";
  treinamento.modalidade = "presencial";
}

/* ---------- Histórico por colaborador (aba Colaborador do Treinamento) ----------
   Sem cadastro de Colaboradores: agrupa só pelos treinamentos já lançados
   (nome digitado na hora), no estado do filtro atual. Clicar num colaborador
   edita o treinamento (se só houver um) ou expande a lista para escolher
   qual; marcar e excluir remove os treinamentos (e as horas) dele, em todos
   os meses. */
const trQuery = ref("");

const trPeople = computed(() => {
  const byName = new Map();
  getEntriesFor("treinamento", filters.current).forEach((e) => {
    const name = (e.meta && e.meta.employeeName) || "Sem colaborador";
    if (!byName.has(name)) byName.set(name, []);
    byName.get(name).push(e);
  });

  const people = [];
  byName.forEach((list, name) => {
    const entries = list.slice().sort((a, b) => String(b.date).localeCompare(String(a.date)));
    const cargo = (entries.find((e) => e.meta && e.meta.cargo) || {}).meta;
    people.push({
      key: `name:${name}`,
      name,
      cargo: String((cargo && cargo.cargo) || ""),
      search: `${name} ${(cargo && cargo.cargo) || ""}`,
      entries,
      count: entries.length,
      horas: entries.reduce((sum, e) => sum + (Number(e.value) || 0), 0)
    });
  });

  return people.sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));
});

const trPeopleVisible = computed(() => {
  const q = normalizeText(trQuery.value).trim();
  if (!q) return trPeople.value;
  return trPeople.value.filter((x) => normalizeText(x.search).includes(q));
});

const trSelectable = computed(() => trPeopleVisible.value);
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

/* Novo treinamento: descarta uma edição em andamento, limpa os campos e vai
   para a aba de lançamento. */
function newTreinamento() {
  editingEntryId.value = null;
  resetTreinamento();
  showTab("treinamento");
}

/* Clique no colaborador: um só treinamento → edita; vários → expande a lista
   para escolher qual. */
function onTrPersonClick(x) {
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


/* ---------- Custos Totais (por filial) ---------- */

const custosTotResults = computed(() => {
  const q = normalizeText(custosTot.query).trim();
  let list = listBranches(custosTot.estado);
  if (q) {
    list = list.filter((b) =>
      normalizeText(`${b.cnpj} ${b.name} ${b.shortName} ${b.manager || ""}`)
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
      cnpj: b.cnpj || null,
      razaoSocial: b.name || null,
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
    (e) => e.date === dataCompetencia && e.meta && b.cnpj && e.meta.cnpj === b.cnpj
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

onUnmounted(() => {
  window.removeEventListener("keydown", onSubKeydown, true);
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
              <select id="vagaFilial" v-model="vaga.filial" class="input-field">
                <option :value="null">— Sem filial —</option>
                <option v-for="b in vagaBranches" :key="b.id" :value="b.shortName">{{ b.shortName }} — {{ b.name }}</option>
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

          <div class="flex flex-col gap-1.5 sm:w-64">
            <label for="vagaRecrutador" class="text-sm font-medium text-zinc-700 dark:text-zinc-200">Recrutador</label>
            <input id="vagaRecrutador" v-model="vaga.recrutador" v-upper type="text" class="input-field uppercase" placeholder="Ex.: FULANO DE TAL" />
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
                  v-if="v.tipoContratacao || v.filial || v.estado || v.recrutador"
                  class="text-xs text-zinc-500 dark:text-zinc-400"
                >
                  {{ [tipoContratacaoLabel(v.tipoContratacao), v.filial, v.estado, v.recrutador].filter(Boolean).join(" · ") }}
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
              <select id="turnoverFilial" v-model="turnover.filial" class="input-field">
                <option :value="null">— Sem filial —</option>
                <option v-for="b in turnoverBranches" :key="b.id" :value="b.name">{{ b.name }}</option>
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


          <div class="flex flex-wrap gap-2">
            <button type="button" class="btn-primary" @click="submitTurnover">
              {{ editingTurnoverId ? "Salvar alterações" : "+ Lançar turnover" }}
            </button>
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
          <div class="grid gap-4">
            <div class="flex flex-col gap-1.5">
              <label for="hcColaborador" class="text-sm font-medium text-zinc-700 dark:text-zinc-200">Colaborador</label>
              <input id="hcColaborador" v-model="headcount.colaborador" v-upper type="text" class="input-field uppercase" placeholder="Nome do colaborador" />
            </div>
          </div>

          <div class="grid gap-4 sm:grid-cols-3">
            <div class="flex flex-col gap-1.5">
              <label for="hcCodigo" class="text-sm font-medium text-zinc-700 dark:text-zinc-200">Código</label>
              <input id="hcCodigo" v-model="headcount.codigo" type="text" class="input-field" />
            </div>
            <div class="flex flex-col gap-1.5">
              <label for="hcGenero" class="text-sm font-medium text-zinc-700 dark:text-zinc-200">Gênero</label>
              <select id="hcGenero" v-model="headcount.genero" class="input-field">
                <option value="">— Não informado —</option>
                <option value="masculino">Masculino</option>
                <option value="feminino">Feminino</option>
              </select>
            </div>
            <div class="flex flex-col gap-1.5">
              <label for="hcContrato" class="text-sm font-medium text-zinc-700 dark:text-zinc-200">Tipo de contrato</label>
              <select id="hcContrato" v-model="headcount.tipoContrato" class="input-field">
                <option value="">— Não informado —</option>
                <option value="indeterminado">Indeterminado (efetivado)</option>
                <option value="determinado">Determinado (experiência)</option>
              </select>
            </div>
          </div>

          <div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <div class="flex flex-col gap-1.5">
              <label for="hcEmpresa" class="text-sm font-medium text-zinc-700 dark:text-zinc-200">Empresa</label>
              <select id="hcEmpresa" v-model="headcount.filial" class="input-field">
                <option :value="null">— Sem empresa —</option>
                <option v-for="b in headcountBranches" :key="b.id" :value="b.shortName">{{ b.shortName }} — {{ b.name }}</option>
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


          <div class="flex flex-wrap gap-2">
            <button type="button" class="btn-primary" @click="submitHeadcount">+ Lançar headcount</button>
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
                placeholder="Colaborador, função, estado..."
              />
            </div>
            <div class="flex flex-col gap-1.5 sm:w-56">
              <label for="headcountFilterEmpresa" class="text-sm font-medium text-zinc-700 dark:text-zinc-200">Empresa</label>
              <select id="headcountFilterEmpresa" v-model="headcountFilterFilial" class="input-field">
                <option :value="null">Todas as empresas</option>
                <option v-for="b in headcountFilterBranches" :key="b.id" :value="b.shortName">{{ b.name }}</option>
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
                  <button
                    type="button"
                    class="text-sm font-bold text-zinc-900 underline-offset-2 hover:text-accent-hover hover:underline dark:text-zinc-100 dark:hover:text-accent-light"
                    :title="`Editar ${h.colaborador}`"
                    @click="openHeadcountEdit(h.id)"
                  >
                    {{ h.colaborador }}
                  </button>
                  <Badge v-if="h.codigo" tone="dark">{{ h.codigo }}</Badge>
                </div>
                <span v-if="h.funcao || h.estado || headcountBranchName(h)" class="text-xs text-zinc-500 dark:text-zinc-400">
                  {{ [headcountBranchName(h), h.funcao, h.estado].filter(Boolean).join(" · ") }}
                </span>
                <span v-if="h.remuneracao != null" class="text-xs text-zinc-500 dark:text-zinc-400">
                  Remuneração: {{ formatCurrency(h.remuneracao) }}
                </span>
                <span v-if="h.dataAdmissao" class="text-xs text-zinc-500 dark:text-zinc-400">
                  Admissão: {{ formatDate(h.dataAdmissao) }}
                </span>
              </div>
              <div class="flex flex-wrap items-center gap-2">
                <button type="button" class="btn-danger-ghost btn-sm" @click="removeHeadcount(h.id)">Excluir</button>
              </div>
            </div>
          </div>
        </div>
      </template>

      <!-- ===== DIÁRIA ===== -->
      <template v-if="indicator.form === 'diaria'">
        <div class="flex flex-col gap-4">
          <div class="flex flex-col gap-1.5">
            <label for="diariaSelected" class="text-sm font-medium text-zinc-700 dark:text-zinc-200">Colaborador</label>
            <input
              id="diariaSelected"
              v-model="diaria.employeeName"
              v-upper
              type="text"
              class="input-field"
              placeholder="Nome do colaborador"
            />
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
            <input id="trSearch" v-model="trQuery" type="search" class="input-field" placeholder="Nome ou cargo..." />
          </div>
          <div class="flex flex-col gap-2 rounded-xl border border-zinc-200 p-3 dark:border-zinc-800">
            <div class="flex flex-wrap items-center justify-between gap-2">
              <div class="flex min-w-0 flex-col">
                <strong class="text-sm text-zinc-800 dark:text-zinc-100">Colaboradores já lançados</strong>
                <span class="text-xs text-zinc-500 dark:text-zinc-400">
                  Clique em um colaborador para editar o treinamento. Marque para excluir os treinamentos (e as horas) dele.
                </span>
              </div>
              <div class="flex items-center gap-3">
                <button type="button" class="btn-ghost btn-sm" @click="newTreinamento">+ Novo</button>
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
                  :class="trSelected.has(x.key) ? 'bg-accent/10 dark:bg-accent/10' : ''"
                  role="button"
                  tabindex="0"
                  @click="onTrPersonClick(x)"
                  @keydown.enter.self.prevent="onTrPersonClick(x)"
                >
                  <input
                    type="checkbox"
                    class="h-4 w-4 shrink-0 cursor-pointer accent-accent"
                    :checked="trSelected.has(x.key)"
                    :aria-label="'Selecionar ' + x.name"
                    @click.stop
                    @change="toggleTrPerson(x.key)"
                  />
                  <strong class="min-w-0 flex-1 truncate text-sm text-zinc-900 dark:text-zinc-100">{{ x.name }}</strong>
                  <span class="shrink-0 text-xs text-zinc-500 dark:text-zinc-400">
                    {{ x.cargo }} · {{ x.count }} treinamento(s) · {{ formatHoursClock(x.horas) }}
                  </span>
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
          <div class="flex flex-col gap-1.5">
            <label for="trSelected" class="text-sm font-medium text-zinc-700 dark:text-zinc-200">Colaborador</label>
            <input id="trSelected" v-model="treinamento.employeeName" v-upper type="text" class="input-field" placeholder="Nome do colaborador" />
            <p class="text-xs">
              <button type="button" class="font-medium text-accent-hover dark:text-accent-light" @click="showTab('colaborador')">Ver histórico por colaborador</button>
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
              <label for="trGerenteRegional" class="text-sm font-medium text-zinc-700 dark:text-zinc-200">Gerente regional</label>
              <input id="trGerenteRegional" v-model="treinamento.gerenteRegional" v-upper type="text" class="input-field" />
            </div>
            <div class="flex flex-col gap-1.5">
              <label for="trEstado" class="text-sm font-medium text-zinc-700 dark:text-zinc-200">Estado</label>
              <select id="trEstado" v-model="treinamento.estado" class="input-field">
                <option v-for="s in STATES" :key="s" :value="s">{{ s }} — {{ STATE_NAMES[s] }}</option>
              </select>
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

  </Modal>


  <HeadcountEditModal
    v-if="headcountEditOpen"
    :open="headcountEditOpen"
    :record-id="headcountEditId"
    @close="headcountEditOpen = false"
    @saved="onHeadcountEdited"
  />
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
