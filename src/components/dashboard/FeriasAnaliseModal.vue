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
import { filialDisplay, formatCurrency, formatDate, ymLabel, ymShortLabel } from "@/lib/utils";

defineProps({
  open: { type: Boolean, default: false }
});

const emit = defineEmits(["close"]);

const { state } = useFilters();

const estadoSel = ref(!state.current || state.current === "todos" ? "todos" : state.current);
const estadoOptions = [{ id: "todos", label: "Todos" }, ...STATES.map((s) => ({ id: s, label: s }))];
const regionalSel = ref("");

const upper = (v, fallback) => String(v || "").trim().toUpperCase() || fallback;

function toRow(e) {
  const m = e.meta || {};
  return {
    id: e.id,
    data: String(e.date || "").slice(0, 10),
    mes: String(e.date || "").slice(0, 7),
    colaborador: upper(m.employeeName, "SEM COLABORADOR"),
    codigo: String(m.codigo || ""),
    filial: upper(filialDisplay(m.filial, m.estado), "SEM FILIAL"),
    regional: upper(m.regional, "SEM REGIONAL"),
    banco: upper(m.banco, "NÃO INFORMADO"),
    pagamento: m.dataPagto || "",
    estado: upper(m.estado, ""),
    valor: Number(e.value) || 0
  };
}

const entriesEstado = computed(() => {
  void state.revision;
  return getEntriesFor("ferias", estadoSel.value).map(toRow);
});

const entriesTodos = computed(() => {
  void state.revision;
  return getEntriesFor("ferias", "todos").map(toRow);
});

const regionalOptions = computed(() =>
  [...new Set(entriesEstado.value.map((r) => r.regional))].sort((a, b) => a.localeCompare(b, "pt-BR"))
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

const soma = (list) => list.reduce((s, r) => s + r.valor, 0);
const colabKey = (r) => `${r.codigo}|${r.colaborador}`;
const totalValor = computed(() => soma(rows.value));
const colaboradores = computed(() => new Set(rows.value.map(colabKey)).size);

function groupBy(keyOf, list = rows.value) {
  const map = new Map();
  list.forEach((r) => {
    const k = keyOf(r);
    const g = map.get(k) || { label: k, valor: 0, pagamentos: 0, nomes: new Set() };
    g.valor += r.valor;
    g.pagamentos += 1;
    g.nomes.add(colabKey(r));
    map.set(k, g);
  });
  return [...map.values()]
    .map(({ nomes, ...g }) => ({ ...g, colaboradores: nomes.size, media: g.pagamentos ? g.valor / g.pagamentos : 0 }))
    .sort((a, b) => b.valor - a.valor || a.label.localeCompare(b.label, "pt-BR"));
}

const regionalRows = computed(() => groupBy((r) => r.regional));
const bancoRows = computed(() => groupBy((r) => r.banco));
const colaboradorRows = computed(() => groupBy((r) => r.colaborador));

const filialRows = computed(() => {
  const prev = prevRows.value ? new Map(groupBy((r) => r.filial, prevRows.value).map((r) => [r.label, r])) : null;
  return groupBy((r) => r.filial).map((r) => {
    const before = prev && prev.get(r.label);
    return { ...r, delta: before ? r.valor - before.valor : null };
  });
});

const barOf = (list) =>
  list.map((r) => ({
    label: r.label,
    value: r.valor,
    tooltipValue: `${formatCurrency(r.valor)} · ${r.colaboradores} ${r.colaboradores === 1 ? "colaborador" : "colaboradores"}`
  }));
const regionalData = computed(() => barOf(regionalRows.value));
const filialData = computed(() => barOf(filialRows.value));
const colaboradorData = computed(() => barOf(colaboradorRows.value.slice(0, 15)));
const bancoData = computed(() => bancoRows.value.map((r) => ({ label: r.label, value: r.valor })));

const fmtDelta = (d) => `${d > 0 ? "+" : d < 0 ? "-" : ""}${formatCurrency(Math.abs(d))}`;
const fmtPct = (v) => `${v.toFixed(1).replace(".", ",")}%`;

const INSIGHT_DOT = { red: "bg-red-500", amber: "bg-amber-500", green: "bg-green-500", zinc: "bg-zinc-400" };

const insights = computed(() => {
  const list = [];
  if (!rows.value.length || totalValor.value <= 0) return list;
  const topFilial = filialRows.value[0];
  list.push({
    tone: "zinc",
    text: `${topFilial.label} concentra ${fmtPct((topFilial.valor / totalValor.value) * 100)} do valor (${formatCurrency(topFilial.valor)} de ${formatCurrency(totalValor.value)}).`
  });
  const topRegional = regionalRows.value[0];
  list.push({
    tone: "zinc",
    text: `Regional com maior gasto: ${topRegional.label} (${formatCurrency(topRegional.valor)}).`
  });
  if (prevRows.value) {
    const antes = soma(prevRows.value);
    if (antes > 0) {
      const delta = totalValor.value - antes;
      list.push({
        tone: delta > 0 ? "amber" : "green",
        text: `${delta >= 0 ? "Aumento" : "Queda"} de ${formatCurrency(Math.abs(delta))} (${fmtPct((Math.abs(delta) / antes) * 100)}) contra o mês anterior (${formatCurrency(antes)}).`
      });
    }
  }
  const topColab = colaboradorRows.value[0];
  list.push({ tone: "zinc", text: `Maior pagamento acumulado: ${topColab.label} (${formatCurrency(topColab.valor)}).` });
  return list;
});

const lancamentos = computed(() =>
  rows.value.slice().sort((a, b) => b.data.localeCompare(a.data) || a.colaborador.localeCompare(b.colaborador, "pt-BR"))
);

const totals = computed(() => [
  { label: "Total de férias", value: formatCurrency(totalValor.value), sub: "Valor pago no período" },
  { label: "Pagamentos", value: String(rows.value.length), sub: "Lançamentos no período" },
  { label: "Colaboradores", value: String(colaboradores.value), sub: "Colaboradores com férias pagas" },
  {
    label: "Média por colaborador",
    value: colaboradores.value ? formatCurrency(totalValor.value / colaboradores.value) : "—",
    sub: "Valor por colaborador"
  }
]);

const UF_COR = { RO: "#ef4444", AM: "#3b82f6", PA: "#eab308" };

const estadoRows = computed(() => {
  const atual = entriesTodos.value.filter((r) => inRange(r, dateFilter.start, dateFilter.end));
  const antes = prevRange.value ? entriesTodos.value.filter((r) => inRange(r, prevRange.value.start, prevRange.value.end)) : null;
  const total = soma(atual);
  const prevMap = antes ? new Map(groupBy((r) => r.estado, antes).map((r) => [r.label, r])) : null;
  const atualMap = new Map(groupBy((r) => r.estado, atual).map((r) => [r.label, r]));
  return STATES.map((uf) => {
    const g = atualMap.get(uf) || { valor: 0, pagamentos: 0, colaboradores: 0 };
    const anterior = prevMap ? (prevMap.get(uf) || { valor: 0 }).valor : null;
    return {
      uf,
      nome: STATE_NAMES[uf] || uf,
      valor: g.valor,
      colaboradores: g.colaboradores,
      pct: total > 0 ? (g.valor / total) * 100 : 0,
      anterior,
      delta: anterior === null ? null : g.valor - anterior
    };
  });
});

const estadoData = computed(() =>
  estadoRows.value.map((r) => {
    if (r.anterior === null) return { label: r.uf, value: r.valor, barColor: UF_COR[r.uf] };
    return {
      label: r.uf,
      series: [
        { label: "Mês anterior", value: r.anterior, color: "#a1a1aa" },
        { label: periodo.value, value: r.valor, color: "#E8AF3E" }
      ]
    };
  })
);

const tables = computed(() => [
  { title: "Por filial", col: "Filial", rows: filialRows.value, delta: true },
  { title: "Por regional", col: "Regional", rows: regionalRows.value },
  { title: "Por banco", col: "Banco", rows: bancoRows.value }
]);
</script>

<template>
  <Modal title="Análise de Férias" :subtitle="`${escopo} · ${periodo}`" :open="open" fullscreen @close="emit('close')">
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
            <p class="mt-1.5 text-3xl font-bold leading-none tabular-nums text-zinc-900 dark:text-zinc-100">{{ t.value }}</p>
            <p class="mt-2 text-xs text-zinc-500 dark:text-zinc-400">{{ t.sub }}</p>
          </div>
        </div>

        <p v-if="!rows.length" class="rounded-2xl border border-zinc-200 bg-white px-5 py-10 text-center text-sm text-zinc-500 shadow-sm dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-400">
          Nenhum pagamento de férias registrado para o período e os filtros selecionados.
        </p>

        <template v-else>
          <section class="overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
            <header class="border-b border-zinc-100 px-5 py-3.5 dark:border-zinc-800">
              <h3 class="text-sm font-bold text-zinc-900 dark:text-zinc-100">Comparativo por estado</h3>
              <p class="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">
                Valor de férias de cada estado no período{{ prevRange ? ", comparado ao mês anterior" : "" }} · considera todos os estados e regionais
              </p>
            </header>
            <div class="grid gap-5 p-4 lg:grid-cols-3">
              <div class="lg:col-span-2">
                <BarChart :data="estadoData" show-values value-format="currency" :show-trend="false" :height-px="288" />
              </div>
              <ul class="flex flex-col gap-3">
                <li
                  v-for="r in estadoRows"
                  :key="r.uf"
                  class="rounded-xl border px-4 py-3 transition"
                  :class="estadoSel === r.uf
                    ? 'border-accent/60 bg-accent/5 dark:bg-accent/10'
                    : 'border-zinc-100 bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-800/50'"
                >
                  <div class="flex items-center justify-between gap-3">
                    <span class="flex items-center gap-2 text-sm font-semibold text-zinc-700 dark:text-zinc-200">
                      <span class="h-2.5 w-2.5 rounded-sm" :style="{ backgroundColor: UF_COR[r.uf] }" />
                      {{ r.nome }}
                    </span>
                    <span class="text-xs font-semibold tabular-nums text-zinc-500 dark:text-zinc-400">{{ fmtPct(r.pct) }} do total</span>
                  </div>
                  <div class="mt-1 flex items-baseline justify-between gap-3">
                    <span class="text-lg font-bold tabular-nums text-zinc-900 dark:text-zinc-100">{{ formatCurrency(r.valor) }}</span>
                    <span
                      v-if="r.delta !== null"
                      class="text-xs font-semibold tabular-nums"
                      :class="r.delta > 0 ? 'text-amber-600 dark:text-amber-400' : r.delta < 0 ? 'text-green-600 dark:text-green-400' : 'text-zinc-500 dark:text-zinc-400'"
                    >
                      {{ fmtDelta(r.delta) }} vs. mês anterior
                    </span>
                  </div>
                  <p class="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">
                    {{ r.colaboradores }} {{ r.colaboradores === 1 ? "colaborador" : "colaboradores" }}
                  </p>
                </li>
              </ul>
            </div>
          </section>

          <div class="grid gap-5 lg:grid-cols-3">
            <section class="overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
              <header class="border-b border-zinc-100 px-5 py-3.5 dark:border-zinc-800">
                <h3 class="text-sm font-bold text-zinc-900 dark:text-zinc-100">Por banco</h3>
                <p class="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">Valor pago por banco</p>
              </header>
              <div class="p-4">
                <PieChart
                  :data="bancoData"
                  show-values
                  height="h-72"
                  :center-value="formatCurrency(totalValor)"
                  center-caption="Total"
                  value-format="currency"
                />
              </div>
            </section>

            <section class="overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-900 lg:col-span-2">
              <header class="border-b border-zinc-100 px-5 py-3.5 dark:border-zinc-800">
                <h3 class="text-sm font-bold text-zinc-900 dark:text-zinc-100">Por regional</h3>
                <p class="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">Valor de férias por regional</p>
              </header>
              <div class="p-4">
                <BarChart :data="regionalData" show-values value-format="currency" :show-trend="false" :height-px="288" />
              </div>
            </section>
          </div>

          <section class="overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
            <header class="border-b border-zinc-100 px-5 py-3.5 dark:border-zinc-800">
              <h3 class="text-sm font-bold text-zinc-900 dark:text-zinc-100">Por filial</h3>
              <p class="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">Valor de férias por filial, do maior para o menor</p>
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
                <BarChart :data="filialData" show-values value-format="currency" :show-trend="false" horizontal align-top :height-px="360" />
              </div>
            </div>
          </section>

          <section class="overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
            <header class="border-b border-zinc-100 px-5 py-3.5 dark:border-zinc-800">
              <h3 class="text-sm font-bold text-zinc-900 dark:text-zinc-100">Maiores pagamentos por colaborador</h3>
              <p class="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">Os 15 colaboradores com maior valor de férias no período</p>
            </header>
            <div class="p-4">
              <BarChart :data="colaboradorData" show-values value-format="currency" :show-trend="false" horizontal align-top :height-px="420" />
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
                      <th class="px-4 py-2.5 text-right font-semibold">Pagamentos</th>
                      <th class="px-4 py-2.5 text-right font-semibold">Colaboradores</th>
                      <th class="px-4 py-2.5 text-right font-semibold">Média</th>
                      <th class="px-4 py-2.5 text-right font-semibold">Valor</th>
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
                      <td class="px-4 py-2.5 text-right tabular-nums text-zinc-600 dark:text-zinc-300">{{ r.pagamentos }}</td>
                      <td class="px-4 py-2.5 text-right tabular-nums text-zinc-600 dark:text-zinc-300">{{ r.colaboradores }}</td>
                      <td class="whitespace-nowrap px-4 py-2.5 text-right tabular-nums text-zinc-600 dark:text-zinc-300">{{ formatCurrency(r.media) }}</td>
                      <td class="whitespace-nowrap px-4 py-2.5 text-right font-bold tabular-nums text-zinc-900 dark:text-zinc-100">{{ formatCurrency(r.valor) }}</td>
                      <td
                        v-if="t.delta"
                        class="whitespace-nowrap px-5 py-2.5 text-right font-semibold tabular-nums"
                        :class="r.delta === null ? 'text-zinc-400' : r.delta > 0 ? 'text-red-600 dark:text-red-400' : r.delta < 0 ? 'text-green-600 dark:text-green-400' : 'text-zinc-500'"
                      >
                        <template v-if="r.delta === null">—</template>
                        <template v-else>{{ r.delta > 0 ? "▲" : r.delta < 0 ? "▼" : "•" }} {{ fmtDelta(r.delta) }}</template>
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
                      <th class="px-4 py-2.5 font-semibold">Regional</th>
                      <th class="px-4 py-2.5 font-semibold">Mês referente</th>
                      <th class="px-4 py-2.5 font-semibold">Pagamento</th>
                      <th class="px-5 py-2.5 text-right font-semibold">Valor</th>
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
                      <td class="whitespace-nowrap px-4 py-2.5 text-zinc-600 dark:text-zinc-300">{{ l.regional }}</td>
                      <td class="whitespace-nowrap px-4 py-2.5 text-zinc-600 dark:text-zinc-300">{{ ymShortLabel(l.mes) }}</td>
                      <td class="whitespace-nowrap px-4 py-2.5 tabular-nums text-zinc-600 dark:text-zinc-300">{{ l.pagamento ? formatDate(l.pagamento) : "—" }}</td>
                      <td class="whitespace-nowrap px-5 py-2.5 text-right font-bold tabular-nums text-zinc-900 dark:text-zinc-100">{{ formatCurrency(l.valor) }}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </section>
          </div>
        </template>

        <p class="border-t border-zinc-200 pt-4 text-center text-xs text-zinc-400 dark:border-zinc-800 dark:text-zinc-500">
          Valor = soma dos pagamentos de férias no mês referente filtrado · Média por colaborador = valor total ÷ colaboradores distintos · Fonte: aba Férias.
        </p>
      </div>
    </div>
  </Modal>
</template>
