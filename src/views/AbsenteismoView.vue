<script setup>
import { computed, onActivated, ref } from "vue";
import AbsenteismoMapa from "@/components/dashboard/AbsenteismoMapa.vue";
import AbsenteismoKpis from "@/components/dashboard/AbsenteismoKpis.vue";
import AbsenteismoTabs from "@/components/dashboard/AbsenteismoTabs.vue";
import AbsenteismoGraficos from "@/components/dashboard/AbsenteismoGraficos.vue";
import DateRangeFilter from "@/components/dashboard/DateRangeFilter.vue";
import StateFilter from "@/components/layout/StateFilter.vue";
import { useFilters } from "@/composables/useFilters";
import { dateFilter } from "@/composables/useDateFilter";
import { hydrateState } from "@/lib/db";
import { beginLoading, endLoading } from "@/composables/useLoading";
import { monthYm } from "@/lib/utils";
import { useMonthOcorrencias } from "@/lib/absenteismo";

/* Página do Mapa de Absenteísmo: colaboradores do Headcount no mês filtrado
   (mesmo filtro de período do dashboard) x dias do mês, com o lançamento da
   ocorrência de cada dia; os KPIs ficam abaixo, e a aba Gráficos mostra as
   ocorrências do mês. */
const { state: filters } = useFilters();

const ym = computed(() => (dateFilter.start ? String(dateFilter.end || dateFilter.start).slice(0, 7) : monthYm(0)));
const ocorrencias = useMonthOcorrencias(ym, () => filters.current);

const tab = ref("mapa");

onActivated(() => {
  beginLoading("Carregando absenteísmo...");
  hydrateState(filters.current)
    .catch(() => {})
    .finally(endLoading);
});
</script>

<template>
  <div class="flex h-[calc(100dvh-8rem)] w-full flex-col gap-3 md:h-[calc(100dvh-4.5rem)]">
    <div class="flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 class="text-lg font-bold text-zinc-900 sm:text-xl dark:text-zinc-100">Mapa de Absenteísmo</h1>
        <p class="text-xs text-zinc-400 dark:text-zinc-500">Controle de frequência</p>
      </div>
      <div class="flex flex-wrap items-center gap-2">
        <DateRangeFilter :range="dateFilter" title="Período" />
        <StateFilter variant="page" />
      </div>
    </div>

    <AbsenteismoMapa v-show="tab === 'mapa'" class="min-h-0 flex-1" :estado="filters.current" :ym="ym">
      <template #after-filters>
        <AbsenteismoTabs v-model="tab" />
      </template>
    </AbsenteismoMapa>
    <template v-if="tab === 'graficos'">
      <AbsenteismoTabs v-model="tab" />
      <div class="min-h-0 flex-1 overflow-y-auto pb-2">
        <AbsenteismoGraficos :ocorrencias="ocorrencias" />
      </div>
    </template>

    <AbsenteismoKpis :ocorrencias="ocorrencias" />
  </div>
</template>
