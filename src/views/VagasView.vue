<script setup>
import { ref, computed, watch, onActivated } from "vue";
import Badge from "@/components/ui/Badge.vue";
import EmptyState from "@/components/ui/EmptyState.vue";
import StateFilter from "@/components/layout/StateFilter.vue";
import MultiSelectFilter from "@/components/dashboard/MultiSelectFilter.vue";
import { useFilters } from "@/composables/useFilters";
import { hydrateState } from "@/lib/db";
import { beginLoading, endLoading } from "@/composables/useLoading";
import { listVacancies } from "@/lib/employees";
import { formatCurrency, formatDate, normalizeText, ymLabel, daysBetween, todayISO } from "@/lib/utils";

/* Página detalhada de Vagas: uma vaga por linha (aba "vagas"), com pesquisa e
   filtros de estado, mês de abertura, situação, filial, recrutador e tipo de
   contratação. */
const { state: filters } = useFilters();

onActivated(() => {
  beginLoading("Carregando vagas...");
  hydrateState(filters.current)
    .catch(() => {})
    .finally(endLoading);
});

const search = ref("");
/* Todos os filtros abaixo aceitam vários valores ([] = sem filtro). */
const meses = ref([]);
const situacoes = ref([]);
const filiais = ref([]);
const recrutadores = ref([]);
const tipos = ref([]);

/* Uma linha "achatada" por vaga do estado escolhido. `dias`: da abertura até o
   fechamento (ou até hoje, se aberta) — null se as datas forem inválidas. */
const base = computed(() => {
  void filters.revision;
  const hoje = todayISO();
  return listVacancies(filters.current).map((v) => {
    const dias = v.openAt ? daysBetween(v.openAt, v.closeAt || hoje) : null;
    return {
      id: v.id,
      nome: v.name || "",
      mes: v.openAt ? String(v.openAt).slice(0, 7) : "",
      abertaEm: v.openAt || "",
      fechadaEm: v.closeAt || "",
      situacao: v.closeAt ? "FECHADA" : "ABERTA",
      dias: dias !== null && Number.isFinite(dias) && dias >= 0 ? dias : null,
      salario: v.salario,
      tipo: v.tipoContratacao ? String(v.tipoContratacao).toUpperCase() : "",
      filial: v.filial || "",
      recrutador: v.recrutador || "",
      estado: v.estado || ""
    };
  });
});

function uniqueSorted(key) {
  const set = new Set();
  base.value.forEach((r) => r[key] && set.add(r[key]));
  return [...set].sort((a, b) => a.localeCompare(b, "pt-BR"));
}
const mesOptions = computed(() => uniqueSorted("mes").reverse());
const situacaoOptions = computed(() => uniqueSorted("situacao"));
const filialOptions = computed(() => uniqueSorted("filial"));
const recrutadorOptions = computed(() => uniqueSorted("recrutador"));
const tipoOptions = computed(() => uniqueSorted("tipo"));

/* Valor marcado que deixou de existir (troca de estado) sai da seleção. */
function prune(selected, options) {
  if (selected.value.some((v) => !options.includes(v))) {
    selected.value = selected.value.filter((v) => options.includes(v));
  }
}
watch([mesOptions, situacaoOptions, filialOptions, recrutadorOptions, tipoOptions], () => {
  prune(meses, mesOptions.value);
  prune(situacoes, situacaoOptions.value);
  prune(filiais, filialOptions.value);
  prune(recrutadores, recrutadorOptions.value);
  prune(tipos, tipoOptions.value);
});

/* O filtro de mês já abre no mês anterior ao atual. Vale só na primeira vez que
   há dados — e só se esse mês existir neles; depois disso a escolha é do usuário. */
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
      if (meses.value.length && !meses.value.includes(r.mes)) return false;
      if (situacoes.value.length && !situacoes.value.includes(r.situacao)) return false;
      if (filiais.value.length && !filiais.value.includes(r.filial)) return false;
      if (recrutadores.value.length && !recrutadores.value.includes(r.recrutador)) return false;
      if (tipos.value.length && !tipos.value.includes(r.tipo)) return false;
      if (!q) return true;
      return normalizeText([r.nome, r.filial, r.recrutador, r.estado, r.tipo].join(" ")).includes(q);
    })
    .slice()
    .sort((a, b) => b.abertaEm.localeCompare(a.abertaEm) || a.nome.localeCompare(b.nome, "pt-BR"));
});

const summary = computed(() => {
  const abertas = rows.value.filter((r) => r.situacao === "ABERTA").length;
  const fechadasDias = rows.value.filter((r) => r.situacao === "FECHADA" && r.dias !== null).map((r) => r.dias);
  const media = fechadasDias.length ? fechadasDias.reduce((s, d) => s + d, 0) / fechadasDias.length : null;
  return [
    { label: "Vagas", value: String(rows.value.length) },
    { label: "Abertas", value: String(abertas) },
    { label: "Fechadas", value: String(rows.value.length - abertas) },
    { label: "Tempo médio (fechadas)", value: media === null ? "—" : `${media.toFixed(1)} dias`, accent: true }
  ];
});

const hasFilter = computed(
  () =>
    search.value ||
    meses.value.length ||
    situacoes.value.length ||
    filiais.value.length ||
    recrutadores.value.length ||
    tipos.value.length
);
function clearFilters() {
  search.value = "";
  meses.value = [];
  situacoes.value = [];
  filiais.value = [];
  recrutadores.value = [];
  tipos.value = [];
}

const text = (v) => (v === undefined || v === null || String(v).trim() === "" ? "—" : String(v));

const columns = [
  { label: "Vaga", get: (r) => text(r.nome), strong: true },
  { label: "Situação", get: (r) => r.situacao },
  { label: "Aberta em", get: (r) => formatDate(r.abertaEm) },
  { label: "Fechada em", get: (r) => formatDate(r.fechadaEm) },
  { label: "Dias", get: (r) => (r.dias === null ? "—" : r.dias.toFixed(1)), num: true, strong: true },
  { label: "Salário", get: (r) => (r.salario == null ? "—" : formatCurrency(r.salario)), num: true },
  { label: "Contratação", get: (r) => text(r.tipo) },
  { label: "Filial", get: (r) => text(r.filial) },
  { label: "Recrutador", get: (r) => text(r.recrutador) },
  { label: "Estado", get: (r) => text(r.estado) }
];
</script>

<template>
  <div>
    <div class="mb-6 flex flex-wrap items-center justify-between gap-4">
      <h1 class="text-2xl font-bold text-zinc-900 dark:text-zinc-100">Vagas</h1>
      <div class="flex items-center gap-3">
        <Badge tone="accent">{{ rows.length === 1 ? "1 vaga" : `${rows.length} vagas` }}</Badge>
        <StateFilter variant="page" />
      </div>
    </div>

    <div class="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
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
          placeholder="Pesquisar vaga, filial, recrutador..."
          aria-label="Pesquisar vagas"
        />
        <MultiSelectFilter
          v-model="meses"
          :options="mesOptions"
          :format-option="ymLabel"
          label="Mês de abertura"
          all-label="Todos os meses"
          plural-label="meses"
          title="Filtrar por um ou mais meses de abertura"
        />
        <MultiSelectFilter
          v-model="situacoes"
          :options="situacaoOptions"
          label="Situação"
          all-label="Todas as situações"
          plural-label="situações"
          title="Filtrar por situação (aberta ou fechada)"
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
          v-model="recrutadores"
          :options="recrutadorOptions"
          label="Recrutador"
          all-label="Todos os recrutadores"
          plural-label="recrutadores"
          title="Filtrar por um ou mais recrutadores"
        />
        <MultiSelectFilter
          v-model="tipos"
          :options="tipoOptions"
          label="Contratação"
          all-label="Todos os tipos"
          plural-label="tipos"
          title="Filtrar por tipo de contratação"
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
                class="whitespace-nowrap px-4 py-2.5"
                :class="[
                  c.num && 'text-right tabular-nums',
                  c.strong ? 'font-semibold text-zinc-900 dark:text-zinc-100' : 'text-zinc-600 dark:text-zinc-300'
                ]"
              >
                {{ c.get(r) }}
              </td>
            </tr>
          </tbody>
        </table>
      </div>
      <div v-else class="p-6">
        <EmptyState title="Nenhuma vaga encontrada" text="Ajuste a pesquisa ou os filtros." />
      </div>
    </section>
  </div>
</template>
