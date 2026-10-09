<script setup>
import { computed, ref, watch } from "vue";
import GerenteRegionalFilter from "@/components/dashboard/GerenteRegionalFilter.vue";
import Modal from "@/components/ui/Modal.vue";
import PieChart from "@/components/charts/PieChart.vue";
import BarChart from "@/components/charts/BarChart.vue";
import { STATE_NAMES, STATES } from "@/lib/config";
import { getEntriesFor } from "@/lib/store";
import { dateFilter } from "@/composables/useDateFilter";
import { useFilters } from "@/composables/useFilters";
import { formatHoursClock, ymLabel } from "@/lib/utils";

defineProps({
  open: { type: Boolean, default: false }
});

const emit = defineEmits(["close"]);

const { state } = useFilters();

const estadoSel = ref(!state.current || state.current === "todos" ? "todos" : state.current);
const estadoOptions = [{ id: "todos", label: "Todos" }, ...STATES.map((s) => ({ id: s, label: s }))];
const regionalSel = ref("");

const upper = (v, fallback) => String(v || "").trim().toUpperCase() || fallback;

const entriesEstado = computed(() => {
  void state.revision;
  return getEntriesFor("treinamento", estadoSel.value).map((e) => {
    const m = e.meta || {};
    return {
      id: e.id,
      data: String(e.date || "").slice(0, 10),
      colaborador: upper(m.employeeName, "SEM COLABORADOR"),
      cargo: upper(m.cargo, "SEM CARGO"),
      filial: upper(m.filial, "SEM FILIAL"),
      regional: upper(m.gerenteRegional, ""),
      tema: upper(m.tema, "SEM TEMA"),
      modalidade: upper(m.modalidade, "NÃO INFORMADA"),
      horas: Number(e.value) || 0
    };
  });
});

const regionalOptions = computed(() =>
  [...new Set(entriesEstado.value.map((r) => r.regional).filter(Boolean))].sort((a, b) => a.localeCompare(b, "pt-BR"))
);
watch(regionalOptions, (opts) => {
  if (regionalSel.value && !opts.includes(regionalSel.value)) regionalSel.value = "";
});

const inRange = (r, start, end) => !(start && r.data < start) && !(end && r.data > end);
const porRegional = (list) => (regionalSel.value ? list.filter((r) => r.regional === regionalSel.value) : list);

const rows = computed(() => porRegional(entriesEstado.value.filter((r) => inRange(r, dateFilter.start, dateFilter.end))));

const prevRange = computed(() => {
  if (!dateFilter.start) return null;
  const [y, m] = String(dateFilter.start).slice(0, 7).split("-").map(Number);
  if (!y || !m) return null;
  const d = new Date(y, m - 2, 1);
  const ym = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  return { start: `${ym}-01`, end: `${ym}-31` };
});
const prevRows = computed(() =>
  prevRange.value ? porRegional(entriesEstado.value.filter((r) => inRange(r, prevRange.value.start, prevRange.value.end))) : null
);

const escopo = computed(() => {
  const st = estadoSel.value;
  return !st || st === "todos" ? "Todos os estados" : STATE_NAMES[st] || st;
});
const periodo = computed(() =>
  dateFilter.start ? ymLabel(String(dateFilter.end || dateFilter.start).slice(0, 7)) : "Todo o período"
);

const somaHoras = (list) => list.reduce((s, r) => s + r.horas, 0);
const totalHoras = computed(() => somaHoras(rows.value));
const colaboradores = computed(() => new Set(rows.value.map((r) => r.colaborador)).size);

function groupBy(keyOf, list = rows.value) {
  const map = new Map();
  list.forEach((r) => {
    const k = keyOf(r);
    const g = map.get(k) || { label: k, horas: 0, treinamentos: 0, nomes: new Set() };
    g.horas += r.horas;
    g.treinamentos += 1;
    g.nomes.add(r.colaborador);
    map.set(k, g);
  });
  return [...map.values()]
    .map(({ nomes, ...g }) => ({ ...g, colaboradores: nomes.size }))
    .sort((a, b) => b.horas - a.horas || a.label.localeCompare(b.label, "pt-BR"));
}

const modalidadeRows = computed(() => groupBy((r) => r.modalidade));
const temaRows = computed(() => groupBy((r) => r.tema));
const cargoRows = computed(() => groupBy((r) => r.cargo));

const modalidadeData = computed(() => modalidadeRows.value.map((r) => ({ label: r.label, value: r.treinamentos })));
const barOf = (list) => list.map((r) => ({ label: r.label, value: r.horas, tooltipValue: formatHoursClock(r.horas) }));
const temaData = computed(() => barOf(temaRows.value));
const cargoData = computed(() => barOf(cargoRows.value));

const filialRows = computed(() => {
  const prev = prevRows.value ? new Map(groupBy((r) => r.filial, prevRows.value).map((r) => [r.label, r])) : null;
  return groupBy((r) => r.filial).map((r) => {
    const before = prev && prev.get(r.label);
    return { ...r, delta: before ? r.horas - before.horas : null };
  });
});
const filialData = computed(() => barOf(filialRows.value));

const fmtH = formatHoursClock;
const fmtDeltaH = (d) => `${d > 0 ? "+" : d < 0 ? "-" : ""}${formatHoursClock(Math.abs(d))} h`;

const INSIGHT_DOT = { red: "bg-red-500", amber: "bg-amber-500", green: "bg-green-500", zinc: "bg-zinc-400" };

const insights = computed(() => {
  const list = [];
  if (!rows.value.length) return list;
  const topFilial = filialRows.value[0];
  list.push({
    tone: "zinc",
    text: `${topFilial.label} concentra ${((topFilial.horas / totalHoras.value) * 100).toFixed(1).replace(".", ",")}% das horas (${fmtH(topFilial.horas)} de ${fmtH(totalHoras.value)}).`
  });
  const topTema = temaRows.value[0];
  list.push({ tone: "zinc", text: `Tema mais frequente em horas: ${topTema.label} (${fmtH(topTema.horas)}).` });
  if (prevRows.value) {
    const antes = somaHoras(prevRows.value);
    if (antes > 0) {
      const delta = totalHoras.value - antes;
      list.push({
        tone: delta >= 0 ? "green" : "amber",
        text: `${delta >= 0 ? "Aumento" : "Queda"} de ${fmtDeltaH(delta)} contra o mês anterior (${fmtH(antes)} h).`
      });
    }
  }
  const semHoras = rows.value.filter((r) => r.horas <= 0).length;
  if (semHoras) list.push({ tone: "red", text: `${semHoras} ${semHoras === 1 ? "lançamento sem" : "lançamentos sem"} carga horária.` });
  return list;
});

const lancamentos = computed(() =>
  rows.value.slice().sort((a, b) => b.data.localeCompare(a.data) || a.colaborador.localeCompare(b.colaborador, "pt-BR"))
);

const totals = computed(() => [
  { label: "Total de horas", value: fmtH(totalHoras.value), sub: "Carga horária no período" },
  { label: "Treinamentos", value: String(rows.value.length), sub: "Lançamentos no período" },
  { label: "Colaboradores", value: String(colaboradores.value), sub: "Colaboradores treinados" },
  {
    label: "Média por colaborador",
    value: colaboradores.value ? fmtH(totalHoras.value / colaboradores.value) : "—",
    sub: "Horas por colaborador"
  }
]);

const tables = computed(() => [
  { title: "Por filial", col: "Filial", rows: filialRows.value, delta: true },
  { title: "Por tema", col: "Tema", rows: temaRows.value },
  { title: "Por cargo", col: "Cargo", rows: cargoRows.value }
]);
</script>

<template>
  <Modal title="Análise de Treinamento" :subtitle="`${escopo} · ${periodo}`" :open="open" fullscreen @close="emit('close')">
    <template #actions>
      <div class="flex flex-wrap items-center gap-2">
        <GerenteRegionalFilter
          v-model="regionalSel"
          :options="regionalOptions"
          label="Regional"
          all-label="Todas as regionais"
          title="Filtrar por regional"
        />
        <div class="inline-flex rounded-xl border border-zinc-200 bg-zinc-50 p-1 dark:border-zinc-700 dark:bg-zinc-800" role="group" aria-label="Filtrar por estado">
          <button
            v-for="o in estadoOptions"
            :key="o.id"
            type="button"
            class="rounded-lg px-3 py-1 text-sm font-semibold transition sm:px-4"
            :class="estadoSel === o.id
              ? 'bg-accent text-white shadow-sm'
              : 'text-zinc-600 hover:bg-zinc-200/70 dark:text-zinc-300 dark:hover:bg-zinc-700'"
            :aria-pressed="estadoSel === o.id"
            @click="estadoSel = o.id"
          >
            {{ o.label }}
          </button>
        </div>
      </div>
    </template>
    <div class="-m-3 min-h-full bg-zinc-50 p-3 sm:-m-6 sm:p-6 dark:bg-zinc-950/60">
      <div class="mx-auto flex max-w-[110rem] flex-col gap-6">
        <div class="grid grid-cols-2 gap-3 md:grid-cols-4">
          <div
            v-for="t in totals"
            :key="t.label"
            class="relative overflow-hidden rounded-2xl border border-zinc-200 bg-white p-5 text-center shadow-sm dark:border-zinc-800 dark:bg-zinc-900"
          >
            <p class="text-[11px] font-semibold uppercase tracking-widest text-zinc-500 dark:text-zinc-400">{{ t.label }}</p>
            <p class="mt-1.5 text-4xl font-bold leading-none tabular-nums text-zinc-900 dark:text-zinc-100">{{ t.value }}</p>
            <p class="mt-2 text-xs text-zinc-500 dark:text-zinc-400">{{ t.sub }}</p>
          </div>
        </div>

        <p v-if="!rows.length" class="rounded-2xl border border-zinc-200 bg-white px-5 py-10 text-center text-sm text-zinc-500 shadow-sm dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-400">
          Nenhum treinamento lançado para o período e os filtros selecionados.
        </p>

        <template v-else>
          <div class="grid gap-5 lg:grid-cols-3">
            <section class="overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
              <header class="border-b border-zinc-100 px-5 py-3.5 dark:border-zinc-800">
                <h3 class="text-sm font-bold text-zinc-900 dark:text-zinc-100">Por modalidade</h3>
                <p class="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">Quantidade de treinamentos</p>
              </header>
              <div class="p-4">
                <PieChart
                  :data="modalidadeData"
                  height="h-72"
                  :center-value="String(rows.length)"
                  center-caption="Treinamentos"
                  value-format="count"
                />
              </div>
            </section>

            <section class="overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-900 lg:col-span-2">
              <header class="border-b border-zinc-100 px-5 py-3.5 dark:border-zinc-800">
                <h3 class="text-sm font-bold text-zinc-900 dark:text-zinc-100">Por tema</h3>
                <p class="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">Horas de treinamento por tema</p>
              </header>
              <div class="p-4">
                <BarChart :data="temaData" show-values value-format="hours" :show-trend="false" horizontal align-top :height-px="288" />
              </div>
            </section>
          </div>

          <section class="overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
            <header class="border-b border-zinc-100 px-5 py-3.5 dark:border-zinc-800">
              <h3 class="text-sm font-bold text-zinc-900 dark:text-zinc-100">Por filial</h3>
              <p class="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">Horas de treinamento por filial, da maior para a menor</p>
            </header>
            <div class="grid gap-5 p-4 lg:grid-cols-3">
              <ul class="flex flex-col gap-3 lg:col-span-1">
                <li
                  v-for="(i, idx) in insights"
                  :key="idx"
                  class="flex items-start gap-3 rounded-xl border border-zinc-100 bg-zinc-50 px-4 py-3 text-sm text-zinc-700 dark:border-zinc-800 dark:bg-zinc-800/50 dark:text-zinc-200"
                >
                  <span class="mt-1.5 h-2 w-2 shrink-0 rounded-full" :class="INSIGHT_DOT[i.tone]" />
                  <span>{{ i.text }}</span>
                </li>
              </ul>
              <div class="lg:col-span-2">
                <BarChart :data="filialData" show-values value-format="hours" :show-trend="false" horizontal align-top :height-px="360" />
              </div>
            </div>
          </section>

          <section class="overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
            <header class="border-b border-zinc-100 px-5 py-3.5 dark:border-zinc-800">
              <h3 class="text-sm font-bold text-zinc-900 dark:text-zinc-100">Por cargo</h3>
              <p class="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">Horas de treinamento por cargo</p>
            </header>
            <div class="p-4">
              <BarChart :data="cargoData" show-values value-format="hours" :show-trend="false" horizontal align-top :height-px="360" />
            </div>
          </section>

          <div class="grid items-start gap-5 xl:grid-cols-2">
            <section
              v-for="t in tables"
              :key="t.title"
              class="overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-900"
            >
              <header class="border-b border-zinc-100 px-5 py-3.5 dark:border-zinc-800">
                <h3 class="text-sm font-bold text-zinc-900 dark:text-zinc-100">Detalhamento {{ t.title.toLowerCase() }}</h3>
              </header>
              <div class="max-h-[32rem] overflow-auto">
                <table class="w-full min-w-max text-left text-sm">
                  <thead class="sticky top-0 z-10 bg-zinc-50 dark:bg-zinc-800">
                    <tr class="text-[11px] uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
                      <th class="px-5 py-2.5 font-semibold">{{ t.col }}</th>
                      <th class="px-4 py-2.5 text-right font-semibold">Treinamentos</th>
                      <th class="px-4 py-2.5 text-right font-semibold">Colaboradores</th>
                      <th class="px-4 py-2.5 text-right font-semibold">Horas</th>
                      <th v-if="t.delta" class="px-5 py-2.5 text-right font-semibold">Vs mês anterior</th>
                    </tr>
                  </thead>
                  <tbody class="uppercase">
                    <tr
                      v-for="r in t.rows"
                      :key="r.label"
                      class="border-t border-zinc-100 transition-colors hover:bg-zinc-50 dark:border-zinc-800 dark:hover:bg-zinc-800/50"
                    >
                      <td class="whitespace-nowrap px-5 py-2.5 font-medium text-zinc-900 dark:text-zinc-100">{{ r.label }}</td>
                      <td class="px-4 py-2.5 text-right tabular-nums text-zinc-600 dark:text-zinc-300">{{ r.treinamentos }}</td>
                      <td class="px-4 py-2.5 text-right tabular-nums text-zinc-600 dark:text-zinc-300">{{ r.colaboradores }}</td>
                      <td class="px-4 py-2.5 text-right font-bold tabular-nums text-zinc-900 dark:text-zinc-100">{{ fmtH(r.horas) }}</td>
                      <td
                        v-if="t.delta"
                        class="whitespace-nowrap px-5 py-2.5 text-right font-semibold tabular-nums"
                        :class="r.delta === null ? 'text-zinc-400' : r.delta > 0 ? 'text-green-600 dark:text-green-400' : r.delta < 0 ? 'text-red-600 dark:text-red-400' : 'text-zinc-500'"
                      >
                        <template v-if="r.delta === null">—</template>
                        <template v-else>{{ r.delta > 0 ? "▲" : r.delta < 0 ? "▼" : "•" }} {{ fmtDeltaH(r.delta) }}</template>
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </section>

            <section class="overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
              <header class="border-b border-zinc-100 px-5 py-3.5 dark:border-zinc-800">
                <h3 class="text-sm font-bold text-zinc-900 dark:text-zinc-100">Lançamentos</h3>
              </header>
              <div class="max-h-[32rem] overflow-auto">
                <table class="w-full min-w-max text-left text-sm">
                  <thead class="sticky top-0 z-10 bg-zinc-50 dark:bg-zinc-800">
                    <tr class="text-[11px] uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
                      <th class="px-5 py-2.5 font-semibold">Colaborador</th>
                      <th class="px-4 py-2.5 font-semibold">Filial</th>
                      <th class="px-4 py-2.5 font-semibold">Tema</th>
                      <th class="px-4 py-2.5 font-semibold">Modalidade</th>
                      <th class="px-5 py-2.5 text-right font-semibold">Carga horária</th>
                    </tr>
                  </thead>
                  <tbody class="uppercase">
                    <tr
                      v-for="l in lancamentos"
                      :key="l.id"
                      class="border-t border-zinc-100 transition-colors hover:bg-zinc-50 dark:border-zinc-800 dark:hover:bg-zinc-800/50"
                    >
                      <td class="whitespace-nowrap px-5 py-2.5 font-medium text-zinc-900 dark:text-zinc-100">{{ l.colaborador }}</td>
                      <td class="whitespace-nowrap px-4 py-2.5 text-zinc-600 dark:text-zinc-300">{{ l.filial }}</td>
                      <td class="max-w-[18rem] truncate px-4 py-2.5 text-zinc-600 dark:text-zinc-300" :title="l.tema">{{ l.tema }}</td>
                      <td class="whitespace-nowrap px-4 py-2.5 text-zinc-600 dark:text-zinc-300">{{ l.modalidade }}</td>
                      <td class="whitespace-nowrap px-5 py-2.5 text-right font-bold tabular-nums text-zinc-900 dark:text-zinc-100">{{ fmtH(l.horas) }}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </section>
          </div>
        </template>

        <p class="border-t border-zinc-200 pt-4 text-center text-xs text-zinc-400 dark:border-zinc-800 dark:text-zinc-500">
          Horas = soma da carga horária dos lançamentos de treinamento no período filtrado · Média por colaborador = total de horas ÷ colaboradores distintos.
        </p>
      </div>
    </div>
  </Modal>
</template>
