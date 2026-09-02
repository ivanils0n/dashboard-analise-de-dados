<script setup>
import { ref, reactive, computed, watch, onMounted } from "vue";
import Modal from "@/components/ui/Modal.vue";
import LineChart from "@/components/charts/LineChart.vue";
import PieChart from "@/components/charts/PieChart.vue";
import AbsenteismoBar from "@/components/charts/AbsenteismoBar.vue";
import DateRangeFilter from "@/components/dashboard/DateRangeFilter.vue";
import { INDICATORS, getIndicatorById } from "@/lib/config";
import { getEntriesFor } from "@/lib/store";
import { firstDayOfMonthISO, lastDayOfMonthISO } from "@/lib/utils";
import { useFilters } from "@/composables/useFilters";

const props = defineProps({ open: { type: Boolean, default: false } });
const emit = defineEmits(["close"]);

const { state: filters } = useFilters();

const slides = computed(() => {
  const out = [];
  INDICATORS.forEach((ind) => {
    if (ind.id === "turnover_entradas") out.push({ type: "pie" });
    else if (ind.id === "absenteismo") out.push({ type: "bar", ind });
    else if (ind.id !== "turnover_saidas") out.push({ type: "line", ind });
  });
  return out;
});

const index = ref(0);
const showValues = ref(false);
const range = reactive({ start: firstDayOfMonthISO(), end: lastDayOfMonthISO() });

const slide = computed(() => slides.value[index.value] || { type: "line", ind: INDICATORS[0] });

function reset() {
  index.value = 0;
  showValues.value = false;
  range.start = firstDayOfMonthISO();
  range.end = lastDayOfMonthISO();
}

watch(
  () => props.open,
  (open) => {
    if (open) reset();
  }
);

onMounted(reset);

function filteredEntriesFor(ind) {
  return getEntriesFor(ind.id, filters.current).filter((e) => {
    if (range.start && e.date < range.start) return false;
    if (range.end && e.date > range.end) return false;
    return true;
  });
}

function pieData() {
  const latest = (id) => {
    const list = filteredEntriesFor(getIndicatorById(id));
    return list.length ? list[list.length - 1].value : 0;
  };
  return [
    { label: "Entradas", value: latest("turnover_entradas") },
    { label: "Saídas", value: latest("turnover_saidas") }
  ];
}

function barData() {
  const totals = { falta: 0, atraso: 0, afastamento: 0 };
  filteredEntriesFor(getIndicatorById("absenteismo")).forEach((e) => {
    const type = e.meta && e.meta.type;
    if (type in totals) totals[type] += e.value || 0;
  });
  return [
    { label: "Falta", value: totals.falta },
    { label: "Atestado", value: totals.atraso },
    { label: "Acidente", value: totals.afastamento }
  ];
}

function nav(delta) {
  const total = slides.value.length || 1;
  index.value = (index.value + delta + total) % total;
}

const slideTitle = computed(() => {
  if (slide.value.type === "pie") return "Turnover — Entradas vs Saídas";
  return slide.value.ind ? slide.value.ind.name : "";
});

const slideSub = computed(() => {
  if (slide.value.type === "pie") return "Distribuição no período";
  return "Período selecionado";
});
</script>

<template>
  <Modal
    :title="slideTitle"
    :subtitle="slideSub"
    fullscreen
    :open="open"
    @close="emit('close')"
  >
    <div class="flex h-full flex-col gap-4">
        <div class="flex flex-wrap items-center gap-3">
          <DateRangeFilter :range="range" title="Período" align="left" />
          <div class="ml-auto flex items-center gap-2">
          <button type="button" class="icon-btn" aria-label="Indicador anterior" @click="nav(-1)">‹</button>
          <span class="min-w-[140px] text-center text-sm font-semibold text-zinc-700 dark:text-zinc-200">
            {{ index + 1 }} / {{ slides.length }}
          </span>
          <button type="button" class="icon-btn" aria-label="Próximo indicador" @click="nav(1)">›</button>
        </div>
        <label class="flex items-center gap-2 text-sm text-zinc-700 dark:text-zinc-200">
          <input v-model="showValues" type="checkbox" class="h-4 w-4 accent-red-500" />
          Mostrar valores
        </label>
      </div>

      <div class="flex flex-1 items-center">
        <PieChart v-if="slide.type === 'pie'" class="w-full" :data="pieData()" :show-values="showValues" height="h-[60vh]" />
        <AbsenteismoBar v-else-if="slide.type === 'bar'" class="w-full" :data="barData()" :show-values="showValues" height="h-[60vh]" />
        <LineChart v-else class="w-full" :indicator="slide.ind" :entries="filteredEntriesFor(slide.ind)" :show-values="showValues" height="h-[60vh]" />
      </div>
    </div>
  </Modal>
</template>

<style scoped>
.icon-btn {
  display: flex;
  height: 2rem;
  width: 2rem;
  align-items: center;
  justify-content: center;
  border-radius: 0.5rem;
  border: 1px solid rgb(212 212 216);
  font-size: 1.25rem;
  color: rgb(63 63 70);
  transition: background-color 0.15s;
}
.icon-btn:hover {
  background-color: rgb(244 244 245);
}
:global(.dark) .icon-btn {
  border-color: rgb(63 63 70);
  color: rgb(228 228 231);
}
:global(.dark) .icon-btn:hover {
  background-color: rgb(39 39 42);
  color: rgb(244 244 245);
}
</style>
