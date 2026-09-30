<script setup>
import { computed } from "vue";
import Modal from "@/components/ui/Modal.vue";
import AbsenteismoKpis from "@/components/dashboard/AbsenteismoKpis.vue";
import AbsenteismoGraficos from "@/components/dashboard/AbsenteismoGraficos.vue";
import { dateFilter } from "@/composables/useDateFilter";
import { monthYm, ymLabel } from "@/lib/utils";
import { useMonthOcorrencias } from "@/lib/absenteismo";
import { STATE_NAMES } from "@/lib/config";

/* Informações de absenteísmo (clique direito no KPI): KPIs e gráficos das
   ocorrências do mês e do estado filtrados no dashboard. O lançamento por dia
   fica na página do Mapa de Absenteísmo. */
const props = defineProps({
  open: { type: Boolean, default: false },
  estado: { type: String, default: "todos" }
});
const emit = defineEmits(["close"]);

const ym = computed(() => (dateFilter.start ? String(dateFilter.end || dateFilter.start).slice(0, 7) : monthYm(0)));
const ocorrencias = useMonthOcorrencias(ym, () => props.estado);

const subtitle = computed(() => {
  const uf = String(props.estado || "").toUpperCase();
  const state = !uf || uf === "TODOS" ? "Todos os estados" : STATE_NAMES[uf] || uf;
  return `${ymLabel(ym.value)} · ${state}`;
});
</script>

<template>
  <Modal title="Absenteísmo" :subtitle="subtitle" :open="open" max-width="max-w-6xl" @close="emit('close')">
    <div class="flex flex-col gap-4">
      <AbsenteismoKpis :ocorrencias="ocorrencias" class="lg:!w-full lg:!min-w-0" />
      <AbsenteismoGraficos :ocorrencias="ocorrencias" />
    </div>
  </Modal>
</template>
