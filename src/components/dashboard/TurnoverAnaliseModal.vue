<script setup>
import { computed, ref } from "vue";
import Modal from "@/components/ui/Modal.vue";
import PieChart from "@/components/charts/PieChart.vue";
import BarChart from "@/components/charts/BarChart.vue";
import TurnoverGrupoModal from "@/components/dashboard/TurnoverGrupoModal.vue";
import { STATE_NAMES, STATES } from "@/lib/config";
import { turnoverRateStats, headcountMovements, headcountActiveInRange, findBranchByShortName } from "@/lib/employees";
import { dateFilter } from "@/composables/useDateFilter";
import { useFilters } from "@/composables/useFilters";
import { formatValue, formatDate, ymLabel } from "@/lib/utils";

defineProps({
  open: { type: Boolean, default: false }
});

const emit = defineEmits(["close"]);

const { state } = useFilters();
const PERCENT = { type: "percent", decimals: 1 };

const estadoSel = ref(!state.current || state.current === "todos" ? "todos" : state.current);
const estadoOptions = [{ id: "todos", label: "Todos" }, ...STATES.map((s) => ({ id: s, label: s }))];

const range = computed(() => (dateFilter.start ? { start: dateFilter.start, end: dateFilter.end } : null));
const stats = computed(() => turnoverRateStats(estadoSel.value, range.value));
const movements = computed(() => headcountMovements(estadoSel.value, range.value));

const escopo = computed(() => {
  const st = estadoSel.value;
  return !st || st === "todos" ? "Todos os estados" : STATE_NAMES[st] || st;
});
const periodo = computed(() =>
  dateFilter.start ? ymLabel(String(dateFilter.end || dateFilter.start).slice(0, 7)) : "Todo o período"
);

const pieData = computed(() => [
  { label: "Entrada", value: stats.value.turnoverEntradaPct },
  { label: "Saída", value: stats.value.turnoverSaidaPct }
]);
const centerValue = computed(() =>
  stats.value.turnoverPct === null ? "—" : formatValue(PERCENT, stats.value.turnoverPct)
);

function norm(v, fallback) {
  return String(v || "").trim().toUpperCase() || fallback;
}

const pct = (n, ativos) => (ativos ? (n / ativos) * 100 : 0);

function groupBy(keyOf, rng = range.value) {
  const map = new Map();
  const bump = (list, field) =>
    list.forEach((h) => {
      const k = keyOf(h);
      const row = map.get(k) || { ativos: 0, entradas: 0, saidas: 0 };
      row[field] += 1;
      map.set(k, row);
    });
  const mov = rng === range.value ? movements.value : headcountMovements(estadoSel.value, rng);
  bump(headcountActiveInRange(estadoSel.value, rng), "ativos");
  bump(mov.admissoes, "entradas");
  bump(mov.demissoes, "saidas");
  return [...map.entries()].map(([label, r]) => ({
    label,
    ...r,
    entradaPct: pct(r.entradas, r.ativos),
    saidaPct: pct(r.saidas, r.ativos),
    turnoverPct: pct((r.entradas + r.saidas) / 2, r.ativos)
  }));
}

const funcaoKey = (h) => norm(h.funcao, "SEM FUNÇÃO");
const funcaoRows = computed(() =>
  groupBy(funcaoKey).sort(
    (a, b) => b.turnoverPct - a.turnoverPct || b.entradas + b.saidas - (a.entradas + a.saidas) || a.label.localeCompare(b.label, "pt-BR")
  )
);

const COR_ENTRADA = "#16a34a";
const COR_SAIDA = "#dc2626";

const funcaoData = computed(() =>
  funcaoRows.value.map((r) => ({
    label: r.label,
    series: [
      { label: "Entrada (%)", value: r.entradaPct, color: COR_ENTRADA },
      { label: "Saída (%)", value: r.saidaPct, color: COR_SAIDA }
    ]
  }))
);

const GENERO_LABEL = { masculino: "Masculino", feminino: "Feminino" };
const generoKey = (h) => GENERO_LABEL[String(h.genero || "").trim().toLowerCase()] || "Não informado";
const generoRows = computed(() =>
  groupBy(generoKey).sort((a, b) => {
    const order = ["Masculino", "Feminino", "Não informado"];
    return order.indexOf(a.label) - order.indexOf(b.label);
  })
);

const generoData = computed(() => {
  const rows = generoRows.value;
  return [
    { label: "Entrada (%)", series: rows.map((r) => ({ label: r.label, value: r.entradaPct })) },
    { label: "Saída (%)", series: rows.map((r) => ({ label: r.label, value: r.saidaPct })) }
  ];
});

const fmtPct = (v) => formatValue(PERCENT, v);

const DIAS_EXPERIENCIA = 90;

function diasDeCasa(h) {
  const a = new Date(`${String(h.dataAdmissao || "").slice(0, 10)}T00:00:00`);
  const d = new Date(`${String(h.dataDesligamento || "").slice(0, 10)}T00:00:00`);
  if (isNaN(a) || isNaN(d)) return null;
  return Math.round((d - a) / 86400000);
}

const experienciaItems = computed(() =>
  movements.value.demissoes.filter((h) => {
    const dias = diasDeCasa(h);
    return dias !== null && dias >= 0 && dias <= DIAS_EXPERIENCIA;
  })
);

const GENERO_COR = { Masculino: "#0284c7", Feminino: "#db2777", "Não informado": "#a1a1aa" };
const experienciaData = computed(() => {
  const counts = new Map();
  experienciaItems.value.forEach((h) => counts.set(generoKey(h), (counts.get(generoKey(h)) || 0) + 1));
  return ["Masculino", "Feminino", "Não informado"]
    .filter((g) => g !== "Não informado" || counts.get(g))
    .map((g) => ({ label: g, value: counts.get(g) || 0, color: GENERO_COR[g] }));
});
const experienciaPctDosDesligados = computed(() => {
  const total = movements.value.demissoes.length;
  return total ? (experienciaItems.value.length / total) * 100 : null;
});

function onExperienciaClick(sliceIndex) {
  const slice = experienciaData.value[sliceIndex];
  if (!slice) return;
  const items = experienciaItems.value.filter((h) => generoKey(h) === slice.label);
  grupo.value = {
    title: `Saídas em experiência — ${slice.label}`,
    subtitle: `${escopo.value} · ${periodo.value} · até ${DIAS_EXPERIENCIA} dias de casa`,
    entrada: false,
    items,
    cards: [
      { label: "Em experiência", value: String(items.length) },
      { label: "Total no período", value: String(experienciaItems.value.length) }
    ]
  };
}

const grupo = ref(null);

function openGrupo({ title, entrada, keyOf, key, row }) {
  const list = entrada ? movements.value.admissoes : movements.value.demissoes;
  const items = key == null ? list : list.filter((h) => keyOf(h) === key);
  const cards = row
    ? [
        { label: "Ativos", value: String(row.ativos) },
        { label: entrada ? "Entradas" : "Saídas", value: String(entrada ? row.entradas : row.saidas) },
        { label: entrada ? "Entrada" : "Saída", value: fmtPct(entrada ? row.entradaPct : row.saidaPct) }
      ]
    : [
        { label: "Ativos", value: String(stats.value.headcountAtual) },
        { label: entrada ? "Admissões" : "Demissões", value: String(items.length) },
        {
          label: entrada ? "Entrada" : "Saída",
          value: fmtPct(entrada ? stats.value.turnoverEntradaPct : stats.value.turnoverSaidaPct)
        }
      ];
  grupo.value = {
    title: `${entrada ? "Entradas" : "Saídas"}${key == null ? "" : ` — ${key}`}`,
    subtitle: `${escopo.value} · ${periodo.value}`,
    entrada,
    items,
    cards
  };
}

function onFuncaoClick({ index, datasetIndex }) {
  const row = funcaoRows.value[index];
  if (!row) return;
  openGrupo({ entrada: datasetIndex === 0, keyOf: funcaoKey, key: row.label, row });
}

function onGeneroClick({ index, datasetIndex }) {
  const row = generoRows.value[datasetIndex];
  if (!row) return;
  openGrupo({ entrada: index === 0, keyOf: generoKey, key: row.label, row });
}

function onPieClick(sliceIndex) {
  if (sliceIndex !== 0 && sliceIndex !== 1) return;
  openGrupo({ entrada: sliceIndex === 0 });
}

/* ---------- Filiais críticas ----------
   Ranking das filiais por turnover (mesma fórmula, sobre os ativos da filial),
   com a variação em pontos percentuais contra o mês anterior ao filtrado.
   Crítica = turnover ≥ 1,5× o turnover geral; Atenção = ≥ o turnover geral. */
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
  return { start: `${prev}-01`, end: `${prev}-28` };
});

const filialRows = computed(() => {
  const media = stats.value.turnoverPct || 0;
  const prev = prevRange.value ? new Map(groupBy(filialKey, prevRange.value).map((r) => [r.label, r])) : null;
  return groupBy(filialKey)
    .filter((r) => r.ativos > 0)
    .map((r) => {
      const before = prev && prev.get(r.label);
      const status =
        media > 0 && r.turnoverPct >= media * 1.5 ? "critica" : r.turnoverPct >= media && r.turnoverPct > 0 ? "atencao" : "normal";
      return {
        ...r,
        key: r.label,
        nome: filialLabel(r.label),
        delta: before && before.ativos > 0 ? r.turnoverPct - before.turnoverPct : null,
        status
      };
    })
    .sort((a, b) => b.turnoverPct - a.turnoverPct || b.saidas - a.saidas || a.nome.localeCompare(b.nome, "pt-BR"));
});

const STATUS_FILIAL = {
  critica: { label: "Crítica", cls: "bg-red-100 text-red-700 dark:bg-red-500/15 dark:text-red-400" },
  atencao: { label: "Atenção", cls: "bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-400" },
  normal: { label: "Normal", cls: "bg-green-100 text-green-700 dark:bg-green-500/15 dark:text-green-400" }
};

const fmtDelta = (d) => `${d > 0 ? "+" : ""}${d.toFixed(1).replace(".", ",")} p.p.`;

const filialInsights = computed(() => {
  const rows = filialRows.value;
  const list = [];
  if (!rows.length) return list;
  const media = stats.value.turnoverPct || 0;
  const top = rows[0];
  if (top.turnoverPct > 0) {
    const acima = top.turnoverPct - media;
    list.push({
      tone: "red",
      text: `${top.nome} tem o maior turnover: ${fmtPct(top.turnoverPct)}${media > 0 ? ` (${fmtDelta(acima)} da média geral)` : ""}.`
    });
  }
  const criticas = rows.filter((r) => r.status === "critica").length;
  list.push({
    tone: criticas ? "red" : "green",
    text: criticas
      ? `${criticas} ${criticas === 1 ? "filial está" : "filiais estão"} em situação crítica (turnover ≥ 1,5× a média geral).`
      : "Nenhuma filial em situação crítica no período."
  });
  const comDelta = rows.filter((r) => r.delta !== null);
  if (comDelta.length) {
    const pioraram = comDelta.filter((r) => r.delta > 0);
    const pior = pioraram.slice().sort((a, b) => b.delta - a.delta)[0];
    list.push({
      tone: pioraram.length ? "amber" : "green",
      text: pioraram.length
        ? `${pioraram.length} de ${comDelta.length} filiais pioraram contra o mês anterior; maior alta: ${pior.nome} (${fmtDelta(pior.delta)}).`
        : "Nenhuma filial piorou contra o mês anterior."
    });
  }
  const totalSaidas = rows.reduce((s, r) => s + r.saidas, 0);
  const maisSaidas = rows.slice().sort((a, b) => b.saidas - a.saidas)[0];
  if (totalSaidas > 0 && maisSaidas.saidas > 0) {
    list.push({
      tone: "zinc",
      text: `${maisSaidas.nome} concentra ${fmtPct((maisSaidas.saidas / totalSaidas) * 100)} das saídas (${maisSaidas.saidas} de ${totalSaidas}).`
    });
  }
  return list;
});

const INSIGHT_DOT = { red: "bg-red-500", amber: "bg-amber-500", green: "bg-green-500", zinc: "bg-zinc-400" };

const tables = computed(() => [
  { title: "Por função", col: "Função", rows: funcaoRows.value, span: true },
  { title: "Por gênero", col: "Gênero", rows: generoRows.value }
]);

const lancamentos = computed(() => {
  const map = (list, entrada) =>
    list.map((h) => ({
      key: `${entrada ? "e" : "s"}-${h.id}`,
      entrada,
      colaborador: h.colaborador || "—",
      funcao: h.funcao || "—",
      admissao: h.dataAdmissao || "",
      desligamento: h.dataDesligamento || "",
      data: (entrada ? h.dataAdmissao : h.dataDesligamento) || ""
    }));
  return [...map(movements.value.admissoes, true), ...map(movements.value.demissoes, false)].sort(
    (a, b) => String(b.data).localeCompare(String(a.data)) || a.colaborador.localeCompare(b.colaborador, "pt-BR")
  );
});

const totals = computed(() => [
  {
    label: "Turnover geral",
    value: centerValue.value,
    sub: "Média de entrada e saída",
    tone: "text-zinc-900 dark:text-zinc-100"
  },
  {
    label: "Admissões",
    value: String(stats.value.admissoes),
    sub: `Entrada ${stats.value.turnoverEntradaPct === null ? "—" : fmtPct(stats.value.turnoverEntradaPct)}`,
    tone: "text-zinc-900 dark:text-zinc-100"
  },
  {
    label: "Demissões",
    value: String(stats.value.desligamentos),
    sub: `Saída ${stats.value.turnoverSaidaPct === null ? "—" : fmtPct(stats.value.turnoverSaidaPct)}`,
    tone: "text-zinc-900 dark:text-zinc-100"
  },
  {
    label: "Ativos",
    value: String(stats.value.headcountAtual),
    sub: "Quadro do mês filtrado",
    tone: "text-zinc-900 dark:text-zinc-100"
  }
]);
</script>

<template>
  <Modal title="Análise de Turnover" :subtitle="`${escopo} · ${periodo}`" :open="open" fullscreen @close="emit('close')">
    <template #actions>
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
            <p class="mt-1.5 text-4xl font-bold leading-none tabular-nums" :class="t.tone">{{ t.value }}</p>
            <p class="mt-2 text-xs text-zinc-500 dark:text-zinc-400">{{ t.sub }}</p>
          </div>
        </div>

        <div class="grid gap-5 md:grid-cols-2 lg:grid-cols-3">
          <section class="overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
            <header class="border-b border-zinc-100 px-5 py-3.5 dark:border-zinc-800">
              <h3 class="text-sm font-bold text-zinc-900 dark:text-zinc-100">Entrada vs Saída</h3>
              <p class="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">Taxa sobre os ativos</p>
            </header>
            <div class="p-4">
              <PieChart
                :data="pieData"
                show-values
                height="h-72"
                :center-value="centerValue"
                center-caption="Turnover"
                value-format="percent"
                clickable
                @chart-click="onPieClick"
              />
            </div>
          </section>

          <section class="overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
            <header class="border-b border-zinc-100 px-5 py-3.5 dark:border-zinc-800">
              <h3 class="text-sm font-bold text-zinc-900 dark:text-zinc-100">Por gênero</h3>
              <p class="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">Entrada e saída sobre os ativos de cada gênero</p>
            </header>
            <div class="p-4">
              <BarChart :data="generoData" show-values value-format="percent" :show-trend="false" :height-px="288" bars-clickable @bar-click="onGeneroClick" />
            </div>
          </section>

          <section class="overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-sm md:col-span-2 lg:col-span-1 dark:border-zinc-800 dark:bg-zinc-900">
            <header class="border-b border-zinc-100 px-5 py-3.5 dark:border-zinc-800">
              <h3 class="text-sm font-bold text-zinc-900 dark:text-zinc-100">Período de experiência</h3>
              <p class="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">
                Desligados com até 90 dias de casa
                <template v-if="experienciaPctDosDesligados !== null">
                  · <span class="font-semibold text-zinc-700 dark:text-zinc-200">{{ fmtPct(experienciaPctDosDesligados) }}</span> dos desligamentos
                </template>
              </p>
            </header>
            <div class="p-4">
              <PieChart
                :data="experienciaData"
                height="h-72"
                :center-value="String(experienciaItems.length)"
                center-caption="Em experiência"
                value-format="count"
                clickable
                @chart-click="onExperienciaClick"
              />
            </div>
          </section>
        </div>

        <section class="overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
          <header class="border-b border-zinc-100 px-5 py-3.5 dark:border-zinc-800">
            <h3 class="text-sm font-bold text-zinc-900 dark:text-zinc-100">Por função</h3>
            <p class="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">
              Entrada e saída sobre os ativos de cada função, do maior para o menor turnover
            </p>
          </header>
          <div class="p-4">
            <BarChart :data="funcaoData" show-values value-format="percent" :show-trend="false" horizontal align-top :height-px="480" bars-clickable @bar-click="onFuncaoClick" />
          </div>
        </section>

        <section class="overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
          <header class="border-b border-zinc-100 px-5 py-3.5 dark:border-zinc-800">
            <h3 class="text-sm font-bold text-zinc-900 dark:text-zinc-100">Filiais críticas</h3>
            <p class="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">
              Ranking por turnover sobre os ativos da filial, com a variação contra o mês anterior
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
                      <th class="px-4 py-2.5 text-right font-semibold">Ativos</th>
                      <th class="px-4 py-2.5 text-right font-semibold">Entradas</th>
                      <th class="px-4 py-2.5 text-right font-semibold">Saídas</th>
                      <th class="px-4 py-2.5 text-right font-semibold">Turnover</th>
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
                      <td class="px-4 py-2.5 text-right tabular-nums text-zinc-600 dark:text-zinc-300">{{ r.ativos }}</td>
                      <td class="px-4 py-2.5 text-right tabular-nums text-zinc-600 dark:text-zinc-300">{{ r.entradas }}</td>
                      <td class="px-4 py-2.5 text-right tabular-nums text-zinc-600 dark:text-zinc-300">{{ r.saidas }}</td>
                      <td class="px-4 py-2.5 text-right font-bold tabular-nums text-zinc-900 dark:text-zinc-100">{{ fmtPct(r.turnoverPct) }}</td>
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
          <p v-else class="px-5 py-8 text-center text-sm text-zinc-500 dark:text-zinc-400">Sem filiais com quadro ativo no período.</p>
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
                    <th class="px-4 py-2.5 text-right font-semibold">Ativos</th>
                    <th class="px-4 py-2.5 text-right font-semibold">Entradas</th>
                    <th class="px-4 py-2.5 text-right font-semibold">Saídas</th>
                    <th class="px-4 py-2.5 text-right font-semibold">Entrada</th>
                    <th class="px-4 py-2.5 text-right font-semibold">Saída</th>
                    <th class="px-5 py-2.5 text-right font-semibold">Turnover</th>
                  </tr>
                </thead>
                <tbody class="uppercase">
                  <tr
                    v-for="r in t.rows"
                    :key="r.label"
                    class="border-t border-zinc-100 transition-colors hover:bg-zinc-50 dark:border-zinc-800 dark:hover:bg-zinc-800/50"
                  >
                    <td class="whitespace-nowrap px-5 py-2.5 font-medium text-zinc-900 dark:text-zinc-100">{{ r.label }}</td>
                    <td class="px-4 py-2.5 text-right tabular-nums text-zinc-600 dark:text-zinc-300">{{ r.ativos }}</td>
                    <td class="px-4 py-2.5 text-right tabular-nums text-zinc-600 dark:text-zinc-300">{{ r.entradas }}</td>
                    <td class="px-4 py-2.5 text-right tabular-nums text-zinc-600 dark:text-zinc-300">{{ r.saidas }}</td>
                    <td class="px-4 py-2.5 text-right tabular-nums text-green-600 dark:text-green-400">{{ fmtPct(r.entradaPct) }}</td>
                    <td class="px-4 py-2.5 text-right tabular-nums text-red-600 dark:text-red-400">{{ fmtPct(r.saidaPct) }}</td>
                    <td class="px-5 py-2.5 text-right font-bold tabular-nums text-zinc-900 dark:text-zinc-100">{{ fmtPct(r.turnoverPct) }}</td>
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
                    <th class="px-5 py-2.5 font-semibold">Tipo</th>
                    <th class="px-4 py-2.5 font-semibold">Colaborador</th>
                    <th class="px-4 py-2.5 font-semibold">Função</th>
                    <th class="px-4 py-2.5 font-semibold">Admissão</th>
                    <th class="px-5 py-2.5 font-semibold">Desligamento</th>
                  </tr>
                </thead>
                <tbody class="uppercase">
                  <tr
                    v-for="l in lancamentos"
                    :key="l.key"
                    class="border-t border-zinc-100 transition-colors hover:bg-zinc-50 dark:border-zinc-800 dark:hover:bg-zinc-800/50"
                  >
                    <td class="whitespace-nowrap px-5 py-2.5">
                      <span
                        class="rounded-full px-2.5 py-0.5 text-[11px] font-semibold"
                        :class="l.entrada
                          ? 'bg-green-100 text-green-700 dark:bg-green-500/15 dark:text-green-400'
                          : 'bg-red-100 text-red-700 dark:bg-red-500/15 dark:text-red-400'"
                      >
                        {{ l.entrada ? "Entrada" : "Saída" }}
                      </span>
                    </td>
                    <td class="whitespace-nowrap px-4 py-2.5 font-medium text-zinc-900 dark:text-zinc-100">{{ l.colaborador }}</td>
                    <td class="whitespace-nowrap px-4 py-2.5 text-zinc-600 dark:text-zinc-300">{{ l.funcao }}</td>
                    <td class="whitespace-nowrap px-4 py-2.5 tabular-nums text-zinc-600 dark:text-zinc-300">{{ l.admissao ? formatDate(l.admissao) : "—" }}</td>
                    <td class="whitespace-nowrap px-5 py-2.5 tabular-nums text-zinc-600 dark:text-zinc-300">{{ l.desligamento ? formatDate(l.desligamento) : "—" }}</td>
                  </tr>
                </tbody>
              </table>
            </div>
            <p v-else class="px-5 py-8 text-center text-sm text-zinc-500 dark:text-zinc-400">Nenhuma entrada ou saída no período.</p>
          </section>
        </div>

        <p class="border-t border-zinc-200 pt-4 text-center text-xs text-zinc-400 dark:border-zinc-800 dark:text-zinc-500">
          Ativos = quadro ativo do mês filtrado · Entrada = admissões ÷ ativos · Saída = desligamentos ÷ ativos · Turnover =
          média das duas · Fonte: Headcount. Filial crítica = turnover ≥ 1,5× o geral; atenção = ≥ o geral.
        </p>
      </div>
    </div>

    <TurnoverGrupoModal
      v-if="grupo"
      open
      :title="grupo.title"
      :subtitle="grupo.subtitle"
      :cards="grupo.cards"
      :items="grupo.items"
      :entrada="grupo.entrada"
      @close="grupo = null"
    />
  </Modal>
</template>
