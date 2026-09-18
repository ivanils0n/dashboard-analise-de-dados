<script setup>
import { computed, ref } from "vue";
import BarChart from "@/components/charts/BarChart.vue";
import PieChart from "@/components/charts/PieChart.vue";
import Modal from "@/components/ui/Modal.vue";
import TrainingFilialModal from "@/components/dashboard/TrainingFilialModal.vue";
import DiariaColaboradorModal from "@/components/dashboard/DiariaColaboradorModal.vue";
import VacancyDetailModal from "@/components/dashboard/VacancyDetailModal.vue";
import PermanenciaDetailModal from "@/components/dashboard/PermanenciaDetailModal.vue";
import HiringStatusPills from "@/components/dashboard/HiringStatusPills.vue";
import HiringGoalsLegend from "@/components/dashboard/HiringGoalsLegend.vue";
import { formatValue } from "@/lib/utils";

/* `dashboard` é o objeto retornado por useDashboardData (refs/computed +
   funções) — repassado inteiro para reaproveitar exatamente os mesmos dados
   da aba "Visão geral" sem duplicar cálculo. O Cockpit segue o filtro de
   período/estado global (definido na Visão geral), sem filtro próprio. */
const props = defineProps({
  dashboard: { type: Object, required: true },
  showValues: { type: Boolean, default: false }
});

const emit = defineEmits(["edit-vacancy", "edit-permanencia", "open-turnover"]);

const kpis = computed(() => props.dashboard.kpis.value);
const selectedKpiId = computed(() => props.dashboard.selectedKpiId.value);

/* Filtro de status (abertas/fechadas) do gráfico de Tempo médio de
   contratação, quando ele é o gráfico central. */
const hiringStatusFilter = ref("fechadas");

/* Painel central: Custo de folha de salário (padrão) quando nada está
   selecionado — Panorama atual foi desativado —, ou o gráfico do KPI clicado
   (linha mensal, barras por filial/estado ou pizza de turnover — ver
   cockpitChartFor em useDashboardData.js). */
const centerChart = computed(() =>
  props.dashboard.cockpitChartFor(selectedKpiId.value, hiringStatusFilter.value)
);

/* Divide os KPIs em duas faixas (esquerda e abaixo) para que fiquem ao
   redor do gráfico central, com o painel Indicadores fixo à direita. */
const leftKpis = computed(() => kpis.value.filter((_, i) => i % 2 === 0));
const bottomKpis = computed(() => kpis.value.filter((_, i) => i % 2 === 1));

function select(id) {
  props.dashboard.selectKpi(selectedKpiId.value === id ? null : id);
}

/* Card "table" da Retenção: cada valor cai em "—" quando ainda não há dado
   suficiente (ex.: sem headcount inicial cadastrado). */
function retencaoNum(v) {
  return v === null || v === undefined ? "—" : v;
}
function retencaoPctText(data) {
  const v = data && data.retencaoPct;
  return v === null || v === undefined ? "—" : `${v.toFixed(1)}%`;
}

/* Turnover (pizza): sem número total isolado — mostra as duas taxas da
   pizza (Entrada/Saída) já formatadas em %, em vez do total combinado. */
function indicatorValueText(kpi) {
  if (kpi.kind === "pie") {
    const pct = { type: "percent", decimals: 1 };
    return (kpi.pieData || [])
      .map((d) => `${d.label} ${formatValue(pct, d.value)}`)
      .join(" · ");
  }
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

function onCenterBarClick({ index, label }) {
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
    treinamentoFilialRows.value = props.dashboard.treinamentoFilialEntries(label);
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
  if (centerChart.value.id === "custo_contratacao") {
    const row = centerChart.value.data[index];
    if (!row) return;
    vacancyDetailId.value = row.vacancyId;
    vacancyDetailFallback.value = { name: row.label, salario: row.value, date: row.date };
    vacancyDetailOpen.value = true;
    return;
  }
  if (centerChart.value.id === "tempo_permanencia") {
    const row = centerChart.value.data[index];
    if (!row || !row.permanenciaId) return;
    permanenciaDetailId.value = row.permanenciaId;
    permanenciaDetailOpen.value = true;
  }
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
const NO_TREND_CHARTS = ["treinamento", "tempo_contratacao", "tempo_permanencia", "custo_diaria"];
const showTrend = computed(() => !!selectedKpiId.value && !NO_TREND_CHARTS.includes(selectedKpiId.value));

/* Gráficos de barras deitadas (uma linha por filial/vaga/colaborador, com
   rolagem). */
const HORIZONTAL_CHARTS = ["treinamento", "tempo_contratacao", "tempo_permanencia", "custo_diaria"];
const isHorizontalChart = computed(() => HORIZONTAL_CHARTS.includes(centerChart.value.id));

/* Clique na pizza do Turnover: abre o modal de Turnover (hospedado na Visão
   geral). Da tela cheia, fecha o modal do gráfico antes para não ficar por
   cima. */
function onPieClick() {
  if (centerChart.value.id !== "turnover") return;
  fullscreenOpen.value = false;
  emit("open-turnover");
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
          <!-- KPIs à esquerda do gráfico: centralizados na vertical em
               relação à altura do gráfico central (mesma linha do grid). -->
          <div class="flex gap-2 overflow-x-auto pb-1 lg:h-full lg:flex-col lg:justify-center lg:overflow-visible lg:pb-0">
            <button
              v-for="kpi in leftKpis"
              :key="kpi.id"
              type="button"
              class="cockpit-kpi-btn"
              :class="selectedKpiId === kpi.id ? 'is-active' : ''"
              @click="select(kpi.id)"
            >
              <span class="cockpit-kpi-name">{{ kpi.name }}</span>
              <span class="cockpit-kpi-value">{{ indicatorValueText(kpi) }}</span>
            </button>
          </div>

          <!-- Gráfico central -->
          <section class="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
            <div class="mb-4 grid grid-cols-1 items-center gap-2 sm:grid-cols-3">
              <div>
                <h2 class="text-sm font-bold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">{{ centerChart.title }}</h2>
                <span class="text-xs text-zinc-400 dark:text-zinc-400">{{ centerChart.sub }}</span>
              </div>
              <div v-if="centerChart.id === 'tempo_contratacao'" class="flex justify-start sm:justify-center">
                <HiringStatusPills v-model="hiringStatusFilter" />
              </div>
              <div v-else></div>
              <div class="flex justify-start gap-2 sm:justify-end">
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
            <PieChart
              v-if="centerChart.kind === 'pie'"
              :data="centerChart.data"
              :show-values="showValues"
              height="h-[480px]"
              :clickable="centerChart.id === 'turnover'"
              @chart-click="onPieClick"
            />
            <div v-else-if="centerChart.kind === 'table'" class="flex flex-col gap-4 py-2">
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
              :height-px="480"
              :bars-clickable="
                centerChart.id === 'treinamento' ||
                centerChart.id === 'custo_diaria' ||
                centerChart.id === 'tempo_contratacao' ||
                centerChart.id === 'custo_contratacao' ||
                centerChart.id === 'tempo_permanencia'
              "
              @bar-click="onCenterBarClick"
              @bar-contextmenu="onCenterBarContext"
            />
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
            <button
              v-for="kpi in bottomKpis"
              :key="kpi.id"
              type="button"
              class="cockpit-kpi-btn"
              :class="selectedKpiId === kpi.id ? 'is-active' : ''"
              @click="select(kpi.id)"
            >
              <span class="cockpit-kpi-name">{{ kpi.name }}</span>
              <span class="cockpit-kpi-value">{{ indicatorValueText(kpi) }}</span>
            </button>
          </div>
        </div>
      </div>

      <!-- Indicadores -->
      <aside class="h-fit rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
        <h2 class="mb-3 text-sm font-bold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">Indicadores</h2>
        <ul class="flex flex-col gap-1">
          <li
            v-for="kpi in kpis"
            :key="kpi.id"
            class="flex cursor-pointer items-center justify-between gap-3 rounded-lg px-2 py-1.5 text-sm transition"
            :class="
              selectedKpiId === kpi.id
                ? 'bg-accent/10 font-semibold text-accent-hover dark:text-accent-light'
                : 'text-zinc-600 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-800'
            "
            @click="select(kpi.id)"
          >
            <span class="truncate">{{ kpi.name }}</span>
            <span class="shrink-0 font-semibold text-zinc-900 dark:text-zinc-100">{{ indicatorValueText(kpi) }}</span>
          </li>
        </ul>
      </aside>
    </div>

    <DiariaColaboradorModal
      v-if="diariaColabOpen"
      :open="diariaColabOpen"
      :colaborador="diariaColabName"
      :entries="diariaColabRows"
      @close="diariaColabOpen = false"
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
          <HiringStatusPills v-if="centerChart.id === 'tempo_contratacao'" v-model="hiringStatusFilter" />
          <span v-else class="min-w-[10rem] text-center text-sm font-semibold text-zinc-600 dark:text-zinc-300">
            {{ centerChart.title }}
          </span>
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
          <PieChart
            v-if="centerChart.kind === 'pie'"
            :data="centerChart.data"
            :show-values="showValues"
            height="h-full"
            :clickable="centerChart.id === 'turnover'"
            @chart-click="onPieClick"
          />
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
            fluid
            :bars-clickable="
              centerChart.id === 'treinamento' ||
              centerChart.id === 'custo_diaria' ||
              centerChart.id === 'tempo_contratacao' ||
                centerChart.id === 'custo_contratacao' ||
              centerChart.id === 'tempo_permanencia'
            "
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
.cockpit-kpi-btn {
  position: relative;
  display: flex;
  min-width: 150px;
  flex-shrink: 0;
  flex-direction: column;
  gap: 0.3rem;
  overflow: hidden;
  border-radius: 0.9rem;
  border: 1px solid rgb(228 228 231);
  background-color: #fff;
  padding: 0.75rem 0.9rem 0.7rem;
  align-items: center;
  justify-content: center;
  text-align: center;
  box-shadow: 0 1px 2px rgba(24, 24, 27, 0.04);
  transition: border-color 0.18s ease, box-shadow 0.18s ease, transform 0.15s ease;
}
.cockpit-kpi-btn::before {
  content: "";
  position: absolute;
  inset: 0 auto 0 0;
  width: 3px;
  background: var(--color-accent, #B7791F);
  opacity: 0;
  transition: opacity 0.18s ease;
}
.cockpit-kpi-btn:hover {
  border-color: rgb(212 212 216);
  box-shadow: 0 4px 10px rgba(24, 24, 27, 0.08);
  transform: translateY(-1px);
}
.cockpit-kpi-btn.is-active {
  border-color: rgba(220, 38, 38, 0.35);
  background-image: linear-gradient(135deg, rgba(220, 38, 38, 0.07), rgba(220, 38, 38, 0));
  box-shadow: 0 4px 12px rgba(220, 38, 38, 0.12);
}
.cockpit-kpi-btn.is-active::before {
  opacity: 1;
}
.cockpit-kpi-name {
  font-size: 0.68rem;
  font-weight: 700;
  color: rgb(113 113 122);
  text-transform: uppercase;
  letter-spacing: 0.04em;
}
.cockpit-kpi-value {
  font-size: 1.15rem;
  font-weight: 800;
  letter-spacing: -0.01em;
  color: rgb(24 24 27);
  font-variant-numeric: tabular-nums;
}
.cockpit-kpi-btn.is-active .cockpit-kpi-value {
  color: var(--color-accent, #B7791F);
}
:global(.dark) .cockpit-kpi-btn {
  border-color: rgb(63 63 70);
  background-color: rgb(24 24 27);
  box-shadow: none;
}
:global(.dark) .cockpit-kpi-btn:hover {
  border-color: rgb(82 82 91);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
}
:global(.dark) .cockpit-kpi-btn.is-active {
  border-color: rgba(248, 113, 113, 0.35);
  background-image: linear-gradient(135deg, rgba(248, 113, 113, 0.12), rgba(248, 113, 113, 0));
  box-shadow: 0 4px 14px rgba(0, 0, 0, 0.35);
}
:global(.dark) .cockpit-kpi-name {
  color: rgb(161 161 170);
}
:global(.dark) .cockpit-kpi-value {
  color: rgb(244 244 245);
}
:global(.dark) .cockpit-kpi-btn.is-active .cockpit-kpi-value {
  color: #F2C766;
}
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
