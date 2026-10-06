<script setup>
import { computed, ref, watch } from "vue";
import GerenteRegionalFilter from "@/components/dashboard/GerenteRegionalFilter.vue";
import Modal from "@/components/ui/Modal.vue";
import PieChart from "@/components/charts/PieChart.vue";
import BarChart from "@/components/charts/BarChart.vue";
import { STATE_NAMES, STATES } from "@/lib/config";
import { headcountMovements, findBranchByShortName, filterByRegional, headcountRegionalOptions } from "@/lib/employees";
import { dateFilter } from "@/composables/useDateFilter";
import { useFilters } from "@/composables/useFilters";
import { formatDate, daysBetween, ymLabel } from "@/lib/utils";

defineProps({
  open: { type: Boolean, default: false }
});

const emit = defineEmits(["close", "abrir-lista"]);

const { state } = useFilters();

const estadoSel = ref(!state.current || state.current === "todos" ? "todos" : state.current);
const estadoOptions = [{ id: "todos", label: "Todos" }, ...STATES.map((s) => ({ id: s, label: s }))];

const range = computed(() => (dateFilter.start ? { start: dateFilter.start, end: dateFilter.end } : null));
const regionalSel = ref("");
const regionalOptions = computed(() => headcountRegionalOptions(estadoSel.value));
watch(regionalOptions, (opts) => {
  if (regionalSel.value && !opts.includes(regionalSel.value)) regionalSel.value = "";
});

const escopo = computed(() => {
  const st = estadoSel.value;
  return !st || st === "todos" ? "Todos os estados" : STATE_NAMES[st] || st;
});
const periodo = computed(() =>
  dateFilter.start ? ymLabel(String(dateFilter.end || dateFilter.start).slice(0, 7)) : "Todo o período"
);

const DIAS_EXPERIENCIA = 90;

function desligadosDoPeriodo(rng) {
  const lista = filterByRegional(headcountMovements(estadoSel.value, rng).demissoes, regionalSel.value);
  return lista
    .map((h) => ({ h, dias: daysBetween(h.dataAdmissao, h.dataDesligamento) }))
    .filter(({ dias }) => dias !== null && Number.isFinite(dias) && dias >= 0)
    .map(({ h, dias }) => ({ ...h, dias }));
}

const desligados = computed(() => desligadosDoPeriodo(range.value));

const media = (nums) => (nums.length ? nums.reduce((s, n) => s + n, 0) / nums.length : null);
const mediana = (nums) => {
  if (!nums.length) return null;
  const s = nums.slice().sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

function resumo(items) {
  const dias = items.map((p) => p.dias);
  return { total: items.length, tempoMedio: media(dias), mediana: mediana(dias), minimo: dias.length ? Math.min(...dias) : null, maximo: dias.length ? Math.max(...dias) : null };
}

const stats = computed(() => resumo(desligados.value));
const experiencia = computed(() => desligados.value.filter((p) => p.dias <= DIAS_EXPERIENCIA));

const fmtDias = (d) => (d === null || d === undefined ? "—" : `${d.toFixed(1).replace(".", ",")} dias`);
const fmtDelta = (d) => `${d > 0 ? "+" : ""}${d.toFixed(1).replace(".", ",")} d`;
const fmtPct = (v) => `${v.toFixed(1).replace(".", ",")}%`;

function norm(v, fallback) {
  return String(v || "").trim().toUpperCase() || fallback;
}

function groupBy(keyOf, rng = range.value) {
  const grupos = new Map();
  (rng === range.value ? desligados.value : desligadosDoPeriodo(rng)).forEach((p) => {
    const k = keyOf(p);
    if (!grupos.has(k)) grupos.set(k, []);
    grupos.get(k).push(p);
  });
  return [...grupos.entries()].map(([label, items]) => ({ label, items, ...resumo(items) }));
}

const porTempoAsc = (a, b) => a.tempoMedio - b.tempoMedio || b.total - a.total || a.label.localeCompare(b.label, "pt-BR");
const porTempoDesc = (a, b) => b.tempoMedio - a.tempoMedio || b.total - a.total || a.label.localeCompare(b.label, "pt-BR");

const GENERO_LABEL = { masculino: "Masculino", feminino: "Feminino" };
const generoKey = (h) => GENERO_LABEL[String(h.genero || "").trim().toLowerCase()] || "Não informado";
const funcaoKey = (h) => norm(h.funcao, "SEM FUNÇÃO");

const generoRows = computed(() =>
  groupBy(generoKey).sort((a, b) => ["Masculino", "Feminino", "Não informado"].indexOf(a.label) - ["Masculino", "Feminino", "Não informado"].indexOf(b.label))
);
const funcaoRows = computed(() => groupBy(funcaoKey).sort(porTempoAsc));

const GENERO_COR = { Masculino: "#0284c7", Feminino: "#db2777", "Não informado": "#a1a1aa" };
const generoData = computed(() =>
  generoRows.value.map((r) => ({
    label: r.label,
    series: [{ label: "Tempo médio (dias)", value: Number(r.tempoMedio.toFixed(1)), color: GENERO_COR[r.label] }]
  }))
);
const funcaoData = computed(() =>
  funcaoRows.value.map((r) => ({
    label: r.label,
    series: [{ label: "Tempo médio (dias)", value: Number(r.tempoMedio.toFixed(1)), color: "#0284c7" }]
  }))
);

const FAIXAS = [
  { label: "Até 90 dias (experiência)", min: -1, max: 90, color: "#dc2626" },
  { label: "91 a 180 dias", min: 90, max: 180, color: "#f97316" },
  { label: "181 a 365 dias", min: 180, max: 365, color: "#E8AF3E" },
  { label: "1 a 2 anos", min: 365, max: 730, color: "#84cc16" },
  { label: "Mais de 2 anos", min: 730, max: Infinity, color: "#16a34a" }
];
const faixaFatias = computed(() =>
  FAIXAS.map((f) => ({ ...f, items: desligados.value.filter((p) => p.dias > f.min && p.dias <= f.max) })).filter((f) => f.items.length)
);
const faixaData = computed(() => faixaFatias.value.map((f) => ({ label: f.label, value: f.items.length, color: f.color })));

const grupo = ref(null);

function abrirGrupo(title, items) {
  grupo.value = {
    title,
    subtitle: `${escopo.value} · ${periodo.value}`,
    items: items.slice().sort((a, b) => a.dias - b.dias)
  };
}

function onFaixaClick(i) {
  const f = faixaFatias.value[i];
  if (f) abrirGrupo(`Desligados — ${f.label}`, f.items);
}
function onGeneroClick({ index }) {
  const row = generoRows.value[index];
  if (row) abrirGrupo(`Gênero — ${row.label}`, row.items);
}
function onFuncaoClick({ index }) {
  const row = funcaoRows.value[index];
  if (row) abrirGrupo(`Função — ${row.label}`, row.items);
}

/* ---------- Filiais em atenção ----------
   Aqui o pior é o tempo MENOR: Crítica = permanência ≤ 2/3 da média geral;
   Atenção = abaixo da média geral. A variação é em dias contra o mês anterior ao filtrado. */
const filialKey = (h) => `${norm(h.filial, "SEM FILIAL")}|${norm(h.estado, "")}`;

function filialLabel(key) {
  const [nome, uf] = key.split("|");
  const branch = nome !== "SEM FILIAL" ? findBranchByShortName(nome, uf) : null;
  const label = (branch && branch.name) || nome;
  return estadoSel.value === "todos" && uf ? `${label} (${uf})` : label;
}

const prevRange = computed(() => {
  if (!range.value) return null;
  const ym = String(range.value.start || range.value.end).slice(0, 7);
  const [y, m] = ym.split("-").map(Number);
  if (!y || !m) return null;
  const d = new Date(y, m - 2, 1);
  const prev = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  return { start: `${prev}-01`, end: `${prev}-31` };
});

const filialRows = computed(() => {
  const geral = stats.value.tempoMedio || 0;
  const prev = prevRange.value ? new Map(groupBy(filialKey, prevRange.value).map((r) => [r.label, r])) : null;
  return groupBy(filialKey)
    .map((r) => {
      const antes = prev && prev.get(r.label);
      const status = geral <= 0 ? "normal" : r.tempoMedio <= (geral * 2) / 3 ? "critica" : r.tempoMedio < geral ? "atencao" : "normal";
      return {
        ...r,
        key: r.label,
        nome: filialLabel(r.label),
        delta: antes ? r.tempoMedio - antes.tempoMedio : null,
        status
      };
    })
    .sort(porTempoAsc);
});

const STATUS_FILIAL = {
  critica: { label: "Crítica", cls: "bg-red-100 text-red-700 dark:bg-red-500/15 dark:text-red-400" },
  atencao: { label: "Atenção", cls: "bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-400" },
  normal: { label: "Normal", cls: "bg-green-100 text-green-700 dark:bg-green-500/15 dark:text-green-400" }
};

const filialInsights = computed(() => {
  const rows = filialRows.value;
  const list = [];
  if (!rows.length) return list;
  const geral = stats.value.tempoMedio || 0;
  const pior = rows[0];
  list.push({
    tone: "red",
    text: `${pior.nome} tem a menor permanência: ${fmtDias(pior.tempoMedio)}${geral > 0 ? ` (${fmtDelta(pior.tempoMedio - geral)} da média geral)` : ""}.`
  });
  const criticas = rows.filter((r) => r.status === "critica").length;
  list.push({
    tone: criticas ? "red" : "green",
    text: criticas
      ? `${criticas} ${criticas === 1 ? "filial está" : "filiais estão"} em situação crítica (permanência ≤ 2/3 da média geral).`
      : "Nenhuma filial em situação crítica no período."
  });
  const comDelta = rows.filter((r) => r.delta !== null);
  if (comDelta.length) {
    const pioraram = comDelta.filter((r) => r.delta < 0);
    const maior = pioraram.slice().sort((a, b) => a.delta - b.delta)[0];
    list.push({
      tone: pioraram.length ? "amber" : "green",
      text: pioraram.length
        ? `${pioraram.length} de ${comDelta.length} filiais perderam pessoas mais cedo que no mês anterior; maior queda: ${maior.nome} (${fmtDelta(maior.delta)}).`
        : "Nenhuma filial piorou a permanência contra o mês anterior."
    });
  }
  const totalExp = rows.reduce((s, r) => s + r.items.filter((p) => p.dias <= DIAS_EXPERIENCIA).length, 0);
  const maisExp = rows.map((r) => ({ r, n: r.items.filter((p) => p.dias <= DIAS_EXPERIENCIA).length })).sort((a, b) => b.n - a.n)[0];
  if (totalExp > 0 && maisExp.n > 0) {
    list.push({
      tone: "zinc",
      text: `${maisExp.r.nome} concentra ${fmtPct((maisExp.n / totalExp) * 100)} das saídas em experiência (${maisExp.n} de ${totalExp}).`
    });
  }
  return list;
});

const INSIGHT_DOT = { red: "bg-red-500", amber: "bg-amber-500", green: "bg-green-500", zinc: "bg-zinc-400" };

const tables = computed(() => [
  { title: "Por função", col: "Função", rows: funcaoRows.value, span: true },
  { title: "Por gênero", col: "Gênero", rows: generoRows.value }
]);

const lancamentos = computed(() =>
  desligados.value
    .map((p) => ({
      key: p.id,
      colaborador: p.colaborador || "—",
      funcao: p.funcao || "—",
      filial: p.filial || "—",
      admissao: p.dataAdmissao,
      desligamento: p.dataDesligamento,
      dias: p.dias
    }))
    .sort((a, b) => a.dias - b.dias || a.colaborador.localeCompare(b.colaborador, "pt-BR"))
);

const totals = computed(() => [
  { label: "Permanência média", value: fmtDias(stats.value.tempoMedio), sub: "Admissão até o desligamento" },
  { label: "Mediana", value: fmtDias(stats.value.mediana), sub: "Metade sai até este prazo" },
  { label: "Desligados", value: String(stats.value.total), sub: `Menor ${fmtDias(stats.value.minimo)} · maior ${fmtDias(stats.value.maximo)}` },
  {
    label: "Em experiência",
    value: String(experiencia.value.length),
    sub: stats.value.total ? `${fmtPct((experiencia.value.length / stats.value.total) * 100)} · até ${DIAS_EXPERIENCIA} dias de casa` : `Até ${DIAS_EXPERIENCIA} dias de casa`
  }
]);
</script>

<template>
  <Modal title="Análise de Tempo Médio de Permanência" :subtitle="`${escopo} · ${periodo}`" :open="open" fullscreen @close="emit('close')">
    <template #actions>
      <div class="flex flex-wrap items-center gap-2">
        <button
          type="button"
          class="rounded-lg border border-zinc-300 px-4 py-2.5 text-[15px] font-medium text-zinc-700 transition hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-800"
          @click="emit('abrir-lista')"
        >
          Ver desligados
        </button>
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
      <div class="mx-auto flex max-w-7xl flex-col gap-6">
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

        <div class="grid gap-5 md:grid-cols-2">
          <section class="overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
            <header class="border-b border-zinc-100 px-5 py-3.5 dark:border-zinc-800">
              <h3 class="text-sm font-bold text-zinc-900 dark:text-zinc-100">Faixas de permanência</h3>
              <p class="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">Desligados por tempo de casa</p>
            </header>
            <div class="p-4">
              <PieChart
                :data="faixaData"
                height="h-72"
                :center-value="String(stats.total)"
                center-caption="Desligados"
                value-format="count"
                clickable
                @chart-click="onFaixaClick"
              />
            </div>
          </section>

          <section class="overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
            <header class="border-b border-zinc-100 px-5 py-3.5 dark:border-zinc-800">
              <h3 class="text-sm font-bold text-zinc-900 dark:text-zinc-100">Por gênero</h3>
              <p class="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">Permanência média (dias) de cada gênero</p>
            </header>
            <div class="p-4">
              <BarChart :data="generoData" show-values :show-trend="false" :height-px="288" bars-clickable @bar-click="onGeneroClick" />
            </div>
          </section>
        </div>

        <section class="overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
          <header class="border-b border-zinc-100 px-5 py-3.5 dark:border-zinc-800">
            <h3 class="text-sm font-bold text-zinc-900 dark:text-zinc-100">Por função</h3>
            <p class="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">
              Permanência média (dias) de cada função, da menor para a maior
            </p>
          </header>
          <div class="max-h-[32rem] overflow-y-auto p-4">
            <BarChart :data="funcaoData" show-values :show-trend="false" horizontal align-top :height-px="Math.max(240, funcaoData.length * 36)" bars-clickable @bar-click="onFuncaoClick" />
          </div>
        </section>

        <section class="overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
          <header class="border-b border-zinc-100 px-5 py-3.5 dark:border-zinc-800">
            <h3 class="text-sm font-bold text-zinc-900 dark:text-zinc-100">Filiais em atenção</h3>
            <p class="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">
              Ranking pela menor permanência média, com a variação contra o mês anterior
            </p>
          </header>
          <div v-if="filialRows.length" class="grid gap-5 p-4 lg:grid-cols-3">
            <ul class="flex flex-col gap-3 lg:col-span-1">
              <li
                v-for="(i, idx) in filialInsights"
                :key="idx"
                class="flex items-start gap-3 rounded-xl border border-zinc-100 bg-zinc-50 px-4 py-3 text-sm text-zinc-700 dark:border-zinc-800 dark:bg-zinc-800/50 dark:text-zinc-200"
              >
                <span class="mt-1.5 h-2 w-2 shrink-0 rounded-full" :class="INSIGHT_DOT[i.tone]" />
                <span>{{ i.text }}</span>
              </li>
            </ul>
            <div class="overflow-hidden rounded-xl border border-zinc-100 dark:border-zinc-800 lg:col-span-2">
              <div class="max-h-96 overflow-auto">
                <table class="w-full min-w-max text-left text-sm">
                  <thead class="sticky top-0 z-10 bg-zinc-50 dark:bg-zinc-800">
                    <tr class="text-[11px] uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
                      <th class="px-4 py-2.5 font-semibold">#</th>
                      <th class="px-4 py-2.5 font-semibold">Filial</th>
                      <th class="px-4 py-2.5 text-right font-semibold">Desligados</th>
                      <th class="px-4 py-2.5 text-right font-semibold">Mediana</th>
                      <th class="px-4 py-2.5 text-right font-semibold">Permanência média</th>
                      <th class="px-4 py-2.5 text-right font-semibold">Vs mês anterior</th>
                      <th class="px-4 py-2.5 font-semibold">Situação</th>
                    </tr>
                  </thead>
                  <tbody class="uppercase">
                    <tr
                      v-for="(r, idx) in filialRows"
                      :key="r.key"
                      class="border-t border-zinc-100 transition-colors hover:bg-zinc-50 dark:border-zinc-800 dark:hover:bg-zinc-800/50"
                    >
                      <td class="px-4 py-2.5 tabular-nums text-zinc-400">{{ idx + 1 }}</td>
                      <td class="whitespace-nowrap px-4 py-2.5 font-medium text-zinc-900 dark:text-zinc-100">{{ r.nome }}</td>
                      <td class="px-4 py-2.5 text-right tabular-nums text-zinc-600 dark:text-zinc-300">{{ r.total }}</td>
                      <td class="whitespace-nowrap px-4 py-2.5 text-right tabular-nums text-zinc-600 dark:text-zinc-300">{{ fmtDias(r.mediana) }}</td>
                      <td class="whitespace-nowrap px-4 py-2.5 text-right font-bold tabular-nums text-zinc-900 dark:text-zinc-100">{{ fmtDias(r.tempoMedio) }}</td>
                      <td
                        class="whitespace-nowrap px-4 py-2.5 text-right font-semibold tabular-nums"
                        :class="r.delta === null ? 'text-zinc-400' : r.delta < 0 ? 'text-red-600 dark:text-red-400' : r.delta > 0 ? 'text-green-600 dark:text-green-400' : 'text-zinc-500'"
                      >
                        <template v-if="r.delta === null">—</template>
                        <template v-else>{{ r.delta > 0 ? "▲" : r.delta < 0 ? "▼" : "•" }} {{ fmtDelta(r.delta) }}</template>
                      </td>
                      <td class="whitespace-nowrap px-4 py-2.5">
                        <span class="rounded-full px-2.5 py-0.5 text-[11px] font-semibold" :class="STATUS_FILIAL[r.status].cls">
                          {{ STATUS_FILIAL[r.status].label }}
                        </span>
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          </div>
          <p v-else class="px-5 py-8 text-center text-sm text-zinc-500 dark:text-zinc-400">Sem desligados no período.</p>
        </section>

        <div class="grid items-start gap-5 xl:grid-cols-2">
          <section
            v-for="t in tables"
            :key="t.title"
            class="overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-900"
            :class="t.span ? 'xl:row-span-2' : ''"
          >
            <header class="border-b border-zinc-100 px-5 py-3.5 dark:border-zinc-800">
              <h3 class="text-sm font-bold text-zinc-900 dark:text-zinc-100">Detalhamento {{ t.title.toLowerCase() }}</h3>
            </header>
            <div class="max-h-[32rem] overflow-auto">
              <table class="w-full min-w-max text-left text-sm">
                <thead class="sticky top-0 z-10 bg-zinc-50 dark:bg-zinc-800">
                  <tr class="text-[11px] uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
                    <th class="px-5 py-2.5 font-semibold">{{ t.col }}</th>
                    <th class="px-4 py-2.5 text-right font-semibold">Desligados</th>
                    <th class="px-4 py-2.5 text-right font-semibold">Menor</th>
                    <th class="px-4 py-2.5 text-right font-semibold">Maior</th>
                    <th class="px-4 py-2.5 text-right font-semibold">Mediana</th>
                    <th class="px-5 py-2.5 text-right font-semibold">Média</th>
                  </tr>
                </thead>
                <tbody class="uppercase">
                  <tr
                    v-for="r in t.rows"
                    :key="r.label"
                    class="border-t border-zinc-100 transition-colors hover:bg-zinc-50 dark:border-zinc-800 dark:hover:bg-zinc-800/50"
                  >
                    <td class="whitespace-nowrap px-5 py-2.5 font-medium text-zinc-900 dark:text-zinc-100">{{ r.label }}</td>
                    <td class="px-4 py-2.5 text-right tabular-nums text-zinc-600 dark:text-zinc-300">{{ r.total }}</td>
                    <td class="whitespace-nowrap px-4 py-2.5 text-right tabular-nums text-zinc-600 dark:text-zinc-300">{{ fmtDias(r.minimo) }}</td>
                    <td class="whitespace-nowrap px-4 py-2.5 text-right tabular-nums text-zinc-600 dark:text-zinc-300">{{ fmtDias(r.maximo) }}</td>
                    <td class="whitespace-nowrap px-4 py-2.5 text-right tabular-nums text-zinc-600 dark:text-zinc-300">{{ fmtDias(r.mediana) }}</td>
                    <td class="whitespace-nowrap px-5 py-2.5 text-right font-bold tabular-nums text-zinc-900 dark:text-zinc-100">{{ fmtDias(r.tempoMedio) }}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </section>

          <section class="overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
            <header class="flex items-center justify-between border-b border-zinc-100 px-5 py-3.5 dark:border-zinc-800">
              <h3 class="text-sm font-bold text-zinc-900 dark:text-zinc-100">Lançamentos</h3>
            </header>
            <div v-if="lancamentos.length" class="max-h-80 overflow-auto">
              <table class="w-full min-w-max text-left text-sm">
                <thead class="sticky top-0 z-10 bg-zinc-50 dark:bg-zinc-800">
                  <tr class="text-[11px] uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
                    <th class="px-5 py-2.5 font-semibold">Colaborador</th>
                    <th class="px-4 py-2.5 font-semibold">Função</th>
                    <th class="px-4 py-2.5 font-semibold">Admissão</th>
                    <th class="px-4 py-2.5 font-semibold">Desligamento</th>
                    <th class="px-5 py-2.5 text-right font-semibold">Permanência</th>
                  </tr>
                </thead>
                <tbody class="uppercase">
                  <tr
                    v-for="l in lancamentos"
                    :key="l.key"
                    class="border-t border-zinc-100 transition-colors hover:bg-zinc-50 dark:border-zinc-800 dark:hover:bg-zinc-800/50"
                  >
                    <td class="whitespace-nowrap px-5 py-2.5 font-medium text-zinc-900 dark:text-zinc-100">{{ l.colaborador }}</td>
                    <td class="whitespace-nowrap px-4 py-2.5 text-zinc-600 dark:text-zinc-300">{{ l.funcao }}</td>
                    <td class="whitespace-nowrap px-4 py-2.5 tabular-nums text-zinc-600 dark:text-zinc-300">{{ formatDate(l.admissao) }}</td>
                    <td class="whitespace-nowrap px-4 py-2.5 tabular-nums text-zinc-600 dark:text-zinc-300">{{ formatDate(l.desligamento) }}</td>
                    <td class="whitespace-nowrap px-5 py-2.5 text-right font-bold tabular-nums text-zinc-900 dark:text-zinc-100">{{ fmtDias(l.dias) }}</td>
                  </tr>
                </tbody>
              </table>
            </div>
            <p v-else class="px-5 py-8 text-center text-sm text-zinc-500 dark:text-zinc-400">Nenhum desligamento no período.</p>
          </section>
        </div>

        <p class="border-t border-zinc-200 pt-4 text-center text-xs text-zinc-400 dark:border-zinc-800 dark:text-zinc-500">
          Permanência = dias entre admissão e desligamento dos colaboradores desligados no mês filtrado · Mediana = prazo
          central · Filial crítica = permanência ≤ 2/3 da média geral; atenção = abaixo da média. Fonte: Headcount.
        </p>
      </div>
    </div>

    <Modal v-if="grupo" open :title="grupo.title" :subtitle="grupo.subtitle" max-width="max-w-4xl" @close="grupo = null">
      <div class="overflow-hidden rounded-xl border border-zinc-200 dark:border-zinc-800">
        <div class="max-h-[28rem] overflow-auto">
          <table class="w-full min-w-max text-left text-sm">
            <thead class="sticky top-0 z-10 bg-white dark:bg-zinc-900">
              <tr class="border-b border-zinc-100 text-xs uppercase tracking-wide text-zinc-400 dark:border-zinc-800">
                <th class="px-4 py-2.5 font-semibold">Colaborador</th>
                <th class="px-4 py-2.5 font-semibold">Função</th>
                <th class="px-4 py-2.5 font-semibold">Filial</th>
                <th class="px-4 py-2.5 font-semibold">Admissão</th>
                <th class="px-4 py-2.5 font-semibold">Desligamento</th>
                <th class="px-4 py-2.5 text-right font-semibold">Permanência</th>
              </tr>
            </thead>
            <tbody class="uppercase">
              <tr v-for="p in grupo.items" :key="p.id" class="border-b border-zinc-100 last:border-0 dark:border-zinc-800">
                <td class="whitespace-nowrap px-4 py-2.5 font-medium text-zinc-900 dark:text-zinc-100">{{ p.colaborador || "—" }}</td>
                <td class="whitespace-nowrap px-4 py-2.5 text-zinc-700 dark:text-zinc-300">{{ p.funcao || "—" }}</td>
                <td class="whitespace-nowrap px-4 py-2.5 text-zinc-700 dark:text-zinc-300">{{ p.filial || "—" }}</td>
                <td class="whitespace-nowrap px-4 py-2.5 text-zinc-700 dark:text-zinc-300">{{ formatDate(p.dataAdmissao) }}</td>
                <td class="whitespace-nowrap px-4 py-2.5 text-zinc-700 dark:text-zinc-300">{{ formatDate(p.dataDesligamento) }}</td>
                <td class="whitespace-nowrap px-4 py-2.5 text-right font-medium tabular-nums text-zinc-900 dark:text-zinc-100">{{ fmtDias(p.dias) }}</td>
              </tr>
            </tbody>
          </table>
        </div>
        <div class="border-t border-zinc-100 px-4 py-2 text-xs text-zinc-400 dark:border-zinc-800 dark:text-zinc-400">
          {{ grupo.items.length === 1 ? "1 colaborador" : `${grupo.items.length} colaboradores` }}
        </div>
      </div>
    </Modal>
  </Modal>
</template>
