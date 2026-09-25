<script setup>
import { ref, computed, watch, onActivated } from "vue";
import Badge from "@/components/ui/Badge.vue";
import EmptyState from "@/components/ui/EmptyState.vue";
import StateFilter from "@/components/layout/StateFilter.vue";
import ExpandableText from "@/components/ui/ExpandableText.vue";
import MultiSelectFilter from "@/components/dashboard/MultiSelectFilter.vue";
import { useFilters } from "@/composables/useFilters";
import { getEntriesFor } from "@/lib/store";
import { hydrateState } from "@/lib/db";
import { beginLoading, endLoading } from "@/composables/useLoading";
import { formatHoursClock, normalizeText, ymLabel } from "@/lib/utils";
import { employeeNameKey } from "@/lib/metrics";

/* Página detalhada de Treinamentos: um lançamento por linha (aba "treinamentos"),
   com pesquisa e filtros de estado, mês, filial, gerente regional, cargo, tema e
   modalidade. */
const { state: filters } = useFilters();

onActivated(() => {
  beginLoading("Carregando treinamentos...");
  hydrateState(filters.current)
    .catch(() => {})
    .finally(endLoading);
});

const search = ref("");
/* Todos os filtros abaixo aceitam vários valores ([] = sem filtro). */
const meses = ref([]);
const filiais = ref([]);
const gerentes = ref([]);
const cargos = ref([]);
const temas = ref([]);
const modalidades = ref([]);

/* Uma linha "achatada" por lançamento do estado escolhido. */
const base = computed(() => {
  void filters.revision;
  return getEntriesFor("treinamento", filters.current).map((e) => {
    const m = e.meta || {};
    return {
      id: e.id,
      mes: String(e.date || "").slice(0, 7),
      colaborador: m.employeeName || "",
      cargo: m.cargo || "",
      filial: m.filial || "",
      gerente: m.gerenteRegional || "",
      estado: m.estado || "",
      tema: m.tema || "",
      modalidade: m.modalidade || "",
      horas: Number(e.value) || 0
    };
  });
});

function uniqueSorted(key) {
  const set = new Set();
  base.value.forEach((r) => r[key] && set.add(r[key]));
  return [...set].sort((a, b) => a.localeCompare(b, "pt-BR"));
}
const mesOptions = computed(() => uniqueSorted("mes").reverse());
const filialOptions = computed(() => uniqueSorted("filial"));
const gerenteOptions = computed(() => uniqueSorted("gerente"));
const cargoOptions = computed(() => uniqueSorted("cargo"));
const temaOptions = computed(() => uniqueSorted("tema"));
const modalidadeOptions = computed(() => uniqueSorted("modalidade"));

/* Valor marcado que deixou de existir (troca de estado) sai da seleção. */
function prune(selected, options) {
  if (selected.value.some((v) => !options.includes(v))) {
    selected.value = selected.value.filter((v) => options.includes(v));
  }
}
watch([mesOptions, filialOptions, gerenteOptions, cargoOptions, temaOptions, modalidadeOptions], () => {
  prune(meses, mesOptions.value);
  prune(filiais, filialOptions.value);
  prune(gerentes, gerenteOptions.value);
  prune(cargos, cargoOptions.value);
  prune(temas, temaOptions.value);
  prune(modalidades, modalidadeOptions.value);
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
      if (filiais.value.length && !filiais.value.includes(r.filial)) return false;
      if (gerentes.value.length && !gerentes.value.includes(r.gerente)) return false;
      if (cargos.value.length && !cargos.value.includes(r.cargo)) return false;
      if (temas.value.length && !temas.value.includes(r.tema)) return false;
      if (modalidades.value.length && !modalidades.value.includes(r.modalidade)) return false;
      if (!q) return true;
      return normalizeText([r.colaborador, r.cargo, r.filial, r.gerente, r.estado, r.tema, r.modalidade].join(" ")).includes(q);
    })
    .slice()
    .sort(
      (a, b) =>
        b.mes.localeCompare(a.mes) || a.colaborador.localeCompare(b.colaborador, "pt-BR")
    );
});

const summary = computed(() => {
  const horas = rows.value.reduce((s, r) => s + r.horas, 0);
  const colaboradores = new Set(rows.value.map((r) => employeeNameKey(r.colaborador))).size;
  return [
    { label: "Treinamentos", value: String(rows.value.length) },
    { label: "Colaboradores", value: String(colaboradores) },
    { label: "Total de horas", value: formatHoursClock(horas), accent: true },
    { label: "Média por treinamento", value: rows.value.length ? formatHoursClock(horas / rows.value.length) : "—" }
  ];
});

const hasFilter = computed(
  () =>
    search.value ||
    meses.value.length ||
    filiais.value.length ||
    gerentes.value.length ||
    cargos.value.length ||
    temas.value.length ||
    modalidades.value.length
);
function clearFilters() {
  search.value = "";
  meses.value = [];
  filiais.value = [];
  gerentes.value = [];
  cargos.value = [];
  temas.value = [];
  modalidades.value = [];
}

const text = (v) => (v === undefined || v === null || String(v).trim() === "" ? "—" : String(v));

/* `clamp`: texto longo, mostra até 3 linhas com "..." e expande ao clicar. */
const columns = [
  { label: "Competência", get: (r) => (r.mes ? ymLabel(r.mes) : "—") },
  { label: "Colaborador", get: (r) => text(r.colaborador), strong: true },
  { label: "Cargo", get: (r) => text(r.cargo) },
  { label: "Filial", get: (r) => text(r.filial) },
  { label: "Gerente regional", get: (r) => text(r.gerente) },
  { label: "Estado", get: (r) => text(r.estado) },
  { label: "Tema do treinamento", get: (r) => text(r.tema), clamp: true, width: "min-w-[14rem] max-w-[20rem]" },
  { label: "Modalidade", get: (r) => text(r.modalidade) },
  { label: "Carga horária", get: (r) => formatHoursClock(r.horas), num: true, strong: true }
];
</script>

<template>
  <div>
    <div class="mb-6 flex flex-wrap items-center justify-between gap-4">
      <h1 class="text-2xl font-bold text-zinc-900 dark:text-zinc-100">Treinamentos</h1>
      <div class="flex items-center gap-3">
        <Badge tone="accent">{{ rows.length === 1 ? "1 treinamento" : `${rows.length} treinamentos` }}</Badge>
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
          placeholder="Pesquisar colaborador, cargo, tema..."
          aria-label="Pesquisar treinamentos"
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
          label="Gerente regional"
          all-label="Todos os gerentes regionais"
          plural-label="gerentes"
          title="Filtrar por um ou mais gerentes regionais"
        />
        <MultiSelectFilter
          v-model="cargos"
          :options="cargoOptions"
          label="Cargo"
          all-label="Todos os cargos"
          plural-label="cargos"
          title="Filtrar por um ou mais cargos"
        />
        <MultiSelectFilter
          v-model="temas"
          :options="temaOptions"
          label="Tema"
          all-label="Todos os temas"
          plural-label="temas"
          title="Filtrar por um ou mais temas"
        />
        <MultiSelectFilter
          v-model="modalidades"
          :options="modalidadeOptions"
          label="Modalidade"
          all-label="Todas as modalidades"
          plural-label="modalidades"
          title="Filtrar por uma ou mais modalidades"
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
        <EmptyState title="Nenhum treinamento encontrado" text="Ajuste a pesquisa ou os filtros." />
      </div>
    </section>
  </div>
</template>
