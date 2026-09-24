<script setup>
import { computed, ref, watch, nextTick } from "vue";
import BarChart from "@/components/charts/BarChart.vue";
import PieChart from "@/components/charts/PieChart.vue";
import Modal from "@/components/ui/Modal.vue";
import TrainingFilialModal from "@/components/dashboard/TrainingFilialModal.vue";
import HeadcountEstadoModal from "@/components/dashboard/HeadcountEstadoModal.vue";
import DiariaColaboradorModal from "@/components/dashboard/DiariaColaboradorModal.vue";
import VacancyDetailModal from "@/components/dashboard/VacancyDetailModal.vue";
import PermanenciaDetailModal from "@/components/dashboard/PermanenciaDetailModal.vue";
import HiringStatusPills from "@/components/dashboard/HiringStatusPills.vue";
import GerenteRegionalFilter from "@/components/dashboard/GerenteRegionalFilter.vue";
import HiringGoalsLegend from "@/components/dashboard/HiringGoalsLegend.vue";
import SummaryTiles from "@/components/dashboard/SummaryTiles.vue";
import CockpitKpiButton from "@/components/dashboard/CockpitKpiButton.vue";
import UfMapCard from "@/components/dashboard/UfMapCard.vue";
import TurnoverSummaryCards from "@/components/dashboard/TurnoverSummaryCards.vue";
import FaturamentoShareChip from "@/components/dashboard/FaturamentoShareChip.vue";
import FaturamentoButton from "@/components/layout/FaturamentoButton.vue";
import TurnoverDetailModal from "@/components/dashboard/TurnoverDetailModal.vue";
import { useFilters } from "@/composables/useFilters";
import { formatValue, formatCurrency, formatHoursClock } from "@/lib/utils";

/* `dashboard` é o objeto retornado por useDashboardData (refs/computed +
   funções) — repassado inteiro para reaproveitar exatamente os mesmos dados
   da aba "Visão geral" sem duplicar cálculo. O Painel segue o filtro de
   período/estado global (definido na Visão geral), sem filtro próprio. */
const props = defineProps({
  dashboard: { type: Object, required: true },
  showValues: { type: Boolean, default: false }
});

const emit = defineEmits(["edit-vacancy", "edit-permanencia", "kpi-context", "custo-filial"]);

const kpis = computed(() => props.dashboard.kpis.value);
const selectedKpiId = computed(() => props.dashboard.selectedKpiId.value);

/* Filtro de status (abertas/fechadas) do gráfico de Tempo médio de
   contratação, quando ele é o gráfico central. */
const hiringStatusFilter = ref("fechadas");

/* Filtro por Gerente regional do gráfico de Treinamento, quando ele é o
   gráfico central — "" (vazio) = todos os gerentes. */
const treinamentoGerenteFilter = ref("");
const treinamentoGerenteOptions = computed(() => props.dashboard.treinamentoGerentesRegionais());
/* Se o gerente selecionado deixar de aparecer nas opções (filtros do
   dashboard mudaram), volta para "Todos". */
watch(treinamentoGerenteOptions, (opts) => {
  if (treinamentoGerenteFilter.value && !opts.includes(treinamentoGerenteFilter.value)) {
    treinamentoGerenteFilter.value = "";
  }
});

/* Filtro por Recrutador do gráfico de Tempo médio de contratação, quando ele
   é o gráfico central — "" (vazio) = todos os recrutadores. */
const hiringRecrutadorFilter = ref("");
const hiringRecrutadorOptions = computed(() => props.dashboard.vagasRecrutadores());
watch(hiringRecrutadorOptions, (opts) => {
  if (hiringRecrutadorFilter.value && !opts.includes(hiringRecrutadorFilter.value)) {
    hiringRecrutadorFilter.value = "";
  }
});

/* Filtro por Filial do gráfico de Headcount — "" = todas as filiais. */
const headcountFilialFilter = ref("");
const headcountFilialOptions = computed(() => props.dashboard.headcountFiliais());
watch(headcountFilialOptions, (opts) => {
  if (headcountFilialFilter.value && !opts.includes(headcountFilialFilter.value)) {
    headcountFilialFilter.value = "";
  }
});

/* Headcount: "bar" (barras por estado) ou "pie" (pizza Masculino x Feminino). */
const headcountView = ref("bar");

/* Painel central: Custo de folha de salário (padrão) quando nada está
   selecionado — Panorama atual foi desativado —, ou o gráfico do KPI clicado
   (linha mensal, barras por filial/estado ou pizza de turnover — ver
   cockpitChartFor em useDashboardData.js). */
const centerChart = computed(() =>
  props.dashboard.cockpitChartFor(
    selectedKpiId.value,
    hiringStatusFilter.value,
    treinamentoGerenteFilter.value,
    hiringRecrutadorFilter.value,
    headcountFilialFilter.value,
    headcountView.value
  )
);

/* Soma das horas do gráfico de Treinamento, exibida como KPI só quando um
   gerente regional está filtrado (com "Todos" o total já é óbvio pela soma
   visual das barras, e a faixa central fica livre para o filtro de status/
   diária de outros KPIs). */
const treinamentoSummaryItems = computed(() => {
  if (centerChart.value.id !== "treinamento" || !treinamentoGerenteFilter.value) return [];
  const total = centerChart.value.data.reduce((sum, row) => sum + (Number(row.value) || 0), 0);
  return [{ label: "Total de horas", value: formatHoursClock(total), accent: true }];
});

/* Tempo médio de contratação: com um recrutador filtrado, mostra as vagas dele
   no período (total, abertas e fechadas — independente do filtro de status). */
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

/* Custo médio da diária: Total, Colaboradores e Média do período filtrado,
   exibidos acima das barras (ver custoDiariaSummary em useDashboardData.js). */
const diariaSummaryItems = computed(() => {
  const s = centerChart.value.id === "custo_diaria" ? centerChart.value.summary : null;
  if (!s) return [];
  return [
    { label: "Total", value: formatCurrency(s.total), accent: true },
    { label: "Colaboradores", value: String(s.colaboradores) },
    { label: "Média", value: s.media === null ? "—" : formatCurrency(s.media) }
  ];
});

/* Divide os KPIs em duas faixas (esquerda e abaixo) para que fiquem ao
   redor do gráfico central, com o painel Indicadores fixo à direita. */
const BOTTOM_ONLY_KPIS = ["ticket_medio"];
const splitKpis = computed(() => kpis.value.filter((k) => !BOTTOM_ONLY_KPIS.includes(k.id)));
const leftKpis = computed(() => splitKpis.value.filter((_, i) => i % 2 === 0));
/* Custo médio por colaborador fica sempre por último, na faixa abaixo do gráfico. */
const bottomKpis = computed(() => [
  ...splitKpis.value.filter((_, i) => i % 2 === 1),
  ...kpis.value.filter((k) => BOTTOM_ONLY_KPIS.includes(k.id))
]);

/* Mapa abaixo dos Indicadores: mostra o KPI selecionado (ou o padrão, Custo de
   folha de salário) em cada estado — RO, AM e PA com o filtro em "todos", só o
   estado escolhido nos demais casos. Clicar num estado filtra por ele; clicar
   de novo volta para "todos". */
const { setState, state: filters } = useFilters();
const mapStates = computed(() => props.dashboard.kpiValueByEstado(selectedKpiId.value));

/* Taxa total de Turnover no centro da pizza (Painel e tela cheia). */
const pieCenter = computed(() => {
  const chart = centerChart.value;
  if (chart.id === "turnover" && chart.summary) {
    return { value: formatValue({ type: "percent", decimals: 1 }, chart.summary.totalPct), caption: "Turnover" };
  }
  return chart.center || { value: "", caption: "" };
});

function select(id) {
  props.dashboard.selectKpi(selectedKpiId.value === id ? null : id);
}

/* Ao selecionar um KPI (por qualquer caminho: botões, lista ou navegação da
   tela cheia), a lista Indicadores rola até ele e o destaca. Rola só a própria
   lista (não a página). */
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

/* Card "table" da Retenção: cada valor cai em "—" quando ainda não há dado
   suficiente (ex.: sem headcount inicial cadastrado). */
function retencaoNum(v) {
  return v === null || v === undefined ? "—" : v;
}
function retencaoPctText(data) {
  const v = data && data.retencaoPct;
  return v === null || v === undefined ? "—" : `${v.toFixed(1)}%`;
}

/* Turnover (pizza): mostra a taxa total em %. */
function indicatorValueText(kpi) {
  if (kpi.kind === "pie") return formatValue({ type: "percent", decimals: 1 }, kpi.totalPct);
  if (kpi.current === null || kpi.current === undefined) return "—";
  return formatValue({ type: kpi.type, decimals: kpi.decimals ?? 1 }, kpi.current);
}

/* Clique numa barra do gráfico de Treinamento (por filial): abre o modal
   com os colaboradores, horas e total daquela filial — mesmo modal usado
   na Visão geral. */
const treinamentoFilialOpen = ref(false);
const treinamentoFilialLabel = ref("");
const treinamentoFilialRows = ref([]);

/* Clique numa barra do gráfico de Custo médio da diária: abre o detalhe do
   colaborador (dados e diárias do período). */
const diariaColabOpen = ref(false);
const diariaColabName = ref("");
const diariaColabRows = ref([]);

/* Clique numa barra do gráfico de Headcount (uma por estado): abre o modal
   com os colaboradores do estado da barra no mês filtrado. */
const headcountEstadoOpen = ref(false);
const headcountEstadoSigla = ref("");
const headcountGenero = ref("");

function onCenterBarClick({ index, label, datasetIndex }) {
  if (centerChart.value.id === "headcount") {
    if (!label) return;
    /* Séries do gráfico: 0 = Masculino, 1 = Feminino, 2 = Total (geral). */
    headcountGenero.value = ["masculino", "feminino"][datasetIndex] || "";
    headcountEstadoSigla.value = label;
    headcountEstadoOpen.value = true;
    return;
  }
  if (centerChart.value.id === "custo_diaria") {
    if (!label) return;
    diariaColabName.value = label;
    diariaColabRows.value = props.dashboard.custoDiariaEntriesByColaborador(label);
    diariaColabOpen.value = true;
    return;
  }
  if (centerChart.value.id === "treinamento") {
    if (!label) return;
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
    if (!row || !row.permanenciaId) return;
    permanenciaDetailId.value = row.permanenciaId;
    permanenciaDetailOpen.value = true;
    return;
  }
  /* Demais gráficos de barra (ex.: Absenteísmo, Custo de folha de salário)
     não têm modal próprio no Painel: reaproveita o mesmo modal de
     informações do botão direito no KPI (hospedado na Visão geral).
     Sem KPI selecionado o gráfico central é o de Custo de folha (id null). */
  emit("kpi-context", centerChart.value.id || "custo_total");
}

/* Botão direito no KPI (faixas ao redor do gráfico ou lista de
   Indicadores): mesmo modal de informações da Visão geral. */
function onKpiContext(id) {
  emit("kpi-context", id);
}

/* Botão direito na barra de Tempo médio de contratação ou de permanência:
   edita direto, sem passar pelo modal de detalhe. */
function onCenterBarContext({ index }) {
  if (centerChart.value.id === "tempo_contratacao") {
    const row = centerChart.value.data[index];
    if (!row || !row.vacancyId) return;
    emit("edit-vacancy", row.vacancyId);
    return;
  }
  if (centerChart.value.id === "tempo_permanencia") {
    const row = centerChart.value.data[index];
    if (!row || !row.permanenciaId) return;
    emit("edit-permanencia", row.permanenciaId);
  }
}

/* Clique numa barra do gráfico de Tempo médio de contratação: abre o
   detalhe da vaga; "Editar" ali repassa para a Visão geral (que hospeda o
   formulário de lançamento). */
const vacancyDetailOpen = ref(false);
const vacancyDetailId = ref(null);
const vacancyDetailFallback = ref(null);

function onVacancyDetailEdit(vacancyId) {
  vacancyDetailOpen.value = false;
  emit("edit-vacancy", vacancyId);
}

/* Mesma ideia para o gráfico de Tempo médio de permanência. */
const permanenciaDetailOpen = ref(false);
const permanenciaDetailId = ref(null);

function onPermanenciaDetailEdit(recordId) {
  permanenciaDetailOpen.value = false;
  emit("edit-permanencia", recordId);
}

/* Linha de tendência (MM2): fica de fora dos gráficos de barras deitadas
   (Treinamento, Tempo médio de contratação, Tempo médio de permanência e
   Custo médio da diária). */
const NO_TREND_CHARTS = ["treinamento", "tempo_contratacao", "tempo_permanencia", "custo_diaria", "ticket_medio"];
const showTrend = computed(() => !!selectedKpiId.value && !NO_TREND_CHARTS.includes(selectedKpiId.value));

/* Gráficos de barras deitadas (uma linha por filial/vaga/colaborador, com
   rolagem). */
const HORIZONTAL_CHARTS = ["treinamento", "tempo_contratacao", "tempo_permanencia", "custo_diaria"];
const isHorizontalChart = computed(() => HORIZONTAL_CHARTS.includes(centerChart.value.id));

/* Clique na pizza do Turnover: mesmo modal de Admissões/Demissões dos cards
   ao lado (openTurnoverDetail, abaixo) — a fatia clicada decide qual
   (0 = Entrada/Admissões, 1 = Saída/Demissões, ver chartPieData em
   useDashboardData.js); fora de uma fatia (ex.: buraco central), cai em
   Admissões. Mesmo comportamento da pizza na Visão geral (ver
   onTurnoverChartInfo em KpiChartCard.vue). */
function onPieClick(sliceIndex) {
  if (centerChart.value.id === "headcount") {
    /* Fatia 0 = Masculino, 1 = Feminino; fora de uma fatia (centro) = geral. */
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
  if (centerChart.value.id !== "turnover") return;
  openTurnoverDetail(sliceIndex === 1 ? "demissoes" : "admissoes");
}

/* Clique num card de Admissões/Demissões ao lado da pizza: abre o detalhe dos
   lançamentos que compõem o número. Da tela cheia, fecha o modal do gráfico
   antes para não ficar por baixo. */
const turnoverDetailOpen = ref(false);
const turnoverDetailKind = ref("admissoes");

function openTurnoverDetail(kind) {
  turnoverDetailKind.value = kind;
  fullscreenOpen.value = false;
  turnoverDetailOpen.value = true;
}

/* Tela cheia do gráfico central, com navegação entre os KPIs sem precisar
   fechar o modal. Índice 0 do ciclo é sempre o gráfico padrão (id null). */
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
    <div class="grid gap-4 xl:grid-cols-[1fr_280px]">
      <div>
        <div class="grid gap-4 lg:grid-cols-[200px_1fr]">
          <!-- KPIs à esquerda do gráfico (mesmo estilo dos cards da Visão geral). -->
          <div class="flex gap-2 overflow-x-auto pb-1 lg:flex-col lg:overflow-visible lg:pb-0">
            <CockpitKpiButton
              v-for="kpi in leftKpis"
              :key="kpi.id"
              :kpi="kpi"
              :selected="selectedKpiId === kpi.id"
              @select="select"
              @context="onKpiContext"
            />
          </div>

          <!-- Gráfico central -->
          <section class="flex flex-col rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
            <div
              class="mb-4 grid grid-cols-1 items-center gap-2"
              :class="diariaSummaryItems.length || treinamentoSummaryItems.length ? 'sm:grid-cols-[1fr_auto_1fr]' : centerChart.faturamentoEnabled ? 'sm:grid-cols-[1fr_auto_auto]' : 'sm:grid-cols-3'"
            >
              <div>
                <div class="flex flex-wrap items-center gap-2">
                  <h2 class="text-sm font-bold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">{{ centerChart.title }}</h2>
                  <div v-if="centerChart.id === 'headcount'" class="flex overflow-hidden rounded-lg border border-zinc-300 dark:border-zinc-700" role="group" aria-label="Tipo de gráfico"><button type="button" class="px-3 py-1.5 text-xs font-medium transition" :class="headcountView === 'bar' ? 'bg-accent/15 text-accent' : 'text-zinc-600 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-800'" @click="headcountView = 'bar'">Barras</button><button type="button" class="px-3 py-1.5 text-xs font-medium transition" :class="headcountView === 'pie' ? 'bg-accent/15 text-accent' : 'text-zinc-600 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-800'" @click="headcountView = 'pie'">Pizza</button></div>
                </div>
                <span class="text-xs text-zinc-400 dark:text-zinc-400">{{ centerChart.sub }}</span>
              </div>
              <div v-if="centerChart.id === 'tempo_contratacao'" class="flex flex-wrap items-center justify-start gap-2 sm:justify-center">
                <HiringStatusPills v-model="hiringStatusFilter" />
                <SummaryTiles v-if="hiringSummaryItems.length" :items="hiringSummaryItems" compact />
              </div>
              <SummaryTiles v-else-if="treinamentoSummaryItems.length" :items="treinamentoSummaryItems" compact />
              <SummaryTiles v-else-if="diariaSummaryItems.length" :items="diariaSummaryItems" compact />
              <div v-else></div>
              <div class="flex flex-wrap items-center justify-start gap-2 sm:justify-end" :class="centerChart.faturamentoEnabled ? 'sm:flex-nowrap' : ''">
                <GerenteRegionalFilter
                  v-if="centerChart.id === 'headcount'"
                  v-model="headcountFilialFilter"
                  :options="headcountFilialOptions"
                  label="Filial"
                  all-label="Todas as filiais"
                  title="Filtrar Headcount por filial"
                />
                <GerenteRegionalFilter
                  v-if="centerChart.id === 'treinamento'"
                  v-model="treinamentoGerenteFilter"
                  :options="treinamentoGerenteOptions"
                />
                <GerenteRegionalFilter
                  v-if="centerChart.id === 'tempo_contratacao'"
                  v-model="hiringRecrutadorFilter"
                  :options="hiringRecrutadorOptions"
                  label="Recrutador"
                  all-label="Todos os recrutadores"
                  title="Filtrar Tempo médio de contratação por recrutador"
                />
                <FaturamentoShareChip v-if="centerChart.faturamentoEnabled && centerChart.faturamento" :data="centerChart.faturamento" />
                <FaturamentoButton v-if="centerChart.faturamentoEnabled" />
                <button
                  v-if="selectedKpiId"
                  type="button"
                  class="rounded-lg border border-zinc-300 px-3 py-1.5 text-xs font-medium text-zinc-700 transition hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-800"
                  @click="select(selectedKpiId)"
                >
                  Voltar ao padrão
                </button>
                <button
                  type="button"
                  class="icon-btn-sm"
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
            <!-- Em telas largas a área do gráfico ocupa o restante da altura da
                 seção, que acompanha a altura da coluna vertical de KPIs
                 (grid estica os dois); abaixo de lg usa altura fixa. -->
            <div class="relative h-[480px] lg:h-auto lg:min-h-[420px] lg:flex-1">
            <div class="h-full lg:absolute lg:inset-0">
            <div v-if="centerChart.kind === 'pie'" class="grid h-full grid-rows-[minmax(0,1fr)_auto] gap-4 md:grid-cols-[180px_minmax(0,1fr)_180px] md:grid-rows-1">
              <PieChart
                class="min-h-0 min-w-0 md:col-start-2 md:row-start-1"
                :data="centerChart.data"
                :show-values="showValues"
                height="h-full"
                :center-value="pieCenter.value"
                :center-caption="pieCenter.caption"
                :value-format="centerChart.valueFormat || 'percent'"
                :clickable="['turnover', 'custo_contratacao', 'headcount'].includes(centerChart.id)"
                @chart-click="onPieClick"
                @chart-contextmenu="onPieClick"
              />
              <TurnoverSummaryCards v-if="centerChart.summary" class="md:col-start-3 md:row-start-1" show-cost :show-geral="false" :summary="centerChart.summary" @select="openTurnoverDetail" />
            </div>
            <div v-else-if="centerChart.kind === 'table'" class="flex h-full flex-col justify-center gap-4 overflow-y-auto py-2">
              <div class="grid grid-cols-1 gap-3 sm:grid-cols-3">
                <div class="rounded-xl border border-zinc-200 bg-zinc-50 px-4 py-3 text-center dark:border-zinc-800 dark:bg-zinc-900">
                  <span class="text-xs font-semibold uppercase tracking-wide text-zinc-400">Headcount final</span>
                  <p class="mt-1 text-2xl font-bold tabular-nums text-zinc-900 dark:text-zinc-100">{{ retencaoNum(centerChart.data?.headcountFinal) }}</p>
                </div>
                <div class="rounded-xl border border-zinc-200 bg-zinc-50 px-4 py-3 text-center dark:border-zinc-800 dark:bg-zinc-900">
                  <span class="text-xs font-semibold uppercase tracking-wide text-zinc-400">Novas contratações</span>
                  <p class="mt-1 text-2xl font-bold tabular-nums text-zinc-900 dark:text-zinc-100">{{ retencaoNum(centerChart.data?.novasContratacoes) }}</p>
                </div>
                <div class="rounded-xl border border-zinc-200 bg-zinc-50 px-4 py-3 text-center dark:border-zinc-800 dark:bg-zinc-900">
                  <span class="text-xs font-semibold uppercase tracking-wide text-zinc-400">Headcount inicial</span>
                  <p class="mt-1 text-2xl font-bold tabular-nums text-zinc-900 dark:text-zinc-100">{{ retencaoNum(centerChart.data?.headcountInicial) }}</p>
                </div>
              </div>
              <div
                v-if="centerChart.data?.missing?.length"
                class="rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-center text-sm text-amber-700 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-400"
              >
                Sem dado suficiente para calcular: {{ centerChart.data.missing.join(", ") }}.
              </div>
              <div class="rounded-xl border border-accent/25 bg-accent/5 px-4 py-3 text-center dark:border-accent/25 dark:bg-accent/10">
                <span class="text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">Cálculo</span>
                <p class="mt-1 text-lg font-semibold tabular-nums text-zinc-800 dark:text-zinc-100">
                  ({{ retencaoNum(centerChart.data?.headcountFinal) }} − {{ retencaoNum(centerChart.data?.novasContratacoes) }}) / {{ retencaoNum(centerChart.data?.headcountInicial) }}
                </p>
              </div>
              <div class="flex flex-col items-center text-center">
                <span class="text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">Retenção</span>
                <strong class="text-7xl font-bold tabular-nums text-accent dark:text-accent-light">{{ retencaoPctText(centerChart.data) }}</strong>
              </div>
            </div>
            <BarChart
              v-else
              :data="centerChart.data"
              :show-values="showValues"
              :show-trend="showTrend"
              :value-format="centerChart.valueFormat"
              :variant="centerChart.variant || 'bar'"
              :horizontal="isHorizontalChart"
              :align-top="centerChart.id === 'tempo_contratacao'"
              fluid
              bars-clickable
              @bar-click="onCenterBarClick"
              @bar-contextmenu="onCenterBarContext"
            />
            </div>
            </div>
            <HiringGoalsLegend
              v-if="centerChart.id === 'tempo_contratacao'"
              size="md"
              class="mt-3 border-t border-zinc-100 pt-3 dark:border-zinc-800"
            />
          </section>

          <!-- KPIs abaixo do gráfico: coluna vazia para manter o alinhamento
               com o gráfico (mesma grade da linha acima) e centralizar a
               faixa de KPIs em relação a ele, não à largura total. -->
          <div class="hidden lg:block"></div>
          <div class="mt-4 flex flex-wrap justify-center gap-2">
            <CockpitKpiButton
              v-for="kpi in bottomKpis"
              :key="kpi.id"
              :kpi="kpi"
              :selected="selectedKpiId === kpi.id"
              @select="select"
              @context="onKpiContext"
            />
          </div>
        </div>
      </div>

      <!-- Mapa do KPI selecionado + indicadores (coluna da direita) -->
      <div class="flex flex-col gap-4">
      <UfMapCard
        title="Mapa por estado"
        :subtitle="centerChart.id === 'custo_diaria' ? `${centerChart.title} — valor total` : centerChart.title"
        :states="mapStates"
        @select="setState"
      />

      <!-- Em telas largas o card Indicadores desce até o fim da faixa de KPIs
           inferior (a coluna estica junto com a coluna da esquerda); a lista
           ocupa o espaço restante e rola dentro dele, sem aumentar a linha. -->
      <aside class="flex flex-col rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-900 xl:min-h-[12rem] xl:flex-1">
        <h2 class="mb-2 text-center text-sm font-bold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">Indicadores</h2>
        <div class="xl:relative xl:min-h-0 xl:flex-1">
        <ul
          ref="indicatorListRef"
          class="relative flex max-h-48 flex-col gap-1 overflow-y-auto pr-1 [scrollbar-width:thin] xl:absolute xl:inset-0 xl:max-h-none"
        >
          <li
            v-for="kpi in kpis"
            :key="kpi.id"
            :ref="(el) => setIndicatorItem(kpi.id, el)"
            class="flex cursor-pointer items-center justify-between gap-3 rounded-lg px-2 py-1.5 text-sm transition"
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
    </div>

    <DiariaColaboradorModal
      v-if="diariaColabOpen"
      :open="diariaColabOpen"
      :colaborador="diariaColabName"
      :entries="diariaColabRows"
      @close="diariaColabOpen = false"
    />

    <TurnoverDetailModal
      v-if="turnoverDetailOpen"
      :open="turnoverDetailOpen"
      :kind="turnoverDetailKind"
      @close="turnoverDetailOpen = false"
    />

    <HeadcountEstadoModal
      v-if="headcountEstadoOpen"
      :open="headcountEstadoOpen"
      :estado="headcountEstadoSigla"
      :genero="headcountGenero"
      :filial="headcountFilialFilter"
      @close="headcountEstadoOpen = false"
    />

    <TrainingFilialModal
      v-if="treinamentoFilialOpen"
      :open="treinamentoFilialOpen"
      :filial="treinamentoFilialLabel"
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

    <PermanenciaDetailModal
      v-if="permanenciaDetailOpen"
      :open="permanenciaDetailOpen"
      :record-id="permanenciaDetailId"
      @close="permanenciaDetailOpen = false"
      @edit="onPermanenciaDetailEdit"
    />

    <Modal
      v-if="fullscreenOpen"
      fullscreen
      :title="centerChart.title"
      :subtitle="centerChart.sub"
      @close="fullscreenOpen = false"
    >
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
            <HiringStatusPills v-model="hiringStatusFilter" />
            <SummaryTiles v-if="hiringSummaryItems.length" :items="hiringSummaryItems" compact />
          </template>
          <SummaryTiles v-else-if="treinamentoSummaryItems.length" :items="treinamentoSummaryItems" compact />
          <SummaryTiles v-else-if="diariaSummaryItems.length" :items="diariaSummaryItems" compact />
          <div v-else class="flex min-w-[10rem] items-center justify-center gap-2">
            <span class="text-center text-sm font-semibold text-zinc-600 dark:text-zinc-300">{{ centerChart.title }}</span>
            <div v-if="centerChart.id === 'headcount'" class="flex overflow-hidden rounded-lg border border-zinc-300 dark:border-zinc-700" role="group" aria-label="Tipo de gráfico"><button type="button" class="px-3 py-1.5 text-xs font-medium transition" :class="headcountView === 'bar' ? 'bg-accent/15 text-accent' : 'text-zinc-600 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-800'" @click="headcountView = 'bar'">Barras</button><button type="button" class="px-3 py-1.5 text-xs font-medium transition" :class="headcountView === 'pie' ? 'bg-accent/15 text-accent' : 'text-zinc-600 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-800'" @click="headcountView = 'pie'">Pizza</button></div>
          </div>
          <GerenteRegionalFilter
            v-if="centerChart.id === 'headcount'"
            v-model="headcountFilialFilter"
            :options="headcountFilialOptions"
            label="Filial"
            all-label="Todas as filiais"
            title="Filtrar Headcount por filial"
          />
          <GerenteRegionalFilter
            v-if="centerChart.id === 'treinamento'"
            v-model="treinamentoGerenteFilter"
            :options="treinamentoGerenteOptions"
          />
          <GerenteRegionalFilter
            v-if="centerChart.id === 'tempo_contratacao'"
            v-model="hiringRecrutadorFilter"
            :options="hiringRecrutadorOptions"
            label="Recrutador"
            all-label="Todos os recrutadores"
            title="Filtrar Tempo médio de contratação por recrutador"
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
          <div v-if="centerChart.kind === 'pie'" class="grid h-full grid-rows-[minmax(0,1fr)_auto] gap-4 md:grid-cols-[180px_minmax(0,1fr)_180px] md:grid-rows-1">
            <PieChart
              class="min-h-0 min-w-0 md:col-start-2 md:row-start-1"
              :data="centerChart.data"
              :show-values="showValues"
              height="h-full"
              :center-value="pieCenter.value"
              :center-caption="pieCenter.caption"
              :value-format="centerChart.valueFormat || 'percent'"
              :clickable="['turnover', 'custo_contratacao', 'headcount'].includes(centerChart.id)"
              @chart-click="onPieClick"
              @chart-contextmenu="onPieClick"
            />
            <TurnoverSummaryCards v-if="centerChart.summary" class="md:col-start-3 md:row-start-1" show-cost :show-geral="false" :summary="centerChart.summary" @select="openTurnoverDetail" />
          </div>
          <div v-else-if="centerChart.kind === 'table'" class="flex h-full flex-col justify-center gap-4">
            <div class="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <div class="rounded-xl border border-zinc-200 bg-zinc-50 px-4 py-3 text-center dark:border-zinc-800 dark:bg-zinc-900">
                <span class="text-xs font-semibold uppercase tracking-wide text-zinc-400">Headcount final</span>
                <p class="mt-1 text-2xl font-bold tabular-nums text-zinc-900 dark:text-zinc-100">{{ retencaoNum(centerChart.data?.headcountFinal) }}</p>
              </div>
              <div class="rounded-xl border border-zinc-200 bg-zinc-50 px-4 py-3 text-center dark:border-zinc-800 dark:bg-zinc-900">
                <span class="text-xs font-semibold uppercase tracking-wide text-zinc-400">Novas contratações</span>
                <p class="mt-1 text-2xl font-bold tabular-nums text-zinc-900 dark:text-zinc-100">{{ retencaoNum(centerChart.data?.novasContratacoes) }}</p>
              </div>
              <div class="rounded-xl border border-zinc-200 bg-zinc-50 px-4 py-3 text-center dark:border-zinc-800 dark:bg-zinc-900">
                <span class="text-xs font-semibold uppercase tracking-wide text-zinc-400">Headcount inicial</span>
                <p class="mt-1 text-2xl font-bold tabular-nums text-zinc-900 dark:text-zinc-100">{{ retencaoNum(centerChart.data?.headcountInicial) }}</p>
              </div>
            </div>
            <div
              v-if="centerChart.data?.missing?.length"
              class="rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-center text-sm text-amber-700 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-400"
            >
              Sem dado suficiente para calcular: {{ centerChart.data.missing.join(", ") }}.
            </div>
            <div class="rounded-xl border border-accent/25 bg-accent/5 px-4 py-3 text-center dark:border-accent/25 dark:bg-accent/10">
              <span class="text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">Cálculo</span>
              <p class="mt-1 text-lg font-semibold tabular-nums text-zinc-800 dark:text-zinc-100">
                ({{ retencaoNum(centerChart.data?.headcountFinal) }} − {{ retencaoNum(centerChart.data?.novasContratacoes) }}) / {{ retencaoNum(centerChart.data?.headcountInicial) }}
              </p>
            </div>
            <div class="flex flex-col items-center text-center">
              <span class="text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">Retenção</span>
              <strong class="text-7xl font-bold tabular-nums text-accent dark:text-accent-light">{{ retencaoPctText(centerChart.data) }}</strong>
            </div>
          </div>
          <BarChart
            v-else
            :data="centerChart.data"
            :show-values="showValues"
            :show-trend="showTrend"
            :value-format="centerChart.valueFormat"
            :variant="centerChart.variant || 'bar'"
            :horizontal="isHorizontalChart"
            :align-top="centerChart.id === 'tempo_contratacao'"
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
