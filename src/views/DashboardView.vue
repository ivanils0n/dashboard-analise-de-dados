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
import TurnoverAnaliseModal from "@/components/dashboard/TurnoverAnaliseModal.vue";
import IndicatorEntriesModal from "@/components/dashboard/IndicatorEntriesModal.vue";
import VacanciesModal from "@/components/dashboard/VacanciesModal.vue";
import FiliaisOutrasModal from "@/components/dashboard/FiliaisOutrasModal.vue";
import VacancyDetailModal from "@/components/dashboard/VacancyDetailModal.vue";
import PermanenciaDetailModal from "@/components/dashboard/PermanenciaDetailModal.vue";
import PermanenciaListaModal from "@/components/dashboard/PermanenciaListaModal.vue";
import CompararMesesButton from "@/components/dashboard/CompararMesesButton.vue";
import CustoPessoalEmpresaModal from "@/components/dashboard/CustoPessoalEmpresaModal.vue";
import TrainingFilialModal from "@/components/dashboard/TrainingFilialModal.vue";
import HeadcountEstadoModal from "@/components/dashboard/HeadcountEstadoModal.vue";
import AbsenteismoAnaliseModal from "@/components/dashboard/AbsenteismoAnaliseModal.vue";
import HeadcountAnaliseModal from "@/components/dashboard/HeadcountAnaliseModal.vue";
import DashboardTour from "@/components/dashboard/DashboardTour.vue";
import LaunchModal from "@/components/dashboard/LaunchModal.vue";
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
import { safeSetItem, localStore, normalizeText, ymLabel } from "@/lib/utils";
import { toXLSX, toCSV } from "@/lib/export";
import { hydrateState, reloadData, warmApi } from "@/lib/db";
import { syncAll } from "@/lib/employees";
import { apiFetch } from "@/lib/api";

const { dateFilter: df } = useDateFilter();
const { state: filters, setState } = useFilters();
const { show: toast, hide: hideToast } = useToast();
const { confirm } = useDialog();

const dashboard = useDashboardData(dateFilter);

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

const launchOpen = ref(false);
const preEditSelectedKpiId = ref(null);
const editTarget = ref(null);
const editVacancyTarget = ref(null);
const diariaEntriesOpen = ref(false);
const treinamentoEntriesOpen = ref(false);
const custosEntriesOpen = ref(false);
const absenteismoAnaliseOpen = ref(false);
const vacanciesOpen = ref(false);
const vacancyIndicatorId = ref("tempo_contratacao");
const vacancyInitialFilial = ref(null);

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

const treinamentoFilialOpen = ref(false);
const treinamentoFilialLabel = ref("");
const treinamentoFilialRows = ref([]);
const treinamentoModalTitle = ref("");

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

const turnoverDetailOpen = ref(false);
const turnoverDetailKind = ref("admissoes");

function openTurnoverDetail(kind) {
  turnoverDetailKind.value = kind;
  turnoverDetailOpen.value = true;
}

const turnoverAnaliseOpen = ref(false);

const tourOpen = ref(false);

const headcountAnaliseOpen = ref(false);

function onHeadcountAnaliseColaboradores({ genero, estado }) {
  headcountGenero.value = genero || "";
  headcountEstadoSigla.value = estado || filters.current;
  headcountEstadoOpen.value = true;
}

const headcountEstadoOpen = ref(false);
const headcountEstadoSigla = ref("");
const headcountGenero = ref("");

function onHeadcountBarClick({ label, datasetIndex }) {
  if (!label) return;
  headcountGenero.value = ["masculino", "feminino"][datasetIndex] || "";
  headcountEstadoSigla.value = label;
  headcountEstadoOpen.value = true;
}

const diariaColabOpen = ref(false);
const diariaColabName = ref("");
const diariaColabRows = ref([]);

function onDiariaBarClick({ label }) {
  if (!label) return;
  diariaColabName.value = label;
  diariaColabRows.value = dashboard.custoDiariaEntriesByColaborador(label);
  diariaColabOpen.value = true;
}

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

function onHiringBarContext({ index }) {
  const row = hiringBarData.value[index];
  if (!row || !row.vacancyId) return;
  onVacancyEdit(row.vacancyId);
}

function onVacancyDetailEdit(vacancyId) {
  vacancyDetailOpen.value = false;
  onVacancyEdit(vacancyId);
}

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

const custoPessoalOpen = ref(false);
const custoPessoalEmpresa = ref("");
const custoPessoalRows = ref([]);

function onCustoPessoalBarClick({ label }) {
  if (!label) return;
  custoPessoalEmpresa.value = label;
  custoPessoalRows.value = dashboard.custoPessoalEntriesByEmpresa(label);
  custoPessoalOpen.value = true;
}

const permanenciaListaOpen = ref(false);
const permanenciaListaRows = ref([]);
const permanenciaListaPeriodo = ref("");
const permanenciaDetailOpen = ref(false);
const permanenciaDetailRecord = ref(null);

function onPermanenciaBarClick({ index }) {
  const row = permanenciaBarData.value[index];
  if (!row || !row.permanenciaDetail) return;
  permanenciaDetailRecord.value = row.permanenciaDetail;
  permanenciaDetailOpen.value = true;
}

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

const regionalModalOpen = ref(false);
const regionalGroups = ref([]);
const hiringBarChartRef = ref(null);
const permanenciaBarChartRef = ref(null);

const diariaColumns = [
  { label: "Mês", monthYear: true },
  { label: "Colaborador", meta: "employeeName" },
  { label: "Filial", meta: "filial" },
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
  { label: "Carga horária", value: true },
  { label: "Modalidade", meta: "modalidade" }
];

const custosColumns = [
  { label: "Mês", month: true },
  { label: "Código", meta: "codigo" },
  { label: "Nome", meta: "employeeName" },
  { label: "Banco", meta: "banco" },
  { label: "Empresa", meta: "empresa" },
  { label: "Filial", meta: "filial" },
  { label: "Estado", meta: "estado" },
  { label: "Data de pagamento", meta: "dataPagto" },
  { label: "Valor total", value: true }
];

const scrollRef = ref(null);

const CHART_ORDER = ["headcount", "turnover", "absenteismo", "custo_contratacao", "retencao"];
function chartSpan(id) {
  if (id === "turnover") return "lg:col-span-5";
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
const canRefreshCache = isAdmin();

const visibleKpis = computed(() => {
  const q = normalizeText(kpiSearch.value).trim();
  if (!q) return kpis.value;
  return kpis.value.filter((k) => normalizeText(`${k.name} ${k.desc || ""}`).includes(q));
});

const custosBarData = computed(() => dashboard.custosBarByEmpresa());

const treinamentoBarData = computed(() => dashboard.treinamentoBarByFilial());

const regionalBarData = computed(() => dashboard.cockpitChartFor("horas_regional").data);

const hiringBarData = computed(() => dashboard.vacanciesBarByOpen(hiringStatusFilter.value));
const permanenciaBarData = computed(() => dashboard.turnoverTenureBarByEmployee());

const rescisaoMode = ref("total");
const rescisaoFilial = ref("");
const rescisaoGerente = ref("");
const rescisaoOptions = computed(() => dashboard.rescisoesFilterOptions());
const rescisaoFilters = computed(() => ({ filial: rescisaoFilial.value, gerente: rescisaoGerente.value }));
watch(rescisaoOptions, (opts) => {
  if (rescisaoFilial.value && !opts.filiais.includes(rescisaoFilial.value)) rescisaoFilial.value = "";
  if (rescisaoGerente.value && !opts.gerentes.includes(rescisaoGerente.value)) rescisaoGerente.value = "";
});
const rescisaoView = ref("funcao");
const rescisoesBarData = computed(() =>
  rescisaoView.value === "regional"
    ? dashboard.rescisoesBarByRegional(rescisaoMode.value, rescisaoFilters.value)
    : dashboard.rescisoesBarByFuncao(rescisaoMode.value, rescisaoFilters.value)
);
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
  const by = rescisaoView.value === "estado" ? "estado" : rescisaoView.value === "regional" ? "regional" : "função";
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
  rescisaoFuncaoRows.value =
    rescisaoView.value === "regional"
      ? dashboard.rescisoesEntriesByRegional(label, rescisaoFilters.value)
      : dashboard.rescisoesEntriesByFuncao(label, rescisaoFilters.value);
  rescisaoPorEstado.value = false;
  rescisaoFuncaoOpen.value = true;
}
const rescisoesChartRef = ref(null);
const rescisoesBarChartRef = ref(null);

function lineEntries(card) {
  if (card.kind !== "line") return [];
  const ind = getIndicatorById(card.id);
  if (ind && ind.id === "custo_diaria") return dashboard.diariaDailySeries();
  return filteredEntries(ind);
}

function chartBarData(card) {
  if (card.kind !== "bar") return [];
  if (card.id === "headcount") return dashboard.headcountBarByState();
    if (card.id === "custo_diaria") return dashboard.custoDiariaBarByColaborador();
  if (card.id === "absenteismo") return dashboard.absenteismoBarByMotivo();
  return [];
}

function chartTableData(card) {
  if (card.kind !== "table") return null;
  if (card.id === "retencao") return dashboard.retentionBreakdown();
  return null;
}

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
    turnoverSummary: card.id === "turnover" ? dashboard.cockpitChartFor("turnover").summary : null,
    barData: chartBarData(card),
    tableData: chartTableData(card)
  }))
);

const generoChartView = computed(() => {
  const chart = dashboard.cockpitChartFor("headcount", undefined, undefined, undefined, [], [], "pie");
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
const absenteismoChartView = computed(() => {
  const view = kpiChartViews.value.find((v) => v.card.id === "absenteismo");
  if (!view) return null;
  const chart = dashboard.cockpitChartFor("absenteismo");
  return {
    ...view,
    card: { ...view.card, kind: "pie", title: chart.title, sub: chart.sub, valueFormat: "count" },
    entries: [],
    barData: [],
    pieData: chart.data,
    pieCenter: chart.center
  };
});
const ticketChartView = computed(() => kpiChartViews.value.find((v) => v.card.id === "ticket_medio") || null);
const ticketChartRef = ref(null);
const absenteismoChartRef = ref(null);

const custosFaturamento = computed(() => dashboard.ticketMedioFaturamento());

const estadoFiltroMapa = computed(() => {
  void filters.revision;
  const ufs = !filters.current || filters.current === "todos" ? STATES : [filters.current];
  return ufs.map((uf) => ({ uf, text: "", sub: "", filled: true }));
});

const reloading = ref(false);
async function handleReload() {
  if (reloading.value) return;
  reloading.value = true;
  const loadingToast = toast("Atualizando dados, aguarde...", "loading");
  try {
    await apiFetch("/api/cache/refresh", { method: "POST", timeoutMs: 0 });
    await reloadData();
    syncAll();
    hideToast(loadingToast);
    toast("Dados recarregados.");
  } catch (err) {
    console.error("[DashboardView] Falha ao recarregar os dados:", err);
    hideToast(loadingToast);
    toast("Não foi possível recarregar os dados.");
  } finally {
    reloading.value = false;
  }
}

function closeLaunch() {
  launchOpen.value = false;
  preEditSelectedKpiId.value = null;
  editTarget.value = null;
  editVacancyTarget.value = null;
}

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

function onEntriesEdit({ indicatorId, entry }) {
  if (!canEdit) {
    toast("Seu perfil tem acesso somente leitura.");
    return;
  }
  preEditSelectedKpiId.value = dashboard.selectedKpiId.value;
  diariaEntriesOpen.value = false;
  treinamentoEntriesOpen.value = false;
  custosEntriesOpen.value = false;
  editTarget.value = { indicatorId, entry };
  editVacancyTarget.value = null;
  launchOpen.value = true;
}

function onSaved() {
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
    if (id === "absenteismo") {
      absenteismoChartRef.value?.scrollIntoView({ behavior: "smooth", block: "center" });
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

function onKpiContext(id) {
  if (id === "headcount") {
    headcountAnaliseOpen.value = true;
  } else if (id === "custo_diaria") diariaEntriesOpen.value = true;
  else if (id === "horas_regional") {
    regionalGroups.value = dashboard.treinamentoRegionalGroups();
    regionalModalOpen.value = true;
  } else if (id === "treinamento") treinamentoEntriesOpen.value = true;
  else if (id === "custo_total") custosEntriesOpen.value = true;
  else if (id === "absenteismo") {
    absenteismoAnaliseOpen.value = true;
  } else if (id === "turnover") {
    turnoverAnaliseOpen.value = true;
  } else if (id === "tempo_permanencia") {
    permanenciaListaRows.value = dashboard.permanenciaDesligadosLista();
    const ini = dateFilter.start ? ymLabel(String(dateFilter.start).slice(0, 7)) : "";
    const fim = dateFilter.end ? ymLabel(String(dateFilter.end).slice(0, 7)) : "";
    permanenciaListaPeriodo.value = ini && fim && ini !== fim ? `${ini} a ${fim}` : ini;
    permanenciaListaOpen.value = true;
  } else if (id === "tempo_contratacao") {
    vacancyIndicatorId.value = "tempo_contratacao";
    vacancyInitialFilial.value = null;
    vacanciesOpen.value = true;
  } else if (id === "custo_contratacao") {
    vacancyIndicatorId.value = "custo_contratacao";
    vacancyInitialFilial.value = null;
    vacanciesOpen.value = true;
  }
}

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
});

onActivated(() => {
  warmApi();
  hydrateState(filters.current).catch(() => {});
  sidebarHidden.value = activeTab.value === "cockpit";
});
onDeactivated(() => {
  sidebarHidden.value = false;
});

watch(activeTab, (tab) => {
  sidebarHidden.value = tab === "cockpit";
});
</script>

<template>
  <div>
    <div class="mb-4 flex flex-wrap items-center justify-between gap-3 sm:mb-6 sm:gap-4">
      <div class="flex items-center gap-3">
        <h1 class="text-xl font-bold text-zinc-900 sm:text-2xl dark:text-zinc-100">Gente &amp; Gestão</h1>
        <button
          v-if="canRefreshCache"
          type="button"
          data-tour="refresh"
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

      <div
        v-if="activeTab === 'cockpit'"
        id="cockpit-kpi-slot"
        class="flex min-w-0 flex-1 items-center justify-center empty:hidden max-sm:basis-full"
      ></div>

      <div class="flex w-full flex-wrap items-center justify-start gap-2 sm:ml-auto sm:w-auto sm:justify-end">
        <button
          type="button"
          data-tour="tour-button"
          class="flex h-9 w-9 items-center justify-center rounded-full border border-zinc-300 text-zinc-700 transition hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-800"
          aria-label="Tour pela dashboard"
          title="Tour pela dashboard"
          @click="tourOpen = true"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <circle cx="12" cy="12" r="10" />
            <line x1="12" y1="16" x2="12" y2="12" />
            <line x1="12" y1="8" x2="12.01" y2="8" />
          </svg>
        </button>
        <button
          v-if="activeTab === 'cockpit'"
          type="button"
          data-tour="hide-values"
          class="whitespace-nowrap rounded-lg border border-zinc-300 px-3 py-1.5 text-sm font-medium text-zinc-700 transition hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-800"
          @click="toggleShowValues"
        >
          {{ showValues ? "Ocultar valores" : "Mostrar valores" }}
        </button>
        <DateRangeFilter data-tour="period" :range="df" title="Período" />
        <StateFilter data-tour="state" variant="page" />

        <div v-if="canEdit" data-tour="menu" class="relative ml-auto sm:ml-0" @click.stop>
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
          <button type="button" class="dropdown-item text-zinc-700 hover:bg-zinc-100 dark:text-zinc-100 dark:hover:bg-zinc-800" @click="onMenuClick('xlsx')">Baixar em XLSX</button>
          <button type="button" class="dropdown-item text-zinc-700 hover:bg-zinc-100 dark:text-zinc-100 dark:hover:bg-zinc-800" @click="onMenuClick('csv')">Baixar em CSV</button>
        </div>
        </div>
      </div>
    </div>

    <transition :name="tabDirection === 1 ? 'slide-left' : 'slide-right'" mode="out-in">
    <CockpitPanel
      v-if="activeTab === 'cockpit'"
      key="cockpit"
      :dashboard="dashboard"
      :show-values="showValues"
      @edit-vacancy="onVacancyEdit"
      @custo-filial="onCustoFilial"
      @kpi-context="onKpiContext"
    />

    <div v-else key="visao-geral">

    <div class="mb-3 flex flex-wrap items-center gap-2">
      <h2 class="text-sm font-bold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">Indicadores</h2>
      <CompararMesesButton :dashboard="dashboard" />
      <input
        v-model="kpiSearch"
        type="search"
        class="input-sm ml-auto w-full sm:w-64"
        placeholder="Buscar indicador..."
        aria-label="Buscar indicador"
      />
    </div>
    <section data-tour="overview-kpis" class="flex snap-x gap-3 overflow-x-auto px-7 pb-9 pt-8 sm:gap-4" aria-label="Indicadores-chave">
      <KpiCard
        v-for="(kpi, kpiIndex) in visibleKpis"
        :key="kpi.id"
        :kpi="kpi"
        :index="kpiIndex"
        :selected="selectedKpiId === kpi.id"
        :show-values="showValues"
        @select="onSelectKpi"
        @context="onKpiContext"
      />
      <p
        v-if="!visibleKpis.length"
        class="self-center px-4 text-sm text-zinc-500 dark:text-zinc-400"
      >
        Nenhum indicador encontrado para “{{ kpiSearch }}”.
      </p>
    </section>

    <div class="mt-8 flex justify-end">
      <button type="button" data-tour="hide-values" class="rounded-lg border border-zinc-300 px-3 py-1.5 text-sm font-medium text-zinc-700 transition hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-800" @click="toggleShowValues">
        {{ showValues ? "Ocultar valores" : "Mostrar valores" }}
      </button>
    </div>
    <div ref="scrollRef" data-tour="overview-charts" class="mt-3 grid grid-cols-1 gap-8 lg:grid-cols-12">
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

    <div class="mt-8 grid gap-4 lg:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)_minmax(0,0.75fr)]">

      <section
        ref="custosChartRef"
        class="min-w-0 rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-900"
      >
        <div class="mb-4 flex items-start justify-between gap-2">
          <div class="min-w-0">
            <h2 class="text-sm font-bold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">Custo de Pessoal</h2>
            <span class="text-xs text-zinc-400 dark:text-zinc-400">Valor total por empresa, no período filtrado</span>
          </div>
          <div class="flex shrink-0 items-center gap-2">
          <FaturamentoShareChip v-if="custosFaturamento" :data="custosFaturamento" />
          <FaturamentoButton compact />
          <button
            v-if="custosBarData.length"
            type="button"
            class="icon-btn-sm"
            title="Tela cheia"
            aria-label="Ver gráfico de Custo de Pessoal em tela cheia"
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
          bars-clickable
          title="Custo de Pessoal — Evolução dos Indicadores"
          subtitle="Valor total por empresa, no período filtrado"
          @bar-click="onCustoPessoalBarClick"
        />
        <div v-else class="p-6">
          <EmptyState
            title="Sem custos no período"
            text="Nenhum Custo de Pessoal lançado para o período e o estado filtrados."
          />
        </div>
      </section>

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

      <div v-if="absenteismoChartView" ref="absenteismoChartRef" class="min-w-0">
        <KpiChartCard
          stacked
          class="h-full"
          :card="absenteismoChartView.card"
          :pie-data="absenteismoChartView.pieData"
          :pie-center="absenteismoChartView.pieCenter"
          :show-values="showValues"
          :data-indicator-card="absenteismoChartView.card.id"
        />
      </div>
    </div>

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
          text="Nenhum treinamento lançado para o período e o estado filtrados."
        />
      </div>
    </section>

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
          text="Nenhuma vaga aberta no período e no estado filtrados."
        />
      </div>
      <HiringGoalsLegend size="md" class="mt-3 border-t border-zinc-100 pt-3 dark:border-zinc-800" />
    </section>

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
      />
      <div v-else class="p-6">
        <EmptyState
          title="Sem colaboradores desligados no período"
          text="Nenhum colaborador do Headcount tem data de desligamento no mês filtrado. Ajuste o filtro."
        />
      </div>
    </section>
    </div>

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
            v-if="rescisaoView !== 'estado' && rescisoesBarData.length"
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
    <CustoPessoalEmpresaModal
      v-if="custoPessoalOpen"
      :open="custoPessoalOpen"
      :empresa="custoPessoalEmpresa"
      :entries="custoPessoalRows"
      @close="custoPessoalOpen = false"
    />
    <PermanenciaListaModal
      v-if="permanenciaListaOpen"
      :open="permanenciaListaOpen"
      :records="permanenciaListaRows"
      :periodo="permanenciaListaPeriodo"
      @close="permanenciaListaOpen = false"
    />
    <PermanenciaDetailModal
      v-if="permanenciaDetailOpen"
      :open="permanenciaDetailOpen"
      :record="permanenciaDetailRecord"
      @close="permanenciaDetailOpen = false"
    />
    <TurnoverDetailModal
      v-if="turnoverDetailOpen"
      :open="turnoverDetailOpen"
      :kind="turnoverDetailKind"
      @close="turnoverDetailOpen = false"
    />
    <TurnoverAnaliseModal
      v-if="turnoverAnaliseOpen"
      :open="turnoverAnaliseOpen"
      @close="turnoverAnaliseOpen = false"
    />
    <RegionalTreinamentosModal
      v-if="regionalModalOpen"
      :open="regionalModalOpen"
      :groups="regionalGroups"
      @close="regionalModalOpen = false"
    />
    <DashboardTour :open="tourOpen" :tab="activeTab === 'cockpit' ? 'cockpit' : 'overview'" @close="tourOpen = false" />
    <HeadcountAnaliseModal
      v-if="headcountAnaliseOpen"
      :open="headcountAnaliseOpen"
      @close="headcountAnaliseOpen = false"
      @colaboradores="onHeadcountAnaliseColaboradores"
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
      title="Custo de Pessoal — Registros"
      :columns="custosColumns"
      readonly
      @close="custosEntriesOpen = false"
      @edit="onEntriesEdit"
    />
    <AbsenteismoAnaliseModal
      v-if="absenteismoAnaliseOpen"
      :open="absenteismoAnaliseOpen"
      :estado="filters.current"
      @close="absenteismoAnaliseOpen = false"
    />


  </div>
</template>

<style scoped>
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
