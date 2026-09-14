<script setup>
import { ref, computed, onMounted, onActivated, onUnmounted, nextTick, watch } from "vue";
import KpiCard from "@/components/dashboard/KpiCard.vue";
import KpiChartCard from "@/components/dashboard/KpiChartCard.vue";
import LaunchModal from "@/components/dashboard/LaunchModal.vue";
import PresentationModal from "@/components/dashboard/PresentationModal.vue";
import HeadcountModal from "@/components/dashboard/HeadcountModal.vue";
import IndicatorEntriesModal from "@/components/dashboard/IndicatorEntriesModal.vue";
import VacanciesModal from "@/components/dashboard/VacanciesModal.vue";
import TrainingFilialModal from "@/components/dashboard/TrainingFilialModal.vue";
import EditEntryModal from "@/components/dashboard/EditEntryModal.vue";
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
import { singleMonthOfRange, ymLabel, ymShortLabel, safeSetItem, localStore, normalizeText } from "@/lib/utils";
import { syncAll } from "@/lib/employees";
import { toXLSX, toCSV, downloadTemplate, importFile } from "@/lib/export";
import { reloadData, hydrateState } from "@/lib/db";
import { beginLoading, endLoading } from "@/composables/useLoading";

const { dateFilter: df } = useDateFilter();
const { state: filters } = useFilters();
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

const launchOpen = ref(false);
const presentationOpen = ref(false);
const headcountOpen = ref(false);
const diariaEntriesOpen = ref(false);
const treinamentoEntriesOpen = ref(false);
const custosEntriesOpen = ref(false);
const vacanciesOpen = ref(false);
const vacancyAllPeriods = ref(false);

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
const menuOpen = ref(false);
const tableSearch = ref("");
const kpiSearch = ref("");
const SHOW_VALUES_KEY = "gg-show-values";
const storedShowValues = localStore.getItem(SHOW_VALUES_KEY);
const showValues = ref(storedShowValues === null ? true : storedShowValues === "1");
watch(showValues, (v) => safeSetItem(localStore, SHOW_VALUES_KEY, v ? "1" : "0"));
const custosChartRef = ref(null);
const treinamentoChartRef = ref(null);
const panoramaChartRef = ref(null);
const custosBarChartRef = ref(null);
const treinamentoBarChartRef = ref(null);
const editingRow = ref(null);
const editTarget = ref(null);
const editVacancyTarget = ref(null);

/* Colunas exibidas no modal de registros (clique direito no KPI). */
const diariaColumns = [
  { label: "Data", date: true },
  { label: "Colaborador", meta: "employeeName" },
  { label: "Departamento", meta: "departamento" },
  { label: "Filial", meta: "filial" },
  { label: "Líder imediato", meta: "liderImediato" },
  { label: "Gerente regional", meta: "gerenteRegional" },
  { label: "Regional", meta: "regional" },
  { label: "Período", month: true },
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
  { label: "Carga horária", meta: "cargaHoraria", hours: true },
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

const scrollRef = ref(null);
let flashTimer = null;

const canEdit = canEditData();

const tableRows = computed(() => dashboard.tableRows(tableSearch.value));

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

const diariaSemPeriodoCount = computed(() => dashboard.diariaSemPeriodoCount());

/* Entradas da linha do gráfico "Evolução no período". Absenteísmo, diárias e
   treinamento usam a série agregada por dia (total do dia, sem visão
   individual); os demais indicadores usam os lançamentos do período. */
function lineEntries(card) {
  if (card.kind !== "line") return [];
  const ind = getIndicatorById(card.id);
  if (ind && ind.id === "absenteismo") return dashboard.absenteismoDailySeries();
  if (ind && ind.id === "custo_diaria") return dashboard.diariaDailySeries(diariaShowSemPeriodo.value);
  return filteredEntries(ind);
}

/* Gráfico de barras por estado do Headcount (demais indicadores têm gráfico
   próprio fora da faixa "Evolução por indicador"). */
function chartBarData(card) {
  if (card.kind !== "bar") return [];
  if (card.id === "headcount") return dashboard.headcountBarByState();
  return [];
}

function openLaunch() {
  if (!canEdit) {
    toast("Seu perfil tem acesso somente leitura.");
    return;
  }
  editTarget.value = null;
  editVacancyTarget.value = null;
  launchOpen.value = true;
}

function closeLaunch() {
  launchOpen.value = false;
  editTarget.value = null;
  editVacancyTarget.value = null;
}

/* Editar uma vaga a partir do histórico (botão direito no KPI de contratação). */
function onVacancyEdit(vacancyId) {
  if (!canEdit) {
    toast("Seu perfil tem acesso somente leitura.");
    return;
  }
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
  diariaEntriesOpen.value = false;
  treinamentoEntriesOpen.value = false;
  custosEntriesOpen.value = false;
  editTarget.value = { indicatorId, entry };
  launchOpen.value = true;
}

function onSaved() {
  dashboard.selectKpi(null);
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
  else if (action === "presentation") presentationOpen.value = true;
  else if (action === "reload") handleReload();
}

async function handleReload() {
  importing.value = true;
  try {
    await reloadData();
    syncAll();
    toast("Dados recarregados.");
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
    scrollToKpiChart(id);
  });
}

/* Clique direito em um KPI abre o modal correspondente:
   Headcount → detalhes de salários/custos; Diárias, Treinamento e
   Custos Totais → registros. */
function onKpiContext(id) {
  if (id === "headcount") headcountOpen.value = true;
  else if (id === "custo_diaria") diariaEntriesOpen.value = true;
  else if (id === "treinamento") treinamentoEntriesOpen.value = true;
  else if (id === "custo_total") custosEntriesOpen.value = true;
  else if (id === "tempo_contratacao") {
    vacancyAllPeriods.value = false;
    vacanciesOpen.value = true;
  } else if (id === "custo_contratacao") {
    /* O custo de contratação vem do salário das vagas: abre o histórico
       completo (abertas e fechadas, sem restringir ao mês atual). */
    vacancyAllPeriods.value = true;
    vacanciesOpen.value = true;
  }
}

/* Rola a faixa de gráficos até o card do indicador e o destaca. */
function scrollToKpiChart(indicatorId) {
  const scroll = scrollRef.value;
  if (!scroll) return;
  let targetId = indicatorId;
  if (targetId === "turnover_total") targetId = "turnover_entradas";
  const card = scroll.querySelector(`[data-indicator-card="${targetId}"]`);
  if (!card) return;
  scroll.scrollTo({ left: card.offsetLeft - (scroll.clientWidth - card.offsetWidth) / 2, behavior: "smooth" });
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

/* Mostra a tela de carregamento sempre que a aba é aberta (inclusive ao
   voltar de outra aba, já que o KeepAlive não remonta o componente). */
onActivated(() => {
  beginLoading("Carregando dashboard...");
  hydrateState(filters.current)
    .catch(() => {})
    .finally(endLoading);
});
</script>

<template>
  <div>
    <!-- ===== HERO ===== -->
    <div class="mb-6 flex flex-wrap items-center justify-between gap-4">
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

      <div class="flex items-center gap-2">
        <DateRangeFilter :range="df" title="Período" />

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
        </template>
        <button type="button" class="dropdown-item text-zinc-700 hover:bg-zinc-100 dark:text-zinc-100 dark:hover:bg-zinc-800" @click="onMenuClick('reload')">Recarregar Dados</button>
        <div class="my-1 border-t border-zinc-100 dark:border-zinc-800"></div>
        <button type="button" class="dropdown-item text-zinc-700 hover:bg-zinc-100 dark:text-zinc-100 dark:hover:bg-zinc-800" @click="onMenuClick('presentation')">⛶ Apresentação</button>
        </div>
        <input ref="fileInput" type="file" accept=".xlsx,.xls,.csv" hidden @change="onImportFile" />
        </div>
      </div>
    </div>

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

    <!-- ===== EVOLUÇÃO POR INDICADOR ===== -->
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
          :show-values="showValues"
          :data-indicator-card="card.id"
        />
      </div>
    </section>

    <!-- ===== PANORAMA ATUAL + CUSTOS TOTAIS ===== -->
    <div class="mt-8 grid gap-4 lg:grid-cols-2">
      <!-- ===== PANORAMA ATUAL ===== -->
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
          title="Panorama atual"
          subtitle="Último valor por indicador"
        />
      </section>

      <!-- ===== CUSTOS TOTAIS — EVOLUÇÃO DOS INDICADORES ===== -->
      <section
        ref="custosChartRef"
        class="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-900"
      >
        <div class="mb-4 flex items-start justify-between gap-2">
          <div>
            <h2 class="text-sm font-bold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">Custos Totais — Evolução dos Indicadores</h2>
            <span class="text-xs text-zinc-400 dark:text-zinc-400">Soma dos custos por filial no período filtrado</span>
          </div>
          <button
            v-if="custosBarData.length"
            type="button"
            class="icon-btn-sm"
            title="Tela cheia"
            aria-label="Ver gráfico de Custos Totais em tela cheia"
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
          title="Custos Totais — Evolução dos Indicadores"
          subtitle="Soma dos custos por filial no período filtrado"
        />
        <div v-else class="p-6">
          <EmptyState
            title="Sem custos no período"
            text="Use o botão “Lançar dados” (Custos Totais) para registrar os custos do período ou ajuste o filtro."
          />
        </div>
      </section>
    </div>

    <!-- ===== TREINAMENTO — CARGA HORÁRIA POR FILIAL ===== -->
    <section
      ref="treinamentoChartRef"
      class="mt-8 rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-900"
    >
      <div class="mb-4 flex items-start justify-between gap-2">
        <div>
          <h2 class="text-sm font-bold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">Treinamento — Carga horária por filial</h2>
          <span class="text-xs text-zinc-400 dark:text-zinc-400">Soma das horas de treinamento por filial no período filtrado</span>
        </div>
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
      <BarChart
        v-if="treinamentoBarData.length"
        ref="treinamentoBarChartRef"
        :data="treinamentoBarData"
        :show-values="showValues"
        value-format="hours"
        :show-trend="true"
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

    <!-- ===== LANÇAMENTOS ===== -->
    <section class="mt-8 rounded-2xl border border-zinc-200 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
      <div class="flex flex-wrap items-center justify-between gap-3 border-b border-zinc-100 p-5 dark:border-zinc-800">
        <div>
          <h2 class="text-sm font-bold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">Lançamentos recentes</h2>
          <p class="text-xs text-zinc-400 dark:text-zinc-400">Todos os registros cadastrados e calculados</p>
        </div>
        <div class="flex flex-wrap items-center gap-2">
          <template v-if="canEdit && selectedRows.length">
            <span class="rounded-full bg-accent/10 px-2.5 py-1 text-xs font-semibold text-accent-hover dark:text-red-400">
              {{ selectedRows.length }} selecionado(s)
            </span>
            <button type="button" class="btn-danger-solid-sm" @click="handleBulkDelete">Excluir selecionados</button>
          </template>
          <input v-model="tableSearch" type="search" class="input-sm" placeholder="Buscar lançamento..." aria-label="Buscar lançamento" />
          <button v-if="canEdit" type="button" class="btn-ghost-sm" @click="handleClearAll">Limpar tudo</button>
        </div>
      </div>

      <div v-if="tableRows.length" class="max-h-[400px] overflow-auto">
        <table class="w-full min-w-max text-left text-sm">
          <thead class="sticky top-0 z-10 bg-white dark:bg-zinc-900">
            <tr class="border-b border-zinc-100 text-xs uppercase tracking-wide text-zinc-400 dark:border-zinc-800 dark:text-zinc-400">
              <th v-if="canEdit" class="w-10 px-4 py-3 font-semibold">
                <input
                  type="checkbox"
                  class="h-4 w-4 cursor-pointer accent-red-600"
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
              v-for="{ entry, ind } in tableRows"
              :key="entry.id"
              class="border-b border-zinc-100 last:border-0 dark:border-zinc-800"
              :class="selectedKeys.has(entry.id) ? 'bg-accent/5 dark:bg-red-500/5' : ''"
            >
              <td v-if="canEdit" class="px-4 py-3">
                <input
                  type="checkbox"
                  class="h-4 w-4 cursor-pointer accent-red-600"
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

      <div v-else class="p-5">
        <EmptyState
          :title="tableSearch ? 'Nenhum resultado encontrado' : 'Nenhum lançamento ainda'"
          :text="tableSearch ? '' : 'Use o botão “Lançar dados” para alimentar seus indicadores ou cadastre colaboradores na aba Equipe.'"
        />
      </div>
    </section>

    <LaunchModal
      v-if="launchOpen"
      :open="launchOpen"
      :edit-entry="editTarget"
      :edit-vacancy-id="editVacancyTarget"
      @close="closeLaunch"
      @saved="onSaved"
    />
    <PresentationModal v-if="presentationOpen" :open="presentationOpen" @close="presentationOpen = false" />
    <HeadcountModal v-if="headcountOpen" :open="headcountOpen" @close="headcountOpen = false" />
    <VacanciesModal
      v-if="vacanciesOpen"
      :open="vacanciesOpen"
      :all-periods="vacancyAllPeriods"
      @close="vacanciesOpen = false"
      @edit="onVacancyEdit"
    />
    <TrainingFilialModal
      v-if="treinamentoFilialOpen"
      :open="treinamentoFilialOpen"
      :filial="treinamentoFilialLabel"
      :entries="treinamentoFilialRows"
      @close="treinamentoFilialOpen = false"
    />
    <IndicatorEntriesModal
      v-if="diariaEntriesOpen"
      :open="diariaEntriesOpen"
      indicator-id="custo_diaria"
      title="Custo da diária geral — Lançamentos"
      subtitle="Registros de diárias por colaborador, departamento, filial, líder, regional, período e diária"
      :columns="diariaColumns"
      @close="diariaEntriesOpen = false"
      @edit="onEntriesEdit"
    />
    <IndicatorEntriesModal
      v-if="treinamentoEntriesOpen"
      :open="treinamentoEntriesOpen"
      indicator-id="treinamento"
      title="Treinamentos — Lançamentos"
      subtitle="Registros de treinamento por colaborador (cargo, loja, tema, carga horária e modalidade)"
      :columns="treinamentoColumns"
      @close="treinamentoEntriesOpen = false"
      @edit="onEntriesEdit"
    />
    <IndicatorEntriesModal
      v-if="custosEntriesOpen"
      :open="custosEntriesOpen"
      indicator-id="custo_total"
      title="Custos Totais — Lançamentos"
      subtitle="Custos totais por estado e filial (CNPJ, razão social, custo e % de participação)"
      :columns="custosColumns"
      default-this-month
      @close="custosEntriesOpen = false"
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

    <LoadingOverlay :show="importing" :label="'Processando planilha...'" />
  </div>
</template>

<style scoped>
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
