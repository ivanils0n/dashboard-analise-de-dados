<script setup>
import { computed, ref, watch } from "vue";
import Modal from "@/components/ui/Modal.vue";
import { STATES, STATE_NAMES, getIndicatorById } from "@/lib/config";
import { useFilters } from "@/composables/useFilters";
import { formatValue, ymLabel } from "@/lib/utils";

const { state } = useFilters();

const props = defineProps({
  dashboard: { type: Object, required: true },
  compact: { type: Boolean, default: false }
});

const open = ref(false);
const meses = ref(3);
const MESES_OPCOES = [1, 2, 3, 6, 12];

const estadoDoDashboard = () => (!state.current || state.current === "todos" ? "todos" : state.current);
const estadoSel = ref(estadoDoDashboard());
watch(() => state.current, () => (estadoSel.value = estadoDoDashboard()));
watch(open, (aberto) => {
  if (aberto) estadoSel.value = estadoDoDashboard();
});
const estadoOptions = [{ id: "todos", label: "Todos estados" }, ...STATES.map((s) => ({ id: s, label: s }))];

const busca = ref("");
const statusSel = ref("todos");
const ordem = ref("padrao");
const expandido = ref(null);

const comparacao = computed(() => {
  void state.revision;
  return open.value ? props.dashboard.comparacaoMeses(meses.value, estadoSel.value) : { months: [], rows: [] };
});
const months = computed(() => comparacao.value.months);
const outrosEstados = (lista) => (lista || []).filter((e) => e.label !== estadoSel.value);
const detalheExpandido = computed(() => {
  void state.revision;
  return open.value && expandido.value
    ? props.dashboard.comparacaoDetalhe(expandido.value, meses.value, estadoSel.value)
    : {};
});
const ultimo = computed(() => months.value.length - 1);

function variacao(row, i) {
  return calcVariacao(row, row.values[i], i === 0 ? row.anterior : row.values[i - 1]);
}

function variacaoPeriodo(row) {
  const lista = row.values.map((_, i) => variacao(row, i)).filter(Boolean);
  if (!lista.length) return null;
  const pct = lista.reduce((s, v) => s + v.pct, 0) / lista.length;
  const bom = pct === 0 ? null : row.higherIsBetter ? pct > 0 : pct < 0;
  return { pct, bom };
}

function calcVariacao(row, cur, base) {
  if (cur === null || base === null || cur === undefined || base === undefined) return null;
  const diff = cur - base;
  if (base === 0) return diff === 0 ? { pct: 0, bom: null } : null;
  const pct = (diff / Math.abs(base)) * 100;
  const bom = diff === 0 ? null : row.higherIsBetter ? diff > 0 : diff < 0;
  return { pct, bom };
}

const CHIP = {
  bom: "bg-green-100 text-green-700 dark:bg-green-500/15 dark:text-green-400",
  ruim: "bg-red-100 text-red-700 dark:bg-red-500/15 dark:text-red-400",
  neutro: "bg-zinc-100 text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400"
};
const chipClass = (v) => (!v || v.bom === null ? CHIP.neutro : v.bom ? CHIP.bom : CHIP.ruim);

function pctText(v) {
  if (!v) return "—";
  if (v.pct === 0) return "0%";
  const abs = Math.abs(v.pct).toLocaleString("pt-BR", { maximumFractionDigits: 1 });
  return `${v.pct > 0 ? "▲" : "▼"} ${abs}%`;
}

function statusDe(row) {
  const v = variacaoPeriodo(row);
  if (!v) return "semdados";
  if (v.bom === null) return "estavel";
  return v.bom ? "melhorou" : "piorou";
}

const linhas = computed(() =>
  comparacao.value.rows.map((row) => {
    const v = variacaoPeriodo(row);
    return { ...row, status: statusDe(row), ultimaVar: v, pctAbs: v ? Math.abs(v.pct) : -1 };
  })
);

const contagem = computed(() => {
  const c = { todos: linhas.value.length, melhorou: 0, piorou: 0, estavel: 0, semdados: 0 };
  linhas.value.forEach((r) => (c[r.status] += 1));
  return c;
});

const filtros = computed(() => [
  { id: "todos", label: "Todos", dot: "bg-zinc-400" },
  { id: "melhorou", label: "Melhoraram", dot: "bg-green-500" },
  { id: "piorou", label: "Pioraram", dot: "bg-red-500" },
  { id: "estavel", label: "Estáveis", dot: "bg-zinc-300" },
  { id: "semdados", label: "Sem dados", dot: "bg-zinc-200" }
]);

const ORDENS = [
  { id: "padrao", label: "Ordem padrão" },
  { id: "melhor", label: "Maior melhora" },
  { id: "pior", label: "Maior piora" },
  { id: "nome", label: "Nome (A–Z)" }
];

const visiveis = computed(() => {
  const termo = busca.value.trim().toLowerCase();
  let list = linhas.value.filter(
    (r) => (statusSel.value === "todos" || r.status === statusSel.value) && (!termo || r.name.toLowerCase().includes(termo))
  );
  const score = (r) => (r.status === "melhorou" ? r.pctAbs : r.status === "piorou" ? -r.pctAbs : r.status === "estavel" ? 0 : -Infinity);
  if (ordem.value === "melhor") list = list.slice().sort((a, b) => score(b) - score(a));
  else if (ordem.value === "pior") list = list.slice().sort((a, b) => (score(a) === -Infinity) - (score(b) === -Infinity) || score(a) - score(b));
  else if (ordem.value === "nome") list = list.slice().sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));
  return list;
});

function sparkPoints(row) {
  const vals = [row.anterior, ...row.values];
  const nums = vals.filter((v) => v !== null && v !== undefined);
  if (nums.length < 2) return "";
  const min = Math.min(...nums);
  const max = Math.max(...nums);
  const w = 88;
  const h = 26;
  const pad = 3;
  return vals
    .map((v, i) => {
      if (v === null || v === undefined) return null;
      const x = pad + (i / (vals.length - 1)) * (w - pad * 2);
      const y = max === min ? h / 2 : h - pad - ((v - min) / (max - min)) * (h - pad * 2);
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .filter(Boolean)
    .join(" ");
}
const SPARK_COR = { melhorou: "#16a34a", piorou: "#dc2626", estavel: "#a1a1aa", semdados: "#d4d4d8" };

const escopo = computed(() => (estadoSel.value === "todos" ? "Todos estados" : STATE_NAMES[estadoSel.value] || estadoSel.value));

const descricao = (id) => getIndicatorById(id);
const toggle = (id) => (expandido.value = expandido.value === id ? null : id);
</script>

<template>
  <button
    type="button"
    class="inline-flex items-center justify-center gap-1.5 rounded-lg border border-zinc-300 px-2.5 py-1.5 text-xs font-semibold text-zinc-700 transition hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-800"
    :class="compact ? 'w-full' : ''"
    title="Comparar os indicadores com o mês anterior"
    @click="open = true"
  >
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
      <path d="M3 3v18h18" />
      <path d="m7 15 4-4 3 3 5-6" />
    </svg>
    Comparar com mês anterior
  </button>

  <Modal
    v-if="open"
    title="Comparar indicadores"
    :subtitle="months.length ? `${escopo} · ${ymLabel(months[0])} a ${ymLabel(months[ultimo])}` : escopo"
    :open="open"
    fullscreen
    @close="open = false"
  >
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
      <div class="mx-auto flex w-full max-w-[1900px] flex-col gap-4">
        <section class="overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
          <header class="flex flex-wrap items-center gap-x-4 gap-y-3 border-b border-zinc-100 px-5 py-3.5 dark:border-zinc-800">
            <div class="flex items-center gap-2">
              <span class="text-xs font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">Período</span>
              <div class="inline-flex rounded-xl border border-zinc-200 bg-zinc-50 p-1 dark:border-zinc-700 dark:bg-zinc-800" role="group" aria-label="Meses para comparar">
                <button
                  v-for="n in MESES_OPCOES"
                  :key="n"
                  type="button"
                  class="rounded-lg px-3 py-1 text-sm font-semibold transition"
                  :class="meses === n
                    ? 'bg-accent text-white shadow-sm'
                    : 'text-zinc-600 hover:bg-zinc-200/70 dark:text-zinc-300 dark:hover:bg-zinc-700'"
                  :aria-pressed="meses === n"
                  @click="meses = n"
                >
                  {{ n }}{{ n === 1 ? " mês" : "m" }}
                </button>
              </div>
            </div>

            <div class="flex flex-wrap items-center gap-1.5">
              <button
                v-for="f in filtros"
                :key="f.id"
                type="button"
                class="inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-semibold transition"
                :class="statusSel === f.id
                  ? 'border-accent bg-accent/10 text-zinc-900 dark:text-zinc-100'
                  : 'border-zinc-200 text-zinc-600 hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800'"
                @click="statusSel = f.id"
              >
                <span class="h-2 w-2 rounded-full" :class="f.dot" />
                {{ f.label }}
                <span class="tabular-nums text-zinc-400">{{ contagem[f.id] }}</span>
              </button>
            </div>

            <div class="ml-auto flex flex-wrap items-center gap-2">
              <input
                v-model="busca"
                type="search"
                placeholder="Buscar indicador"
                class="w-44 rounded-lg border border-zinc-300 bg-white px-3 py-1.5 text-sm text-zinc-800 outline-none transition focus:border-accent focus:ring-2 focus:ring-accent/20 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-100"
              />
              <select
                v-model="ordem"
                aria-label="Ordenar"
                class="rounded-lg border border-zinc-300 bg-white px-3 py-1.5 text-sm font-medium text-zinc-800 outline-none transition focus:border-accent focus:ring-2 focus:ring-accent/20 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-100 dark:[color-scheme:dark]"
              >
                <option v-for="o in ORDENS" :key="o.id" :value="o.id">{{ o.label }}</option>
              </select>
            </div>
          </header>

          <div class="max-h-[calc(100vh-15rem)] overflow-auto">
            <table class="border-separate border-spacing-0 w-full min-w-max text-left text-sm">
              <thead class="sticky top-0 z-10 bg-zinc-50 dark:bg-zinc-800">
                <tr class="text-[11px] uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
                  <th class="sticky left-0 z-20 w-[clamp(12rem,18vw,22rem)] min-w-[12rem] bg-zinc-50 px-5 py-2.5 font-semibold dark:bg-zinc-800">Indicador</th>
                  <th
                    v-for="(ym, i) in months"
                    :key="ym"
                    class="whitespace-nowrap px-4 py-2.5 text-right font-semibold"
                  >
                    {{ ymLabel(ym) }}
                  </th>
                  <th class="sticky right-[8rem] z-20 bg-zinc-50 px-4 py-2.5 text-center font-semibold shadow-[-6px_0_10px_-6px_rgba(0,0,0,0.25)] dark:bg-zinc-800">Tendência</th>
                  <th class="sticky right-0 z-20 w-[8rem] min-w-[8rem] bg-zinc-50 px-3 py-2.5 text-center font-semibold dark:bg-zinc-800" title="Média das variações mensais (%) dos meses filtrados">Variação média</th>
                </tr>
              </thead>
              <tbody>
                <template v-for="row in visiveis" :key="row.id">
                  <tr
                    class="cursor-pointer transition-colors hover:bg-zinc-50 dark:hover:bg-zinc-800/50 [&>td]:border-t [&>td]:border-zinc-100 dark:[&>td]:border-zinc-800"
                    @click="toggle(row.id)"
                  >
                    <td class="sticky left-0 w-[clamp(12rem,18vw,22rem)] min-w-[12rem] whitespace-nowrap bg-white px-5 py-3 font-medium text-zinc-900 dark:bg-zinc-900 dark:text-zinc-100">
                      <span class="mr-2 inline-block text-[10px] text-zinc-400 transition-transform" :class="expandido === row.id ? 'rotate-90' : ''">▶</span>{{ row.name }}
                    </td>
                    <td
                      v-for="(v, i) in row.values"
                      :key="i"
                      class="whitespace-nowrap px-4 py-3 text-right tabular-nums text-zinc-600 dark:text-zinc-300"
                    >
                      {{ formatValue(row, v) }}
                      <div class="mt-0.5 text-[11px] font-medium">
                        <span
                          v-if="row.faltantes?.[i]?.length"
                          class="mr-1 cursor-help rounded-full bg-amber-100 px-1.5 py-0.5 text-amber-800 dark:bg-amber-500/15 dark:text-amber-300"
                          :title="`Custo incompleto neste mês: sem lançamentos de ${row.faltantes[i].join(', ')}`"
                        >⚠ incompleto</span>
                        <span class="rounded-full px-1.5 py-0.5" :class="chipClass(variacao(row, i))">{{ pctText(variacao(row, i)) }}</span>
                      </div>
                    </td>
                    <td class="sticky right-[8rem] bg-white px-4 py-3 text-center shadow-[-6px_0_10px_-6px_rgba(0,0,0,0.25)] dark:bg-zinc-900">
                      <svg v-if="sparkPoints(row)" width="88" height="26" viewBox="0 0 88 26" aria-hidden="true">
                        <polyline :points="sparkPoints(row)" fill="none" :stroke="SPARK_COR[row.status]" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" />
                      </svg>
                      <span v-else class="text-zinc-300">—</span>
                    </td>
                    <td class="sticky right-0 w-[8rem] min-w-[8rem] whitespace-nowrap bg-white px-3 py-3 text-center dark:bg-zinc-900">
                      <span class="rounded-full px-3 py-1.5 text-sm font-bold tabular-nums" :class="chipClass(row.ultimaVar)">{{ pctText(row.ultimaVar) }}</span>
                    </td>
                  </tr>
                  <template v-if="expandido === row.id && row.detalhes">
                    <template v-for="d in row.detalhes" :key="d.label">
                    <tr
                      class="bg-zinc-50/70 dark:bg-zinc-800/30 [&>td]:border-t [&>td]:border-zinc-100 dark:[&>td]:border-zinc-800"
                    >
                      <td class="sticky left-0 w-[clamp(12rem,18vw,22rem)] min-w-[12rem] whitespace-nowrap bg-zinc-50 py-2 pl-10 pr-5 font-medium text-zinc-700 dark:bg-zinc-900 dark:text-zinc-200">{{ d.label }}</td>
                      <td
                        v-for="(v, i) in d.values"
                        :key="i"
                        class="whitespace-nowrap px-4 py-2 text-right tabular-nums text-zinc-600 dark:text-zinc-300"
                      >
                        {{ v === null ? "—" : formatValue(row, v) }}
                        <div class="mt-0.5 text-[11px] font-medium">
                          <span class="rounded-full px-1.5 py-0.5" :class="chipClass(calcVariacao(row, v, i === 0 ? d.anterior : d.values[i - 1]))">{{ pctText(calcVariacao(row, v, i === 0 ? d.anterior : d.values[i - 1])) }}</span>
                        </div>
                      </td>
                      <td class="sticky right-[8rem] bg-zinc-50 px-4 py-2 text-center dark:bg-zinc-900">
                        <svg v-if="sparkPoints(d)" width="88" height="26" viewBox="0 0 88 26" aria-hidden="true">
                          <polyline :points="sparkPoints(d)" fill="none" :stroke="SPARK_COR[statusDe(d)]" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" />
                        </svg>
                        <span v-else class="text-zinc-300">—</span>
                      </td>
                      <td class="sticky right-0 w-[8rem] min-w-[8rem] whitespace-nowrap bg-zinc-50 px-3 py-2 text-center dark:bg-zinc-900">
                        <span class="rounded-full px-3 py-1 text-sm font-bold tabular-nums" :class="chipClass(variacaoPeriodo(d))">{{ pctText(variacaoPeriodo(d)) }}</span>
                      </td>
                    </tr>
                    <tr
                      v-for="e in outrosEstados(detalheExpandido.estadosPorComponente?.[d.label])"
                      :key="`${d.label}-${e.label}`"
                      class="bg-zinc-50/70 dark:bg-zinc-800/30 [&>td]:border-t [&>td]:border-zinc-100 dark:[&>td]:border-zinc-800"
                    >
                      <td class="sticky left-0 w-[clamp(12rem,18vw,22rem)] min-w-[12rem] whitespace-nowrap bg-zinc-50 py-2 pl-16 pr-5 text-zinc-500 dark:bg-zinc-900 dark:text-zinc-400">{{ e.label }}</td>
                      <td
                        v-for="(v, i) in e.values"
                        :key="i"
                        class="whitespace-nowrap px-4 py-2 text-right tabular-nums text-zinc-600 dark:text-zinc-300"
                      >
                        {{ v === null ? "—" : formatValue(row, v) }}
                        <div class="mt-0.5 text-[11px] font-medium">
                          <span class="rounded-full px-1.5 py-0.5" :class="chipClass(calcVariacao(row, v, i === 0 ? e.anterior : e.values[i - 1]))">{{ pctText(calcVariacao(row, v, i === 0 ? e.anterior : e.values[i - 1])) }}</span>
                        </div>
                      </td>
                      <td class="sticky right-[8rem] bg-zinc-50 px-4 py-2 text-center dark:bg-zinc-900">
                        <svg v-if="sparkPoints(e)" width="88" height="26" viewBox="0 0 88 26" aria-hidden="true">
                          <polyline :points="sparkPoints(e)" fill="none" :stroke="SPARK_COR[statusDe(e)]" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" />
                        </svg>
                        <span v-else class="text-zinc-300">—</span>
                      </td>
                      <td class="sticky right-0 w-[8rem] min-w-[8rem] whitespace-nowrap bg-zinc-50 px-3 py-2 text-center dark:bg-zinc-900">
                        <span class="rounded-full px-3 py-1 text-sm font-bold tabular-nums" :class="chipClass(variacaoPeriodo(e))">{{ pctText(variacaoPeriodo(e)) }}</span>
                      </td>
                    </tr>
                    </template>
                  </template>
                  <template v-if="expandido === row.id && detalheExpandido.estados">
                    <tr
                      v-for="e in outrosEstados(detalheExpandido.estados)"
                      :key="`${row.id}-${e.label}`"
                      class="bg-zinc-50/70 dark:bg-zinc-800/30 [&>td]:border-t [&>td]:border-zinc-100 dark:[&>td]:border-zinc-800"
                    >
                      <td class="sticky left-0 w-[clamp(12rem,18vw,22rem)] min-w-[12rem] whitespace-nowrap bg-zinc-50 py-2 pl-10 pr-5 text-zinc-500 dark:bg-zinc-900 dark:text-zinc-400">{{ e.label }}</td>
                      <td
                        v-for="(v, i) in e.values"
                        :key="i"
                        class="whitespace-nowrap px-4 py-2 text-right tabular-nums text-zinc-600 dark:text-zinc-300"
                      >
                        {{ v === null ? "—" : formatValue(row, v) }}
                        <div class="mt-0.5 text-[11px] font-medium">
                          <span class="rounded-full px-1.5 py-0.5" :class="chipClass(calcVariacao(row, v, i === 0 ? e.anterior : e.values[i - 1]))">{{ pctText(calcVariacao(row, v, i === 0 ? e.anterior : e.values[i - 1])) }}</span>
                        </div>
                      </td>
                      <td class="sticky right-[8rem] bg-zinc-50 px-4 py-2 text-center dark:bg-zinc-900">
                        <svg v-if="sparkPoints(e)" width="88" height="26" viewBox="0 0 88 26" aria-hidden="true">
                          <polyline :points="sparkPoints(e)" fill="none" :stroke="SPARK_COR[statusDe(e)]" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" />
                        </svg>
                        <span v-else class="text-zinc-300">—</span>
                      </td>
                      <td class="sticky right-0 w-[8rem] min-w-[8rem] whitespace-nowrap bg-zinc-50 px-3 py-2 text-center dark:bg-zinc-900">
                        <span class="rounded-full px-3 py-1 text-sm font-bold tabular-nums" :class="chipClass(variacaoPeriodo(e))">{{ pctText(variacaoPeriodo(e)) }}</span>
                      </td>
                    </tr>
                  </template>
                  <tr v-if="expandido === row.id" class="bg-zinc-50/70 dark:bg-zinc-800/30 [&>td]:border-t [&>td]:border-zinc-100 dark:[&>td]:border-zinc-800">
                    <td :colspan="months.length + 3" class="px-5 py-3 text-xs text-zinc-600 dark:text-zinc-300">
                      <p v-if="descricao(row.id)"><span class="font-semibold text-zinc-800 dark:text-zinc-100">Cálculo:</span> {{ descricao(row.id).calc }}</p>
                      <p class="mt-1">
                        <span class="font-semibold text-zinc-800 dark:text-zinc-100">Leitura:</span>
                        {{ row.higherIsBetter ? "quanto maior, melhor" : "quanto menor, melhor" }} ·
                        mês anterior ao período: {{ row.anterior === null ? "sem dados" : formatValue(row, row.anterior) }}
                      </p>
                    </td>
                  </tr>
                </template>
              </tbody>
            </table>
            <p v-if="!visiveis.length" class="px-5 py-10 text-center text-sm text-zinc-500 dark:text-zinc-400">
              Nenhum indicador encontrado para os filtros selecionados.
            </p>
          </div>
        </section>

        <p class="border-t border-zinc-200 pt-4 text-center text-xs text-zinc-400 dark:border-zinc-800 dark:text-zinc-500">
          Verde = melhora e vermelho = piora, conforme o tipo de cada indicador · A variação em % é contra o mês imediatamente anterior; o primeiro mês é comparado com o mês anterior a ele · "Variação média" = média das variações mensais (%) de todos os meses filtrados, ignorando meses sem base · "—" indica mês sem dados ou sem base (valor zero) · Clique em uma linha para ver o cálculo.
        </p>
      </div>
    </div>
  </Modal>
</template>
