<script setup>
import { computed, ref, watch } from "vue";
import GerenteRegionalFilter from "@/components/dashboard/GerenteRegionalFilter.vue"; import Modal from "@/components/ui/Modal.vue";
import EmptyState from "@/components/ui/EmptyState.vue";
import PieChart from "@/components/charts/PieChart.vue";
import BarChart from "@/components/charts/BarChart.vue";
import AbsenteismoKpis from "@/components/dashboard/AbsenteismoKpis.vue";
import AbsenteismoDetalheModal from "@/components/dashboard/AbsenteismoDetalheModal.vue";
import { dateFilter } from "@/composables/useDateFilter";
import { monthYm, ymLabel } from "@/lib/utils";
import { STATES, STATE_NAMES } from "@/lib/config";
import { analiseAbsenteismo } from "@/lib/absenteismoAnalise";
import { headcountRegionalOptions } from "@/lib/employees";

const props = defineProps({
  open: { type: Boolean, default: false },
  estado: { type: String, default: "todos" }
});
const emit = defineEmits(["close"]);

const ym = computed(() => (dateFilter.start ? String(dateFilter.end || dateFilter.start).slice(0, 7) : monthYm(0)));

const estadoOptions = [{ id: "todos", label: "Todos" }, ...STATES.map((s) => ({ id: s, label: s }))];
const estadoSel = ref(props.estado || "todos");
watch(
  () => props.open,
  (open) => {
    if (open) estadoSel.value = String(props.estado || "todos").toUpperCase() === "TODOS" ? "todos" : String(props.estado).toUpperCase();
  },
  { immediate: true }
);

const regionalSel = ref("");
const regionalOptions = computed(() => headcountRegionalOptions(estadoSel.value));
watch(regionalOptions, (opts) => {
  if (regionalSel.value && !opts.includes(regionalSel.value)) regionalSel.value = "";
});

const a = computed(() => analiseAbsenteismo(ym.value, estadoSel.value, regionalSel.value));
const escopo = computed(() => (estadoSel.value === "todos" ? "Todos os estados" : STATE_NAMES[estadoSel.value] || estadoSel.value));
const periodo = computed(() => ymLabel(ym.value));

const nf = (n, d = 0) => Number(n).toLocaleString("pt-BR", { minimumFractionDigits: d, maximumFractionDigits: d });
const fmtPct = (n) => (n == null ? "—" : `${nf(n, 2)}%`);
const fmtPp = (n) => `${n >= 0 ? "+" : "−"}${nf(Math.abs(n), 2)} p.p.`;

function variacao(value, kind = "pct") {
  if (value == null) return { text: `sem base em ${ymLabel(a.value.prev.ym)}`, cls: "text-zinc-500 dark:text-zinc-400" };
  if (Math.abs(value) < 0.005) return { text: `igual a ${ymLabel(a.value.prev.ym)}`, cls: "text-zinc-500 dark:text-zinc-400" };
  const up = value > 0;
  const body = kind === "pp" ? fmtPp(value) : `${nf(Math.abs(value), 1)}%`;
  return {
    text: `${up ? "▲" : "▼"} ${kind === "pp" ? body : body} vs ${ymLabel(a.value.prev.ym)}`,
    cls: "text-zinc-500 dark:text-zinc-400"
  };
}

const cards = computed(() => {
  const d = a.value;
  const vTotal = variacao(d.variacao.total);
  const vTaxa = variacao(d.variacao.taxa, "pp");
  const vAfet = variacao(d.variacao.afetados);
  const vDias = variacao(d.variacao.dias);
  const pctAtivos = d.ativos ? (d.afetados / d.ativos) * 100 : null;
  return [
    { label: "Ocorrências", value: nf(d.total), sub: vTotal.text, subCls: vTotal.cls, tone: "text-zinc-900 dark:text-zinc-100" },
    {
      label: "Taxa de absenteísmo",
      value: fmtPct(d.taxa),
      sub: d.taxa == null ? "sem ativos no Headcount" : vTaxa.text,
      subCls: vTaxa.cls,
      tone: "text-zinc-900 dark:text-zinc-100"
    },
    {
      label: "Colaboradores afetados",
      value: nf(d.afetados),
      sub: pctAtivos == null ? vAfet.text : `${nf(pctAtivos, 1)}% dos ${nf(d.ativos)} ativos · ${vAfet.text}`,
      subCls: "text-zinc-500 dark:text-zinc-400",
      tone: "text-zinc-900 dark:text-zinc-100"
    },
    { label: "Dias de ausência", value: nf(d.dias, 1), sub: vDias.text, subCls: vDias.cls, tone: "text-zinc-900 dark:text-zinc-100" },
    {
      label: "Média de dias de atestado",
      value: d.mediaDiasAtestado == null ? "—" : nf(d.mediaDiasAtestado, 1),
      sub: d.atestadosComDias
        ? `${nf(d.atestadosComDias)} ${d.atestadosComDias === 1 ? "atestado" : "atestados"} com dias informados`
        : "nenhum atestado com dias informados",
      subCls: "text-zinc-500 dark:text-zinc-400",
      tone: "text-zinc-900 dark:text-zinc-100"
    },
    {
      label: "Média por afetado",
      value: d.mediaPorAfetado == null ? "—" : nf(d.mediaPorAfetado, 1),
      sub: "ocorrências por colaborador afetado",
      subCls: "text-zinc-500 dark:text-zinc-400",
      tone: "text-zinc-900 dark:text-zinc-100"
    }
  ];
});

const motivoPie = computed(() => a.value.porMotivo.map((m) => ({ label: m.label, value: m.value, color: m.color })));
const estadoPie = computed(() => a.value.porEstado.map((e) => ({ label: STATE_NAMES[e.label] || e.label, value: e.value })));
const tooltipGrupo = (g) =>
  `${g.ocorrencias} ${g.ocorrencias === 1 ? "ocorrência" : "ocorrências"} · ${nf(g.dias, 1)} dias · ${nf(g.ativos)} ativos · taxa ${fmtPct(g.taxa)}`;

const cidPie = computed(() => a.value.porCid.map((c) => ({ label: c.label, value: c.value })));
const totalCid = computed(() => a.value.porCid.reduce((s, c) => s + c.value, 0));
const generoData = computed(() => a.value.porGenero.map((g) => ({ label: g.label, value: g.taxa ?? 0, tooltipValue: tooltipGrupo(g) })));
const diaMesData = computed(() => a.value.porDiaDoMes.map((d) => ({ label: d.label, value: d.value, tooltipValue: `${d.value} ${d.value === 1 ? "ocorrência" : "ocorrências"}` })));
const SEMANA_CURTA = { Domingo: "Dom", Segunda: "Seg", Terça: "Ter", Quarta: "Qua", Quinta: "Qui", Sexta: "Sex", Sábado: "Sáb" };
const semanaData = computed(() => a.value.porDiaSemana.map((d) => ({ label: SEMANA_CURTA[d.label], value: d.value, tooltipValue: `${d.label}: ${d.value} ${d.value === 1 ? "ocorrência" : "ocorrências"}` })));
const tendenciaData = computed(() =>
  a.value.tendencia.map((t) => ({ label: t.label, value: t.taxa ?? 0, tooltipValue: `${t.total} ${t.total === 1 ? "ocorrência" : "ocorrências"} · taxa ${fmtPct(t.taxa)}` }))
);
const short = (s, n = 28) => (s.length > n ? `${s.slice(0, n - 1).trimEnd()}…` : s);
const funcaoData = computed(() => a.value.porFuncao.map((g) => ({ label: short(g.label), value: g.taxa ?? 0, tooltipValue: `${g.label} — ${tooltipGrupo(g)}` })));
const funcaoHeight = computed(() => Math.max(240, Math.min(560, a.value.porFuncao.length * 30 + 60)));
const experienciaPie = computed(() => [
  { label: "Em experiência (até 90 dias)", value: a.value.experiencia.emExperiencia.length, color: "#a78bfa" },
  { label: "Demais colaboradores", value: a.value.experiencia.demais.length, color: "#94a3b8" }
]);

const detalhe = ref({ open: false, title: "", subtitle: "", rows: [] });
function abrirDetalhe(title, rows, subtitle = "") {
  detalhe.value = { open: true, title, subtitle: subtitle || `${escopo.value} · ${periodo.value}`, rows };
}
const idx = (i) => (Number.isInteger(i) && i >= 0 ? i : null);
function onMotivoClick(i) {
  const m = a.value.porMotivo[idx(i)];
  if (m) abrirDetalhe(m.label, m.itens);
}
function onEstadoClick(i) {
  const e = a.value.porEstado[idx(i)];
  if (e) abrirDetalhe(`Ocorrências — ${STATE_NAMES[e.label] || e.label}`, e.itens);
}
function onCidClick(i) {
  const c = a.value.porCid[idx(i)];
  if (c) abrirDetalhe(`Atestados — CID ${c.label}`, c.itens);
}
function onGeneroClick({ index }) {
  const g = a.value.porGenero[index];
  if (g) abrirDetalhe(`Ocorrências — ${g.label}`, g.itens);
}
function onDiaMesClick({ index }) {
  const d = a.value.porDiaDoMes[index];
  if (d) abrirDetalhe(`Ocorrências do dia ${d.label}/${ym.value.slice(5, 7)}`, d.itens);
}
function onSemanaClick({ index }) {
  const d = a.value.porDiaSemana[index];
  if (d) abrirDetalhe(`Ocorrências — ${d.label}`, d.itens);
}
function onFuncaoClick({ index }) {
  const g = a.value.porFuncao[index];
  if (g) abrirDetalhe(`Ocorrências — ${g.label}`, g.itens);
}
function onFilialClick(g) {
  abrirDetalhe(`Ocorrências — ${g.label}`, g.itens);
}
function onColabClick(c) {
  abrirDetalhe(c.colaborador, c.itens, `${c.filial} · ${periodo.value}`);
}
function onExperienciaClick(i) {
  const e = idx(i);
  if (e === 0) abrirDetalhe("Em período de experiência", a.value.experiencia.emExperiencia);
  else if (e === 1) abrirDetalhe("Demais colaboradores", a.value.experiencia.demais);
}

const INSIGHT_DOT = { warn: "bg-rose-500", ok: "bg-emerald-500", info: "bg-sky-500" };
const cardCls = "overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-900";
const headCls = "border-b border-zinc-100 px-5 py-3.5 dark:border-zinc-800";
</script>

<template>
  <Modal title="Análise de Absenteísmo" :subtitle="`${escopo}${regionalSel ? ` · ${regionalSel}` : ''} · ${periodo}`" :open="open" fullscreen @close="emit('close')">
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
          :class="estadoSel === o.id ? 'bg-accent text-white shadow-sm' : 'text-zinc-600 hover:bg-zinc-200/70 dark:text-zinc-300 dark:hover:bg-zinc-700'"
          :aria-pressed="estadoSel === o.id"
          @click="estadoSel = o.id"
        >
          {{ o.label }}
        </button>
      </div>
      </div>
    </template>

    <div class="-m-3 min-h-full bg-zinc-50 p-3 sm:-m-6 sm:p-6 dark:bg-zinc-950/60">
      <div class="mx-auto flex max-w-[120rem] flex-col gap-6">
        <p
          v-if="a.headcountRef.fallback"
          class="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-300"
        >
          Ainda não há Headcount de {{ periodo }}: a taxa usa os ativos de {{ ymLabel(a.headcountRef.ym) }}.
        </p>

        <div class="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">
          <div v-for="c in cards" :key="c.label" :class="[cardCls, 'relative p-5 text-center']">
            <p class="text-[11px] font-semibold uppercase tracking-widest text-zinc-500 dark:text-zinc-400">{{ c.label }}</p>
            <p class="mt-1.5 text-4xl font-bold leading-none tabular-nums" :class="c.tone">{{ c.value }}</p>
            <p class="mt-2 text-xs" :class="c.subCls">{{ c.sub }}</p>
          </div>
        </div>

        <AbsenteismoKpis :ocorrencias="a.itens" neutral class="lg:!w-full lg:!min-w-0" />

        <template v-if="a.total > 0">
          <div class="grid gap-5 md:grid-cols-2 lg:grid-cols-3">
            <section :class="cardCls">
              <header :class="headCls">
                <h3 class="text-sm font-bold text-zinc-900 dark:text-zinc-100">Por tipo de ocorrência</h3>
                <p class="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">Cada ocorrência em um só tipo: o motivo (ou a marcação, se não houver motivo). Clique para ver as ocorrências)</p>
              </header>
              <div class="p-4">
                <PieChart :data="motivoPie" show-values height="h-72" :center-value="String(a.total)" center-caption="Ocorrências" value-format="count" clickable @chart-click="onMotivoClick" />
              </div>
            </section>

            <section :class="cardCls">
              <header :class="headCls">
                <h3 class="text-sm font-bold text-zinc-900 dark:text-zinc-100">Por estado</h3>
                <p class="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">Ocorrências de cada estado</p>
              </header>
              <div class="p-4">
                <PieChart :data="estadoPie" show-values height="h-72" :center-value="String(a.total)" center-caption="Ocorrências" value-format="count" clickable @chart-click="onEstadoClick" />
              </div>
            </section>

            <section :class="cardCls">
              <header :class="headCls">
                <h3 class="text-sm font-bold text-zinc-900 dark:text-zinc-100">Por CID</h3>
                <p class="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">Atestados de cada CID (clique para ver os atestados)</p>
              </header>
              <div class="p-4">
                <PieChart v-if="totalCid" :data="cidPie" show-values height="h-72" :center-value="String(totalCid)" center-caption="Atestados" value-format="count" clickable @chart-click="onCidClick" />
                <p v-else class="flex h-72 items-center justify-center text-center text-sm text-zinc-500 dark:text-zinc-400">Nenhum atestado com CID informado neste período.</p>
              </div>
            </section>
          </div>

          <div class="grid gap-5 lg:grid-cols-4">
            <section :class="[cardCls, 'lg:col-span-2']">
              <header :class="headCls">
                <h3 class="text-sm font-bold text-zinc-900 dark:text-zinc-100">Ocorrências por dia do mês</h3>
                <p class="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">Para identificar picos (clique numa barra para ver o dia)</p>
              </header>
              <div class="p-4">
                <BarChart :data="diaMesData" variant="line" line-x-labels :show-trend="false" :height-px="280" bars-clickable @bar-click="onDiaMesClick" />
              </div>
            </section>

            <section :class="cardCls">
              <header :class="headCls">
                <h3 class="text-sm font-bold text-zinc-900 dark:text-zinc-100">Por gênero</h3>
                <p class="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">Taxa de absenteísmo sobre os ativos de cada gênero</p>
              </header>
              <div class="p-4">
                <BarChart :data="generoData" show-values value-format="percent2" :show-trend="false" :height-px="288" bars-clickable @bar-click="onGeneroClick" />
              </div>
            </section>

            <section :class="cardCls">
              <header :class="headCls">
                <h3 class="text-sm font-bold text-zinc-900 dark:text-zinc-100">Por dia da semana</h3>
                <p class="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">Em que dias as ausências mais se concentram</p>
              </header>
              <div class="p-4">
                <BarChart :data="semanaData" show-values :show-trend="false" :height-px="280" bars-clickable @bar-click="onSemanaClick" />
              </div>
            </section>
          </div>
        </template>

        <section :class="cardCls">
          <header :class="headCls">
            <h3 class="text-sm font-bold text-zinc-900 dark:text-zinc-100">Tendência — últimos 6 meses</h3>
            <p class="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">Taxa de absenteísmo de cada mês (o total de ocorrências aparece ao passar o mouse)</p>
          </header>
          <div class="p-4">
            <BarChart :data="tendenciaData" show-values value-format="percent2" :show-trend="false" :height-px="260" />
          </div>
        </section>

        <template v-if="a.total > 0">
          <section :class="cardCls">
            <header :class="headCls">
              <h3 class="text-sm font-bold text-zinc-900 dark:text-zinc-100">Por função</h3>
              <p class="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">Taxa de absenteísmo sobre os ativos de cada função, do maior para o menor</p>
            </header>
            <div class="p-4">
              <BarChart :data="funcaoData" show-values value-format="percent2" :show-trend="false" horizontal align-top :height-px="funcaoHeight" bars-clickable @bar-click="onFuncaoClick" />
            </div>
          </section>

          <section :class="cardCls">
            <header :class="headCls">
              <h3 class="text-sm font-bold text-zinc-900 dark:text-zinc-100">Filiais críticas</h3>
              <p class="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">Ranking pela taxa de absenteísmo sobre os ativos da filial, com a variação contra o mês anterior</p>
            </header>
            <div class="grid gap-5 p-4 lg:grid-cols-3">
              <ul class="flex flex-col gap-3 lg:col-span-1">
                <li
                  v-for="(i, n) in a.insights"
                  :key="n"
                  class="flex items-start gap-3 rounded-xl border border-zinc-100 bg-zinc-50 px-4 py-3 text-sm text-zinc-700 dark:border-zinc-800 dark:bg-zinc-800/50 dark:text-zinc-200"
                >
                  <span class="mt-1.5 h-2 w-2 shrink-0 rounded-full" :class="INSIGHT_DOT[i.tone]" />
                  <span>{{ i.text }}</span>
                </li>
              </ul>
              <div class="overflow-hidden rounded-xl border border-zinc-200 lg:col-span-2 dark:border-zinc-800">
                <div class="max-h-[26rem] overflow-auto">
                  <table class="w-full min-w-max text-left text-sm">
                    <thead class="sticky top-0 z-10 bg-white dark:bg-zinc-900">
                      <tr class="border-b border-zinc-100 text-xs uppercase tracking-wide text-zinc-400 dark:border-zinc-800 dark:text-zinc-400">
                        <th class="px-4 py-2.5 font-semibold">#</th>
                        <th class="px-4 py-2.5 font-semibold">Filial</th>
                        <th class="px-4 py-2.5 text-right font-semibold">Ocorrências</th>
                        <th class="px-4 py-2.5 text-right font-semibold">Dias</th>
                        <th class="px-4 py-2.5 text-right font-semibold">Ativos</th>
                        <th class="px-4 py-2.5 text-right font-semibold">Taxa</th>
                        <th class="px-4 py-2.5 text-right font-semibold">vs mês anterior</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr
                        v-for="(g, n) in a.porFilial"
                        :key="g.label"
                        class="cursor-pointer border-b border-zinc-100 transition last:border-0 hover:bg-zinc-50 dark:border-zinc-800 dark:hover:bg-zinc-800/60"
                        @click="onFilialClick(g)"
                      >
                        <td class="px-4 py-2.5 tabular-nums text-zinc-400">{{ n + 1 }}</td>
                        <td class="whitespace-nowrap px-4 py-2.5 font-medium text-zinc-900 dark:text-zinc-100">{{ g.label }}</td>
                        <td class="px-4 py-2.5 text-right tabular-nums text-zinc-700 dark:text-zinc-200">{{ g.ocorrencias }}</td>
                        <td class="px-4 py-2.5 text-right tabular-nums text-zinc-700 dark:text-zinc-200">{{ nf(g.dias, 1) }}</td>
                        <td class="px-4 py-2.5 text-right tabular-nums text-zinc-500 dark:text-zinc-400">{{ nf(g.ativos) }}</td>
                        <td class="px-4 py-2.5 text-right font-semibold tabular-nums text-rose-600 dark:text-rose-400">{{ fmtPct(g.taxa) }}</td>
                        <td
                          class="whitespace-nowrap px-4 py-2.5 text-right tabular-nums"
                          :class="g.variacao == null ? 'text-zinc-400' : g.variacao > 0.005 ? 'text-rose-600 dark:text-rose-400' : g.variacao < -0.005 ? 'text-emerald-600 dark:text-emerald-400' : 'text-zinc-500'"
                        >
                          {{ g.variacao == null ? "—" : Math.abs(g.variacao) < 0.005 ? "igual" : `${g.variacao > 0 ? "▲" : "▼"} ${nf(Math.abs(g.variacao), 2)} p.p.` }}
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          </section>

          <div class="grid gap-5 lg:grid-cols-3">
            <section :class="[cardCls, 'lg:col-span-2']">
              <header :class="headCls">
                <h3 class="text-sm font-bold text-zinc-900 dark:text-zinc-100">Reincidentes</h3>
                <p class="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">
                  Colaboradores com mais ocorrências no mês · alerta para 3 ou mais ocorrências, 3 ou mais faltas ou alguma advertência
                </p>
              </header>
              <ul class="divide-y divide-zinc-100 dark:divide-zinc-800">
                <li
                  v-for="c in a.reincidentes"
                  :key="c.colaborador"
                  class="flex cursor-pointer items-center gap-3 px-5 py-3 transition hover:bg-zinc-50 dark:hover:bg-zinc-800/60"
                  @click="onColabClick(c)"
                >
                  <span class="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-sm font-bold tabular-nums" :class="c.alerta ? 'bg-rose-100 text-rose-700 dark:bg-rose-500/20 dark:text-rose-300' : 'bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300'">
                    {{ c.total }}
                  </span>
                  <span class="min-w-0 flex-1">
                    <span class="block truncate text-sm font-semibold uppercase text-zinc-900 dark:text-zinc-100">{{ c.colaborador }}</span>
                    <span class="block truncate text-xs uppercase text-zinc-400 dark:text-zinc-500">{{ c.filial }} · {{ c.setor }}</span>
                  </span>
                  <span class="shrink-0 text-right text-xs text-zinc-500 dark:text-zinc-400">
                    {{ nf(c.dias, 1) }} {{ c.dias === 1 ? "dia" : "dias" }}
                    <span v-if="c.faltas" class="block">{{ c.faltas }} {{ c.faltas === 1 ? "falta" : "faltas" }}</span>
                    <span v-if="c.advertencias" class="block font-semibold text-orange-600 dark:text-orange-400">{{ c.advertencias }} {{ c.advertencias === 1 ? "advertência" : "advertências" }}</span>
                  </span>
                </li>
              </ul>
            </section>

            <section :class="cardCls">
              <header :class="headCls">
                <h3 class="text-sm font-bold text-zinc-900 dark:text-zinc-100">Período de experiência</h3>
                <p class="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">
                  Ocorrências de quem tem até 90 dias de casa
                  <template v-if="a.experiencia.pctDasOcorrencias !== null">
                    · <span class="font-semibold text-zinc-700 dark:text-zinc-200">{{ nf(a.experiencia.pctDasOcorrencias, 1) }}%</span> do total
                  </template>
                </p>
              </header>
              <div class="p-4">
                <PieChart
                  :data="experienciaPie"
                  height="h-72"
                  :center-value="String(a.experiencia.emExperiencia.length)"
                  center-caption="Em experiência"
                  value-format="count"
                  clickable
                  @chart-click="onExperienciaClick"
                />
              </div>
            </section>
          </div>
        </template>

        <EmptyState
          v-else
          title="Sem ocorrências de absenteísmo"
          :text="`Nenhuma ocorrência lançada em ${periodo} para ${escopo}. Troque o mês no filtro do dashboard ou lance pelo Mapa de Absenteísmo.`"
        />

        <p class="rounded-lg px-1 text-[11px] leading-relaxed text-zinc-500 dark:text-zinc-400">
          <strong>Como é calculado.</strong> Taxa de absenteísmo = dias de ausência ÷ (ativos × dias úteis) × 100. Dias úteis: segunda a sábado
          ({{ a.uteis }} em {{ periodo }}). Dias de ausência: Falta, Atestado, Suspensão e Acidente de trabalho = 1 dia;
          Advertência não conta como ausência. Ativos: Headcount de {{ ymLabel(a.headcountRef.ym) }} ({{ nf(a.ativos) }} colaboradores).
        </p>
      </div>
    </div>

    <AbsenteismoDetalheModal
      v-if="detalhe.open"
      :open="detalhe.open"
      :title="detalhe.title"
      :subtitle="detalhe.subtitle"
      :rows="detalhe.rows"
      @close="detalhe.open = false"
    />
  </Modal>
</template>
