<script setup>
import { ref, computed, onMounted, onUnmounted, nextTick } from "vue";
import KpiCard from "@/components/dashboard/KpiCard.vue";
import KpiChartCard from "@/components/dashboard/KpiChartCard.vue";
import LaunchModal from "@/components/dashboard/LaunchModal.vue";
import PresentationModal from "@/components/dashboard/PresentationModal.vue";
import FilterDrawer from "@/components/dashboard/FilterDrawer.vue";
import BarChart from "@/components/charts/BarChart.vue";
import Badge from "@/components/ui/Badge.vue";
import EmptyState from "@/components/ui/EmptyState.vue";
import { useDashboardData } from "@/composables/useDashboardData";
import { useDateFilter, dateFilter } from "@/composables/useDateFilter";
import { useToast } from "@/composables/useToast";
import { useDialog } from "@/composables/useDialog";
import { canEditData } from "@/lib/auth";
import { getIndicatorById } from "@/lib/config";
import { removeEntry, clearEntries } from "@/lib/store";
import { syncAll } from "@/lib/employees";
import { toXLSX, toCSV, downloadTemplate, importFile } from "@/lib/export";
import { reloadData } from "@/lib/supabase";
import { firstDayOfMonthISO, lastDayOfMonthISO } from "@/lib/utils";

const { dateFilter: df } = useDateFilter();
const { show: toast } = useToast();
const { confirm } = useDialog();

const dashboard = useDashboardData(dateFilter);

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
const menuOpen = ref(false);
const tableSearch = ref("");
const showValues = ref(false);

const scrollRef = ref(null);
let flashTimer = null;

const canEdit = canEditData();

const tableRows = computed(() => dashboard.tableRows(tableSearch.value));

function openLaunch() {
  if (!canEdit) {
    toast("Seu perfil tem acesso somente leitura.");
    return;
  }
  launchOpen.value = true;
}

function closeLaunch() {
  launchOpen.value = false;
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
  await reloadData();
  syncAll();
  toast("Dados recarregados.");
}

const fileInput = ref(null);

function onImportFile(e) {
  const file = e.target.files && e.target.files[0];
  if (file) {
    importFile(file, (summary) => {
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
      toast("Importação concluída — " + parts.join(" · "));
    });
  }
  e.target.value = "";
}

function removeEntryRow(indicatorId, entryId) {
  removeEntry(indicatorId, entryId);
  toast("Lançamento excluído.");
}

async function handleClearAll() {
  if (!canEdit) {
    toast("Seu perfil tem acesso somente leitura.");
    return;
  }
  const ok = await confirm({
    title: "Apagar todos os lançamentos?",
    message: "Todos os registros serão removidos. Essa ação não pode ser desfeita.",
    confirmText: "Apagar tudo",
    danger: true
  });
  if (!ok) return;
  clearEntries();
  syncAll();
  toast("Todos os dados foram removidos.");
}

function resetDateFilter() {
  df.start = firstDayOfMonthISO();
  df.end = lastDayOfMonthISO();
}

function onSelectKpi(id) {
  selectKpi(id);
  nextTick(() => scrollToKpiChart(id));
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

onMounted(() => document.addEventListener("click", onDocumentClick));
onUnmounted(() => {
  document.removeEventListener("click", onDocumentClick);
  clearTimeout(flashTimer);
});
</script>

<template>
  <div class="fade-in">
    <FilterDrawer page="dashboard" />

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
          <button type="button" class="dropdown-item text-zinc-700 hover:bg-zinc-100 dark:text-zinc-100 dark:hover:bg-zinc-800" @click="onMenuClick('xlsx')">Baixar em XLSX</button>
          <button type="button" class="dropdown-item text-zinc-700 hover:bg-zinc-100 dark:text-zinc-100 dark:hover:bg-zinc-800" @click="onMenuClick('csv')">Baixar em CSV</button>
          <button type="button" class="dropdown-item text-zinc-700 hover:bg-zinc-100 dark:text-zinc-100 dark:hover:bg-zinc-800" @click="onMenuClick('template')">Baixar template</button>
          <div class="my-1 border-t border-zinc-100 dark:border-zinc-800"></div>
          <button v-if="canEdit" type="button" class="dropdown-item text-zinc-700 hover:bg-zinc-100 dark:text-zinc-100 dark:hover:bg-zinc-800" @click="onMenuClick('import')">Importar planilha</button>
          <div v-if="canEdit" class="my-1 border-t border-zinc-100 dark:border-zinc-800"></div>
          <button type="button" class="dropdown-item text-zinc-700 hover:bg-zinc-100 dark:text-zinc-100 dark:hover:bg-zinc-800" @click="onMenuClick('reload')">Recarregar Dados</button>
          <div class="my-1 border-t border-zinc-100 dark:border-zinc-800"></div>
          <button type="button" class="dropdown-item text-zinc-700 hover:bg-zinc-100 dark:text-zinc-100 dark:hover:bg-zinc-800" @click="onMenuClick('presentation')">⛶ Apresentação</button>
        </div>
        <input ref="fileInput" type="file" accept=".xlsx,.xls,.csv" hidden @change="onImportFile" />
      </div>
    </div>

    <!-- ===== KPIs ===== -->
    <h2 class="mb-3 text-sm font-bold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">Indicadores</h2>
    <section class="flex gap-4 overflow-x-auto pb-2" aria-label="Indicadores-chave">
      <KpiCard
        v-for="kpi in kpis"
        :key="kpi.id"
        :kpi="kpi"
        :selected="selectedKpiId === kpi.id"
        @select="onSelectKpi"
      />
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
          :entries="card.kind === 'line' ? filteredEntries(getIndicatorById(card.id)) : []"
          :pie-data="card.kind === 'pie' ? chartPieData(card.id) : []"
          :show-values="showValues"
          :data-indicator-card="card.id"
        />
      </div>
    </section>

    <!-- ===== PANORAMA ATUAL ===== -->
    <section class="mt-8 rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
      <div class="mb-4">
        <h2 class="text-sm font-bold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">Panorama atual</h2>
        <span class="text-xs text-zinc-400 dark:text-zinc-400">Último valor por indicador</span>
      </div>
      <BarChart :data="panorama" />
    </section>

    <!-- ===== LANÇAMENTOS ===== -->
    <section class="mt-8 rounded-2xl border border-zinc-200 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
      <div class="flex flex-wrap items-center justify-between gap-3 border-b border-zinc-100 p-5 dark:border-zinc-800">
        <div>
          <h2 class="text-sm font-bold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">Lançamentos recentes</h2>
          <p class="text-xs text-zinc-400 dark:text-zinc-400">Todos os registros cadastrados e calculados</p>
        </div>
        <div class="flex items-center gap-2">
          <div class="flex items-center gap-2">
            <input v-model="df.start" type="date" class="input-sm" aria-label="Data início" />
            <input v-model="df.end" type="date" class="input-sm" aria-label="Data fim" />
            <button type="button" class="icon-btn-sm" aria-label="Redefinir filtro para o mês atual" title="Redefinir filtro para o mês atual" @click="resetDateFilter">↺</button>
          </div>
          <input v-model="tableSearch" type="search" class="input-sm" placeholder="Buscar lançamento..." aria-label="Buscar lançamento" />
          <button v-if="canEdit" type="button" class="btn-ghost-sm" @click="handleClearAll">Limpar tudo</button>
        </div>
      </div>

      <div v-if="tableRows.length" class="max-h-[400px] overflow-auto">
        <table class="w-full text-left text-sm">
          <thead class="sticky top-0 z-10 bg-white dark:bg-zinc-900">
            <tr class="border-b border-zinc-100 text-xs uppercase tracking-wide text-zinc-400 dark:border-zinc-800 dark:text-zinc-400">
              <th class="px-5 py-3 font-semibold">Data</th>
              <th class="px-5 py-3 font-semibold">Indicador</th>
              <th class="px-5 py-3 font-semibold">Valor</th>
              <th v-if="canEdit" class="px-5 py-3"></th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="{ entry, ind } in tableRows" :key="entry.id" class="border-b border-zinc-100 last:border-0 dark:border-zinc-800">
              <td class="px-5 py-3 text-zinc-700 dark:text-zinc-300">{{ formatDate(entry.date) }}</td>
              <td class="px-5 py-3"><Badge>{{ ind.name }}</Badge></td>
              <td class="px-5 py-3 font-medium text-zinc-900 dark:text-zinc-100">{{ formatEntryValue(ind, entry) }}</td>
              <td v-if="canEdit" class="px-5 py-3 text-right">
                <button
                  type="button"
                  class="icon-btn-sm"
                  aria-label="Excluir lançamento"
                  @click="removeEntryRow(ind.id, entry.id)"
                >
                  &times;
                </button>
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

    <LaunchModal v-if="launchOpen" :open="launchOpen" @close="closeLaunch" @saved="onSaved" />
    <PresentationModal v-if="presentationOpen" :open="presentationOpen" @close="presentationOpen = false" />
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
:global(.dark) .btn-ghost-sm {
  color: rgb(228 228 231);
}
:global(.dark) .btn-ghost-sm:hover {
  background-color: rgb(39 39 42);
}
</style>
