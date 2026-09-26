<script setup>
import { ref, computed, onMounted, onActivated, onDeactivated, onUnmounted, nextTick, watch } from "vue";
import { sidebarHidden } from "@/composables/useSidebar";
import { activeTab, tabDirection } from "@/composables/useDashboardTab";
import KpiCard from "@/components/dashboard/KpiCard.vue";
import KpiChartCard from "@/components/dashboard/KpiChartCard.vue";
import UfMapCard from "@/components/dashboard/UfMapCard.vue";
import FaturamentoShareChip from "@/components/dashboard/FaturamentoShareChip.vue";
import FaturamentoButton from "@/components/layout/FaturamentoButton.vue";
import TurnoverDetailModal from "@/components/dashboard/TurnoverDetailModal.vue";
import LaunchModal from "@/components/dashboard/LaunchModal.vue";
import IndicatorEntriesModal from "@/components/dashboard/IndicatorEntriesModal.vue";
import VacanciesModal from "@/components/dashboard/VacanciesModal.vue";
import FiliaisOutrasModal from "@/components/dashboard/FiliaisOutrasModal.vue";
import VacancyDetailModal from "@/components/dashboard/VacancyDetailModal.vue";
import PermanenciaModal from "@/components/dashboard/PermanenciaModal.vue";
import PermanenciaDetailModal from "@/components/dashboard/PermanenciaDetailModal.vue";
import TrainingFilialModal from "@/components/dashboard/TrainingFilialModal.vue";
import HeadcountEstadoModal from "@/components/dashboard/HeadcountEstadoModal.vue";
import DiariaColaboradorModal from "@/components/dashboard/DiariaColaboradorModal.vue";
import HiringGoalsLegend from "@/components/dashboard/HiringGoalsLegend.vue";
import CockpitPanel from "@/components/dashboard/CockpitPanel.vue";
import HiringStatusPills from "@/components/dashboard/HiringStatusPills.vue";
import GerenteRegionalFilter from "@/components/dashboard/GerenteRegionalFilter.vue";
import RescisaoModeToggle from "@/components/dashboard/RescisaoModeToggle.vue";
import RescisaoFuncaoModal from "@/components/dashboard/RescisaoFuncaoModal.vue";
import RegionalTreinamentosModal from "@/components/dashboard/RegionalTreinamentosModal.vue";
import DateRangeFilter from "@/components/dashboard/DateRangeFilter.vue";
import StateFilter from "@/components/layout/StateFilter.vue";
import BarChart from "@/components/charts/BarChart.vue";
import PieChart from "@/components/charts/PieChart.vue";
import RescisaoViewToggle from "@/components/dashboard/RescisaoViewToggle.vue";
import Badge from "@/components/ui/Badge.vue";
import EmptyState from "@/components/ui/EmptyState.vue";
import { useDashboardData } from "@/composables/useDashboardData";
import { useDateFilter, dateFilter } from "@/composables/useDateFilter";
import { useFilters } from "@/composables/useFilters";
import { useToast } from "@/composables/useToast";
import { useDialog } from "@/composables/useDialog";
import { canEditData, isAdmin } from "@/lib/auth";
import { getIndicatorById, STATES } from "@/lib/config";
import { singleMonthOfRange, ymLabel, safeSetItem, localStore, normalizeText } from "@/lib/utils";
import { incompleteStates, setMonthIncomplete } from "@/lib/monthStatus";
import Modal from "@/components/ui/Modal.vue";
import { toXLSX, toCSV } from "@/lib/export";
import { hydrateState, reloadData } from "@/lib/db";
import { syncAll } from "@/lib/employees";
import { apiFetch } from "@/lib/api";

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
const vacancyIndicatorId = ref("tempo_contratacao");
/* Filial pré-selecionada no modal de Vagas (clique numa barra do custo). */
const vacancyInitialFilial = ref(null);

/* Fatia "OUTRAS" da pizza de custo: modal com as filiais agrupadas nela. */
const outrasFiliaisOpen = ref(false);
const outrasFiliaisItems = ref([]);

function onCustoFilial(filial) {
  if (filial === "__outras__") {
    const outras = dashboard.custoContratacaoMedioPorFilial().find((r) => r.key === "__outras__");
    outrasFiliaisItems.value = outras ? outras.items : [];
    outrasFiliaisOpen.value = true;
    return;
  }
  outrasFiliaisOpen.value = false;
  vacancyIndicatorId.value = "custo_contratacao";
  vacancyInitialFilial.value = filial || null;
  vacanciesOpen.value = true;
}
const permanenciaOpen = ref(false);

/* Modal ao clicar em uma barra do gráfico de Treinamento (por filial). */
const treinamentoFilialOpen = ref(false);
const treinamentoFilialLabel = ref("");
const treinamentoFilialRows = ref([]);
const treinamentoModalTitle = ref("");

/* Barra do gráfico Regional Treinamentos: mesmo card, com os treinamentos do
   gerente regional (e a coluna Filial). */
function onRegionalBarClick({ label }) {
  if (!label) return;
  treinamentoModalTitle.value = `Regional Treinamentos — ${label}`;
  treinamentoFilialRows.value = dashboard.treinamentoRegionalEntries(label);
  treinamentoFilialOpen.value = true;
}

function onTreinamentoBarClick({ label }) {
  if (!label) return;
  treinamentoModalTitle.value = "";
  treinamentoFilialLabel.value = label;
  treinamentoFilialRows.value = dashboard.treinamentoFilialEntries(label);
  treinamentoFilialOpen.value = true;
}

/* Modal ao clicar em uma barra do gráfico de Headcount (uma por estado) —
   lista os colaboradores do estado da barra no mês filtrado. */
/* Detalhe de Admissões/Demissões do Turnover (cards ao lado da pizza). */
const turnoverDetailOpen = ref(false);
const turnoverDetailKind = ref("admissoes");

function openTurnoverDetail(kind) {
  turnoverDetailKind.value = kind;
  turnoverDetailOpen.value = true;
}

const headcountEstadoOpen = ref(false);
const headcountEstadoSigla = ref("");
const headcountGenero = ref("");

function onHeadcountBarClick({ label, datasetIndex }) {
  if (!label) return;
  /* Séries do gráfico: 0 = Masculino, 1 = Feminino, 2 = Total (geral). */
  headcountGenero.value = ["masculino", "feminino"][datasetIndex] || "";
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
function onKpiCardBarClick({ card, pieData }, { index, label, datasetIndex }) {
  if (card.id === "headcount_genero") {
    headcountGenero.value = ["masculino", "feminino"][index] || "";
    headcountEstadoSigla.value = filters.current;
    headcountEstadoOpen.value = true;
    return;
  }
  if (card.id === "custo_diaria") return onDiariaBarClick({ label });
  if (card.id === "headcount") return onHeadcountBarClick({ label, datasetIndex });
  if (card.id !== "custo_contratacao") return;
  const row = (pieData || [])[index];
  if (row && row.key) onCustoFilial(row.key);
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
const regionalBarChartRef = ref(null);
const regionalChartRef = ref(null);

/* Clique direito no KPI Regional Treinamentos: card com cada regional e seus
   treinamentos (lista calculada ao abrir). */
const regionalModalOpen = ref(false);
const regionalGroups = ref([]);
const hiringBarChartRef = ref(null);
const permanenciaBarChartRef = ref(null);
const editTarget = ref(null);
const editVacancyTarget = ref(null);
const viewIndicatorTarget = ref(null);

/* Colunas exibidas no modal de registros (clique direito no KPI). Regional
   passou a vir do próprio estado do lançamento (estado_sigla → meta.estado,
   ver diariaToRow em lib/db.js) em vez do texto lançado à mão. */
const diariaColumns = [
  { label: "Mês", monthYear: true },
  { label: "Colaborador", meta: "employeeName" },
  { label: "Filial", meta: "filial" },
  { label: "Gerente regional", meta: "gerenteRegional" },
  { label: "Regional", meta: "estado" },
  { label: "Diária", meta: "motivo" },
  { label: "Valor pago", value: true }
];

const treinamentoColumns = [
  { label: "Competência", month: true },
  { label: "Colaborador", meta: "employeeName" },
  { label: "Cargo", meta: "cargo" },
  { label: "Loja", meta: "filial" },
  { label: "Gerente regional", meta: "gerenteRegional" },
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
/* Grade de 3 colunas: [Headcount | Turnover | Mapa-filtro] e depois
   [Absenteísmo | Custo médio de contratação | Retenção]. Os demais gráficos
   ocupam a largura toda. */
const CHART_ORDER = ["headcount", "turnover", "absenteismo", "custo_contratacao", "retencao"];
/* Grade de 12 colunas: Turnover e Custo de contratação mais largos (5), e o
   mapa-filtro e a Retenção estreitos (3). */
function chartSpan(id) {
  if (id === "turnover") return "lg:col-span-5";
  /* Linha 2: Headcount Gênero, Custo médio de contratação e Retenção, do mesmo tamanho. */
  if (id === "headcount_genero" || id === "custo_contratacao" || id === "retencao") return "lg:col-span-4";
  return CHART_ORDER.includes(id) ? "lg:col-span-4" : "lg:col-span-12";
}
const orderedKpiChartCards = computed(() => {
  const first = CHART_ORDER.map((id) => kpiChartCards.value.find((c) => c.id === id)).filter(Boolean);
  const rest = kpiChartCards.value.filter((c) => !CHART_ORDER.includes(c.id));
  return [...first, ...rest];
});
let flashTimer = null;

const canEdit = canEditData();
// Só o admin recarrega dados: é ele quem força a atualização do cache do
// Worker (ver handleReload) — analistas não têm mais esse botão.
const canRefreshCache = isAdmin();

/* Busca na área de indicadores: filtra os cards pelo nome/descrição
   (ignorando maiúsculas/minúsculas e acentos). */
const visibleKpis = computed(() => {
  const q = normalizeText(kpiSearch.value).trim();
  if (!q) return kpis.value;
  return kpis.value.filter((k) => normalizeText(`${k.name} ${k.desc || ""}`).includes(q));
});

/* Dados do gráfico de barras dos Custos Totais em largura total. */
const custosBarData = computed(() => dashboard.custosBarByFilial());

/* Dados do gráfico de barras de Treinamento (carga horária por filial). */
const treinamentoBarData = computed(() => dashboard.treinamentoBarByFilial());

/* Horas de treinamento por gerente regional (ao lado do gráfico por filial). */
const regionalBarData = computed(() => dashboard.cockpitChartFor("horas_regional").data);

/* Dados do gráfico de barras de Tempo médio de contratação (uma barra por
   vaga aberta no período) — mesmo gráfico que já existia na faixa "Evolução
   por indicador", agora com seção própria abaixo de Treinamento. */
const hiringBarData = computed(() => dashboard.vacanciesBarByOpen(hiringStatusFilter.value));
const permanenciaBarData = computed(() => dashboard.turnoverTenureBarByEmployee());

/* Rescisões por função: "total" (rescisão + GRRF/consig + 40%) ou "liquido"
   (só o valor da rescisão). */
const rescisaoMode = ref("total");
/* Filtros de filial e gerente imediato ("" = todos). */
const rescisaoFilial = ref("");
const rescisaoGerente = ref("");
const rescisaoOptions = computed(() => dashboard.rescisoesFilterOptions());
const rescisaoFilters = computed(() => ({ filial: rescisaoFilial.value, gerente: rescisaoGerente.value }));
watch(rescisaoOptions, (opts) => {
  if (rescisaoFilial.value && !opts.filiais.includes(rescisaoFilial.value)) rescisaoFilial.value = "";
  if (rescisaoGerente.value && !opts.gerentes.includes(rescisaoGerente.value)) rescisaoGerente.value = "";
});
const rescisoesBarData = computed(() => dashboard.rescisoesBarByFuncao(rescisaoMode.value, rescisaoFilters.value));
/* Visualização: barras por função ou pizza por estado. */
const rescisaoView = ref("funcao");
const rescisoesPieData = computed(() => dashboard.rescisoesPieByEstado(rescisaoMode.value, rescisaoFilters.value));
const rescisaoPorEstado = ref(false);
function onRescisaoPieClick(sliceIndex) {
  const row = sliceIndex != null ? rescisoesPieData.value[sliceIndex] : null;
  if (!row) return;
  rescisaoFuncaoName.value = row.label;
  rescisaoFuncaoRows.value = dashboard.rescisoesEntriesByEstado(row.label, rescisaoFilters.value);
  rescisaoPorEstado.value = true;
  rescisaoFuncaoOpen.value = true;
}
const rescisoesHasData = computed(() =>
  rescisaoView.value === "estado" ? rescisoesPieData.value.length > 0 : rescisoesBarData.value.length > 0
);
const rescisoesSub = computed(() => {
  const by = rescisaoView.value === "estado" ? "estado" : "função";
  return rescisaoMode.value === "liquido"
    ? `Valor líquido (só a rescisão) por ${by} no período filtrado`
    : `Rescisão + GRRF/consig + 40% por ${by} no período filtrado`;
});
const rescisaoFuncaoOpen = ref(false);
const rescisaoFuncaoName = ref("");
const rescisaoFuncaoRows = ref([]);
function onRescisaoBarClick({ label }) {
  if (!label) return;
  rescisaoFuncaoName.value = label;
  rescisaoFuncaoRows.value = dashboard.rescisoesEntriesByFuncao(label, rescisaoFilters.value);
  rescisaoPorEstado.value = false;
  rescisaoFuncaoOpen.value = true;
}
const rescisoesChartRef = ref(null);
const rescisoesBarChartRef = ref(null);

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
    pieData:
      card.id === "ticket_medio"
        ? dashboard.ticketMedioBarByState()
        : card.id === "custo_contratacao"
          ? dashboard.custoContratacaoMedioPorFilial()
          : card.kind === "pie"
            ? chartPieData(card.id)
            : [],
    pieCenter:
      card.id === "ticket_medio"
        ? dashboard.ticketMedioPieCenter()
        : card.id === "custo_contratacao"
          ? dashboard.custoContratacaoPieCenter()
          : null,
    /* Turnover: quantidades de admissões/demissões e taxa total (centro da pizza). */
    turnoverSummary: card.id === "turnover" ? dashboard.cockpitChartFor("turnover").summary : null,
    barData: chartBarData(card),
    tableData: chartTableData(card)
  }))
);

/* Custo médio por colaborador não entra na grade "por indicador": fica ao lado
   do gráfico de Custo de folha de salário (mesma linha, mais abaixo). */
/* Headcount por gênero (pizza Masculino x Feminino, nos filtros atuais): ocupa
   na grade o lugar do Absenteísmo, que foi para a linha do Custo de folha. */
const generoChartView = computed(() => {
  const chart = dashboard.cockpitChartFor("headcount", undefined, undefined, undefined, "", "pie");
  return {
    card: {
      id: "headcount_genero",
      kind: "pie",
      title: "Headcount — Gênero",
      sub: "Masculino x Feminino",
      valueFormat: "count"
    },
    entries: [],
    pieData: chart.data,
    pieCenter: chart.center,
    turnoverSummary: null,
    barData: [],
    tableData: null
  };
});
const gridChartViews = computed(() =>
  kpiChartViews.value
    .filter((v) => v.card.id !== "ticket_medio")
    .map((v) => (v.card.id === "absenteismo" ? generoChartView.value : v))
);
const absenteismoChartView = computed(() => kpiChartViews.value.find((v) => v.card.id === "absenteismo") || null);
const ticketChartView = computed(() => kpiChartViews.value.find((v) => v.card.id === "ticket_medio") || null);
const ticketChartRef = ref(null);

/* % do faturamento (Custo médio por colaborador ÷ faturamento médio × 100):
   KPI ao lado do gráfico de Custo de folha de salário, com o botão do
   faturamento (especulativo) no cabeçalho dele. null sem faturamento. */
const custosFaturamento = computed(() => dashboard.ticketMedioFaturamento());

/* Mapa-filtro ao lado do gráfico de Turnover (sem valores): RO, AM e PA com o
   filtro em "todos"; só o estado escolhido nos demais casos. */
const estadoFiltroMapa = computed(() => {
  void filters.revision;
  const ufs = !filters.current || filters.current === "todos" ? STATES : [filters.current];
  return ufs.map((uf) => ({ uf, text: "", sub: "", filled: true }));
});

/* "Recarregar dados": força o Worker a buscar tudo de novo na planilha e
   reescrever o cache (reseta a contagem dos 5 min a partir de agora — ver
   services/cache.ts no backend), depois baixa o cache local com o resultado. */
const reloading = ref(false);
async function handleReload() {
  if (reloading.value) return;
  reloading.value = true;
  try {
    // Sem limite de tempo: reler a planilha inteira pode passar de 30 s
    // quando o Apps Script está lento (ele repete a leitura sozinho).
    await apiFetch("/api/cache/refresh", { method: "POST", timeoutMs: 0 });
    await reloadData();
    syncAll();
    toast("Dados recarregados.");
  } catch (err) {
    console.error("[DashboardView] Falha ao recarregar os dados:", err);
    toast("Não foi possível recarregar os dados.");
  } finally {
    reloading.value = false;
  }
}

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
  else if (action === "incomplete") toggleMonthIncomplete();
  else if (action === "launch") openLaunch();
}

function onSelectKpi(id) {
  selectKpi(id);
  nextTick(() => {
    if (id === "custo_total") {
      custosChartRef.value?.scrollIntoView({ behavior: "smooth", block: "center" });
      return;
    }
    if (id === "ticket_medio") {
      ticketChartRef.value?.scrollIntoView({ behavior: "smooth", block: "center" });
      return;
    }
    if (id === "horas_regional") {
      regionalChartRef.value?.scrollIntoView({ behavior: "smooth", block: "center" });
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
    if (id === "rescisoes") {
      rescisoesChartRef.value?.scrollIntoView({ behavior: "smooth", block: "center" });
      return;
    }
    scrollToKpiChart(id);
  });
}

/* Clique direito em um KPI abre o modal correspondente:
   Headcount → card de informações (colaboradores do mês e estado filtrados,
   mesmo modal do clique numa barra do gráfico de Headcount — ver
   HeadcountEstadoModal.vue); Retenção → colaboradores do mês filtrado (aba
   Histórico do Lançamento), pois vem do próprio quadro do Headcount e não
   tem lançamento manual próprio; Diárias, Treinamento e Custos Totais →
   registros; Absenteísmo → histórico do lançamento mensal; Turnover → modal
   de informações (Admissões/Demissões — mesmo destino do clique na pizza do
   gráfico de Turnover, ver onTurnoverChartInfo em KpiChartCard.vue); Tempo de
   permanência → modal próprio (importação por planilha de
   colaborador/admissão/demissão). */
function onKpiContext(id) {
  if (id === "headcount") {
    headcountEstadoSigla.value = filters.current;
    headcountGenero.value = "";
    headcountEstadoOpen.value = true;
  } else if (id === "retencao") openLaunchView("headcount");
  else if (id === "custo_diaria") diariaEntriesOpen.value = true;
  else if (id === "horas_regional") {
    regionalGroups.value = dashboard.treinamentoRegionalGroups();
    regionalModalOpen.value = true;
  } else if (id === "treinamento") treinamentoEntriesOpen.value = true;
  else if (id === "custo_total") custosEntriesOpen.value = true;
  else if (id === "absenteismo") {
    mensalEntriesIndicatorId.value = id;
    mensalEntriesOpen.value = true;
  } else if (id === "turnover") {
    openTurnoverDetail("geral");
  } else if (id === "tempo_permanencia") {
    permanenciaEditId.value = null;
    permanenciaOpen.value = true;
  } else if (id === "tempo_contratacao") {
    vacancyIndicatorId.value = "tempo_contratacao";
    vacancyInitialFilial.value = null;
    vacanciesOpen.value = true;
  } else if (id === "custo_contratacao") {
    /* O custo de contratação vem do salário das vagas fechadas no mês
       filtrado (mesma regra do KPI e do gráfico). */
    vacancyIndicatorId.value = "custo_contratacao";
    vacancyInitialFilial.value = null;
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
    <div class="mb-6 flex flex-wrap items-center justify-between gap-4">
      <div class="flex items-center gap-3">
        <h1 class="text-2xl font-bold text-zinc-900 dark:text-zinc-100">Gente &amp; Gestão</h1>
        <button
          v-if="canRefreshCache"
          type="button"
          class="flex h-9 w-9 items-center justify-center rounded-lg border border-zinc-300 text-zinc-700 transition hover:bg-zinc-100 disabled:cursor-not-allowed disabled:opacity-50 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-800"
          aria-label="Recarregar dados"
          title="Recarregar dados"
          :disabled="reloading"
          @click="handleReload"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" :class="reloading ? 'animate-spin' : ''">
            <path d="M21 12a9 9 0 1 1-2.64-6.36" />
            <polyline points="21 3 21 9 15 9" />
          </svg>
        </button>
      </div>

      <!-- Números-resumo do gráfico central do Painel (Teleport do CockpitPanel),
           no meio da linha, entre o título e o filtro de mês. -->
      <div
        v-if="activeTab === 'cockpit'"
        id="cockpit-kpi-slot"
        class="flex min-w-0 flex-1 items-center justify-center"
      ></div>

      <div class="flex items-center justify-start gap-2 sm:ml-auto sm:justify-end">
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
        <StateFilter variant="page" />

        <div v-if="canEdit" class="relative" @click.stop>
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
          <button v-if="canEdit" type="button" class="dropdown-item text-zinc-700 hover:bg-zinc-100 dark:text-zinc-100 dark:hover:bg-zinc-800" @click="onMenuClick('launch')">Lançar dados</button>
          <div v-if="canEdit" class="my-1 border-t border-zinc-100 dark:border-zinc-800"></div>
          <button type="button" class="dropdown-item text-zinc-700 hover:bg-zinc-100 dark:text-zinc-100 dark:hover:bg-zinc-800" @click="onMenuClick('xlsx')">Baixar em XLSX</button>
          <button type="button" class="dropdown-item text-zinc-700 hover:bg-zinc-100 dark:text-zinc-100 dark:hover:bg-zinc-800" @click="onMenuClick('csv')">Baixar em CSV</button>
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
        </div>
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
      @custo-filial="onCustoFilial"
      @kpi-context="onKpiContext"
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
    <div ref="scrollRef" class="mt-3 grid grid-cols-1 gap-8 lg:grid-cols-12">
      <template v-for="view in gridChartViews" :key="view.card.id">
        <KpiChartCard
          stacked
          :class="chartSpan(view.card.id)"
          :card="view.card"
          :entries="view.entries"
          :pie-data="view.pieData"
          :pie-center="view.pieCenter"
          :turnover-summary="view.turnoverSummary"
          :bar-data="view.barData"
          :table-data="view.tableData"
          :show-values="showValues"
          :data-indicator-card="view.card.id"
          @turnover-detail="openTurnoverDetail"
          @bar-click="onKpiCardBarClick(view, $event)"
        />
        <!-- Mapa dos estados ao lado do Turnover: só filtro, sem valores. -->
        <UfMapCard
          v-if="view.card.id === 'turnover'"
          class="lg:col-span-3"
          :states="estadoFiltroMapa"
          title="Filtrar por estado"
          :show-values="false"
          @select="setState"
        />
      </template>
    </div>

    <!-- ===== PANORAMA ATUAL + CUSTOS TOTAIS ===== -->
    <div class="mt-8 grid gap-4 lg:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)_minmax(0,0.75fr)]">
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
        class="min-w-0 rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-900"
      >
        <div class="mb-4 flex items-start justify-between gap-2">
          <div class="min-w-0">
            <h2 class="text-sm font-bold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">Custo de folha de salário</h2>
            <span class="text-xs text-zinc-400 dark:text-zinc-400">Soma dos custos por filial no período filtrado</span>
          </div>
          <div class="flex shrink-0 items-center gap-2">
          <FaturamentoShareChip v-if="custosFaturamento" :data="custosFaturamento" />
          <FaturamentoButton compact />
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

      <!-- ===== CUSTO MÉDIO POR COLABORADOR (ao lado do Custo de folha de salário) ===== -->
      <div v-if="ticketChartView" ref="ticketChartRef" class="min-w-0">
        <KpiChartCard
          stacked
          class="h-full"
          :card="ticketChartView.card"
          :pie-data="ticketChartView.pieData"
          :pie-center="ticketChartView.pieCenter"
          :show-values="showValues"
          :data-indicator-card="ticketChartView.card.id"
        />
      </div>

      <!-- ===== ABSENTEÍSMO (ao lado do Custo médio por colaborador) ===== -->
      <div v-if="absenteismoChartView" class="min-w-0">
        <KpiChartCard
          stacked
          class="h-full"
          :card="absenteismoChartView.card"
          :entries="absenteismoChartView.entries"
          :bar-data="absenteismoChartView.barData"
          :show-values="showValues"
          :data-indicator-card="absenteismoChartView.card.id"
        />
      </div>
    </div>

    <!-- ===== TREINAMENTO — CARGA HORÁRIA POR FILIAL ===== -->
    <div class="mt-8 grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
    <section
      ref="treinamentoChartRef"
      class="min-w-0 rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-900"
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

    <!-- ===== REGIONAL TREINAMENTOS (ao lado direito do gráfico por filial) ===== -->
    <section ref="regionalChartRef" class="min-w-0 rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
      <div class="mb-4 flex items-start justify-between gap-2">
        <div class="min-w-0">
          <h2 class="text-sm font-bold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">Regional Treinamentos</h2>
          <span class="text-xs text-zinc-400 dark:text-zinc-400">Horas de treinamento por gerente regional no período filtrado</span>
        </div>
        <button
          v-if="regionalBarData.length"
          type="button"
          class="icon-btn-sm shrink-0"
          title="Tela cheia"
          aria-label="Ver gráfico Regional Treinamentos em tela cheia"
          @click="regionalBarChartRef?.openFullscreen()"
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
        v-if="regionalBarData.length"
        ref="regionalBarChartRef"
        :data="regionalBarData"
        :show-values="showValues"
        value-format="hours"
        :show-trend="false"
        :height-px="520"
        horizontal
        bars-clickable
        title="Regional Treinamentos"
        subtitle="Horas de treinamento por gerente regional no período filtrado"
        @bar-click="onRegionalBarClick"
      />
      <div v-else class="p-6">
        <EmptyState
          title="Sem treinamentos no período"
          text="Nenhum treinamento com gerente regional no período filtrado."
        />
      </div>
    </section>
    </div>

    <!-- ===== TEMPO MÉDIO DE CONTRATAÇÃO ===== -->
    <div class="mt-8 grid grid-cols-1 gap-4 lg:grid-cols-2">
    <section
      ref="hiringChartRef"
      class="min-w-0 rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-900"
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

    <!-- ===== TEMPO MÉDIO DE PERMANÊNCIA (ao lado direito do Tempo médio de contratação) ===== -->
    <section class="min-w-0 rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
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
          text="Lance um registro (botão direito no KPI de Tempo médio de permanência) ou ajuste o filtro."
        />
      </div>
    </section>
    </div>

    <!-- ===== RESCISÕES (por função; alterna entre líquido e total) ===== -->
    <div class="mt-8">
    <section
      ref="rescisoesChartRef"
      class="min-w-0 rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-900"
    >
      <div class="mb-4 grid grid-cols-1 items-center gap-2 sm:grid-cols-3">
        <div>
          <div class="flex flex-wrap items-center gap-3">
            <h2 class="text-sm font-bold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">Rescisões</h2>
            <RescisaoViewToggle v-model="rescisaoView" />
          </div>
          <span class="text-xs text-zinc-400 dark:text-zinc-400">{{ rescisoesSub }}</span>
        </div>
        <div class="flex flex-wrap items-center justify-start gap-2 sm:justify-center">
          <RescisaoModeToggle v-model="rescisaoMode" />
          <GerenteRegionalFilter
            v-model="rescisaoFilial"
            :options="rescisaoOptions.filiais"
            label="Filial"
            all-label="Todas as filiais"
            title="Filtrar Rescisões por filial"
          />
          <GerenteRegionalFilter
            v-model="rescisaoGerente"
            :options="rescisaoOptions.gerentes"
            label="Gerente imediato"
            all-label="Todos os gerentes imediatos"
            title="Filtrar Rescisões por gerente imediato"
          />
        </div>
        <div class="flex justify-start sm:justify-end">
          <button
            v-if="rescisaoView === 'funcao' && rescisoesBarData.length"
            type="button"
            class="icon-btn-sm"
            title="Tela cheia"
            aria-label="Ver gráfico de Rescisões em tela cheia"
            @click="rescisoesBarChartRef?.openFullscreen()"
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
      <PieChart
        v-if="rescisaoView === 'estado' && rescisoesHasData"
        :data="rescisoesPieData"
        :show-values="showValues"
        value-format="currency"
        height="h-[420px]"
        clickable
        @chart-click="onRescisaoPieClick"
        @chart-contextmenu="onRescisaoPieClick"
      />
      <BarChart
        v-else-if="rescisoesHasData"
        ref="rescisoesBarChartRef"
        :data="rescisoesBarData"
        :show-values="showValues"
        value-format="currency"
        :show-trend="false"
        :height-px="520"
        horizontal
        bars-clickable
        title="Rescisões"
        :subtitle="rescisoesSub"
        @bar-click="onRescisaoBarClick"
      />
      <div v-else class="p-6">
        <EmptyState
          title="Sem rescisões no período"
          text="Nenhuma rescisão na aba “rescisoes” para o período e estado filtrados."
        />
      </div>
    </section>
    </div>

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
    <FiliaisOutrasModal
      v-if="outrasFiliaisOpen"
      :open="outrasFiliaisOpen"
      :items="outrasFiliaisItems"
      @close="outrasFiliaisOpen = false"
      @select="onCustoFilial"
    />
    <VacanciesModal
      v-if="vacanciesOpen"
      :open="vacanciesOpen"
      :indicator-id="vacancyIndicatorId"
      :initial-filial="vacancyInitialFilial"
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
    <RescisaoFuncaoModal
      v-if="rescisaoFuncaoOpen"
      :open="rescisaoFuncaoOpen"
      :funcao="rescisaoFuncaoName"
      :por-estado="rescisaoPorEstado"
      :records="rescisaoFuncaoRows"
      @close="rescisaoFuncaoOpen = false"
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
    <TurnoverDetailModal
      v-if="turnoverDetailOpen"
      :open="turnoverDetailOpen"
      :kind="turnoverDetailKind"
      @close="turnoverDetailOpen = false"
    />
    <RegionalTreinamentosModal
      v-if="regionalModalOpen"
      :open="regionalModalOpen"
      :groups="regionalGroups"
      @close="regionalModalOpen = false"
    />
    <HeadcountEstadoModal
      v-if="headcountEstadoOpen"
      :open="headcountEstadoOpen"
      :estado="headcountEstadoSigla"
      :genero="headcountGenero"
      @close="headcountEstadoOpen = false"
    />
    <TrainingFilialModal
      v-if="treinamentoFilialOpen"
      :open="treinamentoFilialOpen"
      :filial="treinamentoFilialLabel"
      :title="treinamentoModalTitle"
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
