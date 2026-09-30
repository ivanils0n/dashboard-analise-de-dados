<script setup>
import { computed, ref } from "vue";
import BarChart from "@/components/charts/BarChart.vue";
import PieChart from "@/components/charts/PieChart.vue";
import { TIPOS, countBy } from "@/lib/absenteismo";
import { STATE_NAMES } from "@/lib/config";

/* Gráficos do mapa de absenteísmo (mês e estado filtrados): ocorrências por
   colaborador, ranking por filial, motivos e estados. */
const props = defineProps({
  ocorrencias: { type: Array, default: () => [] }
});

const MAX_FILIAIS = 12;

const motivoColaborador = ref("");
const motivoFilial = ref("");

const only = (tipo) => {
  const t = TIPOS.find((x) => x.value === tipo);
  return t ? props.ocorrencias.filter((o) => t.has(o)) : props.ocorrencias;
};

/* Nomes longos são abreviados com reticências para caberem no eixo do gráfico. */
const shortName = (name) => (name.length > 22 ? `${name.slice(0, 21).trimEnd()}…` : name);
const porColaborador = computed(() =>
  countBy(only(motivoColaborador.value), (o) => o.colaborador).map((d) => ({ ...d, label: shortName(d.label) }))
);

const porFilial = computed(() => countBy(only(motivoFilial.value), (o) => o.filial).slice(0, MAX_FILIAIS));

const porMotivo = computed(() =>
  TIPOS.map((t) => ({
    label: t.label,
    value: props.ocorrencias.filter((o) => t.has(o)).length,
    color: t.hex
  })).filter((d) => d.value > 0)
);

const porEstado = computed(() =>
  countBy(props.ocorrencias, (o) => o.estado).map((d) => ({ ...d, label: STATE_NAMES[d.label] || d.label }))
);

const selectCls =
  "h-8 rounded-lg border border-zinc-200 bg-zinc-50 px-2 text-xs font-medium text-zinc-700 outline-none transition focus:border-accent focus:ring-2 focus:ring-accent/20 dark:border-zinc-700/70 dark:bg-zinc-800/50 dark:text-zinc-200 dark:[color-scheme:dark]";
const cardCls = "rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900";
const titleCls = "text-sm font-semibold text-zinc-800 dark:text-zinc-100";
const hintCls = "text-[11px] text-zinc-400 dark:text-zinc-500";
</script>

<template>
  <div class="grid gap-3 lg:grid-cols-2">
    <section :class="cardCls">
      <header class="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 :class="titleCls">Ocorrências por colaborador</h3>
          <p :class="hintCls">Todos os colaboradores com ocorrências no mês, do maior para o menor</p>
        </div>
        <select v-model="motivoColaborador" :class="selectCls" aria-label="Filtrar ocorrências por colaborador">
          <option value="">Todas as ocorrências</option>
          <option v-for="t in TIPOS" :key="t.value" :value="t.value">{{ t.label }}</option>
        </select>
      </header>
      <BarChart :data="porColaborador" horizontal align-top show-values :show-trend="false" :height-px="380" />
    </section>

    <section :class="cardCls">
      <header class="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 :class="titleCls">Ranking por filial</h3>
          <p :class="hintCls">Total de ocorrências por filial no mês</p>
        </div>
        <select v-model="motivoFilial" :class="selectCls" aria-label="Filtrar ranking por motivo">
          <option value="">Todos os motivos</option>
          <option v-for="t in TIPOS" :key="t.value" :value="t.value">{{ t.label }}</option>
        </select>
      </header>
      <BarChart :data="porFilial" show-values :show-trend="false" :height-px="380" />
    </section>

    <section :class="cardCls">
      <h3 :class="titleCls">Motivos</h3>
      <p :class="[hintCls, 'mb-2']">Participação de cada motivo no total de ocorrências</p>
      <PieChart :data="porMotivo" value-format="count" height="h-64" />
    </section>

    <section :class="cardCls">
      <h3 :class="titleCls">Ocorrências por estado</h3>
      <p :class="[hintCls, 'mb-2']">Distribuição das ocorrências entre os estados</p>
      <PieChart :data="porEstado" value-format="count" height="h-64" />
    </section>
  </div>
</template>
