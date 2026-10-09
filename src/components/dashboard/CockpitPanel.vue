<script setup>
import { computed, ref, watch, nextTick, onMounted, onBeforeUnmount, onActivated } from "vue";
import BarChart from "@/components/charts/BarChart.vue";
import PieChart from "@/components/charts/PieChart.vue";
import Modal from "@/components/ui/Modal.vue";
import TrainingFilialModal from "@/components/dashboard/TrainingFilialModal.vue";
import HeadcountEstadoModal from "@/components/dashboard/HeadcountEstadoModal.vue";
import DiariaColaboradorModal from "@/components/dashboard/DiariaColaboradorModal.vue";
import FeriasColaboradorModal from "@/components/dashboard/FeriasColaboradorModal.vue";
import BeneficiosModal from "@/components/dashboard/BeneficiosModal.vue";
import AbsenteismoDetalheModal from "@/components/dashboard/AbsenteismoDetalheModal.vue";
import CustoRegionalModal from "@/components/dashboard/CustoRegionalModal.vue";
import CustoPessoalEmpresaModal from "@/components/dashboard/CustoPessoalEmpresaModal.vue";
import CompararMesesButton from "@/components/dashboard/CompararMesesButton.vue";
import VacancyDetailModal from "@/components/dashboard/VacancyDetailModal.vue";
import PermanenciaDetailModal from "@/components/dashboard/PermanenciaDetailModal.vue";
import PermanenciaListaModal from "@/components/dashboard/PermanenciaListaModal.vue";
import HiringStatusSelect from "@/components/dashboard/HiringStatusSelect.vue";
import RescisaoModeToggle from "@/components/dashboard/RescisaoModeToggle.vue";
import RescisaoViewToggle from "@/components/dashboard/RescisaoViewToggle.vue";
import ViewTabs from "@/components/dashboard/ViewTabs.vue";
import RescisaoFuncaoModal from "@/components/dashboard/RescisaoFuncaoModal.vue";
import GerenteRegionalFilter from "@/components/dashboard/GerenteRegionalFilter.vue";
import MultiSelectFilter from "@/components/dashboard/MultiSelectFilter.vue";
import HiringGoalsLegend from "@/components/dashboard/HiringGoalsLegend.vue";
import SummaryTiles from "@/components/dashboard/SummaryTiles.vue";
import RetentionPanel from "@/components/dashboard/RetentionPanel.vue";
import CockpitKpiButton from "@/components/dashboard/CockpitKpiButton.vue";
import UfMapCard from "@/components/dashboard/UfMapCard.vue";
import TurnoverSummaryCards from "@/components/dashboard/TurnoverSummaryCards.vue";
import FaturamentoShareChip from "@/components/dashboard/FaturamentoShareChip.vue";
import FaturamentoButton from "@/components/layout/FaturamentoButton.vue";
import TurnoverDetailModal from "@/components/dashboard/TurnoverDetailModal.vue";
import { useFilters } from "@/composables/useFilters";
import { formatValue, formatCurrency, formatHoursClock } from "@/lib/utils";

const props = defineProps({
  dashboard: { type: Object, required: true },
  showValues: { type: Boolean, default: false }
});

const emit = defineEmits(["edit-vacancy", "kpi-context", "custo-filial"]);

const kpis = computed(() => props.dashboard.kpis.value);
const selectedKpiId = computed(() => props.dashboard.selectedKpiId.value);

const hiringStatusFilter = ref("fechadas");

const treinamentoGerenteFilter = ref("");
const treinamentoGerenteOptions = computed(() => props.dashboard.treinamentoGerentesRegionais());
watch(treinamentoGerenteOptions, (opts) => {
  if (treinamentoGerenteFilter.value && !opts.includes(treinamentoGerenteFilter.value)) {
    treinamentoGerenteFilter.value = "";
  }
});

const treinamentoView = ref("filial");

const hiringRecrutadorFilter = ref("");
const hiringRecrutadorOptions = computed(() => props.dashboard.vagasRecrutadores());
watch(hiringRecrutadorOptions, (opts) => {
  if (hiringRecrutadorFilter.value && !opts.includes(hiringRecrutadorFilter.value)) {
    hiringRecrutadorFilter.value = "";
  }
});

const headcountEmpresaFilter = ref([]);
const headcountEmpresaOptions = computed(() => props.dashboard.headcountEmpresas());
watch(headcountEmpresaOptions, (opts) => {
  headcountEmpresaFilter.value = headcountEmpresaFilter.value.filter((v) => opts.includes(v));
});

const headcountFuncaoFilter = ref([]);
const headcountFuncaoOptions = computed(() => props.dashboard.headcountFuncoes());
watch(headcountFuncaoOptions, (opts) => {
  headcountFuncaoFilter.value = headcountFuncaoFilter.value.filter((v) => opts.includes(v));
});

const headcountFilialFilter = ref([]);
const headcountFilialOptions = computed(() => props.dashboard.headcountFiliais(headcountEmpresaFilter.value));
watch(headcountFilialOptions, (opts) => {
  headcountFilialFilter.value = headcountFilialFilter.value.filter((v) => opts.includes(v));
});

const absenteismoFilialFilter = ref([]);
const absenteismoFilialOptions = computed(() => props.dashboard.absenteismoFiliais());
watch(absenteismoFilialOptions, (opts) => {
  absenteismoFilialFilter.value = absenteismoFilialFilter.value.filter((v) => opts.includes(v));
});

const FERIAS_VIEWS = [
  { value: "colaborador", label: "Colaborador", title: "Total por colaborador" },
  { value: "filial", label: "Filial", title: "Total por filial" },
  { value: "regional", label: "Regional", title: "Total por regional" }
];
const feriasView = ref("colaborador");

const PERMANENCIA_VIEWS = [
  { value: "colaborador", label: "Colaborador", title: "Dias por colaborador" },
  { value: "filial", label: "Filial", title: "Média de dias por filial" },
  { value: "regional", label: "Regional", title: "Média de dias por regional" }
];
const permanenciaView = ref("colaborador");

const RETENCAO_VIEWS = [
  { value: "geral", label: "Geral", title: "Retenção geral" },
  { value: "regional", label: "Regional", title: "Retenção por regional" }
];
const retencaoView = ref("geral");

const ABSENTEISMO_VIEWS = [
  { value: "motivo", label: "Motivo", title: "Ocorrências por motivo" },
  { value: "regional", label: "Regional", title: "Ocorrências por regional" }
];
const absenteismoView = ref("motivo");

const TURNOVER_VIEWS = [
  { value: "geral", label: "Geral", title: "Entrada vs Saída geral" },
  { value: "regional", label: "Regional", title: "Entrada vs Saída por regional" }
];
const turnoverView = ref("geral");
const turnoverRegional = ref("");

const CUSTO_VIEWS = [
  { value: "consolidado", label: "Visão Geral", title: "Folha, Férias, Rescisões e Benefícios" },
  { value: "empresa", label: "Folha", title: "Folha por empresa" },
  { value: "regional", label: "Regional", title: "Total por regional" },
  { value: "beneficios", label: "Benefícios", title: "Total por benefício" }
];
const custoView = ref("consolidado");

const headcountView = ref("bar");
watch(headcountView, (view) => {
  if (view === "regional") headcountFilialFilter.value = [];
});

const rescisaoMode = ref("total");

const rescisaoView = ref("funcao");

const rescisaoFilial = ref("");
const rescisaoOptions = computed(() => props.dashboard.rescisoesFilterOptions());
const rescisaoFilters = computed(() => ({ filial: rescisaoFilial.value }));
watch(rescisaoOptions, (opts) => {
  if (rescisaoFilial.value && !opts.filiais.includes(rescisaoFilial.value)) rescisaoFilial.value = "";
});

const rescisaoFuncaoOpen = ref(false);
const rescisaoFuncaoName = ref("");
const rescisaoFuncaoRows = ref([]);
const rescisaoPorEstado = ref(false);

const DIARIA_VIEWS = [
  { value: "colaborador", label: "Colaborador", title: "Total por colaborador" },
  { value: "filial", label: "Filial", title: "Total por filial" },
  { value: "regional", label: "Regional", title: "Total por regional" }
];
const diariaView = ref("colaborador");

const CONTRATACAO_VIEWS = [
  { value: "tempo", label: "Tempo médio", title: "Tempo médio de contratação" },
  { value: "custo", label: "Custo médio", title: "Custo médio de contratação" }
];
const CONTRATACAO_CHARTS = ["tempo_contratacao", "custo_contratacao"];
const contratacaoView = ref("tempo");

function contratacaoKpiId(id) {
  return id === "tempo_contratacao" && contratacaoView.value === "custo" ? "custo_contratacao" : id;
}
const activeKpiId = computed(() => contratacaoKpiId(selectedKpiId.value));

const centerChart = computed(() =>
  props.dashboard.cockpitChartFor(
    selectedKpiId.value === "treinamento" && treinamentoView.value === "regional" ? "horas_regional" : activeKpiId.value,
    hiringStatusFilter.value,
    treinamentoGerenteFilter.value,
    hiringRecrutadorFilter.value,
    headcountFilialFilter.value,
    headcountEmpresaFilter.value,
    headcountView.value,
    rescisaoMode.value,
    rescisaoFilters.value,
    rescisaoView.value,
    headcountFuncaoFilter.value,
    absenteismoFilialFilter.value,
    diariaView.value,
    feriasView.value,
    custoView.value,
    permanenciaView.value,
    turnoverView.value,
    retencaoView.value,
    absenteismoView.value
  )
);

const treinamentoSummaryItems = computed(() => {
  if (centerChart.value.id !== "treinamento" || !treinamentoGerenteFilter.value) return [];
  const total = centerChart.value.data.reduce((sum, row) => sum + (Number(row.value) || 0), 0);
  return [{ label: "Total de horas", value: formatHoursClock(total), accent: true }];
});

const hiringSummaryItems = computed(() => {
  if (centerChart.value.id !== "tempo_contratacao") return [];
  const rows = props.dashboard.vacanciesBarByOpen("todas", hiringRecrutadorFilter.value);
  const abertas = rows.filter((r) => String(r.tooltipValue).includes("(em aberto)")).length;
  return [
    { label: hiringRecrutadorFilter.value ? "Vagas do recrutador" : "Total de vagas", value: String(rows.length), accent: true },
    { label: "Abertas", value: String(abertas) },
    { label: "Fechadas", value: String(rows.length - abertas) }
  ];
});

const diariaSummaryItems = computed(() => {
  const s = centerChart.value.id === "custo_diaria" ? centerChart.value.summary : null;
  if (!s) return [];
  return [
    { label: "Total", value: formatCurrency(s.total), accent: true },
    { label: "Colaboradores", value: String(s.colaboradores) },
    { label: "Média", value: s.media === null ? "—" : formatCurrency(s.media) }
  ];
});

const feriasSummaryItems = computed(() => {
  const s = centerChart.value.id === "ferias" ? centerChart.value.summary : null;
  if (!s) return [];
  return [
    { label: "Total", value: formatCurrency(s.total), accent: true },
    feriasView.value === "filial"
      ? { label: "Filiais", value: String(s.filiais) }
      : feriasView.value === "regional"
        ? { label: "Regionais", value: String(s.regionais) }
        : { label: "Colaboradores", value: String(s.colaboradores) }
  ];
});

const VIEW_REF_BY_CHART = {
  custo_diaria: diariaView,
  rescisoes: rescisaoView,
  tempo_permanencia: permanenciaView,
  retencao: retencaoView,
  ferias: feriasView,
  custo_total: custoView
};
const isRegionalView = computed(() => VIEW_REF_BY_CHART[centerChart.value.id || "custo_total"]?.value === "regional");

const singleCaption = computed(() => {
  const chart = centerChart.value;
  const nomeiaBarraUnica =
    isRegionalView.value || !chart.id || chart.id === "custo_total" || (chart.id === "tempo_permanencia" && permanenciaView.value === "filial");
  return nomeiaBarraUnica && chart.data.length === 1 ? String(chart.data[0].label) : "";
});

const headcountTriplo = computed(
  () => centerChart.value.id === "headcount" && headcountView.value === "bar" && centerChart.value.data.length === 1
);
const headcountTriploCharts = computed(() => {
  if (!headcountTriplo.value) return null;
  const row = centerChart.value.data[0];
  const [masculino, feminino] = row.series;
  return {
    barras: [
      { label: "Masculino", value: masculino.value, barColor: "#0284c7" },
      { label: "Feminino", value: feminino.value, barColor: "#db2777" },
      { label: "Total", value: row.value }
    ]
  };
});

const custoAvisoIncompleto = computed(() => {
  if (selectedKpiId.value !== "custo_total") return "";
  const faltantes = props.dashboard.custoFaltantes();
  if (!faltantes.length) return "";
  return `Custo de Pessoal incompleto no período: sem lançamentos de ${faltantes.join(", ")}.`;
});

const consolidadoSummaryItems = computed(() =>
  (centerChart.value.consolidado || []).map((i) => ({ label: i.label, value: formatCurrency(i.value) }))
);

const cardSummaryItems = computed(() => {
  const id = centerChart.value.id;
  if (centerChart.value.consolidado) return consolidadoSummaryItems.value;
  if (centerChart.value.tiles) return centerChart.value.tiles;
  if (id === "ferias") return feriasSummaryItems.value;
  if (id === "tempo_contratacao") return hiringSummaryItems.value;
  if (id === "custo_diaria") return diariaSummaryItems.value;
  return [];
});
const summaryInCard = computed(() => cardSummaryItems.value.length > 0);

const topKpis = computed(() => kpis.value.slice(0, 6));
const bottomKpis = computed(() => kpis.value.slice(6));

const { setState, state: filters } = useFilters();
const mapStates = computed(() => props.dashboard.kpiValueByEstado(activeKpiId.value));

const pieCenter = computed(() => {
  const chart = centerChart.value;
  if (chart.id === "turnover" && chart.summary) {
    return { value: formatValue({ type: "percent", decimals: 1 }, chart.summary.totalPct), caption: "Turnover" };
  }
  return chart.center || { value: "", caption: "" };
});

function select(id) {
  if (selectedKpiId.value === id) return;
  props.dashboard.selectKpi(id);
}

const indicatorListRef = ref(null);
const indicatorItems = new Map();

function setIndicatorItem(id, el) {
  if (el) indicatorItems.set(id, el);
  else indicatorItems.delete(id);
}

watch(selectedKpiId, async (id) => {
  await nextTick();
  const list = indicatorListRef.value;
  if (!list) return;
  const item = id ? indicatorItems.get(id) : null;
  const top = item ? item.offsetTop - (list.clientHeight - item.offsetHeight) / 2 : 0;
  list.scrollTo({ top: Math.max(0, top), behavior: "smooth" });
});

function indicatorValueText(kpi) {
  if (kpi.kind === "pie") return formatValue({ type: "percent", decimals: 1 }, kpi.totalPct);
  if (kpi.current === null || kpi.current === undefined) return "—";
  return formatValue({ type: kpi.type, decimals: kpi.decimals ?? 1 }, kpi.current);
}

const treinamentoFilialOpen = ref(false);
const treinamentoFilialLabel = ref("");
const treinamentoFilialRows = ref([]);
const treinamentoModalTitle = ref("");

const diariaColabOpen = ref(false);
const diariaColabName = ref("");
const diariaColabRows = ref([]);
const diariaColabGroup = ref("colaborador");

const beneficiosOpen = ref(false);
const beneficiosNome = ref("");
const beneficiosRows = ref([]);

const absenteismoDetalhe = ref({ open: false, title: "", subtitle: "", rows: [] });

function abrirAbsenteismoDetalhe(label) {
  if (!label) return;
  const view = absenteismoView.value;
  absenteismoDetalhe.value = {
    open: true,
    title: `Absenteísmo — ${label}`,
    subtitle: view === "regional" ? "Ocorrências da regional no período filtrado" : "Ocorrências do tipo no período filtrado",
    rows: props.dashboard.absenteismoRowsBy(view, label, absenteismoFilialFilter.value)
  };
}

function onPieContext(sliceIndex) {
  if (centerChart.value.id === "absenteismo") {
    const row = sliceIndex != null ? centerChart.value.data[sliceIndex] : null;
    if (row) fullscreenOpen.value = false;
    if (row) abrirAbsenteismoDetalhe(row.label);
    return;
  }
  onPieClick(sliceIndex);
}

const custoRegionalOpen = ref(false);
const custoRegionalNome = ref("");
const custoRegionalDados = ref({ folha: [], ferias: [], rescisoes: [] });

const custoPessoalOpen = ref(false);
const custoPessoalEmpresa = ref("");
const custoPessoalRows = ref([]);

const feriasColabOpen = ref(false);
const feriasColabName = ref("");
const feriasColabRows = ref([]);
const feriasColabGroup = ref("colaborador");

const headcountEstadoOpen = ref(false);
const headcountEstadoSigla = ref("");
const headcountGenero = ref("");
const headcountRegional = ref("");

function onCenterBarClick({ index, label, datasetIndex }) {
  if (centerChart.value.id === "absenteismo") {
    onCenterBarContext({ index });
    return;
  }
  if (centerChart.value.id === "turnover") {
    if (!label) return;
    turnoverRegional.value = label;
    openTurnoverDetail(datasetIndex === 1 ? "demissoes" : "admissoes");
    return;
  }
  if (centerChart.value.id === "headcount") {
    if (!label) return;
    headcountGenero.value = ["masculino", "feminino"][datasetIndex] || "";
    const porRegional = headcountView.value === "regional";
    headcountRegional.value = porRegional ? label : "";
    headcountEstadoSigla.value = porRegional ? filters.current : label;
    headcountEstadoOpen.value = true;
    return;
  }
  if (!centerChart.value.id || centerChart.value.id === "custo_total") {
    if (!label) return;
    if (custoView.value === "regional") {
      custoRegionalNome.value = label;
      custoRegionalDados.value = props.dashboard.custoRegionalDetalhe(label);
      custoRegionalOpen.value = true;
      return;
    }
    custoPessoalEmpresa.value = label;
    custoPessoalRows.value = props.dashboard.custoPessoalEntriesByEmpresa(label);
    custoPessoalOpen.value = true;
    return;
  }
  if (centerChart.value.id === "ferias") {
    if (!label) return;
    feriasColabName.value = label;
    feriasColabGroup.value = feriasView.value;
    feriasColabRows.value = props.dashboard.feriasEntriesBy(feriasView.value, label);
    feriasColabOpen.value = true;
    return;
  }
  if (centerChart.value.id === "custo_diaria") {
    if (!label) return;
    diariaColabName.value = label;
    diariaColabGroup.value = diariaView.value;
    diariaColabRows.value = props.dashboard.custoDiariaEntriesBy(diariaView.value, label);
    diariaColabOpen.value = true;
    return;
  }
  if (centerChart.value.id === "rescisoes") {
    if (!label) return;
    rescisaoFuncaoName.value = label;
    rescisaoFuncaoRows.value =
      rescisaoView.value === "regional"
        ? props.dashboard.rescisoesEntriesByRegional(label, rescisaoFilters.value)
        : props.dashboard.rescisoesEntriesByFuncao(label, rescisaoFilters.value);
    rescisaoPorEstado.value = false;
    rescisaoFuncaoOpen.value = true;
    return;
  }
  if (centerChart.value.id === "horas_regional") {
    if (!label) return;
    treinamentoModalTitle.value = `Regional Treinamentos — ${label}`;
    treinamentoFilialRows.value = props.dashboard.treinamentoRegionalEntries(label);
    treinamentoFilialOpen.value = true;
    return;
  }
  if (centerChart.value.id === "treinamento") {
    if (!label) return;
    treinamentoModalTitle.value = "";
    treinamentoFilialLabel.value = label;
    treinamentoFilialRows.value = props.dashboard.treinamentoFilialEntries(label, treinamentoGerenteFilter.value);
    treinamentoFilialOpen.value = true;
    return;
  }
  if (centerChart.value.id === "tempo_contratacao") {
    const row = centerChart.value.data[index];
    if (!row || !row.vacancyId) return;
    vacancyDetailId.value = row.vacancyId;
    vacancyDetailFallback.value = null;
    vacancyDetailOpen.value = true;
    return;
  }
  if (centerChart.value.id === "tempo_permanencia") {
    const row = centerChart.value.data[index];
    if (row && permanenciaView.value !== "colaborador") {
      permanenciaRegionalName.value = row.label;
      permanenciaRegionalRows.value = props.dashboard.permanenciaEntriesBy(permanenciaView.value, row.label);
      permanenciaRegionalOpen.value = true;
      return;
    }
    if (!row || !row.permanenciaDetail) return;
    permanenciaDetailRecord.value = row.permanenciaDetail;
    permanenciaDetailOpen.value = true;
    return;
  }
  emit("kpi-context", centerChart.value.id || "custo_total");
}

function onKpiContext(id) {
  emit("kpi-context", contratacaoKpiId(id));
}

function onCenterBarContext({ index }) {
  if (centerChart.value.id === "absenteismo") {
    const row = centerChart.value.data[index];
    if (row) {
      fullscreenOpen.value = false;
      abrirAbsenteismoDetalhe(row.label);
    }
    return;
  }
  if (centerChart.value.id === "tempo_contratacao") {
    const row = centerChart.value.data[index];
    if (!row || !row.vacancyId) return;
    emit("edit-vacancy", row.vacancyId);
    return;
  }
}

const vacancyDetailOpen = ref(false);
const vacancyDetailId = ref(null);
const vacancyDetailFallback = ref(null);

function onVacancyDetailEdit(vacancyId) {
  vacancyDetailOpen.value = false;
  emit("edit-vacancy", vacancyId);
}

const permanenciaRegionalOpen = ref(false);
const permanenciaRegionalName = ref("");
const permanenciaRegionalRows = ref([]);
const permanenciaDetailOpen = ref(false);
const permanenciaDetailRecord = ref(null);

const NO_TREND_CHARTS = ["treinamento", "tempo_contratacao", "tempo_permanencia", "custo_diaria", "ferias", "ticket_medio", "horas_regional", "rescisoes", "absenteismo", "retencao", "turnover"];
const showTrend = computed(
  () => !!selectedKpiId.value && !NO_TREND_CHARTS.includes(selectedKpiId.value) && !(selectedKpiId.value === "custo_total" && ["empresa", "regional"].includes(custoView.value))
);

const HORIZONTAL_CHARTS = ["treinamento", "tempo_contratacao", "tempo_permanencia", "custo_diaria", "ferias", "rescisoes"];
const VERTICAL_WHEN_REGIONAL = ["custo_diaria", "tempo_permanencia"];
const isHorizontalChart = computed(() => {
  const id = centerChart.value.id;
  if (id === "custo_total" && ["empresa", "regional"].includes(custoView.value)) return true;
  return HORIZONTAL_CHARTS.includes(id) && !(VERTICAL_WHEN_REGIONAL.includes(id) && isRegionalView.value);
});

const stackedOnPhone = computed(() => centerChart.value.kind === "pie" || centerChart.value.kind === "table");

function onPieClick(sliceIndex) {
  if (centerChart.value.id === "absenteismo") {
    onPieContext(sliceIndex);
    return;
  }
  if (centerChart.value.beneficiosView) {
    const row = sliceIndex != null ? centerChart.value.data[sliceIndex] : null;
    if (!row) return;
    fullscreenOpen.value = false;
    beneficiosNome.value = row.label;
    beneficiosRows.value = props.dashboard.beneficiosEntries(row.label);
    beneficiosOpen.value = true;
    return;
  }
  if (centerChart.value.consolidado) {
    const row = sliceIndex != null ? centerChart.value.data[sliceIndex] : null;
    if (!row) return;
    fullscreenOpen.value = false;
    if (row.label === "Benefícios") {
      beneficiosNome.value = "";
      beneficiosRows.value = props.dashboard.beneficiosEntries();
      beneficiosOpen.value = true;
      return;
    }
    const rows = props.dashboard.consolidadoEntries(row.label);
    if (row.label === "Folha") {
      custoPessoalEmpresa.value = "Todas as empresas";
      custoPessoalRows.value = rows;
      custoPessoalOpen.value = true;
    } else if (row.label === "Férias") {
      feriasColabName.value = "Todos os colaboradores";
      feriasColabGroup.value = "regional";
      feriasColabRows.value = rows;
      feriasColabOpen.value = true;
    } else {
      rescisaoFuncaoName.value = "Todas as funções";
      rescisaoFuncaoRows.value = rows;
      rescisaoPorEstado.value = false;
      rescisaoFuncaoOpen.value = true;
    }
    return;
  }
  if (centerChart.value.id === "headcount") {
    headcountGenero.value = ["masculino", "feminino"][sliceIndex] || "";
    headcountEstadoSigla.value = filters.current;
    headcountEstadoOpen.value = true;
    return;
  }
  if (centerChart.value.id === "custo_contratacao") {
    const row = sliceIndex != null ? centerChart.value.data[sliceIndex] : null;
    if (row && row.key) emit("custo-filial", row.key);
    return;
  }
  if (centerChart.value.id === "rescisoes") {
    const row = sliceIndex != null ? centerChart.value.data[sliceIndex] : null;
    if (!row) return;
    rescisaoFuncaoName.value = row.label;
    rescisaoFuncaoRows.value = props.dashboard.rescisoesEntriesByEstado(row.label, rescisaoFilters.value);
    rescisaoPorEstado.value = true;
    fullscreenOpen.value = false;
    rescisaoFuncaoOpen.value = true;
    return;
  }
  if (centerChart.value.id !== "turnover") return;
  openTurnoverDetail(sliceIndex === 1 ? "demissoes-empresas" : "admissoes-empresas");
}

const turnoverDetailOpen = ref(false);
const turnoverDetailKind = ref("admissoes");

function openTurnoverDetail(kind) {
  turnoverDetailKind.value = kind;
  fullscreenOpen.value = false;
  turnoverDetailOpen.value = true;
}

const middleRowRef = ref(null);
const bottomKpisRef = ref(null);
const cockpitHeight = ref(540);
const COCKPIT_MIN_H = 280;
const COCKPIT_GAP = 16;
const COCKPIT_BOTTOM_MARGIN = 16;

function fitToViewport() {
  const row = middleRowRef.value;
  if (!row) return;
  const top = row.getBoundingClientRect().top + window.scrollY;
  const bottom = bottomKpisRef.value?.offsetHeight || 0;
  const free = window.innerHeight - top - (bottom ? bottom + COCKPIT_GAP : 0) - COCKPIT_BOTTOM_MARGIN;
  cockpitHeight.value = Math.max(COCKPIT_MIN_H, Math.floor(free));
}

let fitObserver = null;
let fitRaf = 0;
function scheduleFit() {
  if (fitRaf) cancelAnimationFrame(fitRaf);
  fitRaf = requestAnimationFrame(() => {
    fitRaf = 0;
    fitToViewport();
  });
}

onMounted(() => {
  window.addEventListener("resize", scheduleFit);
  if (typeof ResizeObserver !== "undefined") {
    fitObserver = new ResizeObserver(scheduleFit);
    fitObserver.observe(document.body);
  }
  scheduleFit();
});
onActivated(scheduleFit);
onBeforeUnmount(() => {
  window.removeEventListener("resize", scheduleFit);
  fitObserver?.disconnect();
  if (fitRaf) cancelAnimationFrame(fitRaf);
});

const fullscreenOpen = ref(false);
const navIds = computed(() => [null, ...kpis.value.map((k) => k.id)]);

function navIndex() {
  const idx = navIds.value.indexOf(selectedKpiId.value ?? null);
  return idx === -1 ? 0 : idx;
}
function goPrevKpi() {
  const list = navIds.value;
  props.dashboard.selectKpi(list[(navIndex() - 1 + list.length) % list.length]);
}
function goNextKpi() {
  const list = navIds.value;
  props.dashboard.selectKpi(list[(navIndex() + 1) % list.length]);
}
</script>

<template>
  <div class="mt-2">
    <div data-tour="cockpit-main">
      <div class="flex flex-col gap-4">
          <div class="grid auto-cols-[82%] grid-flow-col grid-rows-3 gap-2 overflow-x-auto overscroll-x-contain pb-1 snap-x snap-mandatory [scrollbar-width:none] md:hidden [&::-webkit-scrollbar]:hidden" aria-label="Indicadores">
            <CockpitKpiButton
              v-for="kpi in kpis"
              :key="kpi.id"
              class="!w-full snap-start"
              :kpi="kpi"
              :selected="selectedKpiId === kpi.id"
              @select="select"
              @context="onKpiContext"
            />
          </div>

          <div class="hidden gap-2 md:grid md:grid-cols-3 lg:hidden" aria-label="Indicadores">
            <CockpitKpiButton
              v-for="kpi in kpis"
              :key="kpi.id"
              class="!w-full"
              :kpi="kpi"
              :selected="selectedKpiId === kpi.id"
              @select="select"
              @context="onKpiContext"
            />
          </div>

          <div class="hidden grid-cols-2 gap-2 lg:grid lg:[grid-template-columns:repeat(var(--n),minmax(0,1fr))]" :style="{ '--n': topKpis.length }">
            <CockpitKpiButton
              v-for="kpi in topKpis"
              :key="kpi.id"
              class="!w-full"
              compact
              :kpi="kpi"
              :selected="selectedKpiId === kpi.id"
              @select="select"
              @context="onKpiContext"
            />
          </div>

          <div
            ref="middleRowRef"
            class="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-[280px_minmax(0,1fr)_280px] xl:[grid-template-rows:var(--cockpit-h)]"
            :style="{ '--cockpit-h': `${cockpitHeight}px` }"
          >
          <section data-tour="cockpit-chart" class="order-first flex min-h-0 min-w-0 md:col-span-2 xl:order-none xl:col-span-1 xl:col-start-2 xl:row-start-1 lg:h-[540px] xl:h-full flex-col rounded-2xl border border-zinc-200 bg-white p-3 shadow-sm sm:p-5 dark:border-zinc-800 dark:bg-zinc-900">
            <div class="mb-4 flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
              <div class="min-w-0" :class="summaryInCard ? 'basis-full' : ['treinamento', 'rescisoes'].includes(centerChart.id) ? 'flex-1' : ''">
                <div class="flex flex-wrap items-center gap-2">
                  <h2 class="text-sm font-bold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">{{ centerChart.title }}</h2>
                  <ViewTabs v-if="CONTRATACAO_CHARTS.includes(centerChart.id)" v-model="contratacaoView" :options="CONTRATACAO_VIEWS" label="Visão da Contratação" />
                  <ViewTabs v-if="centerChart.id === 'custo_diaria'" v-model="diariaView" :options="DIARIA_VIEWS" label="Visão das diárias" />
                  <ViewTabs v-if="!centerChart.id || centerChart.id === 'custo_total'" v-model="custoView" :options="CUSTO_VIEWS" label="Visão do custo de pessoal" />
                  <ViewTabs v-if="centerChart.id === 'retencao'" v-model="retencaoView" :options="RETENCAO_VIEWS" label="Visão da retenção" />
                  <ViewTabs v-if="centerChart.id === 'absenteismo'" v-model="absenteismoView" :options="ABSENTEISMO_VIEWS" label="Visão do absenteísmo" />
                  <ViewTabs v-if="centerChart.id === 'turnover'" v-model="turnoverView" :options="TURNOVER_VIEWS" label="Visão do turnover" />
                  <ViewTabs v-if="centerChart.id === 'ferias'" v-model="feriasView" :options="FERIAS_VIEWS" label="Visão das férias" />
                  <ViewTabs v-if="centerChart.id === 'tempo_permanencia'" v-model="permanenciaView" :options="PERMANENCIA_VIEWS" label="Visão do tempo de permanência" />
                  <div v-if="centerChart.id === 'tempo_contratacao'" class="flex flex-wrap items-center gap-2 sm:ml-auto">
                    <HiringStatusSelect v-model="hiringStatusFilter" />
                    <GerenteRegionalFilter
                      v-model="hiringRecrutadorFilter"
                      :options="hiringRecrutadorOptions"
                      label="Recrutador"
                      all-label="Todos os recrutadores"
                      title="Filtrar Tempo médio de contratação por recrutador"
                    />
                  </div>
                  <div v-if="centerChart.id === 'headcount'" class="flex overflow-hidden rounded-lg border border-zinc-300 dark:border-zinc-700" role="group" aria-label="Tipo de gráfico"><button type="button" class="px-3 py-1.5 text-xs font-medium transition" :class="headcountView === 'bar' ? 'bg-accent/15 text-accent' : 'text-zinc-600 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-800'" @click="headcountView = 'bar'">Barras</button><button type="button" class="px-3 py-1.5 text-xs font-medium transition" :class="headcountView === 'pie' ? 'bg-accent/15 text-accent' : 'text-zinc-600 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-800'" @click="headcountView = 'pie'">Pizza</button><button type="button" class="px-3 py-1.5 text-xs font-medium transition" :class="headcountView === 'regional' ? 'bg-accent/15 text-accent' : 'text-zinc-600 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-800'" @click="headcountView = 'regional'">Regional</button></div>
                  <div v-if="centerChart.id === 'treinamento' || centerChart.id === 'horas_regional'" class="flex overflow-hidden rounded-lg border border-zinc-300 dark:border-zinc-700" role="group" aria-label="Visão do Treinamento"><button type="button" class="px-3 py-1.5 text-xs font-medium transition" :class="treinamentoView === 'filial' ? 'bg-accent/15 text-accent' : 'text-zinc-600 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-800'" @click="treinamentoView = 'filial'">Filial</button><button type="button" class="px-3 py-1.5 text-xs font-medium transition" :class="treinamentoView === 'regional' ? 'bg-accent/15 text-accent' : 'text-zinc-600 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-800'" @click="treinamentoView = 'regional'">Regional</button></div>
                  <RescisaoViewToggle v-if="centerChart.id === 'rescisoes'" v-model="rescisaoView" />
                  <RescisaoModeToggle v-if="centerChart.id === 'rescisoes'" v-model="rescisaoMode" />
                  <div v-if="centerChart.id === 'rescisoes'" class="flex flex-wrap items-center gap-2 sm:ml-auto">
                    <GerenteRegionalFilter
                      v-model="rescisaoFilial"
                      :options="rescisaoOptions.filiais"
                      label="Filial"
                      all-label="Todas as filiais"
                      title="Filtrar Rescisões por filial"
                    />
                  </div>
                  <div v-if="centerChart.id === 'treinamento'" class="flex flex-wrap items-center gap-2 sm:ml-auto">
                    <SummaryTiles v-if="treinamentoSummaryItems.length" :items="treinamentoSummaryItems" compact />
                    <GerenteRegionalFilter
                      v-model="treinamentoGerenteFilter"
                      :options="treinamentoGerenteOptions"
                    />
                  </div>
                </div>
                <span class="text-xs text-zinc-400 dark:text-zinc-400">{{ centerChart.sub }}</span>
              </div>
              <div
                class="flex min-w-0 flex-wrap items-center justify-start gap-2 sm:ml-auto sm:justify-end"
                :class="summaryInCard ? 'sm:relative sm:w-full sm:!justify-center' : ''"
              >
                <MultiSelectFilter
                  v-if="centerChart.id === 'absenteismo'"
                  v-model="absenteismoFilialFilter"
                  :options="absenteismoFilialOptions"
                  label="Filial"
                  all-label="Todas as filiais"
                  plural-label="filiais"
                  title="Filtrar Absenteísmo por uma ou mais filiais"
                />
                <MultiSelectFilter
                  v-if="centerChart.id === 'headcount' && headcountView !== 'regional'"
                  v-model="headcountFilialFilter"
                  :options="headcountFilialOptions"
                  label="Filial"
                  all-label="Todas as filiais"
                  plural-label="filiais"
                  title="Filtrar Headcount por uma ou mais filiais"
                />
                <MultiSelectFilter
                  v-if="centerChart.id === 'headcount'"
                  v-model="headcountEmpresaFilter"
                  :options="headcountEmpresaOptions"
                  label="Empresa"
                  all-label="Todas as empresas"
                  plural-label="empresas"
                  title="Filtrar Headcount por uma ou mais empresas"
                />
                <MultiSelectFilter
                  v-if="centerChart.id === 'headcount'"
                  v-model="headcountFuncaoFilter"
                  :options="headcountFuncaoOptions"
                  label="Função"
                  all-label="Todas as funções"
                  plural-label="funções"
                  title="Filtrar Headcount por uma ou mais funções"
                />
                <SummaryTiles v-if="summaryInCard" :items="cardSummaryItems" compact />
                <FaturamentoShareChip v-if="centerChart.faturamentoEnabled && centerChart.faturamento" :data="centerChart.faturamento" />
                <FaturamentoButton v-if="centerChart.faturamentoEnabled" />
                <button
                  type="button"
                  class="icon-btn-sm"
                  :class="summaryInCard ? 'sm:absolute sm:right-0 sm:top-1/2 sm:-translate-y-1/2' : ''"
                  title="Tela cheia"
                  aria-label="Ver gráfico em tela cheia"
                  @click="fullscreenOpen = true"
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
            <div class="relative lg:h-auto lg:min-h-0 lg:flex-1" :class="stackedOnPhone ? '' : 'h-[360px] sm:h-[480px]'">
            <div class="h-full lg:absolute lg:inset-0">
            <BarChart
              v-if="headcountTriploCharts"
              :data="headcountTriploCharts.barras"
              show-values
              :show-trend="false"
              fluid
            />
            <div
              v-else-if="centerChart.kind === 'pie'"
              class="grid gap-4 lg:h-full lg:grid-rows-1"
              :class="centerChart.summary ? 'lg:grid-cols-[minmax(0,1fr)_180px]' : 'lg:grid-cols-1'"
            >
              <PieChart
                :key="centerChart.id"
                class="min-h-0 min-w-0 lg:row-start-1"
                :class="centerChart.summary ? 'lg:col-start-1' : ''"
                :data="centerChart.data"
                :show-values="showValues"
                height="h-[280px] md:h-[400px] lg:h-full"
                :center-value="pieCenter.value"
                :center-caption="pieCenter.caption"
                :value-format="centerChart.valueFormat || 'percent'"
                :clickable="centerChart.id === 'absenteismo' || !!centerChart.consolidado || !!centerChart.beneficiosView || ['turnover', 'custo_contratacao', 'headcount', 'rescisoes'].includes(centerChart.id)"
                @chart-click="onPieClick"
                @chart-contextmenu="onPieContext"
              />
              <TurnoverSummaryCards v-if="centerChart.summary" class="lg:col-start-2 lg:row-start-1" vertical-from="lg" compact show-cost :show-geral="false" :summary="centerChart.summary" @select="openTurnoverDetail" />
            </div>
            <RetentionPanel v-else-if="centerChart.kind === 'table'" :data="centerChart.data" />
            <BarChart
              v-else-if="centerChart.id === 'tempo_contratacao'"
              :data="centerChart.data"
              :show-values="showValues"
              :show-trend="showTrend"
              :value-format="centerChart.valueFormat"
              :variant="centerChart.variant || 'bar'"
              :horizontal="isHorizontalChart"
              align-top
              fluid
              bars-clickable
              @bar-click="onCenterBarClick"
              @bar-contextmenu="onCenterBarContext"
            />
            <BarChart
              v-else
              :data="centerChart.data"
              :show-values="showValues"
              :show-trend="showTrend"
              :animate-trend="!centerChart.id || centerChart.id === 'custo_total'"
              :value-format="centerChart.valueFormat"
              :variant="centerChart.variant || 'bar'"
              :horizontal="isHorizontalChart"
              :single-caption="singleCaption"
              fluid
              bars-clickable
              @bar-click="onCenterBarClick"
              @bar-contextmenu="onCenterBarContext"
            />
            </div>
            </div>
            <p
              v-if="custoAvisoIncompleto"
              role="alert"
              class="mt-3 flex items-center gap-2 rounded-lg border border-amber-300 bg-amber-50 px-3 py-1.5 text-xs font-medium text-amber-800 dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-300"
            >
              <span aria-hidden="true">⚠</span>{{ custoAvisoIncompleto }}
            </p>
            <HiringGoalsLegend
              v-if="centerChart.id === 'tempo_contratacao'"
              size="md"
              class="mt-3 border-t border-zinc-100 pt-3 dark:border-zinc-800"
            />
          </section>

      <UfMapCard
        data-tour="cockpit-map"
        class="xl:col-start-1 xl:row-start-1"
        fluid
        title="Mapa por estado"
        :subtitle="centerChart.id === 'custo_diaria' ? `${centerChart.title} — valor total` : centerChart.title"
        :states="mapStates"
        @select="setState"
      />

      <aside data-tour="cockpit-indicators" class="flex flex-col xl:col-start-3 xl:row-start-1 rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-900 xl:min-h-0">
        <h2 class="mb-2 text-center text-sm font-bold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">Indicadores</h2>
        <div class="mb-2">
          <CompararMesesButton :dashboard="dashboard" compact />
        </div>
        <div class="xl:relative xl:min-h-0 xl:flex-1">
        <ul
          ref="indicatorListRef"
          class="relative flex max-h-48 flex-col gap-1 overflow-y-auto px-1.5 [scrollbar-width:thin] md:max-h-none md:overflow-visible xl:absolute xl:inset-0 xl:max-h-none xl:overflow-y-auto"
        >
          <li
            v-for="kpi in kpis"
            :key="kpi.id"
            :ref="(el) => setIndicatorItem(kpi.id, el)"
            class="no-callout relative flex cursor-pointer items-center justify-between gap-3 rounded-lg px-2 py-1.5 text-sm transition duration-150 hover:z-10 hover:scale-[1.04] hover:shadow-md motion-reduce:hover:scale-100"
            :class="
              selectedKpiId === kpi.id
                ? 'bg-accent/15 font-semibold text-accent-hover ring-1 ring-accent/50 dark:text-accent-light'
                : 'text-zinc-600 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-800'
            "
            :title="kpi.desc"
            @click="select(kpi.id)"
            @contextmenu.prevent="onKpiContext(kpi.id)"
          >
            <span class="truncate">{{ kpi.name }}</span>
            <span class="shrink-0 font-semibold text-zinc-900 dark:text-zinc-100">{{ indicatorValueText(kpi) }}</span>
          </li>
        </ul>
        </div>
      </aside>
          </div>

          <div ref="bottomKpisRef" class="hidden grid-cols-2 gap-2 lg:grid lg:[grid-template-columns:repeat(var(--n),minmax(0,1fr))]" :style="{ '--n': bottomKpis.length }">
            <CockpitKpiButton
              v-for="kpi in bottomKpis"
              :key="kpi.id"
              class="!w-full"
              compact
              :kpi="kpi"
              :selected="selectedKpiId === kpi.id"
              @select="select"
              @context="onKpiContext"
            />
          </div>
      </div>
    </div>

    <BeneficiosModal
      v-if="beneficiosOpen"
      :open="beneficiosOpen"
      :beneficio="beneficiosNome"
      :entries="beneficiosRows"
      @close="beneficiosOpen = false"
    />

    <AbsenteismoDetalheModal
      v-if="absenteismoDetalhe.open"
      :open="absenteismoDetalhe.open"
      :title="absenteismoDetalhe.title"
      :subtitle="absenteismoDetalhe.subtitle"
      :rows="absenteismoDetalhe.rows"
      @close="absenteismoDetalhe.open = false"
    />

    <CustoRegionalModal
      v-if="custoRegionalOpen"
      :open="custoRegionalOpen"
      :regional="custoRegionalNome"
      :folha="custoRegionalDados.folha"
      :ferias="custoRegionalDados.ferias"
      :rescisoes="custoRegionalDados.rescisoes"
      @close="custoRegionalOpen = false"
    />

    <CustoPessoalEmpresaModal
      v-if="custoPessoalOpen"
      :open="custoPessoalOpen"
      :empresa="custoPessoalEmpresa"
      :entries="custoPessoalRows"
      @close="custoPessoalOpen = false"
    />

    <FeriasColaboradorModal
      v-if="feriasColabOpen"
      :open="feriasColabOpen"
      :colaborador="feriasColabName"
      :group-by="feriasColabGroup"
      :entries="feriasColabRows"
      @close="feriasColabOpen = false"
    />

    <DiariaColaboradorModal
      v-if="diariaColabOpen"
      :open="diariaColabOpen"
      :colaborador="diariaColabName"
      :group-by="diariaColabGroup"
      :entries="diariaColabRows"
      @close="diariaColabOpen = false"
    />

    <RescisaoFuncaoModal
      v-if="rescisaoFuncaoOpen"
      :open="rescisaoFuncaoOpen"
      :funcao="rescisaoFuncaoName"
      :por-estado="rescisaoPorEstado"
      :records="rescisaoFuncaoRows"
      @close="rescisaoFuncaoOpen = false"
    />

    <TurnoverDetailModal
      v-if="turnoverDetailOpen"
      :open="turnoverDetailOpen"
      :kind="turnoverDetailKind"
      :regional="turnoverView === 'regional' ? turnoverRegional : ''"
      @close="turnoverDetailOpen = false"
    />

    <HeadcountEstadoModal
      v-if="headcountEstadoOpen"
      :open="headcountEstadoOpen"
      :estado="headcountEstadoSigla"
      :genero="headcountGenero"
      :regional="headcountRegional"
      :filial="headcountFilialFilter"
      :empresa="headcountEmpresaFilter"
      :funcao="headcountFuncaoFilter"
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

    <VacancyDetailModal
      v-if="vacancyDetailOpen"
      :open="vacancyDetailOpen"
      :vacancy-id="vacancyDetailId"
      :fallback="vacancyDetailFallback"
      @close="vacancyDetailOpen = false"
      @edit="onVacancyDetailEdit"
    />

    <PermanenciaListaModal
      v-if="permanenciaRegionalOpen"
      :open="permanenciaRegionalOpen"
      :records="permanenciaRegionalRows"
      :regional="permanenciaRegionalName"
      @close="permanenciaRegionalOpen = false"
    />
    <PermanenciaDetailModal
      v-if="permanenciaDetailOpen"
      :open="permanenciaDetailOpen"
      :record="permanenciaDetailRecord"
      @close="permanenciaDetailOpen = false"
    />

    <Modal
      v-if="fullscreenOpen"
      fullscreen
      :title="centerChart.title"
      :subtitle="centerChart.sub"
      @close="fullscreenOpen = false"
    >
      <template v-if="centerChart.id === 'tempo_contratacao'" #actions>
        <div class="flex flex-wrap items-center justify-end gap-2">
          <HiringStatusSelect v-model="hiringStatusFilter" />
          <GerenteRegionalFilter
            v-model="hiringRecrutadorFilter"
            :options="hiringRecrutadorOptions"
            label="Recrutador"
            all-label="Todos os recrutadores"
            title="Filtrar Tempo médio de contratação por recrutador"
          />
        </div>
      </template>
      <div class="flex h-full flex-col gap-4">
        <div class="flex flex-wrap items-center justify-center gap-3">
          <button
            type="button"
            class="fs-nav-btn"
            aria-label="KPI anterior"
            title="KPI anterior"
            @click="goPrevKpi"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              <polyline points="15 18 9 12 15 6" />
            </svg>
          </button>
          <template v-if="centerChart.id === 'tempo_contratacao'">
            <SummaryTiles v-if="hiringSummaryItems.length" :items="hiringSummaryItems" compact />
          </template>
          <SummaryTiles v-else-if="treinamentoSummaryItems.length" :items="treinamentoSummaryItems" compact />
          <SummaryTiles v-else-if="diariaSummaryItems.length" :items="diariaSummaryItems" compact />
          <SummaryTiles v-else-if="centerChart.consolidado" :items="consolidadoSummaryItems" compact />
          <SummaryTiles v-else-if="centerChart.tiles" :items="centerChart.tiles" compact />
          <div v-else class="flex min-w-[10rem] items-center justify-center gap-2">
            <span class="text-center text-sm font-semibold text-zinc-600 dark:text-zinc-300">{{ centerChart.title }}</span>
            <div v-if="centerChart.id === 'headcount'" class="flex overflow-hidden rounded-lg border border-zinc-300 dark:border-zinc-700" role="group" aria-label="Tipo de gráfico"><button type="button" class="px-3 py-1.5 text-xs font-medium transition" :class="headcountView === 'bar' ? 'bg-accent/15 text-accent' : 'text-zinc-600 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-800'" @click="headcountView = 'bar'">Barras</button><button type="button" class="px-3 py-1.5 text-xs font-medium transition" :class="headcountView === 'pie' ? 'bg-accent/15 text-accent' : 'text-zinc-600 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-800'" @click="headcountView = 'pie'">Pizza</button><button type="button" class="px-3 py-1.5 text-xs font-medium transition" :class="headcountView === 'regional' ? 'bg-accent/15 text-accent' : 'text-zinc-600 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-800'" @click="headcountView = 'regional'">Regional</button></div>
            <div v-if="centerChart.id === 'treinamento' || centerChart.id === 'horas_regional'" class="flex overflow-hidden rounded-lg border border-zinc-300 dark:border-zinc-700" role="group" aria-label="Visão do Treinamento"><button type="button" class="px-3 py-1.5 text-xs font-medium transition" :class="treinamentoView === 'filial' ? 'bg-accent/15 text-accent' : 'text-zinc-600 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-800'" @click="treinamentoView = 'filial'">Filial</button><button type="button" class="px-3 py-1.5 text-xs font-medium transition" :class="treinamentoView === 'regional' ? 'bg-accent/15 text-accent' : 'text-zinc-600 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-800'" @click="treinamentoView = 'regional'">Regional</button></div>
            <RescisaoViewToggle v-if="centerChart.id === 'rescisoes'" v-model="rescisaoView" />
          </div>
          <ViewTabs v-if="CONTRATACAO_CHARTS.includes(centerChart.id)" v-model="contratacaoView" :options="CONTRATACAO_VIEWS" label="Visão da Contratação" />
          <ViewTabs v-if="centerChart.id === 'custo_diaria'" v-model="diariaView" :options="DIARIA_VIEWS" label="Visão das diárias" />
          <ViewTabs v-if="!centerChart.id || centerChart.id === 'custo_total'" v-model="custoView" :options="CUSTO_VIEWS" label="Visão do custo de pessoal" />
          <ViewTabs v-if="centerChart.id === 'retencao'" v-model="retencaoView" :options="RETENCAO_VIEWS" label="Visão da retenção" />
                  <ViewTabs v-if="centerChart.id === 'absenteismo'" v-model="absenteismoView" :options="ABSENTEISMO_VIEWS" label="Visão do absenteísmo" />
          <ViewTabs v-if="centerChart.id === 'turnover'" v-model="turnoverView" :options="TURNOVER_VIEWS" label="Visão do turnover" />
          <ViewTabs v-if="centerChart.id === 'ferias'" v-model="feriasView" :options="FERIAS_VIEWS" label="Visão das férias" />
          <ViewTabs v-if="centerChart.id === 'tempo_permanencia'" v-model="permanenciaView" :options="PERMANENCIA_VIEWS" label="Visão do tempo de permanência" />
          <RescisaoModeToggle v-if="centerChart.id === 'rescisoes'" v-model="rescisaoMode" />
          <GerenteRegionalFilter
            v-if="centerChart.id === 'rescisoes'"
            v-model="rescisaoFilial"
            :options="rescisaoOptions.filiais"
            label="Filial"
            all-label="Todas as filiais"
            title="Filtrar Rescisões por filial"
          />
          <MultiSelectFilter
            v-if="centerChart.id === 'absenteismo'"
            v-model="absenteismoFilialFilter"
            :options="absenteismoFilialOptions"
            label="Filial"
            all-label="Todas as filiais"
            plural-label="filiais"
            title="Filtrar Absenteísmo por uma ou mais filiais"
          />
          <MultiSelectFilter
            v-if="centerChart.id === 'headcount' && headcountView !== 'regional'"
            v-model="headcountFilialFilter"
            :options="headcountFilialOptions"
            label="Filial"
            all-label="Todas as filiais"
            plural-label="filiais"
            title="Filtrar Headcount por uma ou mais filiais"
          />
          <MultiSelectFilter
            v-if="centerChart.id === 'headcount'"
            v-model="headcountEmpresaFilter"
            :options="headcountEmpresaOptions"
            label="Empresa"
            all-label="Todas as empresas"
            plural-label="empresas"
            title="Filtrar Headcount por uma ou mais empresas"
          />
          <MultiSelectFilter
            v-if="centerChart.id === 'headcount'"
            v-model="headcountFuncaoFilter"
            :options="headcountFuncaoOptions"
            label="Função"
            all-label="Todas as funções"
            plural-label="funções"
            title="Filtrar Headcount por uma ou mais funções"
          />
          <GerenteRegionalFilter
            v-if="centerChart.id === 'treinamento'"
            v-model="treinamentoGerenteFilter"
            :options="treinamentoGerenteOptions"
          />
          <FaturamentoShareChip v-if="centerChart.faturamentoEnabled && centerChart.faturamento" :data="centerChart.faturamento" />
          <button
            type="button"
            class="fs-nav-btn"
            aria-label="Próximo KPI"
            title="Próximo KPI"
            @click="goNextKpi"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              <polyline points="9 18 15 12 9 6" />
            </svg>
          </button>
        </div>
        <div class="min-h-0 flex-1">
          <div
            v-if="centerChart.kind === 'pie'"
            class="grid gap-4 md:h-full md:grid-rows-1"
            :class="centerChart.summary ? 'md:grid-cols-[180px_minmax(0,1fr)_180px]' : 'md:grid-cols-1'"
          >
            <PieChart
              :key="centerChart.id"
              class="min-h-0 min-w-0 md:row-start-1"
              :class="centerChart.summary ? 'md:col-start-2' : ''"
              :data="centerChart.data"
              :show-values="showValues"
              height="h-[280px] md:h-full"
              :center-value="pieCenter.value"
              :center-caption="pieCenter.caption"
              :value-format="centerChart.valueFormat || 'percent'"
              :clickable="centerChart.id === 'absenteismo' || !!centerChart.consolidado || !!centerChart.beneficiosView || ['turnover', 'custo_contratacao', 'headcount', 'rescisoes'].includes(centerChart.id)"
              @chart-click="onPieClick"
              @chart-contextmenu="onPieContext"
            />
            <TurnoverSummaryCards v-if="centerChart.summary" class="md:col-start-3 md:row-start-1" show-cost :show-geral="false" :summary="centerChart.summary" @select="openTurnoverDetail" />
          </div>
          <RetentionPanel v-else-if="centerChart.kind === 'table'" :data="centerChart.data" large />
          <BarChart
            v-else
            :data="centerChart.data"
            :show-values="showValues"
            :show-trend="showTrend"
            :value-format="centerChart.valueFormat"
            :variant="centerChart.variant || 'bar'"
            :horizontal="isHorizontalChart"
            :align-top="centerChart.id === 'tempo_contratacao'"
            :single-caption="singleCaption"
            fluid
            bars-clickable
            @bar-click="onCenterBarClick"
            @bar-contextmenu="onCenterBarContext"
          />
        </div>
        <HiringGoalsLegend
          v-if="centerChart.id === 'tempo_contratacao'"
          size="md"
          class="border-t border-zinc-100 pt-3 dark:border-zinc-800"
        />
      </div>
    </Modal>
  </div>
</template>

<style scoped>
.icon-btn-sm {
  display: flex;
  height: 1.9rem;
  width: 1.9rem;
  align-items: center;
  justify-content: center;
  border-radius: 0.5rem;
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
.fs-nav-btn {
  display: flex;
  height: 2.25rem;
  width: 2.25rem;
  flex-shrink: 0;
  align-items: center;
  justify-content: center;
  border-radius: 9999px;
  border: 1px solid rgb(212 212 216);
  color: rgb(63 63 70);
  transition: background-color 0.15s, border-color 0.15s;
}
.fs-nav-btn:hover {
  background-color: rgb(244 244 245);
  border-color: rgb(180 180 186);
}
:global(.dark) .fs-nav-btn {
  border-color: rgb(63 63 70);
  color: rgb(228 228 231);
}
:global(.dark) .fs-nav-btn:hover {
  background-color: rgb(39 39 42);
}
</style>
