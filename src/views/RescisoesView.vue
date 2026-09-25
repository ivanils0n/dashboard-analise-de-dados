<script setup>
import { ref, computed, watch, onActivated } from "vue";
import Badge from "@/components/ui/Badge.vue";
import EmptyState from "@/components/ui/EmptyState.vue";
import StateFilter from "@/components/layout/StateFilter.vue";
import ExpandableText from "@/components/ui/ExpandableText.vue";
import MultiSelectFilter from "@/components/dashboard/MultiSelectFilter.vue";
import { useFilters } from "@/composables/useFilters";
import { hydrateState } from "@/lib/db";
import { beginLoading, endLoading } from "@/composables/useLoading";
import { listRescisoes, rescisaoAmount } from "@/lib/employees";
import { formatCurrency, formatDate, normalizeText, ymLabel } from "@/lib/utils";

/* Página detalhada de Rescisões: todas as colunas da aba "rescisoes", com
   pesquisa e filtros de estado, mês, empresa, filial, gerente imediato e motivo. */
const { state: filters } = useFilters();

onActivated(() => {
  beginLoading("Carregando rescisões...");
  hydrateState(filters.current)
    .catch(() => {})
    .finally(endLoading);
});

const search = ref("");
/* Todos os filtros abaixo aceitam vários valores ([] = sem filtro). */
const meses = ref([]);
const empresas = ref([]);
const filiais = ref([]);
const gerentes = ref([]);
const regionais = ref([]);
const motivos = ref([]);

/* Rescisões do estado escolhido, base das opções dos filtros. */
const base = computed(() => {
  void filters.revision;
  return listRescisoes(filters.current);
});

const mesOptions = computed(() => {
  const set = new Set();
  base.value.forEach((r) => r.mesReferencia && set.add(String(r.mesReferencia).slice(0, 7)));
  return [...set].sort().reverse();
});

function uniqueSorted(key) {
  const set = new Set();
  base.value.forEach((r) => r[key] && set.add(r[key]));
  return [...set].sort((a, b) => a.localeCompare(b, "pt-BR"));
}
const empresaOptions = computed(() => uniqueSorted("empresa"));
const filialOptions = computed(() => uniqueSorted("filial"));
const gerenteOptions = computed(() => uniqueSorted("gerenteImediato"));
const regionalOptions = computed(() => uniqueSorted("regional"));
const motivoOptions = computed(() => uniqueSorted("motivo"));

/* Valor marcado que deixou de existir (troca de estado) sai da seleção. */
function prune(selected, options) {
  if (selected.value.some((v) => !options.includes(v))) {
    selected.value = selected.value.filter((v) => options.includes(v));
  }
}
watch([mesOptions, empresaOptions, filialOptions, gerenteOptions, regionalOptions, motivoOptions], () => {
  prune(meses, mesOptions.value);
  prune(empresas, empresaOptions.value);
  prune(filiais, filialOptions.value);
  prune(gerentes, gerenteOptions.value);
  prune(regionais, regionalOptions.value);
  prune(motivos, motivoOptions.value);
});

/* O filtro de mês já abre no mês anterior ao atual (ex.: em setembro, agosto).
   Vale só na primeira vez que há dados — e só se esse mês existir neles; depois
   disso a escolha é do usuário (inclusive limpar). */
function previousYm() {
  const d = new Date();
  d.setDate(1);
  d.setMonth(d.getMonth() - 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}
let monthDefaulted = false;
watch(
  mesOptions,
  (options) => {
    if (monthDefaulted || !options.length) return;
    monthDefaulted = true;
    const prev = previousYm();
    if (options.includes(prev)) meses.value = [prev];
  },
  { immediate: true }
);

const rows = computed(() => {
  const q = normalizeText(search.value).trim();
  return base.value
    .filter((r) => {
      if (meses.value.length && !meses.value.includes(String(r.mesReferencia || "").slice(0, 7))) return false;
      if (empresas.value.length && !empresas.value.includes(r.empresa)) return false;
      if (filiais.value.length && !filiais.value.includes(r.filial)) return false;
      if (gerentes.value.length && !gerentes.value.includes(r.gerenteImediato)) return false;
      if (regionais.value.length && !regionais.value.includes(r.regional)) return false;
      if (motivos.value.length && !motivos.value.includes(r.motivo)) return false;
      if (!q) return true;
      return normalizeText(
        [
          r.empresa, r.estado, r.colaborador, r.filial, r.funcao, r.gerenteImediato,
          r.regional, r.motivo, r.justificativaApurada, r.ponderacoes
        ].join(" ")
      ).includes(q);
    })
    .slice()
    .sort(
      (a, b) =>
        String(b.mesReferencia || "").localeCompare(String(a.mesReferencia || "")) ||
        String(a.colaborador || "").localeCompare(String(b.colaborador || ""), "pt-BR")
    );
});

const sum = (key) => rows.value.reduce((s, r) => s + (Number(r[key]) || 0), 0);
const summary = computed(() => [
  { label: "Rescisões", value: String(rows.value.length) },
  { label: "Líquido", value: formatCurrency(sum("valorRescisao")) },
  { label: "GRRF/Consig", value: formatCurrency(sum("grrfConsig")) },
  { label: "40%", value: formatCurrency(sum("multa40")) },
  { label: "Total", value: formatCurrency(rows.value.reduce((s, r) => s + rescisaoAmount(r, "total"), 0)), accent: true }
]);

const hasFilter = computed(
  () =>
    search.value ||
    meses.value.length ||
    empresas.value.length ||
    filiais.value.length ||
    gerentes.value.length ||
    regionais.value.length ||
    motivos.value.length
);
function clearFilters() {
  search.value = "";
  meses.value = [];
  empresas.value = [];
  filiais.value = [];
  gerentes.value = [];
  regionais.value = [];
  motivos.value = [];
}

const text = (v) => (v === undefined || v === null || String(v).trim() === "" ? "—" : String(v));
const date = (v) => (v ? formatDate(v) : "—");
const money = (v) => formatCurrency(v);
const mesLabel = (v) => (v ? ymLabel(String(v).slice(0, 7)) : "—");

/* Colunas na mesma ordem da aba. `clamp`: texto longo, mostra até 3 linhas com
   "..." e expande ao clicar (ver ExpandableText). */
const columns = [
  { label: "Empresa", get: (r) => text(r.empresa) },
  { label: "Estado", get: (r) => text(r.estado) },
  { label: "Colaborador", get: (r) => text(r.colaborador), strong: true },
  { label: "Filial", get: (r) => text(r.filial) },
  { label: "Função", get: (r) => text(r.funcao) },
  { label: "Admissão", get: (r) => date(r.admissao) },
  { label: "Gerente imediato", get: (r) => text(r.gerenteImediato) },
  { label: "Regional", get: (r) => text(r.regional) },
  { label: "Motivo", get: (r) => text(r.motivo), clamp: true, width: "min-w-[12rem] max-w-[16rem]" },
  { label: "Justificativa apurada", get: (r) => text(r.justificativaApurada), clamp: true, width: "min-w-[16rem] max-w-[22rem]" },
  { label: "Ponderações", get: (r) => text(r.ponderacoes), clamp: true, width: "min-w-[16rem] max-w-[22rem]" },
  { label: "Últ. dia do aviso", get: (r) => date(r.ultDiaAviso) },
  { label: "Valor rescisão", get: (r) => money(r.valorRescisao), num: true },
  { label: "GRRF/Consig", get: (r) => money(r.grrfConsig), num: true },
  { label: "40%", get: (r) => money(r.multa40), num: true },
  { label: "Total", get: (r) => money(rescisaoAmount(r, "total")), num: true, strong: true },
  { label: "Mês ref.", get: (r) => mesLabel(r.mesReferencia) }
];
</script>

<template>
  <div>
    <div class="mb-6 flex flex-wrap items-center justify-between gap-4">
      <h1 class="text-2xl font-bold text-zinc-900 dark:text-zinc-100">Rescisões</h1>
      <div class="flex items-center gap-3">
        <Badge tone="accent">{{ rows.length === 1 ? "1 rescisão" : `${rows.length} rescisões` }}</Badge>
        <StateFilter variant="page" />
      </div>
    </div>

    <div class="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
      <div
        v-for="s in summary"
        :key="s.label"
        class="rounded-2xl border bg-white p-4 shadow-sm dark:bg-zinc-900"
        :class="s.accent ? 'border-accent/40' : 'border-zinc-200 dark:border-zinc-800'"
      >
        <p class="text-[11px] font-semibold uppercase tracking-wide text-zinc-400">{{ s.label }}</p>
        <p class="mt-1 text-lg font-bold tabular-nums text-zinc-900 dark:text-zinc-100">{{ s.value }}</p>
      </div>
    </div>

    <section class="rounded-2xl border border-zinc-200 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
      <div class="flex flex-wrap items-center gap-2 border-b border-zinc-100 p-5 dark:border-zinc-800">
        <input
          v-model="search"
          type="search"
          class="input-sm w-full sm:w-64"
          placeholder="Pesquisar colaborador, função, motivo..."
          aria-label="Pesquisar rescisões"
        />
        <MultiSelectFilter
          v-model="meses"
          :options="mesOptions"
          :format-option="ymLabel"
          label="Mês"
          all-label="Todos os meses"
          plural-label="meses"
          title="Filtrar por um ou mais meses"
        />
        <MultiSelectFilter
          v-model="empresas"
          :options="empresaOptions"
          label="Empresa"
          all-label="Todas as empresas"
          plural-label="empresas"
          title="Filtrar por uma ou mais empresas"
        />
        <MultiSelectFilter
          v-model="filiais"
          :options="filialOptions"
          label="Filial"
          all-label="Todas as filiais"
          plural-label="filiais"
          title="Filtrar por uma ou mais filiais"
        />
        <MultiSelectFilter
          v-model="gerentes"
          :options="gerenteOptions"
          label="Gerente imediato"
          all-label="Todos os gerentes imediatos"
          plural-label="gerentes"
          title="Filtrar por um ou mais gerentes imediatos"
        />
        <MultiSelectFilter
          v-model="regionais"
          :options="regionalOptions"
          label="Regional"
          all-label="Todas as regionais"
          plural-label="regionais"
          title="Filtrar por uma ou mais regionais"
        />
        <MultiSelectFilter
          v-model="motivos"
          :options="motivoOptions"
          label="Motivo"
          all-label="Todos os motivos"
          plural-label="motivos"
          title="Filtrar por um ou mais motivos"
        />
        <button
          v-if="hasFilter"
          type="button"
          class="rounded-lg border border-zinc-300 px-3 py-2.5 text-sm font-medium text-zinc-700 transition hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-800"
          @click="clearFilters"
        >
          Limpar filtros
        </button>
      </div>

      <div v-if="rows.length" class="max-h-[calc(100vh-22rem)] min-h-[16rem] overflow-auto">
        <table class="w-full min-w-max text-left text-sm">
          <thead class="sticky top-0 z-10 bg-white dark:bg-zinc-900">
            <tr class="border-b border-zinc-100 text-xs uppercase tracking-wide text-zinc-400 dark:border-zinc-800">
              <th
                v-for="c in columns"
                :key="c.label"
                class="whitespace-nowrap px-4 py-2.5 font-semibold"
                :class="c.num && 'text-right'"
              >
                {{ c.label }}
              </th>
            </tr>
          </thead>
          <tbody class="uppercase">
            <tr v-for="r in rows" :key="r.id" class="border-b border-zinc-100 align-top last:border-0 dark:border-zinc-800">
              <td
                v-for="c in columns"
                :key="c.label"
                class="px-4 py-2.5"
                :class="[
                  c.clamp ? c.width : 'whitespace-nowrap',
                  c.num && 'text-right tabular-nums',
                  c.strong ? 'font-semibold text-zinc-900 dark:text-zinc-100' : 'text-zinc-600 dark:text-zinc-300'
                ]"
              >
                <ExpandableText v-if="c.clamp" :text="c.get(r)" :lines="3" class="whitespace-pre-line" />
                <template v-else>{{ c.get(r) }}</template>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
      <div v-else class="p-6">
        <EmptyState
          title="Nenhuma rescisão encontrada"
          text="Ajuste a pesquisa ou os filtros."
        />
      </div>
    </section>
  </div>
</template>
