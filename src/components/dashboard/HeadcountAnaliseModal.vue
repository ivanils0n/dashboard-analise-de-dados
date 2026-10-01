<script setup>
import { computed, ref } from "vue";
import Modal from "@/components/ui/Modal.vue";
import PieChart from "@/components/charts/PieChart.vue";
import BarChart from "@/components/charts/BarChart.vue";
import { STATE_NAMES, STATES } from "@/lib/config";
import { headcountActiveInRange, headcountCount, headcountMovements, findBranchByShortName } from "@/lib/employees";
import { dateFilter } from "@/composables/useDateFilter";
import { useFilters } from "@/composables/useFilters";
import { formatValue, ymLabel } from "@/lib/utils";

defineProps({
  open: { type: Boolean, default: false }
});

const emit = defineEmits(["close", "colaboradores"]);

const { state } = useFilters();
const PERCENT = { type: "percent", decimals: 1 };
const fmtPct = (v) => formatValue(PERCENT, v);

const estadoSel = ref(!state.current || state.current === "todos" ? "todos" : state.current);
const estadoOptions = [{ id: "todos", label: "Todos" }, ...STATES.map((s) => ({ id: s, label: s }))];

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

const quadro = computed(() => headcountActiveInRange(estadoSel.value, range.value));
const total = computed(() => quadro.value.length);
const movements = computed(() => headcountMovements(estadoSel.value, range.value));

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

const cards = computed(() => {
  const t = total.value;
  const fem = quadro.value.filter((h) => generoKey(h) === "Feminino").length;
  const adm = movements.value.admissoes.length;
  const desl = movements.value.demissoes.length;
  const saldo = adm - desl;
  let sub = "Quadro do mês filtrado";
  let subTone = "text-zinc-500 dark:text-zinc-400";
  if (ymAtual.value) {
    const anterior = headcountCount(estadoSel.value, addMonths(ymAtual.value, -1));
    if (anterior) {
      const diff = t - anterior;
      sub = `${diff > 0 ? "▲ +" : diff < 0 ? "▼ " : "• "}${diff} vs mês anterior`;
    }
  }
  return [
    { label: "Colaboradores ativos", value: String(t), sub, subTone, tone: "text-zinc-900 dark:text-zinc-100" },
    {
      label: "Feminino",
      value: t ? fmtPct((fem / t) * 100) : "—",
      sub: `${fem} de ${t} colaboradores`,
      tone: "text-zinc-900 dark:text-zinc-100"
    },
    { label: "Tempo médio de casa", value: tempoMedioCasa.value, sub: "Dos colaboradores ativos", tone: "text-zinc-900 dark:text-zinc-100" },
    {
      label: "Saldo do período",
      value: `${saldo > 0 ? "+" : ""}${saldo}`,
      sub: `${adm} admissões · ${desl} desligamentos`,
      tone: "text-zinc-900 dark:text-zinc-100"
    }
  ];
});

const anoEvolucao = computed(() => Number((ymAtual.value || new Date().toISOString().slice(0, 7)).slice(0, 4)));
const evolucao = computed(() => {
  const fim = ymAtual.value || new Date().toISOString().slice(0, 7);
  const meses = Number(fim.slice(5, 7));
  return Array.from({ length: meses }, (_, i) => `${anoEvolucao.value}-${String(i + 1).padStart(2, "0")}`).map((ym) => ({
    label: ymLabel(ym),
    value: headcountCount(estadoSel.value, ym)
  }));
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
      <div class="mx-auto flex max-w-7xl flex-col gap-6">
        <div class="grid grid-cols-2 gap-3 md:grid-cols-4">
          <div
            v-for="c in cards"
            :key="c.label"
            class="relative overflow-hidden rounded-2xl border border-zinc-200 bg-white p-5 text-center shadow-sm dark:border-zinc-800 dark:bg-zinc-900"
          >
            <p class="text-[11px] font-semibold uppercase tracking-widest text-zinc-500 dark:text-zinc-400">{{ c.label }}</p>
            <p class="mt-1.5 text-4xl font-bold leading-none tabular-nums" :class="c.tone">{{ c.value }}</p>
            <p class="mt-2 text-xs font-medium" :class="c.subTone || 'text-zinc-500 dark:text-zinc-400'">{{ c.sub }}</p>
          </div>
        </div>

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
            <BarChart :data="quadroFuncao" show-values :show-trend="false" horizontal align-top :height-px="420" />
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
          Ativos = quadro ativo do mês filtrado · Tempo de casa contado até o fim do mês filtrado · Saldo = admissões −
          desligamentos do período · Fonte: Headcount
        </p>
      </div>
    </div>
  </Modal>
</template>
