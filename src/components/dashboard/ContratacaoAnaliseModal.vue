<script setup>
import { computed, ref, watch } from "vue";
import GerenteRegionalFilter from "@/components/dashboard/GerenteRegionalFilter.vue";
import Modal from "@/components/ui/Modal.vue";
import Badge from "@/components/ui/Badge.vue";
import PieChart from "@/components/charts/PieChart.vue";
import BarChart from "@/components/charts/BarChart.vue";
import { STATE_NAMES, STATES } from "@/lib/config";
import { listVacancies } from "@/lib/employees";
import { hydrateState } from "@/lib/db";
import { dateFilter } from "@/composables/useDateFilter";
import { useFilters } from "@/composables/useFilters";
import { formatDate, formatCurrency, daysBetween, ymLabel } from "@/lib/utils";

defineProps({
  open: { type: Boolean, default: false }
});

const emit = defineEmits(["close", "abrir-vagas"]);

const { state } = useFilters();

const estadoSel = ref(!state.current || state.current === "todos" ? "todos" : state.current);
const estadoOptions = [{ id: "todos", label: "Todos" }, ...STATES.map((s) => ({ id: s, label: s }))];

watch(
  estadoSel,
  async (st) => {
    try {
      await hydrateState(st);
    } catch (err) {
      console.warn("[ContratacaoAnaliseModal] Falha ao carregar dados do estado:", err);
    }
  },
  { immediate: true }
);

const range = computed(() => (dateFilter.start ? { start: dateFilter.start, end: dateFilter.end } : null));
const recrutadorSel = ref("");

const escopo = computed(() => {
  const st = estadoSel.value;
  return !st || st === "todos" ? "Todos os estados" : STATE_NAMES[st] || st;
});
const periodo = computed(() =>
  dateFilter.start ? ymLabel(String(dateFilter.end || dateFilter.start).slice(0, 7)) : "Todo o período"
);

const dia = (v) => (v ? String(v).slice(0, 10) : "");
const noPeriodo = (data, rng) => {
  const d = dia(data);
  if (!rng) return true;
  if (!d) return false;
  return (!rng.start || d >= rng.start) && (!rng.end || d <= rng.end);
};

const recrutadorOptions = computed(() => {
  const set = new Set();
  listVacancies(estadoSel.value).forEach((v) => v.recrutador && set.add(v.recrutador));
  return [...set].sort((a, b) => a.localeCompare(b, "pt-BR"));
});
watch(recrutadorOptions, (opts) => {
  if (recrutadorSel.value && !opts.includes(recrutadorSel.value)) recrutadorSel.value = "";
});

function vagasDoPeriodo(rng) {
  return listVacancies(estadoSel.value).filter(
    (v) => (!recrutadorSel.value || v.recrutador === recrutadorSel.value) && noPeriodo(v.openAt, rng)
  );
}

// Não alterar para openAt: o KPI de custo considera as vagas fechadas no mês do filtro.
function fechadasNoPeriodo(rng) {
  return listVacancies(estadoSel.value).filter(
    (v) => (!recrutadorSel.value || v.recrutador === recrutadorSel.value) && v.closeAt && Number(v.salario) > 0 && noPeriodo(v.closeAt, rng)
  );
}

const diasDaVaga = (v) => {
  if (!v.openAt || !v.closeAt) return null;
  const d = daysBetween(v.openAt, v.closeAt);
  return d !== null && Number.isFinite(d) && d >= 0 ? d : null;
};

const media = (nums) => (nums.length ? nums.reduce((s, n) => s + n, 0) / nums.length : null);

function resumo(vagas, custoBase) {
  const fechadas = vagas.filter((v) => v.closeAt);
  return {
    total: vagas.length,
    abertas: vagas.length - fechadas.length,
    fechadas: fechadas.length,
    tempoMedio: media(fechadas.map(diasDaVaga).filter((d) => d !== null)),
    custoMedio: media(custoBase.map((v) => Number(v.salario)))
  };
}

const vagas = computed(() => vagasDoPeriodo(range.value));
const stats = computed(() => resumo(vagas.value, fechadasNoPeriodo(range.value)));

const fmtDias = (d) => (d === null ? "—" : `${d.toFixed(1).replace(".", ",")} dias`);
const fmtDelta = (d) => `${d > 0 ? "+" : ""}${d.toFixed(1).replace(".", ",")} d`;
const fmtPct = (v) => `${v.toFixed(1).replace(".", ",")}%`;

function norm(v, fallback) {
  return String(v || "").trim().toUpperCase() || fallback;
}

function groupBy(keyOf, rng = range.value) {
  const grupos = new Map();
  const lista = rng === range.value ? vagas.value : vagasDoPeriodo(rng);
  lista.forEach((v) => {
    const k = keyOf(v);
    if (!grupos.has(k)) grupos.set(k, []);
    grupos.get(k).push(v);
  });
  const custos = new Map();
  fechadasNoPeriodo(rng).forEach((v) => {
    const k = keyOf(v);
    if (!custos.has(k)) custos.set(k, []);
    custos.get(k).push(v);
  });
  const chaves = new Set([...grupos.keys(), ...custos.keys()]);
  return [...chaves].map((label) => ({
    label,
    items: grupos.get(label) || [],
    ...resumo(grupos.get(label) || [], custos.get(label) || [])
  }));
}

const porTempoDesc = (a, b) =>
  (b.tempoMedio ?? -1) - (a.tempoMedio ?? -1) || b.total - a.total || a.label.localeCompare(b.label, "pt-BR");

const tipoKey = (v) => norm(v.tipoContratacao, "NÃO INFORMADO");
const motivoKey = (v) => norm(v.motivoContratacao, "NÃO INFORMADO");
const recrutadorKey = (v) => norm(v.recrutador, "SEM RECRUTADOR");
const funcaoKey = (v) => norm(v.name, "SEM FUNÇÃO");

const tipoRows = computed(() => groupBy(tipoKey).filter((r) => r.total).sort(porTempoDesc));
const motivoRows = computed(() => groupBy(motivoKey).filter((r) => r.total).sort((a, b) => b.total - a.total || a.label.localeCompare(b.label, "pt-BR")));
const recrutadorRows = computed(() => groupBy(recrutadorKey).filter((r) => r.total).sort(porTempoDesc));
const funcaoRows = computed(() => groupBy(funcaoKey).filter((r) => r.total).sort(porTempoDesc));

const COR_FECHADA = "#16a34a";
const COR_ABERTA = "#E8AF3E";
const PALETA = ["#0284c7", "#db2777", "#16a34a", "#E8AF3E", "#7c3aed", "#dc2626", "#0d9488", "#a1a1aa"];

const statusData = computed(() => [
  { label: "Fechadas", value: stats.value.fechadas, color: COR_FECHADA },
  { label: "Em aberto", value: stats.value.abertas, color: COR_ABERTA }
]);

const MOTIVO_MIN_PCT = 4;
const motivoFatias = computed(() => {
  const rows = motivoRows.value;
  const total = rows.reduce((s, r) => s + r.total, 0);
  const grandes = rows.filter((r) => total && (r.total / total) * 100 >= MOTIVO_MIN_PCT);
  const pequenas = rows.filter((r) => !grandes.includes(r));
  const fatias = grandes.map((r) => ({ label: r.label, items: r.items }));
  if (pequenas.length === 1) fatias.push({ label: pequenas[0].label, items: pequenas[0].items });
  else if (pequenas.length) fatias.push({ label: "OUTROS", items: pequenas.flatMap((r) => r.items) });
  return fatias;
});
const motivoData = computed(() =>
  motivoFatias.value.map((f, i) => ({ label: f.label, value: f.items.length, color: PALETA[i % PALETA.length] }))
);

const barraDias = (rows, serie = "Tempo médio (dias)") =>
  rows.map((r) => ({
    label: r.label,
    series: [{ label: serie, value: r.tempoMedio === null ? 0 : Number(r.tempoMedio.toFixed(1)), color: "#0284c7" }]
  }));
const tipoData = computed(() =>
  tipoRows.value.map((r) => ({
    label: r.label,
    series: [
      { label: "Fechadas", value: r.fechadas, color: COR_FECHADA },
      { label: "Em aberto", value: r.abertas, color: COR_ABERTA }
    ]
  }))
);
const funcaoData = computed(() => barraDias(funcaoRows.value));

const grupo = ref(null);

function abrirGrupo(title, items, extra = {}) {
  grupo.value = {
    title,
    subtitle: `${escopo.value} · ${periodo.value}`,
    items: items.slice().sort((a, b) => dia(b.openAt).localeCompare(dia(a.openAt))),
    ...extra
  };
}

function onStatusClick(i) {
  if (i !== 0 && i !== 1) return;
  const fechada = i === 0;
  abrirGrupo(`Vagas ${fechada ? "fechadas" : "em aberto"}`, vagas.value.filter((v) => Boolean(v.closeAt) === fechada));
}
function onMotivoClick(i) {
  const row = motivoFatias.value[i];
  if (row) abrirGrupo(`Motivo — ${row.label}`, row.items);
}
function onTipoClick({ index }) {
  const row = tipoRows.value[index];
  if (row) abrirGrupo(`Tipo — ${row.label}`, row.items);
}
function onFuncaoClick({ index }) {
  const row = funcaoRows.value[index];
  if (row) abrirGrupo(`Função — ${row.label}`, row.items);
}

/* ---------- Filiais em atenção ----------
   Ranking das filiais por tempo médio de contratação, com a variação em dias
   contra o mês anterior ao filtrado. Crítica = tempo ≥ 1,5× o tempo médio geral;
   Atenção = ≥ o tempo médio geral. */
const filialKey = (v) => `${norm(v.filial, "SEM FILIAL")}|${norm(v.estado, "")}`;

function filialLabel(key) {
  const [nome, uf] = key.split("|");
  return estadoSel.value === "todos" && uf ? `${nome} (${uf})` : nome;
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
    .filter((r) => r.total)
    .map((r) => {
      const antes = prev && prev.get(r.label);
      const t = r.tempoMedio;
      const status =
        t === null || geral <= 0 ? "normal" : t >= geral * 1.5 ? "critica" : t >= geral ? "atencao" : "normal";
      return {
        ...r,
        key: r.label,
        nome: filialLabel(r.label),
        delta: t !== null && antes && antes.tempoMedio !== null ? t - antes.tempoMedio : null,
        status
      };
    })
    .sort(porTempoDesc);
});

const STATUS_FILIAL = {
  critica: { label: "Crítica", cls: "bg-red-100 text-red-700 dark:bg-red-500/15 dark:text-red-400" },
  atencao: { label: "Atenção", cls: "bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-400" },
  normal: { label: "Normal", cls: "bg-green-100 text-green-700 dark:bg-green-500/15 dark:text-green-400" }
};

const filialInsights = computed(() => {
  const rows = filialRows.value.filter((r) => r.tempoMedio !== null);
  const list = [];
  if (!rows.length) return list;
  const geral = stats.value.tempoMedio || 0;
  const top = rows[0];
  list.push({
    tone: "red",
    text: `${top.nome} tem o maior tempo de contratação: ${fmtDias(top.tempoMedio)}${geral > 0 ? ` (${fmtDelta(top.tempoMedio - geral)} da média geral)` : ""}.`
  });
  const criticas = rows.filter((r) => r.status === "critica").length;
  list.push({
    tone: criticas ? "red" : "green",
    text: criticas
      ? `${criticas} ${criticas === 1 ? "filial está" : "filiais estão"} em situação crítica (tempo ≥ 1,5× a média geral).`
      : "Nenhuma filial em situação crítica no período."
  });
  const comDelta = rows.filter((r) => r.delta !== null);
  if (comDelta.length) {
    const pioraram = comDelta.filter((r) => r.delta > 0);
    const pior = pioraram.slice().sort((a, b) => b.delta - a.delta)[0];
    list.push({
      tone: pioraram.length ? "amber" : "green",
      text: pioraram.length
        ? `${pioraram.length} de ${comDelta.length} filiais demoraram mais que no mês anterior; maior alta: ${pior.nome} (${fmtDelta(pior.delta)}).`
        : "Nenhuma filial demorou mais que no mês anterior."
    });
  }
  const totalAbertas = filialRows.value.reduce((s, r) => s + r.abertas, 0);
  const maisAbertas = filialRows.value.slice().sort((a, b) => b.abertas - a.abertas)[0];
  if (totalAbertas > 0 && maisAbertas.abertas > 0) {
    list.push({
      tone: "zinc",
      text: `${maisAbertas.nome} concentra ${fmtPct((maisAbertas.abertas / totalAbertas) * 100)} das vagas em aberto (${maisAbertas.abertas} de ${totalAbertas}).`
    });
  }
  return list;
});

const INSIGHT_DOT = { red: "bg-red-500", amber: "bg-amber-500", green: "bg-green-500", zinc: "bg-zinc-400" };

const totalVagas = (rows) => rows.reduce((s, r) => s + r.total, 0);

const tables = computed(() => [
  { title: "Por tipo de contratação", col: "Tipo", rows: tipoRows.value },
  { title: "Por recrutador", col: "Recrutador", rows: recrutadorRows.value, pct: true, totalVagas: totalVagas(recrutadorRows.value) },
  { title: "Por motivo", col: "Motivo", rows: motivoRows.value }
]);

const lancamentos = computed(() =>
  vagas.value
    .map((v) => ({
      key: v.id,
      vaga: v.name || "—",
      tipo: v.tipoContratacao ? String(v.tipoContratacao).toUpperCase() : "—",
      filial: v.filial || "—",
      recrutador: v.recrutador || "—",
      salario: v.salario,
      abertura: v.openAt || "",
      fechamento: v.closeAt || "",
      dias: diasDaVaga(v) ?? (v.openAt && !v.closeAt ? daysBetween(v.openAt, new Date().toISOString().slice(0, 10)) : null),
      fechada: Boolean(v.closeAt)
    }))
    .sort((a, b) => dia(b.abertura).localeCompare(dia(a.abertura)) || a.vaga.localeCompare(b.vaga, "pt-BR"))
);

const totals = computed(() => [
  {
    label: "Tempo médio",
    value: fmtDias(stats.value.tempoMedio),
    sub: "Vagas fechadas do período"
  },
  {
    label: "Vagas",
    value: String(stats.value.total),
    sub: `${stats.value.fechadas} fechadas · ${stats.value.abertas} em aberto`
  },
  {
    label: "Custo médio",
    value: stats.value.custoMedio === null ? "—" : formatCurrency(stats.value.custoMedio),
    sub: "Salário das vagas fechadas no mês"
  },
  {
    label: "Taxa de fechamento",
    value: stats.value.total ? fmtPct((stats.value.fechadas / stats.value.total) * 100) : "—",
    sub: "Fechadas ÷ vagas abertas no período"
  }
]);
</script>

<template>
  <Modal title="Análise de Contratação" :subtitle="`${escopo} · ${periodo}`" :open="open" fullscreen @close="emit('close')">
    <template #actions>
      <div class="flex flex-wrap items-center gap-2">
        <button
          type="button"
          class="rounded-lg border border-zinc-300 px-4 py-2.5 text-[15px] font-medium text-zinc-700 transition hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-800"
          @click="emit('abrir-vagas')"
        >
          Ver vagas
        </button>
        <GerenteRegionalFilter
          v-model="recrutadorSel"
          :options="recrutadorOptions"
          label="Recrutador"
          all-label="Todos os recrutadores"
          title="Filtrar por recrutador"
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

        <div class="grid gap-5 md:grid-cols-2 lg:grid-cols-3">
          <section class="overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
            <header class="border-b border-zinc-100 px-5 py-3.5 dark:border-zinc-800">
              <h3 class="text-sm font-bold text-zinc-900 dark:text-zinc-100">Status das vagas</h3>
              <p class="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">Fechadas vs em aberto no período</p>
            </header>
            <div class="p-4">
              <PieChart
                :data="statusData"
                height="h-72"
                :center-value="String(stats.total)"
                center-caption="Vagas"
                value-format="count"
                clickable
                @chart-click="onStatusClick"
              />
            </div>
          </section>

          <section class="overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
            <header class="border-b border-zinc-100 px-5 py-3.5 dark:border-zinc-800">
              <h3 class="text-sm font-bold text-zinc-900 dark:text-zinc-100">Por tipo de contratação</h3>
              <p class="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">Vagas fechadas e em aberto de cada tipo</p>
            </header>
            <div class="p-4">
              <BarChart :data="tipoData" show-values :show-trend="false" :height-px="288" bars-clickable @bar-click="onTipoClick" />
            </div>
          </section>

          <section class="overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-sm md:col-span-2 lg:col-span-1 dark:border-zinc-800 dark:bg-zinc-900">
            <header class="border-b border-zinc-100 px-5 py-3.5 dark:border-zinc-800">
              <h3 class="text-sm font-bold text-zinc-900 dark:text-zinc-100">Motivo da contratação</h3>
              <p class="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">Quantidade de vagas por motivo</p>
            </header>
            <div class="p-4">
              <PieChart
                :data="motivoData"
                height="h-72"
                :center-value="String(stats.total)"
                center-caption="Vagas"
                value-format="count"
                clickable
                @chart-click="onMotivoClick"
              />
            </div>
          </section>
        </div>

        <section class="overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
          <header class="border-b border-zinc-100 px-5 py-3.5 dark:border-zinc-800">
            <h3 class="text-sm font-bold text-zinc-900 dark:text-zinc-100">Por função</h3>
            <p class="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">
              Tempo médio de contratação (dias) de cada função, do maior para o menor
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
              Ranking por tempo médio de contratação, com a variação contra o mês anterior
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
                      <th class="px-4 py-2.5 text-right font-semibold">Vagas</th>
                      <th class="px-4 py-2.5 text-right font-semibold">Abertas</th>
                      <th class="px-4 py-2.5 text-right font-semibold">Fechadas</th>
                      <th class="px-4 py-2.5 text-right font-semibold">Tempo médio</th>
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
                      <td class="px-4 py-2.5 text-right tabular-nums text-zinc-600 dark:text-zinc-300">{{ r.abertas }}</td>
                      <td class="px-4 py-2.5 text-right tabular-nums text-zinc-600 dark:text-zinc-300">{{ r.fechadas }}</td>
                      <td class="whitespace-nowrap px-4 py-2.5 text-right font-bold tabular-nums text-zinc-900 dark:text-zinc-100">{{ fmtDias(r.tempoMedio) }}</td>
                      <td
                        class="whitespace-nowrap px-4 py-2.5 text-right font-semibold tabular-nums"
                        :class="r.delta === null ? 'text-zinc-400' : r.delta > 0 ? 'text-red-600 dark:text-red-400' : r.delta < 0 ? 'text-green-600 dark:text-green-400' : 'text-zinc-500'"
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
          <p v-else class="px-5 py-8 text-center text-sm text-zinc-500 dark:text-zinc-400">Sem vagas no período.</p>
        </section>

        <div class="grid items-start gap-5 xl:grid-cols-2">
          <div class="flex flex-col gap-5">
            <section
              v-for="t in tables"
              :key="t.title"
              class="overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-900"
            >
              <header class="border-b border-zinc-100 px-5 py-3.5 dark:border-zinc-800">
                <h3 class="text-sm font-bold text-zinc-900 dark:text-zinc-100">Detalhamento {{ t.title.toLowerCase() }}</h3>
              </header>
              <div class="max-h-80 overflow-auto">
                <table class="w-full min-w-max text-left text-sm">
                  <thead class="sticky top-0 z-10 bg-zinc-50 dark:bg-zinc-800">
                    <tr class="text-[11px] uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
                      <th class="px-5 py-2.5 font-semibold">{{ t.col }}</th>
                      <th class="px-4 py-2.5 text-right font-semibold">Vagas</th>
                      <th v-if="t.pct" class="px-4 py-2.5 text-right font-semibold" title="Participação no total de vagas do período">%</th>
                      <th class="px-4 py-2.5 text-right font-semibold">Abertas</th>
                      <th class="px-4 py-2.5 text-right font-semibold">Fechadas</th>
                      <th class="px-4 py-2.5 text-right font-semibold">Tempo médio</th>
                      <th class="px-5 py-2.5 text-right font-semibold">Custo médio</th>
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
                      <td v-if="t.pct" class="whitespace-nowrap px-4 py-2.5 text-right font-semibold tabular-nums text-accent-hover dark:text-accent-light">{{ t.totalVagas ? fmtPct((r.total / t.totalVagas) * 100) : "—" }}</td>
                      <td class="px-4 py-2.5 text-right tabular-nums text-zinc-600 dark:text-zinc-300">{{ r.abertas }}</td>
                      <td class="px-4 py-2.5 text-right tabular-nums text-zinc-600 dark:text-zinc-300">{{ r.fechadas }}</td>
                      <td class="whitespace-nowrap px-4 py-2.5 text-right font-bold tabular-nums text-zinc-900 dark:text-zinc-100">{{ fmtDias(r.tempoMedio) }}</td>
                      <td class="whitespace-nowrap px-5 py-2.5 text-right tabular-nums text-zinc-600 dark:text-zinc-300">{{ r.custoMedio === null ? "—" : formatCurrency(r.custoMedio) }}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </section>
          </div>

          <section class="overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
            <header class="flex items-center justify-between border-b border-zinc-100 px-5 py-3.5 dark:border-zinc-800">
              <h3 class="text-sm font-bold text-zinc-900 dark:text-zinc-100">Lançamentos</h3>
            </header>
            <div v-if="lancamentos.length" class="max-h-[40rem] overflow-auto">
              <table class="w-full min-w-max text-left text-sm">
                <thead class="sticky top-0 z-10 bg-zinc-50 dark:bg-zinc-800">
                  <tr class="text-[11px] uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
                    <th class="px-5 py-2.5 font-semibold">Status</th>
                    <th class="px-4 py-2.5 font-semibold">Vaga</th>
                    <th class="px-4 py-2.5 font-semibold">Filial</th>
                    <th class="px-4 py-2.5 font-semibold">Recrutador</th>
                    <th class="px-4 py-2.5 font-semibold">Abertura</th>
                    <th class="px-4 py-2.5 font-semibold">Fechamento</th>
                    <th class="px-5 py-2.5 text-right font-semibold">Dias</th>
                  </tr>
                </thead>
                <tbody class="uppercase">
                  <tr
                    v-for="l in lancamentos"
                    :key="l.key"
                    class="border-t border-zinc-100 transition-colors hover:bg-zinc-50 dark:border-zinc-800 dark:hover:bg-zinc-800/50"
                  >
                    <td class="whitespace-nowrap px-5 py-2.5">
                      <Badge :tone="l.fechada ? 'dark' : 'accent'">{{ l.fechada ? "Fechada" : "Aberta" }}</Badge>
                    </td>
                    <td class="whitespace-nowrap px-4 py-2.5 font-medium text-zinc-900 dark:text-zinc-100">{{ l.vaga }}</td>
                    <td class="whitespace-nowrap px-4 py-2.5 text-zinc-600 dark:text-zinc-300">{{ l.filial }}</td>
                    <td class="whitespace-nowrap px-4 py-2.5 text-zinc-600 dark:text-zinc-300">{{ l.recrutador }}</td>
                    <td class="whitespace-nowrap px-4 py-2.5 tabular-nums text-zinc-600 dark:text-zinc-300">{{ l.abertura ? formatDate(l.abertura) : "—" }}</td>
                    <td class="whitespace-nowrap px-4 py-2.5 tabular-nums text-zinc-600 dark:text-zinc-300">{{ l.fechamento ? formatDate(l.fechamento) : "—" }}</td>
                    <td class="whitespace-nowrap px-5 py-2.5 text-right tabular-nums text-zinc-600 dark:text-zinc-300">{{ l.dias === null ? "—" : l.dias.toFixed(1).replace(".", ",") }}</td>
                  </tr>
                </tbody>
              </table>
            </div>
            <p v-else class="px-5 py-8 text-center text-sm text-zinc-500 dark:text-zinc-400">Nenhuma vaga aberta no período.</p>
          </section>
        </div>

        <p class="border-t border-zinc-200 pt-4 text-center text-xs text-zinc-400 dark:border-zinc-800 dark:text-zinc-500">
          Vagas = abertas no mês filtrado · Tempo médio = dias entre abertura e fechamento das vagas fechadas · Custo médio =
          salário médio das vagas fechadas no mês · Filial crítica = tempo ≥ 1,5× o geral; atenção = ≥ o geral. Fonte: Vagas.
        </p>
      </div>
    </div>

    <Modal v-if="grupo" open :title="grupo.title" :subtitle="grupo.subtitle" max-width="max-w-5xl" @close="grupo = null">
      <div class="overflow-hidden rounded-xl border border-zinc-200 dark:border-zinc-800">
        <div class="max-h-[28rem] overflow-auto">
          <table class="w-full min-w-max text-left text-sm">
            <thead class="sticky top-0 z-10 bg-white dark:bg-zinc-900">
              <tr class="border-b border-zinc-100 text-xs uppercase tracking-wide text-zinc-400 dark:border-zinc-800">
                <th class="px-4 py-2.5 font-semibold">Vaga</th>
                <th class="px-4 py-2.5 font-semibold">Tipo</th>
                <th class="px-4 py-2.5 font-semibold">Filial</th>
                <th class="px-4 py-2.5 font-semibold">Recrutador</th>
                <th class="px-4 py-2.5 font-semibold">Abertura</th>
                <th class="px-4 py-2.5 font-semibold">Fechamento</th>
                <th class="px-4 py-2.5 font-semibold">Status</th>
              </tr>
            </thead>
            <tbody class="uppercase">
              <tr v-for="v in grupo.items" :key="v.id" class="border-b border-zinc-100 last:border-0 dark:border-zinc-800">
                <td class="whitespace-nowrap px-4 py-2.5 font-medium text-zinc-900 dark:text-zinc-100">{{ v.name }}</td>
                <td class="whitespace-nowrap px-4 py-2.5 text-zinc-700 dark:text-zinc-300">{{ v.tipoContratacao ? String(v.tipoContratacao).toUpperCase() : "—" }}</td>
                <td class="whitespace-nowrap px-4 py-2.5 text-zinc-700 dark:text-zinc-300">{{ v.filial || "—" }}</td>
                <td class="whitespace-nowrap px-4 py-2.5 text-zinc-700 dark:text-zinc-300">{{ v.recrutador || "—" }}</td>
                <td class="whitespace-nowrap px-4 py-2.5 text-zinc-700 dark:text-zinc-300">{{ formatDate(v.openAt) }}</td>
                <td class="whitespace-nowrap px-4 py-2.5 text-zinc-700 dark:text-zinc-300">{{ v.closeAt ? formatDate(v.closeAt) : "—" }}</td>
                <td class="whitespace-nowrap px-4 py-2.5">
                  <Badge :tone="v.closeAt ? 'dark' : 'accent'">{{ v.closeAt ? "Fechada" : "Aberta" }}</Badge>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
        <div class="border-t border-zinc-100 px-4 py-2 text-xs text-zinc-400 dark:border-zinc-800">
          {{ grupo.items.length === 1 ? "1 vaga" : `${grupo.items.length} vagas` }}
        </div>
      </div>
    </Modal>
  </Modal>
</template>
