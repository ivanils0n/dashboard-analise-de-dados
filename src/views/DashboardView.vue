<script setup>
import { ref, computed, onMounted, onActivated, onDeactivated, onUnmounted, nextTick, watch } from "vue";
import { sidebarHidden } from "@/composables/useSidebar";
import KpiCard from "@/components/dashboard/KpiCard.vue";
import KpiChartCard from "@/components/dashboard/KpiChartCard.vue";
import UfMapCard from "@/components/dashboard/UfMapCard.vue";
import LaunchModal from "@/components/dashboard/LaunchModal.vue";
import IndicatorEntriesModal from "@/components/dashboard/IndicatorEntriesModal.vue";
import VacanciesModal from "@/components/dashboard/VacanciesModal.vue";
import VacancyDetailModal from "@/components/dashboard/VacancyDetailModal.vue";
import PermanenciaModal from "@/components/dashboard/PermanenciaModal.vue";
import PermanenciaDetailModal from "@/components/dashboard/PermanenciaDetailModal.vue";
import TrainingFilialModal from "@/components/dashboard/TrainingFilialModal.vue";
import HeadcountEstadoModal from "@/components/dashboard/HeadcountEstadoModal.vue";
import DiariaColaboradorModal from "@/components/dashboard/DiariaColaboradorModal.vue";
import HiringGoalsLegend from "@/components/dashboard/HiringGoalsLegend.vue";
import EditEntryModal from "@/components/dashboard/EditEntryModal.vue";
import CockpitPanel from "@/components/dashboard/CockpitPanel.vue";
import HiringStatusPills from "@/components/dashboard/HiringStatusPills.vue";
import DateRangeFilter from "@/components/dashboard/DateRangeFilter.vue";
import BarChart from "@/components/charts/BarChart.vue";
import Badge from "@/components/ui/Badge.vue";
import EmptyState from "@/components/ui/EmptyState.vue";
import LoadingOverlay from "@/components/ui/LoadingOverlay.vue";
import { useDashboardData } from "@/composables/useDashboardData";
import { useDateFilter, dateFilter } from "@/composables/useDateFilter";
import { useFilters } from "@/composables/useFilters";
import { useToast } from "@/composables/useToast";
import { useDialog } from "@/composables/useDialog";
import { canEditData } from "@/lib/auth";
import { getIndicatorById } from "@/lib/config";
import { removeEntry, removeEntries } from "@/lib/store";
import { singleMonthOfRange, ymLabel, ymShortLabel, safeSetItem, localStore, normalizeText, formatCurrency } from "@/lib/utils";
import { syncAll } from "@/lib/employees";
import { incompleteStates, setMonthIncomplete } from "@/lib/monthStatus";
import Modal from "@/components/ui/Modal.vue";
import { toXLSX, toCSV, downloadTemplate, importFile } from "@/lib/export";
import { reloadData, hydrateState } from "@/lib/db";

const { dateFilter: df } = useDateFilter();
const { state: filters, setState } = useFilters();
const { show: toast } = useToast();
const { confirm } = useDialog();

/* Diárias importadas sem período (planilha sem a coluna Periodo preenchida)
   ficam ocultas do KPI por padrão — este filtro, ao lado do card, ativa a
   visualização delas (agrupadas numa barra "Sem período" e somadas ao total
   do KPI). Declarado antes do useDashboardData para ser passado a ele. */
const diariaShowSemPeriodo = ref(false);

const dashboard = useDashboardData(dateFilter, { diariaShowSemPeriodo });

/* Retornos desestruturados como bindings de topo (o template desembrulha
   automaticamente refs de topo; um ref aninhado em objeto não é desembrulhado). */
const {
  kpis,
  selectedKpiId,
  selectKpi,
  kpiChartCards,
  chartPieData,
  filteredEntries,
  panorama,
  formatEntryValue,
  formatDate
} = dashboard;

const activeTab = ref("cockpit");
const TAB_ORDER = ["visao-geral", "cockpit"];
/* Direção da animação de arrasto: 1 = arrasta para a esquerda (indo para a
   aba à direita), -1 = arrasta para a direita (voltando para a aba à
   esquerda). Usada para escolher a transição (slide-left/slide-right). */
const tabDirection = ref(1);
function switchTab(tab) {
  if (tab === activeTab.value) return;
  tabDirection.value = TAB_ORDER.indexOf(tab) > TAB_ORDER.indexOf(activeTab.value) ? 1 : -1;
  activeTab.value = tab;
}

/* ---------- Mês incompleto ----------
   O menu marca/desmarca o mês filtrado (no estado do filtro) como "com
   informações faltando". Toda vez que o filtro cai num mês marcado (trocar o
   mês, aplicar o mesmo mês de novo, trocar o estado, abrir a tela, ou marcar o
   mês pelo menu) o aviso aparece; um selo fica ao lado do filtro de período. */
const filteredMonth = computed(() => singleMonthOfRange(df.start, df.end));
const markedStates = computed(() => incompleteStates(filteredMonth.value, filters.current));
const monthIncomplete = computed(() => markedStates.value.length > 0);
const filteredMonthLabel = computed(() => (filteredMonth.value ? ymLabel(filteredMonth.value) : ""));

const incompleteNoticeOpen = ref(false);

function showIncompleteNotice() {
  incompleteNoticeOpen.value = monthIncomplete.value;
}

watch(
  [() => df.start, () => df.end, () => filters.current, () => filters.revision, monthIncomplete],
  showIncompleteNotice,
  { immediate: true }
);

function confirmIncompleteNotice() {
  incompleteNoticeOpen.value = false;
}

function toggleMonthIncomplete() {
  if (!canEdit) {
    toast("Seu perfil tem acesso somente leitura.");
    return;
  }
  if (!filteredMonth.value) {
    toast("Selecione um único mês no filtro de período.");
    return;
  }
  if (monthIncomplete.value) {
    setMonthIncomplete(filteredMonth.value, filters.current, false);
    toast(`${filteredMonthLabel.value} desmarcado como incompleto.`);
    return;
  }
  setMonthIncomplete(filteredMonth.value, filters.current, true);
}

const launchOpen = ref(false);
/* KPI selecionado no Painel antes de abrir o Lançamento para editar algo
   vindo de lá (ex.: editar vaga a partir do gráfico de Tempo médio de
   contratação) — restaurado em onSaved para não jogar o Painel de volta ao
   Panorama atual depois de salvar. */
const preEditSelectedKpiId = ref(null);
const diariaEntriesOpen = ref(false);
const treinamentoEntriesOpen = ref(false);
const custosEntriesOpen = ref(false);
const mensalEntriesOpen = ref(false);
const mensalEntriesIndicatorId = ref(null);
const vacanciesOpen = ref(false);
const vacancyAllPeriods = ref(false);
const permanenciaOpen = ref(false);

/* Modal ao clicar em uma barra do gráfico de Treinamento (por filial). */
const treinamentoFilialOpen = ref(false);
const treinamentoFilialLabel = ref("");
const treinamentoFilialRows = ref([]);

function onTreinamentoBarClick({ label }) {
  if (!label) return;
  treinamentoFilialLabel.value = label;
  treinamentoFilialRows.value = dashboard.treinamentoFilialEntries(label);
  treinamentoFilialOpen.value = true;
}

/* Modal ao clicar em uma barra do gráfico de Headcount (uma por estado) —
   lista os colaboradores do estado da barra no mês filtrado. */
const headcountEstadoOpen = ref(false);
const headcountEstadoSigla = ref("");

function onHeadcountBarClick({ label }) {
  if (!label) return;
  headcountEstadoSigla.value = label;
  headcountEstadoOpen.value = true;
}

/* Modal ao clicar em uma barra do gráfico de Custo médio da diária geral (um
   colaborador por barra) — mostra os dados e as diárias do colaborador. */
const diariaColabOpen = ref(false);
const diariaColabName = ref("");
const diariaColabRows = ref([]);

function onDiariaBarClick({ label }) {
  if (!label) return;
  diariaColabName.value = label;
  diariaColabRows.value = dashboard.custoDiariaEntriesByColaborador(label);
  diariaColabOpen.value = true;
}

/* Modal ao clicar em uma barra do gráfico de Tempo médio de contratação
   (uma barra por vaga) — mostra os dados da vaga, com opção de editar. */
const vacancyDetailOpen = ref(false);
const vacancyDetailId = ref(null);
const vacancyDetailFallback = ref(null);

function onHiringBarClick({ index }) {
  const row = hiringBarData.value[index];
  if (!row || !row.vacancyId) return;
  vacancyDetailId.value = row.vacancyId;
  vacancyDetailFallback.value = null;
  vacancyDetailOpen.value = true;
}

/* Botão direito na barra: vai direto para a edição da vaga, sem passar pelo
   modal de detalhe (mesmo destino do botão "Editar" de lá). */
function onHiringBarContext({ index }) {
  const row = hiringBarData.value[index];
  if (!row || !row.vacancyId) return;
  onVacancyEdit(row.vacancyId);
}

/* Clique numa barra do gráfico de Custo médio de contratação (uma barra por
   vaga): abre o mesmo detalhe da vaga do gráfico de Tempo médio de contratação. */
function onKpiCardBarClick({ card, barData }, { index, label }) {
  if (card.id === "custo_diaria") return onDiariaBarClick({ label });
  if (card.id === "headcount") return onHeadcountBarClick({ label });
  if (card.id !== "custo_contratacao") return;
  const row = barData[index];
  if (!row) return;
  vacancyDetailId.value = row.vacancyId;
  vacancyDetailFallback.value = { name: row.label, salario: row.value, date: row.date };
  vacancyDetailOpen.value = true;
}

function onVacancyDetailEdit(vacancyId) {
  vacancyDetailOpen.value = false;
  onVacancyEdit(vacancyId);
}

/* Modal ao clicar em uma barra do gráfico de Tempo médio de permanência
   (um colaborador desligado por barra) — mostra os dados do registro, com
   opção de editar/excluir. */
const permanenciaDetailOpen = ref(false);
const permanenciaDetailId = ref(null);
/* Quando preenchido, o modal de Tempo médio de permanência abre já no
   formulário de edição desse registro (ver PermanenciaModal). */
const permanenciaEditId = ref(null);

function onPermanenciaBarClick({ index }) {
  const row = permanenciaBarData.value[index];
  if (!row || !row.permanenciaId) return;
  permanenciaDetailId.value = row.permanenciaId;
  permanenciaDetailOpen.value = true;
}

/* Botão direito na barra: vai direto para a edição do registro, sem passar
   pelo modal de detalhe (mesmo destino do botão "Editar" de lá). */
function onPermanenciaBarContext({ index }) {
  const row = permanenciaBarData.value[index];
  if (!row || !row.permanenciaId) return;
  onPermanenciaEdit(row.permanenciaId);
}

function onPermanenciaDetailEdit(recordId) {
  permanenciaDetailOpen.value = false;
  onPermanenciaEdit(recordId);
}

function onPermanenciaEdit(recordId) {
  if (!canEdit) {
    toast("Seu perfil tem acesso somente leitura.");
    return;
  }
  permanenciaEditId.value = recordId;
  permanenciaOpen.value = true;
}

/* Filtro de status (abertas/fechadas) do gráfico de Tempo médio de
   contratação. Os gráficos seguem o filtro de estado da aba (StateFilter, no
   TopBar). */
const hiringStatusFilter = ref("fechadas");
const menuOpen = ref(false);
const tableSearch = ref("");
/* A tabela só refiltra 200 ms depois da última tecla: refiltrar e reordenar
   todos os lançamentos a cada letra digitada travava a digitação. */
const tableQuery = ref("");
let tableSearchTimer = null;
watch(tableSearch, (value) => {
  clearTimeout(tableSearchTimer);
  tableSearchTimer = setTimeout(() => {
    tableQuery.value = value;
  }, 200);
});
const kpiSearch = ref("");
const SHOW_VALUES_KEY = "gg-show-values";
const storedShowValues = localStore.getItem(SHOW_VALUES_KEY);
const showValues = ref(storedShowValues === null ? true : storedShowValues === "1");
watch(showValues, (v) => safeSetItem(localStore, SHOW_VALUES_KEY, v ? "1" : "0"));
const custosChartRef = ref(null);
const treinamentoChartRef = ref(null);
const hiringChartRef = ref(null);
const panoramaChartRef = ref(null);
const custosBarChartRef = ref(null);
const treinamentoBarChartRef = ref(null);
const hiringBarChartRef = ref(null);
const permanenciaBarChartRef = ref(null);
const editingRow = ref(null);
const editTarget = ref(null);
const editVacancyTarget = ref(null);
const viewIndicatorTarget = ref(null);

/* Colunas exibidas no modal de registros (clique direito no KPI). */
const diariaColumns = [
  { label: "Mês", monthYear: true },
  { label: "Colaborador", meta: "employeeName" },
  { label: "Departamento", meta: "departamento" },
  { label: "Filial", meta: "filial" },
  { label: "Líder imediato", meta: "liderImediato" },
  { label: "Gerente regional", meta: "gerenteRegional" },
  { label: "Regional", meta: "regional" },
  { label: "Diária", meta: "motivo" },
  { label: "Valor pago", value: true }
];

const treinamentoColumns = [
  { label: "Competência", month: true },
  { label: "Colaborador", meta: "employeeName" },
  { label: "Cargo", meta: "cargo" },
  { label: "Loja", meta: "filial" },
  { label: "Estado", meta: "estado" },
  { label: "Tema do treinamento", meta: "tema" },
  /* `value` (não meta.cargaHoraria): é o que o KPI, os gráficos e os modais
     somam — a cópia em meta podia divergir em lançamentos editados antes. */
  { label: "Carga horária", value: true },
  { label: "Modalidade", meta: "modalidade" }
];

const custosColumns = [
  { label: "Mês", month: true },
  { label: "Filial CNPJ", meta: "cnpj" },
  { label: "Razão Social", meta: "razaoSocial" },
  { label: "Estado", meta: "estado" },
  { label: "Custos", value: true },
  { label: "%", meta: "percent", percent: true }
];

/* Colunas do modal de registros dos indicadores "mensal" (Absenteísmo,
   Tempo de permanência, Retenção). */
const mensalColumns = [
  { label: "Mês", month: true },
  { label: "Estado", meta: "estado" },
  { label: "Valor", value: true }
];

const scrollRef = ref(null);

/* Gráficos por indicador: os que dividem a linha (2 por linha) vêm primeiro,
   na ordem em que aparecem; os demais seguem em largura total. */
const HALF_WIDTH_CARDS = ["headcount", "turnover", "absenteismo", "retencao"];
const orderedKpiChartCards = computed(() => {
  const half = HALF_WIDTH_CARDS.map((id) => kpiChartCards.value.find((c) => c.id === id)).filter(Boolean);
  const rest = kpiChartCards.value.filter((c) => !HALF_WIDTH_CARDS.includes(c.id));
  return [...half, ...rest];
});
let flashTimer = null;

const canEdit = canEditData();

const tableRows = computed(() => dashboard.tableRows(tableQuery.value));

/* Só as primeiras linhas vão para o DOM; o restante entra conforme a rolagem
   chega ao fim. Renderizar milhares de linhas (cada uma com checkbox, badge e
   botões) de uma vez era o maior custo de render da tela. */
const TABLE_PAGE_SIZE = 100;
const tableLimit = ref(TABLE_PAGE_SIZE);
const visibleTableRows = computed(() => tableRows.value.slice(0, tableLimit.value));
watch([tableQuery, () => df.start, () => df.end, () => filters.current], () => {
  tableLimit.value = TABLE_PAGE_SIZE;
});

function onTableScroll(event) {
  if (tableLimit.value >= tableRows.value.length) return;
  const el = event.target;
  if (el.scrollTop + el.clientHeight >= el.scrollHeight - 240) tableLimit.value += TABLE_PAGE_SIZE;
}

/* Data exibida em "Lançamentos recentes": indicadores lançados por
   competência (mês/ano) mostram o mês; diárias sem período conhecido
   (importadas sem a coluna Periodo) mostram "Sem período" em vez da
   data-sentinela interna. */
function tableDateLabel(ind, entry) {
  if (entry.meta && entry.meta.semPeriodo) return "Sem período";
  if (ind.form === "custo_total" || ind.form === "treinamento" || ind.form === "diaria") {
    return ymShortLabel(entry.date);
  }
  return formatDate(entry.date);
}

/* Busca na área de indicadores: filtra os cards pelo nome/descrição
   (ignorando maiúsculas/minúsculas e acentos). */
const visibleKpis = computed(() => {
  const q = normalizeText(kpiSearch.value).trim();
  if (!q) return kpis.value;
  return kpis.value.filter((k) => normalizeText(`${k.name} ${k.desc || ""}`).includes(q));
});

/* ---------- Seleção múltipla / exclusão em lote (Lançamentos Recentes) ---------- */
const selectedKeys = ref(new Set());

const selectedRows = computed(() =>
  tableRows.value.filter((r) => selectedKeys.value.has(r.entry.id))
);

const allVisibleSelected = computed(
  () => tableRows.value.length > 0 && tableRows.value.every((r) => selectedKeys.value.has(r.entry.id))
);

function toggleRow(id) {
  const next = new Set(selectedKeys.value);
  if (next.has(id)) next.delete(id);
  else next.add(id);
  selectedKeys.value = next;
}

function toggleSelectAll() {
  if (allVisibleSelected.value) {
    selectedKeys.value = new Set();
  } else {
    selectedKeys.value = new Set(tableRows.value.map((r) => r.entry.id));
  }
}

async function handleBulkDelete() {
  if (!canEdit) {
    toast("Seu perfil tem acesso somente leitura.");
    return;
  }
  const rows = selectedRows.value;
  const n = rows.length;
  if (!n) return;
  const ok = await confirm({
    title: `Excluir ${n} lançamento(s)?`,
    message: "Os lançamentos selecionados serão removidos definitivamente e os totais serão recalculados.",
    confirmText: `Excluir ${n}`,
    danger: true
  });
  if (!ok) return;
  removeEntries(rows.map((r) => ({ indicatorId: r.ind.id, entry: r.entry })));
  selectedKeys.value = new Set();
  toast(`${n} lançamento(s) excluído(s).`);
}

/* Dados do gráfico de barras dos Custos Totais em largura total. */
const custosBarData = computed(() => dashboard.custosBarByFilial());

/* Dados do gráfico de barras de Treinamento (carga horária por filial). */
const treinamentoBarData = computed(() => dashboard.treinamentoBarByFilial());

/* Dados do gráfico de barras de Tempo médio de contratação (uma barra por
   vaga aberta no período) — mesmo gráfico que já existia na faixa "Evolução
   por indicador", agora com seção própria abaixo de Treinamento. */
const hiringBarData = computed(() => dashboard.vacanciesBarByOpen(hiringStatusFilter.value));
const permanenciaBarData = computed(() => dashboard.turnoverTenureBarByEmployee());

const diariaSemPeriodoCount = computed(() => dashboard.diariaSemPeriodoCount());

/* Entradas da linha do gráfico "Evolução no período". Absenteísmo, diárias e
   treinamento usam a série agregada por dia (total do dia, sem visão
   individual); os demais indicadores usam os lançamentos do período. */
function lineEntries(card) {
  if (card.kind !== "line") return [];
  const ind = getIndicatorById(card.id);
  if (ind && ind.id === "custo_diaria") return dashboard.diariaDailySeries(diariaShowSemPeriodo.value);
  return filteredEntries(ind);
}

/* Gráfico de barras por estado do Headcount (demais indicadores têm gráfico
   próprio fora da faixa "Evolução por indicador"). */
function chartBarData(card) {
  if (card.kind !== "bar") return [];
  if (card.id === "headcount") return dashboard.headcountBarByState();
  if (card.id === "custo_contratacao") return dashboard.custoContratacaoBarByFuncao();
  if (card.id === "custo_diaria") return dashboard.custoDiariaBarByColaborador();
  return [];
}

function chartTableData(card) {
  if (card.kind !== "table") return null;
  if (card.id === "retencao") return dashboard.retentionBreakdown();
  return null;
}

/* Dados de cada gráfico por indicador, calculados uma única vez por mudança
   nos dados/filtros. Antes eram chamados direto no template e geravam arrays
   novos a cada re-render da tela (ex.: ao digitar na busca de indicadores),
   o que fazia todos os gráficos serem redesenhados sem necessidade. */
const kpiChartViews = computed(() =>
  orderedKpiChartCards.value.map((card) => ({
    card,
    entries: lineEntries(card),
    pieData: card.kind === "pie" ? chartPieData(card.id) : [],
    barData: chartBarData(card),
    tableData: chartTableData(card)
  }))
);

/* Mapa ao lado do gráfico de Custo médio de contratação: RO, AM e PA com o
   filtro em "todos"; só o estado escolhido nos demais casos. */
const custoContratacaoMapa = computed(() =>
  dashboard.custoContratacaoPorEstado().map((s) => ({
    uf: s.uf,
    text: s.avg === null ? "—" : formatCurrency(s.avg),
    sub: `${s.count} ${s.count === 1 ? "vaga" : "vagas"}`,
    filled: s.count > 0
  }))
);

function openLaunch() {
  if (!canEdit) {
    toast("Seu perfil tem acesso somente leitura.");
    return;
  }
  preEditSelectedKpiId.value = null;
  editTarget.value = null;
  editVacancyTarget.value = null;
  viewIndicatorTarget.value = null;
  launchOpen.value = true;
}

function closeLaunch() {
  launchOpen.value = false;
  preEditSelectedKpiId.value = null;
  editTarget.value = null;
  editVacancyTarget.value = null;
  viewIndicatorTarget.value = null;
}

/* Botão direito no KPI de Turnover/Turnover (Exp): abre o Lançamento já na
   aba Histórico do indicador, sem exigir perfil de edição (só leitura). */
function openLaunchView(indicatorId) {
  preEditSelectedKpiId.value = dashboard.selectedKpiId.value;
  editTarget.value = null;
  editVacancyTarget.value = null;
  viewIndicatorTarget.value = indicatorId;
  launchOpen.value = true;
}

/* Editar uma vaga a partir do histórico (botão direito no KPI de contratação). */
function onVacancyEdit(vacancyId) {
  if (!canEdit) {
    toast("Seu perfil tem acesso somente leitura.");
    return;
  }
  preEditSelectedKpiId.value = dashboard.selectedKpiId.value;
  vacanciesOpen.value = false;
  editTarget.value = null;
  editVacancyTarget.value = vacancyId;
  launchOpen.value = true;
}

/* Editar um lançamento vindo do modal de registros (botão direito no KPI):
   abre o modal de lançamento de dados em modo edição. */
function onEntriesEdit({ indicatorId, entry }) {
  if (!canEdit) {
    toast("Seu perfil tem acesso somente leitura.");
    return;
  }
  preEditSelectedKpiId.value = dashboard.selectedKpiId.value;
  diariaEntriesOpen.value = false;
  treinamentoEntriesOpen.value = false;
  custosEntriesOpen.value = false;
  mensalEntriesOpen.value = false;
  editTarget.value = { indicatorId, entry };
  editVacancyTarget.value = null;
  viewIndicatorTarget.value = null;
  launchOpen.value = true;
}

function onSaved() {
  /* Salvando uma edição aberta a partir de um KPI/gráfico já selecionado
     (ex.: Painel) mantém a mesma seleção; só volta ao Panorama atual quando
     nada estava selecionado antes (ex.: "+ Lançamento" do zero). */
  dashboard.selectKpi(preEditSelectedKpiId.value);
  preEditSelectedKpiId.value = null;
}

function toggleShowValues() {
  showValues.value = !showValues.value;
}

function onMenuClick(action) {
  menuOpen.value = false;
  if (action === "xlsx") toXLSX();
  else if (action === "csv") toCSV();
  else if (action === "template") downloadTemplate();
  else if (action === "import") fileInput.value?.click();
  else if (action === "incomplete") toggleMonthIncomplete();
  else if (action === "reload") handleReload();
}

async function handleReload() {
  importing.value = true;
  try {
    await reloadData();
    syncAll();
    toast("Dados recarregados.");
  } catch (err) {
    console.error("[Dashboard] Falha ao recarregar os dados:", err);
    toast("Não foi possível recarregar os dados.");
  } finally {
    importing.value = false;
  }
}

const fileInput = ref(null);
const importing = ref(false);

function onImportFile(e) {
  const file = e.target.files && e.target.files[0];
  if (file) {
    importing.value = true;
    importFile(
      file,
      (summary) => {
        importing.value = false;
        if (summary.error) {
          toast("Erro ao importar a planilha.");
          return;
        }
        const parts = [`${summary.imported} lançamento(s) importado(s)`];
        if (summary.duplicates) parts.push(`${summary.duplicates} duplicado(s) ignorado(s)`);
        if (summary.invalid) parts.push(`${summary.invalid} inválido(s)`);
        if (summary.importedEmployees) parts.push(`${summary.importedEmployees} colaborador(es) importado(s)`);
        if (summary.duplicateEmployees) parts.push(`${summary.duplicateEmployees} colaborador(es) duplicado(s)`);
        if (summary.importedBranches) parts.push(`${summary.importedBranches} filial(ais) importada(s)`);
        if (summary.duplicateBranches) parts.push(`${summary.duplicateBranches} filial(ais) duplicada(s)`);
        if (summary.importedDepartments) parts.push(`${summary.importedDepartments} departamento(s) importado(s)`);
        if (summary.duplicateDepartments) parts.push(`${summary.duplicateDepartments} departamento(s) duplicado(s)`);
        toast("Importação concluída — " + parts.join(" · "));
      },
      filters.current
    );
  }
  e.target.value = "";
}

async function removeEntryRowConfirmed(indicatorId, entryId) {
  if (!canEdit) {
    toast("Seu perfil tem acesso somente leitura.");
    return;
  }
  const ok = await confirm({
    title: "Excluir lançamento?",
    message: "O registro será removido definitivamente e os totais do gráfico serão recalculados.",
    confirmText: "Excluir",
    danger: true
  });
  if (!ok) return;
  removeEntry(indicatorId, entryId);
  syncAll();
  toast("Lançamento excluído.");
}

function openEditEntry(row) {
  if (!canEdit) {
    toast("Seu perfil tem acesso somente leitura.");
    return;
  }
  editingRow.value = row;
}

/* "Limpar tudo" remove SOMENTE os lançamentos do período atualmente
   filtrado (ex.: o mês Ago/2026), respeitando o estado selecionado.
   Lançamentos de outros períodos nunca são afetados. */
async function handleClearAll() {
  if (!canEdit) {
    toast("Seu perfil tem acesso somente leitura.");
    return;
  }
  if (!df.start && !df.end) {
    toast("Selecione um período (ex.: um mês) antes de usar “Limpar tudo”.");
    return;
  }
  const monthScope = singleMonthOfRange(df.start, df.end);
  const scopeLabel = monthScope
    ? ymLabel(monthScope)
    : `entre ${formatDate(df.start)} e ${formatDate(df.end)}`;
  const stateScope =
    filters.current === "todos"
      ? "todos os estados"
      : `o estado ${filters.current}`;

  const targets = dashboard.tableRows("");

  if (!targets.length) {
    toast(`Nenhum lançamento encontrado em ${scopeLabel} (${stateScope}).`);
    return;
  }

  const ok = await confirm({
    title: `Apagar lançamentos de ${scopeLabel}?`,
    message: `Serão removidos ${targets.length} lançamento(s) de ${scopeLabel} (${stateScope}). Lançamentos de outros períodos não serão afetados. Essa ação não pode ser desfeita.`,
    confirmText: `Apagar ${scopeLabel}`,
    danger: true
  });
  if (!ok) return;

  removeEntries(targets.map((r) => ({ indicatorId: r.ind.id, entry: r.entry })));
  selectedKeys.value = new Set();
  syncAll();
  toast(`${targets.length} lançamento(s) de ${scopeLabel} removido(s).`);
}

function onSelectKpi(id) {
  selectKpi(id);
  nextTick(() => {
    if (id === "custo_total") {
      custosChartRef.value?.scrollIntoView({ behavior: "smooth", block: "center" });
      return;
    }
    if (id === "treinamento") {
      treinamentoChartRef.value?.scrollIntoView({ behavior: "smooth", block: "center" });
      return;
    }
    if (id === "tempo_contratacao") {
      hiringChartRef.value?.scrollIntoView({ behavior: "smooth", block: "center" });
      return;
    }
    scrollToKpiChart(id);
  });
}

/* Clique direito em um KPI abre o modal correspondente:
   Headcount/Retenção → colaboradores do mês filtrado (aba Histórico do
   Lançamento) — Retenção vem do próprio quadro do Headcount, não tem mais
   lançamento manual próprio; Diárias, Treinamento e Custos Totais →
   registros; Absenteísmo → histórico do lançamento mensal; Turnover →
   histórico de lançamentos de quantidade (aba Histórico do Lançamento);
   Tempo de permanência → modal próprio (importação por planilha de
   colaborador/admissão/demissão). */
function onKpiContext(id) {
  if (id === "headcount" || id === "retencao") openLaunchView("headcount");
  else if (id === "custo_diaria") diariaEntriesOpen.value = true;
  else if (id === "treinamento") treinamentoEntriesOpen.value = true;
  else if (id === "custo_total") custosEntriesOpen.value = true;
  else if (id === "absenteismo") {
    mensalEntriesIndicatorId.value = id;
    mensalEntriesOpen.value = true;
  } else if (id === "turnover") {
    openLaunchView(id);
  } else if (id === "tempo_permanencia") {
    permanenciaEditId.value = null;
    permanenciaOpen.value = true;
  } else if (id === "tempo_contratacao") {
    vacancyAllPeriods.value = false;
    vacanciesOpen.value = true;
  } else if (id === "custo_contratacao") {
    /* O custo de contratação vem do salário das vagas: abre o histórico
       completo (abertas e fechadas, sem restringir ao mês atual). */
    vacancyAllPeriods.value = true;
    vacanciesOpen.value = true;
  }
}

/* Rola a página até o gráfico do indicador e o destaca. */
function scrollToKpiChart(indicatorId) {
  const scroll = scrollRef.value;
  if (!scroll) return;
  const card = scroll.querySelector(`[data-indicator-card="${indicatorId}"]`);
  if (!card) return;
  card.scrollIntoView({ behavior: "smooth", block: "center" });
  card.classList.remove("is-flash");
  void card.offsetWidth;
  card.classList.add("is-flash");
  clearTimeout(flashTimer);
  flashTimer = setTimeout(() => card.classList.remove("is-flash"), 1800);
}

function onDocumentClick() {
  menuOpen.value = false;
}

onMounted(() => {
  document.addEventListener("click", onDocumentClick);
});
onUnmounted(() => {
  document.removeEventListener("click", onDocumentClick);
  clearTimeout(flashTimer);
  clearTimeout(tableSearchTimer);
});

/* Ao abrir a aba (inclusive ao voltar de outra, já que o KeepAlive não
   remonta o componente) garante que o estado do filtro esteja em memória.
   hydrateState só mostra a tela de carregamento quando realmente há algo a
   baixar — antes ela piscava a cada visita mesmo com tudo já carregado. */
onActivated(() => {
  hydrateState(filters.current).catch(() => {});
  sidebarHidden.value = activeTab.value === "cockpit";
});
onDeactivated(() => {
  sidebarHidden.value = false;
});

/* No Painel a sidebar fica oculta para dar mais espaço aos gráficos. */
watch(activeTab, (tab) => {
  sidebarHidden.value = tab === "cockpit";
});
</script>

<template>
  <div>
    <!-- ===== HERO ===== -->
    <div class="mb-6 grid grid-cols-1 items-center gap-4 sm:grid-cols-3">
      <div class="flex items-center gap-3">
        <h1 class="text-2xl font-bold text-zinc-900 dark:text-zinc-100">Gente &amp; Gestão</h1>
        <button
          v-if="canEdit"
          type="button"
          class="flex h-9 w-9 items-center justify-center rounded-full bg-accent text-xl font-bold text-white transition hover:bg-accent-hover"
          aria-label="Lançar dados"
          title="Lançar dados"
          @click="openLaunch"
        >
          +
        </button>
      </div>

      <div class="flex items-center justify-center">
        <div class="inline-flex rounded-full border border-zinc-200 bg-zinc-100 p-1 dark:border-zinc-800 dark:bg-zinc-900" role="tablist" aria-label="Modo de visualização">
          <button
            type="button"
            role="tab"
            :aria-selected="activeTab === 'visao-geral'"
            class="rounded-full px-4 py-1.5 text-sm font-semibold transition"
            :class="activeTab === 'visao-geral'
              ? 'bg-white text-zinc-900 shadow-sm dark:bg-zinc-800 dark:text-zinc-100'
              : 'text-zinc-500 hover:text-zinc-700 dark:text-zinc-400 dark:hover:text-zinc-200'"
            @click="switchTab('visao-geral')"
          >
            Visão Geral
          </button>
          <button
            type="button"
            role="tab"
            :aria-selected="activeTab === 'cockpit'"
            class="rounded-full px-4 py-1.5 text-sm font-semibold transition"
            :class="activeTab === 'cockpit'
              ? 'bg-white text-zinc-900 shadow-sm dark:bg-zinc-800 dark:text-zinc-100'
              : 'text-zinc-500 hover:text-zinc-700 dark:text-zinc-400 dark:hover:text-zinc-200'"
            @click="switchTab('cockpit')"
          >
            Painel
          </button>
        </div>
      </div>

      <div class="flex items-center justify-start gap-2 sm:justify-end">
        <span
          v-if="monthIncomplete"
          class="inline-flex items-center gap-1 whitespace-nowrap rounded-full border border-amber-300 bg-amber-50 px-2.5 py-1 text-xs font-semibold text-amber-700 dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-300"
          :title="`${filteredMonthLabel} está marcado como incompleto`"
        >
          <span aria-hidden="true">⚠</span> Mês incompleto
        </span>
        <button
          v-if="activeTab === 'cockpit'"
          type="button"
          class="whitespace-nowrap rounded-lg border border-zinc-300 px-3 py-1.5 text-sm font-medium text-zinc-700 transition hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-800"
          @click="toggleShowValues"
        >
          {{ showValues ? "Ocultar valores" : "Mostrar valores" }}
        </button>
        <DateRangeFilter :range="df" title="Período" @apply="showIncompleteNotice" />

        <div class="relative" @click.stop>
        <button
          type="button"
          class="flex h-9 w-9 items-center justify-center rounded-lg border border-zinc-300 text-zinc-700 transition hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-800"
          aria-haspopup="true"
          :aria-expanded="menuOpen"
          title="Menu de ações"
          aria-label="Menu de ações"
          @click="menuOpen = !menuOpen"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <line x1="4" y1="6" x2="20" y2="6" />
            <line x1="4" y1="12" x2="20" y2="12" />
            <line x1="4" y1="18" x2="20" y2="18" />
          </svg>
        </button>

        <div
          v-if="menuOpen"
          class="absolute right-0 z-40 mt-2 w-56 overflow-hidden rounded-xl border border-zinc-200 bg-white py-1 shadow-xl slide-up dark:border-zinc-800 dark:bg-zinc-900"
        >
        <template v-if="canEdit">
          <button type="button" class="dropdown-item text-zinc-700 hover:bg-zinc-100 dark:text-zinc-100 dark:hover:bg-zinc-800" @click="onMenuClick('xlsx')">Baixar em XLSX</button>
          <button type="button" class="dropdown-item text-zinc-700 hover:bg-zinc-100 dark:text-zinc-100 dark:hover:bg-zinc-800" @click="onMenuClick('csv')">Baixar em CSV</button>
          <button type="button" class="dropdown-item text-zinc-700 hover:bg-zinc-100 dark:text-zinc-100 dark:hover:bg-zinc-800" @click="onMenuClick('template')">Baixar template</button>
          <div class="my-1 border-t border-zinc-100 dark:border-zinc-800"></div>
          <button type="button" class="dropdown-item text-zinc-700 hover:bg-zinc-100 dark:text-zinc-100 dark:hover:bg-zinc-800" @click="onMenuClick('import')">Importar planilha</button>
          <div class="my-1 border-t border-zinc-100 dark:border-zinc-800"></div>
          <button
            type="button"
            class="dropdown-item text-zinc-700 hover:bg-zinc-100 disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-transparent dark:text-zinc-100 dark:hover:bg-zinc-800"
            :disabled="!filteredMonth"
            :title="filteredMonth ? '' : 'Selecione um único mês no filtro de período'"
            @click="onMenuClick('incomplete')"
          >
            {{ monthIncomplete ? "Desmarcar mês incompleto" : "Marcar mês como incompleto" }}{{ filteredMonth ? ` (${filteredMonthLabel})` : "" }}
          </button>
          <div class="my-1 border-t border-zinc-100 dark:border-zinc-800"></div>
        </template>
        <button type="button" class="dropdown-item text-zinc-700 hover:bg-zinc-100 dark:text-zinc-100 dark:hover:bg-zinc-800" @click="onMenuClick('reload')">Recarregar Dados</button>
        </div>
        <input ref="fileInput" type="file" accept=".xlsx,.xls,.csv" hidden @change="onImportFile" />
        </div>
      </div>
    </div>

    <!-- ===== VISÃO GERAL / COCKPIT (com animação de arrasto lateral) ===== -->
    <transition :name="tabDirection === 1 ? 'slide-left' : 'slide-right'" mode="out-in">
    <CockpitPanel
      v-if="activeTab === 'cockpit'"
      key="cockpit"
      :dashboard="dashboard"
      :show-values="showValues"
      @edit-vacancy="onVacancyEdit"
      @edit-permanencia="onPermanenciaEdit"
      @open-turnover="openLaunchView('turnover')"
    />

    <div v-else key="visao-geral">

    <!-- ===== KPIs ===== -->
    <div class="mb-3 flex flex-wrap items-center gap-2">
      <h2 class="text-sm font-bold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">Indicadores</h2>
      <input
        v-model="kpiSearch"
        type="search"
        class="input-sm ml-auto w-full sm:w-64"
        placeholder="Buscar indicador..."
        aria-label="Buscar indicador"
      />
    </div>
    <section class="flex gap-4 overflow-x-auto pb-2" aria-label="Indicadores-chave">
      <KpiCard
        v-for="kpi in visibleKpis"
        :key="kpi.id"
        :kpi="kpi"
        :selected="selectedKpiId === kpi.id"
        :show-values="showValues"
        :sem-periodo-count="kpi.id === 'custo_diaria' ? diariaSemPeriodoCount : 0"
        :show-sem-periodo="diariaShowSemPeriodo"
        @select="onSelectKpi"
        @context="onKpiContext"
        @toggle-sem-periodo="diariaShowSemPeriodo = $event"
      />
      <p
        v-if="!visibleKpis.length"
        class="self-center px-4 text-sm text-zinc-500 dark:text-zinc-400"
      >
        Nenhum indicador encontrado para “{{ kpiSearch }}”.
      </p>
    </section>

    <!-- ===== EVOLUÇÃO POR INDICADOR (desativado: faixa horizontal) =====
    <section class="mt-8">
      <div class="mb-3 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 class="text-sm font-bold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">Evolução por indicador</h2>
          <p class="text-xs text-zinc-400 dark:text-zinc-400">Clique em um indicador acima para ir até o gráfico correspondente.</p>
        </div>
        <button type="button" class="rounded-lg border border-zinc-300 px-3 py-1.5 text-sm font-medium text-zinc-700 transition hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-800" @click="toggleShowValues">
          {{ showValues ? "Ocultar valores" : "Mostrar valores" }}
        </button>
      </div>
      <div
        ref="scrollRef"
        class="flex gap-4 overflow-x-auto pb-2"
      >
        <KpiChartCard
          v-for="card in kpiChartCards"
          :key="card.id"
          :card="card"
          :entries="lineEntries(card)"
          :pie-data="card.kind === 'pie' ? chartPieData(card.id) : []"
          :bar-data="chartBarData(card)"
          :table-data="chartTableData(card)"
          :show-values="showValues"
          :data-indicator-card="card.id"
        />
      </div>
    </section>
    ===== FIM EVOLUÇÃO POR INDICADOR (desativado) ===== -->

    <!-- ===== GRÁFICOS POR INDICADOR (um abaixo do outro) ===== -->
    <div class="mt-8 flex justify-end">
      <button type="button" class="rounded-lg border border-zinc-300 px-3 py-1.5 text-sm font-medium text-zinc-700 transition hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-800" @click="toggleShowValues">
        {{ showValues ? "Ocultar valores" : "Mostrar valores" }}
      </button>
    </div>
    <div ref="scrollRef" class="mt-3 grid grid-cols-1 gap-8 lg:grid-cols-2">
      <template v-for="view in kpiChartViews" :key="view.card.id">
        <!-- Custo médio de contratação: gráfico + mapa dos estados ao lado. -->
        <div
          v-if="view.card.id === 'custo_contratacao'"
          class="grid gap-8 lg:col-span-2 lg:grid-cols-[minmax(0,1fr)_340px]"
        >
          <KpiChartCard
            stacked
            :card="view.card"
            :entries="view.entries"
            :pie-data="view.pieData"
            :bar-data="view.barData"
            :table-data="view.tableData"
            :show-values="showValues"
            :data-indicator-card="view.card.id"
            @bar-click="onKpiCardBarClick(view, $event)"
          />
          <UfMapCard :states="custoContratacaoMapa" subtitle="Custo médio de contratação" @select="setState" />
        </div>
        <KpiChartCard
          v-else
          stacked
          :class="HALF_WIDTH_CARDS.includes(view.card.id) ? '' : 'lg:col-span-2'"
          :card="view.card"
          :entries="view.entries"
          :pie-data="view.pieData"
          :bar-data="view.barData"
          :table-data="view.tableData"
          :show-values="showValues"
          :data-indicator-card="view.card.id"
          @bar-click="onKpiCardBarClick(view, $event)"
        />
      </template>
    </div>

    <!-- ===== PANORAMA ATUAL + CUSTOS TOTAIS ===== -->
    <div class="mt-8 grid gap-4">
      <!-- ===== PANORAMA ATUAL (desativado) =====
      <section class="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
        <div class="mb-4 flex items-start justify-between gap-2">
          <div>
            <h2 class="text-sm font-bold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">Panorama atual</h2>
            <span class="text-xs text-zinc-400 dark:text-zinc-400">Último valor por indicador</span>
          </div>
          <button
            type="button"
            class="icon-btn-sm"
            title="Tela cheia"
            aria-label="Ver gráfico Panorama atual em tela cheia"
            @click="panoramaChartRef?.openFullscreen()"
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              <path d="M8 3H5a2 2 0 0 0-2 2v3" />
              <path d="M16 3h3a2 2 0 0 1 2 2v3" />
              <path d="M8 21H5a2 2 0 0 1-2-2v-3" />
              <path d="M16 21h3a2 2 0 0 0 2-2v-3" />
            </svg>
          </button>
        </div>
        <BarChart
          ref="panoramaChartRef"
          :data="panorama"
          :show-values="showValues"
          :show-trend="false"
          title="Panorama atual"
          subtitle="Último valor por indicador"
        />
      </section>
      ===== FIM PANORAMA ATUAL (desativado) ===== -->

      <!-- ===== CUSTOS TOTAIS — EVOLUÇÃO DOS INDICADORES ===== -->
      <section
        ref="custosChartRef"
        class="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-900"
      >
        <div class="mb-4 flex items-start justify-between gap-2">
          <div>
            <h2 class="text-sm font-bold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">Custo de folha de salário — Evolução dos Indicadores</h2>
            <span class="text-xs text-zinc-400 dark:text-zinc-400">Soma dos custos por filial no período filtrado</span>
          </div>
          <button
            v-if="custosBarData.length"
            type="button"
            class="icon-btn-sm"
            title="Tela cheia"
            aria-label="Ver gráfico de Custo de folha de salário em tela cheia"
            @click="custosBarChartRef?.openFullscreen()"
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              <path d="M8 3H5a2 2 0 0 0-2 2v3" />
              <path d="M16 3h3a2 2 0 0 1 2 2v3" />
              <path d="M8 21H5a2 2 0 0 1-2-2v-3" />
              <path d="M16 21h3a2 2 0 0 0 2-2v-3" />
            </svg>
          </button>
        </div>
        <BarChart
          v-if="custosBarData.length"
          ref="custosBarChartRef"
          :data="custosBarData"
          :show-values="showValues"
          value-format="currency"
          :height-px="340"
          title="Custo de folha de salário — Evolução dos Indicadores"
          subtitle="Soma dos custos por filial no período filtrado"
        />
        <div v-else class="p-6">
          <EmptyState
            title="Sem custos no período"
            text="Use o botão “Lançar dados” (Custo de folha de salário) para registrar os custos do período ou ajuste o filtro."
          />
        </div>
      </section>
    </div>

    <!-- ===== TREINAMENTO — CARGA HORÁRIA POR FILIAL ===== -->
    <section
      ref="treinamentoChartRef"
      class="mt-8 rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-900"
    >
      <div class="mb-4 grid grid-cols-1 items-center gap-2 sm:grid-cols-3">
        <div>
          <h2 class="text-sm font-bold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">Treinamento — Carga horária por filial</h2>
          <span class="text-xs text-zinc-400 dark:text-zinc-400">Soma das horas de treinamento por filial no período filtrado</span>
        </div>
        <div></div>
        <div class="flex justify-start sm:justify-end">
          <button
            v-if="treinamentoBarData.length"
            type="button"
            class="icon-btn-sm"
            title="Tela cheia"
            aria-label="Ver gráfico de Treinamento em tela cheia"
            @click="treinamentoBarChartRef?.openFullscreen()"
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              <path d="M8 3H5a2 2 0 0 0-2 2v3" />
              <path d="M16 3h3a2 2 0 0 1 2 2v3" />
              <path d="M8 21H5a2 2 0 0 1-2-2v-3" />
              <path d="M16 21h3a2 2 0 0 0 2-2v-3" />
            </svg>
          </button>
        </div>
      </div>
      <BarChart
        v-if="treinamentoBarData.length"
        ref="treinamentoBarChartRef"
        :data="treinamentoBarData"
        :show-values="showValues"
        value-format="hours"
        :show-trend="false"
        :height-px="520"
        horizontal
        bars-clickable
        title="Treinamento — Carga horária por filial"
        subtitle="Soma das horas de treinamento por filial no período filtrado"
        @bar-click="onTreinamentoBarClick"
      />
      <div v-else class="p-6">
        <EmptyState
          title="Sem treinamentos no período"
          text="Use o botão “Lançar dados” (Treinamento) para registrar as horas ou ajuste o filtro."
        />
      </div>
    </section>

    <!-- ===== TEMPO MÉDIO DE CONTRATAÇÃO ===== -->
    <section
      ref="hiringChartRef"
      class="mt-8 rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-900"
    >
      <div class="mb-4 grid grid-cols-1 items-center gap-2 sm:grid-cols-3">
        <div>
          <h2 class="text-sm font-bold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">Tempo médio de contratação</h2>
          <span class="text-xs text-zinc-400 dark:text-zinc-400">Vagas abertas no período — dias até o fechamento (ou até hoje, se em aberto)</span>
        </div>
        <div class="flex flex-col items-start gap-2 sm:items-center">
          <HiringStatusPills v-model="hiringStatusFilter" />
        </div>
        <div class="flex justify-start sm:justify-end">
          <button
            v-if="hiringBarData.length"
            type="button"
            class="icon-btn-sm"
            title="Tela cheia"
            aria-label="Ver gráfico de Tempo médio de contratação em tela cheia"
            @click="hiringBarChartRef?.openFullscreen()"
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              <path d="M8 3H5a2 2 0 0 0-2 2v3" />
              <path d="M16 3h3a2 2 0 0 1 2 2v3" />
              <path d="M8 21H5a2 2 0 0 1-2-2v-3" />
              <path d="M16 21h3a2 2 0 0 0 2-2v-3" />
            </svg>
          </button>
        </div>
      </div>
      <BarChart
        v-if="hiringBarData.length"
        ref="hiringBarChartRef"
        :data="hiringBarData"
        :show-values="showValues"
        :show-trend="false"
        :height-px="520"
        horizontal
        align-top
        bars-clickable
        title="Tempo médio de contratação"
        subtitle="Vagas abertas no período — dias até o fechamento (ou até hoje, se em aberto)"
        @bar-click="onHiringBarClick"
        @bar-contextmenu="onHiringBarContext"
      />
      <div v-else class="p-6">
        <EmptyState
          title="Sem vagas no período"
          text="Use o botão “Lançar dados” (Vaga) para registrar uma vaga ou ajuste o filtro."
        />
      </div>
      <HiringGoalsLegend size="md" class="mt-3 border-t border-zinc-100 pt-3 dark:border-zinc-800" />
    </section>

    <!-- ===== TEMPO MÉDIO DE PERMANÊNCIA ===== -->
    <section class="mt-8 rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
      <div class="mb-4 grid grid-cols-1 items-center gap-2 sm:grid-cols-3">
        <div>
          <h2 class="text-sm font-bold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">Tempo médio de permanência</h2>
          <span class="text-xs text-zinc-400 dark:text-zinc-400">Dias entre admissão e desligamento, por colaborador</span>
        </div>
        <div></div>
        <div class="flex justify-start sm:justify-end">
          <button
            v-if="permanenciaBarData.length"
            type="button"
            class="icon-btn-sm"
            title="Tela cheia"
            aria-label="Ver gráfico de Tempo médio de permanência em tela cheia"
            @click="permanenciaBarChartRef?.openFullscreen()"
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              <path d="M8 3H5a2 2 0 0 0-2 2v3" />
              <path d="M16 3h3a2 2 0 0 1 2 2v3" />
              <path d="M8 21H5a2 2 0 0 1-2-2v-3" />
              <path d="M16 21h3a2 2 0 0 0 2-2v-3" />
            </svg>
          </button>
        </div>
      </div>
      <BarChart
        v-if="permanenciaBarData.length"
        ref="permanenciaBarChartRef"
        :data="permanenciaBarData"
        :show-values="showValues"
        :show-trend="false"
        :height-px="520"
        horizontal
        bars-clickable
        title="Tempo médio de permanência"
        subtitle="Dias entre admissão e desligamento, por colaborador"
        @bar-click="onPermanenciaBarClick"
        @bar-contextmenu="onPermanenciaBarContext"
      />
      <div v-else class="p-6">
        <EmptyState
          title="Sem colaboradores desligados no período"
          text="Importe uma planilha ou lance um registro (botão direito no KPI de Tempo médio de permanência) ou ajuste o filtro."
        />
      </div>
    </section>

    <!-- ===== LANÇAMENTOS ===== -->
    <section class="mt-8 rounded-2xl border border-zinc-200 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
      <div class="flex flex-wrap items-center justify-between gap-3 border-b border-zinc-100 p-5 dark:border-zinc-800">
        <div>
          <h2 class="text-sm font-bold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">Lançamentos recentes</h2>
          <p class="text-xs text-zinc-400 dark:text-zinc-400">Todos os registros cadastrados e calculados</p>
        </div>
        <div class="flex flex-wrap items-center gap-2">
          <template v-if="canEdit && selectedRows.length">
            <span class="rounded-full bg-accent/10 px-2.5 py-1 text-xs font-semibold text-accent-hover dark:text-accent-light">
              {{ selectedRows.length }} selecionado(s)
            </span>
            <button type="button" class="btn-danger-solid-sm" @click="handleBulkDelete">Excluir selecionados</button>
          </template>
          <input v-model="tableSearch" type="search" class="input-sm" placeholder="Buscar lançamento..." aria-label="Buscar lançamento" />
          <button v-if="canEdit" type="button" class="btn-ghost-sm" @click="handleClearAll">Limpar tudo</button>
        </div>
      </div>

      <template v-if="tableRows.length">
      <div class="max-h-[400px] overflow-auto" @scroll.passive="onTableScroll">
        <table class="w-full min-w-max text-left text-sm">
          <thead class="sticky top-0 z-10 bg-white dark:bg-zinc-900">
            <tr class="border-b border-zinc-100 text-xs uppercase tracking-wide text-zinc-400 dark:border-zinc-800 dark:text-zinc-400">
              <th v-if="canEdit" class="w-10 px-4 py-3 font-semibold">
                <input
                  type="checkbox"
                  class="h-4 w-4 cursor-pointer accent-accent"
                  :checked="allVisibleSelected"
                  aria-label="Selecionar todos os lançamentos visíveis"
                  @change="toggleSelectAll"
                />
              </th>
              <th class="px-5 py-3 font-semibold">Data</th>
              <th class="px-5 py-3 font-semibold">Indicador</th>
              <th class="px-5 py-3 font-semibold">Valor</th>
              <th v-if="canEdit" class="px-5 py-3"></th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="{ entry, ind } in visibleTableRows"
              :key="entry.id"
              class="border-b border-zinc-100 last:border-0 dark:border-zinc-800"
              :class="selectedKeys.has(entry.id) ? 'bg-accent/5 dark:bg-accent/5' : ''"
            >
              <td v-if="canEdit" class="px-4 py-3">
                <input
                  type="checkbox"
                  class="h-4 w-4 cursor-pointer accent-accent"
                  :checked="selectedKeys.has(entry.id)"
                  :aria-label="`Selecionar lançamento de ${ind.name}`"
                  @change="toggleRow(entry.id)"
                />
              </td>
              <td class="px-5 py-3 text-zinc-700 dark:text-zinc-300">
                {{ tableDateLabel(ind, entry) }}
              </td>
              <td class="px-5 py-3"><Badge>{{ ind.name }}</Badge></td>
              <td class="px-5 py-3 font-medium text-zinc-900 dark:text-zinc-100">{{ formatEntryValue(ind, entry) }}</td>
              <td v-if="canEdit" class="px-5 py-3 text-right">
                <div class="flex justify-end gap-2">
                  <button
                    type="button"
                    class="btn-ghost-sm"
                    aria-label="Editar lançamento"
                    @click="openEditEntry({ entry, ind })"
                  >
                    Editar
                  </button>
                  <button
                    type="button"
                    class="icon-btn-sm"
                    aria-label="Excluir lançamento"
                    @click="removeEntryRowConfirmed(ind.id, entry.id)"
                  >
                    &times;
                  </button>
                </div>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
      <p
        v-if="tableRows.length > visibleTableRows.length"
        class="border-t border-zinc-100 px-5 py-2 text-xs text-zinc-400 dark:border-zinc-800"
      >
        Exibindo {{ visibleTableRows.length }} de {{ tableRows.length }} lançamentos — role a tabela para carregar mais.
      </p>
      </template>

      <div v-else class="p-5">
        <EmptyState
          :title="tableSearch ? 'Nenhum resultado encontrado' : 'Nenhum lançamento ainda'"
          :text="tableSearch ? '' : 'Use o botão “Lançar dados” para alimentar seus indicadores ou cadastre colaboradores na aba Equipe.'"
        />
      </div>
    </section>

    </div>
    </transition>

    <LaunchModal
      v-if="launchOpen"
      :open="launchOpen"
      :edit-entry="editTarget"
      :edit-vacancy-id="editVacancyTarget"
      :view-indicator-id="viewIndicatorTarget"
      @close="closeLaunch"
      @saved="onSaved"
    />
    <VacanciesModal
      v-if="vacanciesOpen"
      :open="vacanciesOpen"
      :all-periods="vacancyAllPeriods"
      @close="vacanciesOpen = false"
      @edit="onVacancyEdit"
    />
    <VacancyDetailModal
      v-if="vacancyDetailOpen"
      :open="vacancyDetailOpen"
      :vacancy-id="vacancyDetailId"
      :fallback="vacancyDetailFallback"
      @close="vacancyDetailOpen = false"
      @edit="onVacancyDetailEdit"
    />
    <PermanenciaModal
      v-if="permanenciaOpen"
      :open="permanenciaOpen"
      :edit-record-id="permanenciaEditId"
      @close="permanenciaOpen = false; permanenciaEditId = null"
    />
    <PermanenciaDetailModal
      v-if="permanenciaDetailOpen"
      :open="permanenciaDetailOpen"
      :record-id="permanenciaDetailId"
      @close="permanenciaDetailOpen = false"
      @edit="onPermanenciaDetailEdit"
    />
    <HeadcountEstadoModal
      v-if="headcountEstadoOpen"
      :open="headcountEstadoOpen"
      :estado="headcountEstadoSigla"
      @close="headcountEstadoOpen = false"
    />
    <TrainingFilialModal
      v-if="treinamentoFilialOpen"
      :open="treinamentoFilialOpen"
      :filial="treinamentoFilialLabel"
      :entries="treinamentoFilialRows"
      @close="treinamentoFilialOpen = false"
    />
    <DiariaColaboradorModal
      v-if="diariaColabOpen"
      :open="diariaColabOpen"
      :colaborador="diariaColabName"
      :entries="diariaColabRows"
      @close="diariaColabOpen = false"
    />
    <IndicatorEntriesModal
      v-if="diariaEntriesOpen"
      :open="diariaEntriesOpen"
      indicator-id="custo_diaria"
      title="Custo médio da diária geral — Lançamentos"
      :columns="diariaColumns"
      @close="diariaEntriesOpen = false"
      @edit="onEntriesEdit"
    />
    <IndicatorEntriesModal
      v-if="treinamentoEntriesOpen"
      :open="treinamentoEntriesOpen"
      indicator-id="treinamento"
      title="Treinamentos — Lançamentos"
      :columns="treinamentoColumns"
      @close="treinamentoEntriesOpen = false"
      @edit="onEntriesEdit"
    />
    <IndicatorEntriesModal
      v-if="custosEntriesOpen"
      :open="custosEntriesOpen"
      indicator-id="custo_total"
      title="Custo de folha de salário — Lançamentos"
      :columns="custosColumns"
      @close="custosEntriesOpen = false"
      @edit="onEntriesEdit"
    />
    <IndicatorEntriesModal
      v-if="mensalEntriesOpen"
      :open="mensalEntriesOpen"
      :indicator-id="mensalEntriesIndicatorId"
      :title="`${getIndicatorById(mensalEntriesIndicatorId)?.name || ''} — Lançamentos`"
      :columns="mensalColumns"
      @close="mensalEntriesOpen = false"
      @edit="onEntriesEdit"
    />
    <EditEntryModal
      v-if="editingRow"
      :open="!!editingRow"
      :indicator-id="editingRow.ind.id"
      :entry="editingRow.entry"
      @close="editingRow = null"
      @saved="editingRow = null"
    />

    <Modal
      v-if="incompleteNoticeOpen"
      title="Mês com informações incompletas"
      :subtitle="filteredMonthLabel"
      max-width="max-w-md"
      @close="confirmIncompleteNotice"
    >
      <p class="text-sm text-zinc-700 dark:text-zinc-300">
        O mês de <strong>{{ filteredMonthLabel }}</strong>
        <template v-if="filters.current === 'todos'"> ({{ markedStates.join(", ") }})</template>
        <template v-else> ({{ filters.current }})</template>
        não está com todas as informações lançadas. Os indicadores e gráficos deste período podem não refletir o resultado final.
      </p>
      <p v-if="canEdit" class="mt-3 text-xs text-zinc-500 dark:text-zinc-400">
        Para remover este aviso, use o menu e escolha “Desmarcar mês incompleto” com este mês filtrado.
      </p>
      <div class="mt-5 flex justify-end">
        <button
          type="button"
          class="rounded-lg bg-accent px-5 py-2 text-sm font-semibold text-white transition hover:bg-accent-hover"
          @click="confirmIncompleteNotice"
        >
          Confirmar
        </button>
      </div>
    </Modal>

    <LoadingOverlay :show="importing" :label="'Processando planilha...'" />
  </div>
</template>

<style scoped>
/* Animação de "arrasto" lateral ao trocar entre Visão Geral e Painel. */
.slide-left-enter-active,
.slide-left-leave-active,
.slide-right-enter-active,
.slide-right-leave-active {
  transition: transform 0.22s ease, opacity 0.22s ease;
}
.slide-left-enter-from {
  transform: translateX(28px);
  opacity: 0;
}
.slide-left-leave-to {
  transform: translateX(-28px);
  opacity: 0;
}
.slide-right-enter-from {
  transform: translateX(-28px);
  opacity: 0;
}
.slide-right-leave-to {
  transform: translateX(28px);
  opacity: 0;
}
.dropdown-item {
  display: block;
  width: 100%;
  padding: 0.5rem 1rem;
  text-align: left;
  font-size: 0.875rem;
  transition: background-color 0.15s;
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
.btn-ghost-sm {
  border-radius: 0.5rem;
  padding: 0.375rem 0.6rem;
  font-size: 0.8125rem;
  font-weight: 500;
  color: rgb(63 63 70);
  transition: background-color 0.15s;
}
.btn-ghost-sm:hover {
  background-color: rgb(244 244 245);
}
.btn-danger-solid-sm {
  border-radius: 0.5rem;
  background-color: rgb(220 38 38);
  padding: 0.375rem 0.6rem;
  font-size: 0.8125rem;
  font-weight: 600;
  color: #fff;
  transition: background-color 0.15s;
}
.btn-danger-solid-sm:hover {
  background-color: rgb(185 28 28);
}
:global(.dark) .btn-ghost-sm {
  color: rgb(228 228 231);
}
:global(.dark) .btn-ghost-sm:hover {
  background-color: rgb(39 39 42);
}
</style>
