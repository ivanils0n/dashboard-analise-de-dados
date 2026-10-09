<script setup>
import { computed, ref, watch } from "vue";
import GerenteRegionalFilter from "@/components/dashboard/GerenteRegionalFilter.vue";
import Modal from "@/components/ui/Modal.vue";
import PieChart from "@/components/charts/PieChart.vue";
import BarChart from "@/components/charts/BarChart.vue";
import { STATE_NAMES, STATES } from "@/lib/config";
import { getEntriesFor, getBeneficios } from "@/lib/store";
import { listRescisoes, rescisaoAmount, rescisaoRegionalLabel } from "@/lib/employees";
import { regionalLabel } from "@/lib/regionais";
import { dateFilter } from "@/composables/useDateFilter";
import { useFilters } from "@/composables/useFilters";
import { filialDisplay, formatCurrency, ymLabel, ymShortLabel } from "@/lib/utils";

defineProps({
  open: { type: Boolean, default: false }
});

const emit = defineEmits(["close"]);

const { state } = useFilters();

const estadoSel = ref(!state.current || state.current === "todos" ? "todos" : state.current);
const estadoOptions = [{ id: "todos", label: "Todos" }, ...STATES.map((s) => ({ id: s, label: s }))];
const regionalSel = ref("");

const TIPOS = [
  { id: "folha", label: "Folha", color: "#0284c7" },
  { id: "ferias", label: "Férias", color: "#f59e0b" },
  { id: "rescisoes", label: "Rescisões", color: "#dc2626" },
  { id: "beneficios", label: "Benefícios", color: "#16a34a" }
];
const TIPO_LABEL = Object.fromEntries(TIPOS.map((t) => [t.id, t.label]));

const upper = (v, fallback) => String(v || "").trim().toUpperCase() || fallback;

function linhasDe(tipo, e) {
  const m = e.meta || {};
  return {
    id: `${tipo}-${e.id}`,
    tipo,
    data: String(e.date || "").slice(0, 10),
    colaborador: upper(m.employeeName, tipo === "beneficios" ? upper(m.beneficio, "SEM BENEFÍCIO") : "SEM COLABORADOR"),
    codigo: String(m.codigo || ""),
    empresa: upper(m.empresa, "SEM EMPRESA"),
    filial: upper(filialDisplay(m.filial, m.estado), "—"),
    regional: tipo === "beneficios" ? "" : regionalLabel(m.regional),
    valor: Number(e.value) || 0
  };
}

function rescisaoLinha(r) {
  return {
    id: `rescisoes-${r.id}`,
    tipo: "rescisoes",
    data: String(r.mesReferencia || r.ultDiaAviso || "").slice(0, 10),
    colaborador: upper(r.colaborador, "SEM COLABORADOR"),
    codigo: "",
    empresa: upper(r.empresa, "SEM EMPRESA"),
    filial: upper(filialDisplay(r.filial, r.estado), "—"),
    regional: rescisaoRegionalLabel(r),
    valor: rescisaoAmount(r, "total")
  };
}

const todasLinhas = computed(() => {
  void state.revision;
  const st = estadoSel.value;
  return [
    ...getEntriesFor("custo_total", st).map((e) => linhasDe("folha", e)),
    ...getEntriesFor("ferias", st).map((e) => linhasDe("ferias", e)),
    ...listRescisoes(st, null).map(rescisaoLinha),
    ...getBeneficios(st).map((e) => linhasDe("beneficios", e))
  ];
});

const regionalOptions = computed(() =>
  [...new Set(todasLinhas.value.map((l) => l.regional).filter(Boolean))].sort((a, b) => a.localeCompare(b, "pt-BR"))
);
watch(regionalOptions, (opts) => {
  if (regionalSel.value && !opts.includes(regionalSel.value)) regionalSel.value = "";
});

const noPeriodo = (l, start, end) => !(start && l.data < start) && !(end && l.data > end);
const filtrar = (start, end) =>
  todasLinhas.value.filter((l) => noPeriodo(l, start, end) && (!regionalSel.value || l.regional === regionalSel.value));

const linhas = computed(() => filtrar(dateFilter.start, dateFilter.end));

const prevRange = computed(() => {
  if (!dateFilter.start) return null;
  const [y, m] = String(dateFilter.start).slice(0, 7).split("-").map(Number);
  if (!y || !m) return null;
  const d = new Date(y, m - 2, 1);
  const ym = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  return { start: `${ym}-01`, end: `${ym}-31` };
});
const linhasPrev = computed(() => (prevRange.value ? filtrar(prevRange.value.start, prevRange.value.end) : null));

const escopo = computed(() => {
  const st = estadoSel.value;
  return !st || st === "todos" ? "Todos os estados" : STATE_NAMES[st] || st;
});
const periodo = computed(() =>
  dateFilter.start ? ymLabel(String(dateFilter.end || dateFilter.start).slice(0, 7)) : "Todo o período"
);

const soma = (list) => list.reduce((s, l) => s + l.valor, 0);
const totalGeral = computed(() => soma(linhas.value));
const totalPorTipo = (list) => Object.fromEntries(TIPOS.map((t) => [t.id, soma(list.filter((l) => l.tipo === t.id))]));
const totais = computed(() => totalPorTipo(linhas.value));
const totaisPrev = computed(() => (linhasPrev.value ? totalPorTipo(linhasPrev.value) : null));
const colaboradores = computed(
  () => new Set(linhas.value.filter((l) => l.tipo === "folha").map((l) => `${l.codigo}|${l.colaborador}`)).size
);

const fmtPct = (v) => `${v.toFixed(1).replace(".", ",")}%`;
const fmtDelta = (d) => `${d > 0 ? "+" : d < 0 ? "-" : ""}${formatCurrency(Math.abs(d))}`;
const pctDoTotal = (v) => (totalGeral.value ? (v / totalGeral.value) * 100 : 0);

const composicao = computed(() =>
  TIPOS.map((t) => {
    const valor = totais.value[t.id];
    const antes = totaisPrev.value ? totaisPrev.value[t.id] : null;
    return {
      ...t,
      valor,
      pct: pctDoTotal(valor),
      lancamentos: linhas.value.filter((l) => l.tipo === t.id).length,
      delta: antes === null ? null : valor - antes
    };
  })
);

const pieData = computed(() => composicao.value.filter((c) => c.valor > 0).map((c) => ({ label: c.label, value: c.valor, color: c.color })));

function agrupar(keyOf, list = linhas.value) {
  const map = new Map();
  list.forEach((l) => {
    const k = keyOf(l);
    const g = map.get(k) || { label: k, total: 0, folha: 0, ferias: 0, rescisoes: 0, beneficios: 0, lancamentos: 0 };
    g[l.tipo] += l.valor;
    g.total += l.valor;
    g.lancamentos += 1;
    map.set(k, g);
  });
  return [...map.values()].sort((a, b) => b.total - a.total || a.label.localeCompare(b.label, "pt-BR"));
}

const semBeneficio = (l) => l.tipo !== "beneficios";
const regionalRows = computed(() => agrupar((l) => l.regional, linhas.value.filter(semBeneficio)));
const empresaRows = computed(() => agrupar((l) => l.empresa, linhas.value.filter((l) => l.tipo === "folha" || l.tipo === "rescisoes")));
const filialRows = computed(() => {
  const prev = linhasPrev.value ? new Map(agrupar((l) => l.filial, linhasPrev.value.filter(semBeneficio)).map((r) => [r.label, r])) : null;
  return agrupar((l) => l.filial, linhas.value.filter(semBeneficio)).map((r) => {
    const before = prev && prev.get(r.label);
    return { ...r, delta: before ? r.total - before.total : null };
  });
});

const regionalData = computed(() =>
  regionalRows.value.map((r) => ({
    label: r.label,
    series: TIPOS.filter((t) => t.id !== "beneficios").map((t) => ({ label: t.label, value: r[t.id], color: t.color }))
  }))
);
const filialData = computed(() =>
  filialRows.value.slice(0, 20).map((r) => ({ label: r.label, value: r.total, tooltipValue: formatCurrency(r.total) }))
);

const INSIGHT_DOT = { red: "bg-red-500", amber: "bg-amber-500", green: "bg-green-500", zinc: "bg-zinc-400" };

const insights = computed(() => {
  const list = [];
  if (!linhas.value.length || totalGeral.value <= 0) return list;
  const maior = composicao.value.slice().sort((a, b) => b.valor - a.valor)[0];
  list.push({ tone: "zinc", text: `${maior.label} é o maior componente: ${fmtPct(maior.pct)} do custo (${formatCurrency(maior.valor)}).` });
  if (regionalRows.value.length) {
    const top = regionalRows.value[0];
    list.push({ tone: "zinc", text: `Regional com maior custo: ${top.label} (${formatCurrency(top.total)}, sem benefícios).` });
  }
  if (totaisPrev.value) {
    const antes = Object.values(totaisPrev.value).reduce((s, v) => s + v, 0);
    if (antes > 0) {
      const delta = totalGeral.value - antes;
      list.push({
        tone: delta > 0 ? "amber" : "green",
        text: `${delta >= 0 ? "Aumento" : "Queda"} de ${formatCurrency(Math.abs(delta))} (${fmtPct((Math.abs(delta) / antes) * 100)}) contra o mês anterior (${formatCurrency(antes)}).`
      });
    }
  }
  if (totais.value.rescisoes > 0) {
    list.push({ tone: "red", text: `Rescisões somam ${formatCurrency(totais.value.rescisoes)} (${fmtPct(pctDoTotal(totais.value.rescisoes))} do custo).` });
  }
  return list;
});

const lancamentos = computed(() =>
  linhas.value.slice().sort((a, b) => b.data.localeCompare(a.data) || a.colaborador.localeCompare(b.colaborador, "pt-BR"))
);

const TIPO_CLS = {
  folha: "bg-sky-100 text-sky-700 dark:bg-sky-500/15 dark:text-sky-400",
  ferias: "bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-400",
  rescisoes: "bg-red-100 text-red-700 dark:bg-red-500/15 dark:text-red-400",
  beneficios: "bg-green-100 text-green-700 dark:bg-green-500/15 dark:text-green-400"
};

const cards = computed(() => [
  { label: "Custo total", value: formatCurrency(totalGeral.value), sub: `${linhas.value.length} lançamentos` },
  ...composicao.value.map((c) => ({ label: c.label, value: formatCurrency(c.valor), sub: `${fmtPct(c.pct)} do total` }))
]);

const tables = computed(() => [
  { title: "Por regional", col: "Regional", rows: regionalRows.value },
  { title: "Por empresa", col: "Empresa", rows: empresaRows.value, soFolhaRescisao: true },
  { title: "Por filial", col: "Filial", rows: filialRows.value, delta: true }
]);
</script>

<template>
  <Modal title="Detalhamento do Custo de Pessoal" :subtitle="`${escopo} · ${periodo}`" :open="open" fullscreen @close="emit('close')">
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
        <div class="grid grid-cols-2 gap-3 md:grid-cols-5">
          <div
            v-for="t in cards"
            :key="t.label"
            class="relative overflow-hidden rounded-2xl border border-zinc-200 bg-white p-5 text-center shadow-sm dark:border-zinc-800 dark:bg-zinc-900"
          >
            <p class="text-[11px] font-semibold uppercase tracking-widest text-zinc-500 dark:text-zinc-400">{{ t.label }}</p>
            <p class="mt-1.5 text-2xl font-bold leading-none tabular-nums text-zinc-900 dark:text-zinc-100">{{ t.value }}</p>
            <p class="mt-2 text-xs text-zinc-500 dark:text-zinc-400">{{ t.sub }}</p>
          </div>
        </div>

        <p v-if="regionalSel" class="-mt-3 text-center text-xs text-zinc-400 dark:text-zinc-500">
          Benefícios não têm regional e ficam fora do total quando uma regional está selecionada.
        </p>

        <p v-if="!linhas.length" class="rounded-2xl border border-zinc-200 bg-white px-5 py-10 text-center text-sm text-zinc-500 shadow-sm dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-400">
          Nenhum custo de pessoal registrado para o período e os filtros selecionados.
        </p>

        <template v-else>
          <section class="overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
            <header class="border-b border-zinc-100 px-5 py-3.5 dark:border-zinc-800">
              <div class="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
                <div>
                  <h3 class="text-sm font-bold text-zinc-900 dark:text-zinc-100">Por regional</h3>
                  <p class="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">Folha, férias e rescisões por regional</p>
                </div>
                <ul class="flex items-center gap-4 text-xs font-medium text-zinc-600 dark:text-zinc-300">
                  <li v-for="t in TIPOS.filter((x) => x.id !== 'beneficios')" :key="t.id" class="flex items-center gap-1.5">
                    <span class="h-3 w-3 rounded-sm" :style="{ backgroundColor: t.color }" />{{ t.label }}
                  </li>
                </ul>
              </div>
            </header>
            <div class="p-4">
              <BarChart :data="regionalData" :show-legend="false" show-values value-format="currency" :show-trend="false" horizontal align-top :height-px="420" />
            </div>
          </section>

          <div class="grid items-stretch gap-5 lg:grid-cols-5">
            <section class="flex flex-col overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-900 lg:col-span-2">
              <header class="border-b border-zinc-100 px-5 py-3.5 dark:border-zinc-800">
                <h3 class="text-sm font-bold text-zinc-900 dark:text-zinc-100">Composição</h3>
                <p class="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">Folha, férias, rescisões e benefícios</p>
              </header>
              <div class="flex flex-1 items-center justify-center p-4">
                <PieChart class="w-full"
                  :data="pieData"
                  show-values
                  height="h-72"
                  :center-value="formatCurrency(totalGeral)"
                  center-caption="Total"
                  value-format="currency"
                />
              </div>
            </section>

            <section class="overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-900 lg:col-span-3">
              <header class="border-b border-zinc-100 px-5 py-3.5 dark:border-zinc-800">
                <h3 class="text-sm font-bold text-zinc-900 dark:text-zinc-100">Principais pontos</h3>
                <p class="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">Filiais com maior custo (folha + férias + rescisões), até 20</p>
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
                  <BarChart :data="filialData" show-values value-format="currency" :show-trend="false" horizontal align-top :height-px="420" />
                </div>
              </div>
            </section>
          </div>

          <section class="overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
            <header class="border-b border-zinc-100 px-5 py-3.5 dark:border-zinc-800">
              <h3 class="text-sm font-bold text-zinc-900 dark:text-zinc-100">Detalhamento por componente</h3>
            </header>
            <div class="overflow-auto">
              <table class="w-full min-w-max text-left text-sm">
                <thead class="bg-zinc-50 dark:bg-zinc-800">
                  <tr class="text-[11px] uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
                    <th class="px-5 py-2.5 font-semibold">Componente</th>
                    <th class="px-4 py-2.5 text-right font-semibold">Lançamentos</th>
                    <th class="px-4 py-2.5 text-right font-semibold">% do total</th>
                    <th class="px-4 py-2.5 text-right font-semibold">Valor</th>
                    <th class="px-5 py-2.5 text-right font-semibold">Vs mês anterior</th>
                  </tr>
                </thead>
                <tbody class="uppercase">
                  <tr v-for="c in composicao" :key="c.id" class="border-t border-zinc-100 dark:border-zinc-800">
                    <td class="whitespace-nowrap px-5 py-2.5 font-medium text-zinc-900 dark:text-zinc-100">
                      <span class="mr-2 inline-block h-2.5 w-2.5 rounded-full" :style="{ backgroundColor: c.color }" />{{ c.label }}
                    </td>
                    <td class="px-4 py-2.5 text-right tabular-nums text-zinc-600 dark:text-zinc-300">{{ c.lancamentos }}</td>
                    <td class="px-4 py-2.5 text-right tabular-nums text-zinc-600 dark:text-zinc-300">{{ fmtPct(c.pct) }}</td>
                    <td class="whitespace-nowrap px-4 py-2.5 text-right font-bold tabular-nums text-zinc-900 dark:text-zinc-100">{{ formatCurrency(c.valor) }}</td>
                    <td
                      class="whitespace-nowrap px-5 py-2.5 text-right font-semibold tabular-nums"
                      :class="c.delta === null ? 'text-zinc-400' : c.delta > 0 ? 'text-red-600 dark:text-red-400' : c.delta < 0 ? 'text-green-600 dark:text-green-400' : 'text-zinc-500'"
                    >
                      <template v-if="c.delta === null">—</template>
                      <template v-else>{{ c.delta > 0 ? "▲" : c.delta < 0 ? "▼" : "•" }} {{ fmtDelta(c.delta) }}</template>
                    </td>
                  </tr>
                </tbody>
              </table>
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
                <p v-if="t.soFolhaRescisao" class="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">Somente folha e rescisões têm empresa</p>
              </header>
              <div class="max-h-[32rem] overflow-auto">
                <table class="w-full min-w-max text-left text-sm">
                  <thead class="sticky top-0 z-10 bg-zinc-50 dark:bg-zinc-800">
                    <tr class="text-[11px] uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
                      <th class="px-5 py-2.5 font-semibold">{{ t.col }}</th>
                      <th class="px-4 py-2.5 text-right font-semibold">Folha</th>
                      <th class="px-4 py-2.5 text-right font-semibold">Férias</th>
                      <th class="px-4 py-2.5 text-right font-semibold">Rescisões</th>
                      <th class="px-4 py-2.5 text-right font-semibold">Total</th>
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
                      <td class="whitespace-nowrap px-4 py-2.5 text-right tabular-nums text-zinc-600 dark:text-zinc-300">{{ formatCurrency(r.folha) }}</td>
                      <td class="whitespace-nowrap px-4 py-2.5 text-right tabular-nums text-zinc-600 dark:text-zinc-300">{{ formatCurrency(r.ferias) }}</td>
                      <td class="whitespace-nowrap px-4 py-2.5 text-right tabular-nums text-zinc-600 dark:text-zinc-300">{{ formatCurrency(r.rescisoes) }}</td>
                      <td class="whitespace-nowrap px-4 py-2.5 text-right font-bold tabular-nums text-zinc-900 dark:text-zinc-100">{{ formatCurrency(r.total) }}</td>
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
                      <th class="px-5 py-2.5 font-semibold">Tipo</th>
                      <th class="px-4 py-2.5 font-semibold">Colaborador / Benefício</th>
                      <th class="px-4 py-2.5 font-semibold">Filial</th>
                      <th class="px-4 py-2.5 font-semibold">Mês</th>
                      <th class="px-5 py-2.5 text-right font-semibold">Valor</th>
                    </tr>
                  </thead>
                  <tbody class="uppercase">
                    <tr
                      v-for="l in lancamentos"
                      :key="l.id"
                      class="border-t border-zinc-100 transition-colors hover:bg-zinc-50 dark:border-zinc-800 dark:hover:bg-zinc-800/50"
                    >
                      <td class="whitespace-nowrap px-5 py-2.5">
                        <span class="rounded-full px-2.5 py-0.5 text-[11px] font-semibold" :class="TIPO_CLS[l.tipo]">{{ TIPO_LABEL[l.tipo] }}</span>
                      </td>
                      <td class="whitespace-nowrap px-4 py-2.5 font-medium text-zinc-900 dark:text-zinc-100">{{ l.colaborador }}</td>
                      <td class="whitespace-nowrap px-4 py-2.5 text-zinc-600 dark:text-zinc-300">{{ l.filial }}</td>
                      <td class="whitespace-nowrap px-4 py-2.5 text-zinc-600 dark:text-zinc-300">{{ ymShortLabel(l.data.slice(0, 7)) || "—" }}</td>
                      <td class="whitespace-nowrap px-5 py-2.5 text-right font-bold tabular-nums text-zinc-900 dark:text-zinc-100">{{ formatCurrency(l.valor) }}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </section>
          </div>
        </template>

        <p class="border-t border-zinc-200 pt-4 text-center text-xs text-zinc-400 dark:border-zinc-800 dark:text-zinc-500">
          Custo de pessoal = folha + férias + rescisões (valor total) + benefícios no período filtrado · Regional e filial consideram só folha, férias e rescisões.
        </p>
      </div>
    </div>
  </Modal>
</template>
