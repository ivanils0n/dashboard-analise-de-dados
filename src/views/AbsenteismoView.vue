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
import { hydrateState, warmApi } from "@/lib/db";
import { beginLoading, endLoading } from "@/composables/useLoading";
import { monthYm } from "@/lib/utils";
import { useMonthOcorrencias } from "@/lib/absenteismo";

/* Altura fixa (tela toda): quem rola é a tabela do mapa (ou a área dos gráficos), nunca a
   página — assim o toque no celular não disputa rolagem com a página. 7rem = cabeçalho do
   celular + margens do layout; a partir de md a barra lateral substitui o cabeçalho.
   Não colocar comentário HTML antes da raiz do template: vira fragmento e quebra o
   KeepAlive/Transition do layout (tela em branco ao sair da página). */
const { state: filters } = useFilters();

const ym = computed(() => (dateFilter.start ? String(dateFilter.end || dateFilter.start).slice(0, 7) : monthYm(0)));
const ocorrencias = useMonthOcorrencias(ym, () => filters.current);

const tab = ref("mapa");

onActivated(() => {
  warmApi();
  beginLoading("Carregando absenteísmo...");
  hydrateState(filters.current)
    .catch(() => {})
    .finally(endLoading);
});
</script>

<template>
  <div class="flex h-[calc(100dvh-7rem)] w-full flex-col gap-3 md:h-[calc(100dvh-4.5rem)]">
    <div class="flex flex-wrap items-end justify-between gap-2 sm:gap-3">
      <div>
        <h1 class="text-base font-bold text-zinc-900 sm:text-xl dark:text-zinc-100">Mapa de Absenteísmo</h1>
        <p class="hidden text-xs text-zinc-400 sm:block dark:text-zinc-500">Controle de frequência</p>
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
        <div class="mb-3 md:hidden"><AbsenteismoKpis :ocorrencias="ocorrencias" /></div>
        <AbsenteismoGraficos :ocorrencias="ocorrencias" />
      </div>
    </template>

    <div class="hidden shrink-0 md:block"><AbsenteismoKpis :ocorrencias="ocorrencias" /></div>
  </div>
</template>
