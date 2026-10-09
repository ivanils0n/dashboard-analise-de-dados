<script setup>
import { computed, ref, watch } from "vue";
import GerenteRegionalFilter from "@/components/dashboard/GerenteRegionalFilter.vue"; import Modal from "@/components/ui/Modal.vue";
import PieChart from "@/components/charts/PieChart.vue";
import BarChart from "@/components/charts/BarChart.vue";
import { STATE_NAMES, STATES } from "@/lib/config";
import { headcountActiveInRange, headcountCount, headcountMovements, findBranchByShortName, filterByRegional, headcountRegionalOptions } from "@/lib/employees";
import { dateFilter } from "@/composables/useDateFilter";
import { useFilters } from "@/composables/useFilters";
import { formatValue, ymLabel, lastDayOfYm } from "@/lib/utils";
import { FAIXAS_IDADE, idadeEm } from "@/lib/faixaEtaria";

defineProps({
  open: { type: Boolean, default: false }
});

const emit = defineEmits(["close", "colaboradores"]);

const { state } = useFilters();
const PERCENT = { type: "percent", decimals: 1 };
const fmtPct = (v) => formatValue(PERCENT, v);

const estadoSel = ref(!state.current || state.current === "todos" ? "todos" : state.current);
const estadoOptions = [{ id: "todos", label: "Todos" }, ...STATES.map((s) => ({ id: s, label: s }))];

const regionalSel = ref("");
const regionalOptions = computed(() => headcountRegionalOptions(estadoSel.value));
watch(regionalOptions, (opts) => {
  if (regionalSel.value && !opts.includes(regionalSel.value)) regionalSel.value = "";
});

const range = computed(() => (dateFilter.start ? { start: dateFilter.start, end: dateFilter.end } : null));
const ymAtual = computed(() => (range.value ? String(range.value.end || range.value.start).slice(0, 7) : ""));

const escopo = computed(() => {
  const st = estadoSel.value;
  return !st || st === "todos" ? "Todos os estados" : STATE_NAMES[st] || st;
});
const periodo = computed(() => (ymAtual.value ? ymLabel(ymAtual.value) : "Todo o período"));

function norm(v, fallback) {
  return String(v || "").trim().toUpperCase() || fallback;
}

const quadro = computed(() => filterByRegional(headcountActiveInRange(estadoSel.value, range.value), regionalSel.value));
const total = computed(() => quadro.value.length);

function addMonths(ym, delta) {
  const [y, m] = ym.split("-").map(Number);
  const d = new Date(y, m - 1 + delta, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

const GENERO_LABEL = { masculino: "Masculino", feminino: "Feminino" };
const GENERO_COR = { Masculino: "#0284c7", Feminino: "#db2777", "Não informado": "#a1a1aa" };
const generoKey = (h) => GENERO_LABEL[String(h.genero || "").trim().toLowerCase()] || "Não informado";

const dataReferencia = computed(() => {
  const [y, m] = ymAtual.value.split("-").map(Number);
  return y && m ? new Date(y, m, 0) : new Date();
});

function diasDeCasa(h) {
  const adm = new Date(`${String(h.dataAdmissao || "").slice(0, 10)}T00:00:00`);
  if (isNaN(adm)) return null;
  return Math.max(0, Math.round((dataReferencia.value - adm) / 86400000));
}

const tempoMedioCasa = computed(() => {
  const dias = quadro.value.map(diasDeCasa).filter((d) => d !== null);
  if (!dias.length) return "—";
  const meses = Math.round(dias.reduce((s, d) => s + d, 0) / dias.length / 30.4);
  const anos = Math.floor(meses / 12);
  const resto = meses % 12;
  return anos ? `${anos}a ${resto}m` : `${resto} meses`;
});

const acumuladoAno = computed(() => {
  const ym = ymAtual.value || new Date().toISOString().slice(0, 7);
  const ano = ym.slice(0, 4);
  const m = headcountMovements(estadoSel.value, { start: `${ano}-01-01`, end: lastDayOfYm(ym) });
  const admissoes = filterByRegional(m.admissoes, regionalSel.value).length;
  const desligamentos = filterByRegional(m.demissoes, regionalSel.value).length;
  return { ano, ate: ymLabel(ym), admissoes, desligamentos, saldo: admissoes - desligamentos };
});

const cards = computed(() => {
  const t = total.value;
  const fem = quadro.value.filter((h) => generoKey(h) === "Feminino").length;
  const masc = quadro.value.filter((h) => generoKey(h) === "Masculino").length;
  let sub = "Quadro do mês filtrado";
  let subTone = "text-zinc-500 dark:text-zinc-400";
  if (ymAtual.value) {
    const anterior = headcountCount(estadoSel.value, addMonths(ymAtual.value, -1), regionalSel.value);
    if (anterior) {
      const diff = t - anterior;
      sub = `${diff > 0 ? "▲ +" : diff < 0 ? "▼ " : "• "}${diff} vs mês anterior`;
    }
  }
  return [
    { label: "Colaboradores ativos", value: String(t), sub, subTone, tone: "text-zinc-900 dark:text-zinc-100" },
    {
      label: "Feminino · Masculino",
      split: [
        { caption: "Feminino", value: t ? fmtPct((fem / t) * 100) : "—", tone: "text-pink-600 dark:text-pink-400" },
        { caption: "Masculino", value: t ? fmtPct((masc / t) * 100) : "—", tone: "text-sky-600 dark:text-sky-400" }
      ],
      sub: `${fem} feminino · ${masc} masculino de ${t}`,
      tone: "text-zinc-900 dark:text-zinc-100"
    },
    { label: "Tempo médio de casa", value: tempoMedioCasa.value, sub: "Dos colaboradores ativos", tone: "text-zinc-900 dark:text-zinc-100" },
    {
      label: `Acumulado ${acumuladoAno.value.ano}`,
      value: `${acumuladoAno.value.saldo > 0 ? "+" : ""}${acumuladoAno.value.saldo}`,
      sub: `${acumuladoAno.value.admissoes} admissões · ${acumuladoAno.value.desligamentos} desligamentos`,
      detail: `Saldo de janeiro até ${acumuladoAno.value.ate}`,
      tone: "text-zinc-900 dark:text-zinc-100"
    }
  ];
});

const anoEvolucao = computed(() => Number((ymAtual.value || new Date().toISOString().slice(0, 7)).slice(0, 4)));
const evolucao = computed(() => {
  const fim = ymAtual.value || new Date().toISOString().slice(0, 7);
  const meses = Number(fim.slice(5, 7));
  return Array.from({ length: meses }, (_, i) => `${anoEvolucao.value}-${String(i + 1).padStart(2, "0")}`).map((ym) => {
    const value = headcountCount(estadoSel.value, ym, regionalSel.value);
    const anterior = headcountCount(estadoSel.value, addMonths(ym, -1), regionalSel.value);
    const diff = value - anterior;
    return {
      label: ymLabel(ym),
      value,
      delta: anterior
        ? {
            text: `${diff > 0 ? "▲ +" : diff < 0 ? "▼ " : "• "}${diff}`,
            color: diff > 0 ? "#16a34a" : diff < 0 ? "#dc2626" : "#a1a1aa"
          }
        : null
    };
  });
});

const quadroGenero = computed(() => {
  const counts = new Map();
  quadro.value.forEach((h) => counts.set(generoKey(h), (counts.get(generoKey(h)) || 0) + 1));
  return ["Masculino", "Feminino", "Não informado"]
    .filter((g) => g !== "Não informado" || counts.get(g))
    .map((g) => ({ label: g, value: counts.get(g) || 0, color: GENERO_COR[g] }));
});

function countBy(keyOf) {
  const counts = new Map();
  quadro.value.forEach((h) => {
    const k = keyOf(h);
    counts.set(k, (counts.get(k) || 0) + 1);
  });
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], "pt-BR"))
    .map(([label, value]) => ({ label, value }));
}

const quadroEmpresa = computed(() => countBy((h) => norm(h.empresa, "SEM EMPRESA")));
const quadroFuncao = computed(() => countBy((h) => norm(h.funcao, "SEM FUNÇÃO")));

const FAIXAS_CASA = [
  { label: "Até 90 dias", max: 90 },
  { label: "3 meses a 1 ano", max: 365 },
  { label: "1 a 2 anos", max: 730 },
  { label: "2 a 5 anos", max: 1825 },
  { label: "Mais de 5 anos", max: Infinity }
];

const quadroTempoCasa = computed(() => {
  const counts = FAIXAS_CASA.map(() => 0);
  let semData = 0;
  quadro.value.forEach((h) => {
    const dias = diasDeCasa(h);
    if (dias === null) semData += 1;
    else counts[FAIXAS_CASA.findIndex((f) => dias <= f.max)] += 1;
  });
  const rows = FAIXAS_CASA.map((f, i) => ({ label: f.label, value: counts[i] }));
  if (semData) rows.push({ label: "Sem data", value: semData });
  return rows;
});

const COR_TOTAL = "#E8AF3E";

const quadroFaixaEtaria = computed(() => {
  const vazio = () => ({ feminino: 0, masculino: 0, total: 0 });
  const grupos = FAIXAS_IDADE.map(vazio);
  const semData = vazio();
  quadro.value.forEach((h) => {
    const idade = idadeEm(h, dataReferencia.value);
    const alvo = idade === null ? semData : grupos[FAIXAS_IDADE.findIndex((f) => idade <= f.max)];
    const g = generoKey(h);
    if (g === "Feminino") alvo.feminino += 1;
    else if (g === "Masculino") alvo.masculino += 1;
    alvo.total += 1;
  });
  const toRow = (label, c) => ({
    label,
    series: [
      { label: "Feminino", value: c.feminino, color: GENERO_COR.Feminino },
      { label: "Masculino", value: c.masculino, color: GENERO_COR.Masculino },
      { label: "Total", value: c.total, color: COR_TOTAL }
    ]
  });
  const rows = FAIXAS_IDADE.map((f, i) => toRow(f.label, grupos[i]));
  if (semData.total) rows.push(toRow("Sem data", semData));
  return rows;
});

const filialRows = computed(() => {
  const map = new Map();
  quadro.value.forEach((h) => {
    const key = `${norm(h.filial, "SEM FILIAL")}|${norm(h.estado, "")}`;
    const row = map.get(key) || { ativos: 0, masculino: 0, feminino: 0 };
    row.ativos += 1;
    const g = generoKey(h);
    if (g === "Masculino") row.masculino += 1;
    else if (g === "Feminino") row.feminino += 1;
    map.set(key, row);
  });
  return [...map.entries()]
    .map(([key, r]) => {
      const [nome, uf] = key.split("|");
      const branch = nome !== "SEM FILIAL" ? findBranchByShortName(nome, uf) : null;
      const label = (branch && branch.name) || nome;
      return {
        key,
        nome: estadoSel.value === "todos" && uf ? `${label} (${uf})` : label,
        ...r,
        share: total.value ? (r.ativos / total.value) * 100 : 0
      };
    })
    .sort((a, b) => b.ativos - a.ativos || a.nome.localeCompare(b.nome, "pt-BR"));
});

function onGeneroClick(sliceIndex) {
  const slice = quadroGenero.value[sliceIndex];
  const genero = slice ? { Masculino: "masculino", Feminino: "feminino" }[slice.label] || "" : "";
  emit("colaboradores", { genero, estado: estadoSel.value });
}
</script>

<template>
  <Modal title="Análise de Headcount" :subtitle="`${escopo} · ${periodo}`" :open="open" fullscreen @close="emit('close')">
    <template #actions>
      <div class="flex items-center gap-2">
        <GerenteRegionalFilter
        v-model="regionalSel"
        :options="regionalOptions"
        label="Regional"
        all-label="Todas as regionais"
        title="Filtrar por regional"
      />
        <button
          type="button"
          class="hidden rounded-lg border border-zinc-200 px-3 py-1.5 text-sm font-semibold text-zinc-600 transition hover:bg-zinc-100 sm:block dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
          @click="emit('colaboradores', { genero: '', estado: estadoSel })"
        >
          Ver colaboradores
        </button>
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
            v-for="c in cards"
            :key="c.label"
            class="relative overflow-hidden rounded-2xl border border-zinc-200 bg-white p-5 text-center shadow-sm dark:border-zinc-800 dark:bg-zinc-900"
          >
            <p class="text-[11px] font-semibold uppercase tracking-widest text-zinc-500 dark:text-zinc-400">{{ c.label }}</p>
            <div v-if="c.split" class="mt-1.5 flex items-start justify-center divide-x divide-zinc-200 dark:divide-zinc-700">
              <div v-for="p in c.split" :key="p.caption" class="px-4">
                <p class="text-4xl font-bold leading-none tabular-nums" :class="p.tone">{{ p.value }}</p>
                <p class="mt-1 text-[11px] font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">{{ p.caption }}</p>
              </div>
            </div>
            <p v-else class="mt-1.5 text-4xl font-bold leading-none tabular-nums" :class="c.tone">{{ c.value }}</p>
            <p class="mt-2 text-xs font-medium" :class="c.subTone || 'text-zinc-500 dark:text-zinc-400'">{{ c.sub }}</p>
            <p v-if="c.detail" class="mt-0.5 text-[11px] text-zinc-400 dark:text-zinc-500">{{ c.detail }}</p>
          </div>
        </div>

        <div class="grid items-start gap-5 xl:grid-cols-2">
          <section class="overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
            <header class="border-b border-zinc-100 px-5 py-3.5 dark:border-zinc-800">
              <h3 class="text-sm font-bold text-zinc-900 dark:text-zinc-100">Evolução do quadro</h3>
              <p class="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">
                Colaboradores ativos mês a mês em {{ anoEvolucao }}, de janeiro até o mês filtrado
              </p>
            </header>
            <div class="p-4">
              <BarChart :data="evolucao" show-values :show-trend="false" :height-px="288" />
            </div>
          </section>

          <section class="overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
            <header class="border-b border-zinc-100 px-5 py-3.5 dark:border-zinc-800">
              <h3 class="text-sm font-bold text-zinc-900 dark:text-zinc-100">Faixa etária</h3>
              <p class="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">
                Colaboradores ativos por faixa de idade, de 10 em 10 anos até 51 anos ou mais, com a idade calculada até o fim do mês filtrado
              </p>
            </header>
            <div v-if="total" class="p-4">
              <BarChart :data="quadroFaixaEtaria" show-values :show-trend="false" :height-px="288" />
            </div>
            <p v-else class="px-5 py-8 text-center text-sm text-zinc-500 dark:text-zinc-400">Sem quadro ativo no período.</p>
          </section>
        </div>

        <section class="overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
          <header class="border-b border-zinc-100 px-5 py-3.5 dark:border-zinc-800">
            <h3 class="text-sm font-bold text-zinc-900 dark:text-zinc-100">Composição do quadro</h3>
            <p class="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">
              Perfil dos colaboradores ativos: gênero, empresa e tempo de casa
            </p>
          </header>
          <div v-if="total" class="grid gap-5 p-4 md:grid-cols-2 lg:grid-cols-3">
            <div>
              <p class="mb-1 text-center text-xs font-semibold text-zinc-600 dark:text-zinc-300">Por gênero</p>
              <PieChart
                :data="quadroGenero"
                height="h-64"
                :center-value="String(total)"
                center-caption="Ativos"
                value-format="count"
                clickable
                @chart-click="onGeneroClick"
              />
            </div>
            <div>
              <p class="mb-1 text-center text-xs font-semibold text-zinc-600 dark:text-zinc-300">Por empresa</p>
              <BarChart :data="quadroEmpresa" show-values :show-trend="false" horizontal align-top :height-px="256" />
            </div>
            <div class="md:col-span-2 lg:col-span-1">
              <p class="mb-1 text-center text-xs font-semibold text-zinc-600 dark:text-zinc-300">Por tempo de casa</p>
              <BarChart :data="quadroTempoCasa" show-values :show-trend="false" :height-px="256" />
            </div>
          </div>
          <p v-else class="px-5 py-8 text-center text-sm text-zinc-500 dark:text-zinc-400">Sem quadro ativo no período.</p>
        </section>

        <section class="overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
          <header class="border-b border-zinc-100 px-5 py-3.5 dark:border-zinc-800">
            <h3 class="text-sm font-bold text-zinc-900 dark:text-zinc-100">Por função</h3>
            <p class="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">Colaboradores ativos em cada função</p>
          </header>
          <div class="p-4">
            <BarChart :data="quadroFuncao" show-values :show-trend="false" horizontal align-top :height-px="320" />
          </div>
        </section>

        <section class="overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
          <header class="flex items-center justify-between border-b border-zinc-100 px-5 py-3.5 dark:border-zinc-800">
            <h3 class="text-sm font-bold text-zinc-900 dark:text-zinc-100">Por filial</h3>
            <span class="rounded-full bg-zinc-100 px-2.5 py-0.5 text-xs font-semibold tabular-nums text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300">
              {{ filialRows.length }}
            </span>
          </header>
          <div v-if="filialRows.length" class="max-h-[32rem] overflow-auto">
            <table class="w-full min-w-max text-left text-sm">
              <thead class="sticky top-0 z-10 bg-zinc-50 dark:bg-zinc-800">
                <tr class="text-[11px] uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
                  <th class="px-5 py-2.5 font-semibold">#</th>
                  <th class="px-4 py-2.5 font-semibold">Filial</th>
                  <th class="px-4 py-2.5 text-right font-semibold">Ativos</th>
                  <th class="px-4 py-2.5 text-right font-semibold">% do quadro</th>
                  <th class="px-4 py-2.5 text-right font-semibold">Masculino</th>
                  <th class="px-5 py-2.5 text-right font-semibold">Feminino</th>
                </tr>
              </thead>
              <tbody class="uppercase">
                <tr
                  v-for="(r, idx) in filialRows"
                  :key="r.key"
                  class="border-t border-zinc-100 transition-colors hover:bg-zinc-50 dark:border-zinc-800 dark:hover:bg-zinc-800/50"
                >
                  <td class="px-5 py-2.5 tabular-nums text-zinc-400">{{ idx + 1 }}</td>
                  <td class="whitespace-nowrap px-4 py-2.5 font-medium text-zinc-900 dark:text-zinc-100">{{ r.nome }}</td>
                  <td class="px-4 py-2.5 text-right font-bold tabular-nums text-zinc-900 dark:text-zinc-100">{{ r.ativos }}</td>
                  <td class="px-4 py-2.5 text-right tabular-nums text-zinc-600 dark:text-zinc-300">{{ fmtPct(r.share) }}</td>
                  <td class="px-4 py-2.5 text-right tabular-nums text-sky-600 dark:text-sky-400">{{ r.masculino }}</td>
                  <td class="px-5 py-2.5 text-right tabular-nums text-pink-600 dark:text-pink-400">{{ r.feminino }}</td>
                </tr>
              </tbody>
            </table>
          </div>
          <p v-else class="px-5 py-8 text-center text-sm text-zinc-500 dark:text-zinc-400">Sem filiais com quadro ativo no período.</p>
        </section>

        <p class="border-t border-zinc-200 pt-4 text-center text-xs text-zinc-400 dark:border-zinc-800 dark:text-zinc-500">
          Ativos = quadro ativo do mês filtrado · Tempo de casa e idade contados até o fim do mês filtrado · Acumulado = admissões −
          desligamentos de janeiro até o mês filtrado · Fonte: Headcount
        </p>
      </div>
    </div>
  </Modal>
</template>
