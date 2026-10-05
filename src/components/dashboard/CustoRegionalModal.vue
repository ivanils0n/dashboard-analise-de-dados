<script setup>
import { computed, ref, watch } from "vue";
import Modal from "@/components/ui/Modal.vue";
import EmptyState from "@/components/ui/EmptyState.vue";
import ViewTabs from "@/components/dashboard/ViewTabs.vue";
import { rescisaoAmount } from "@/lib/employees";
import { formatCurrency, ymShortLabel, compareDateDesc, filialDisplay } from "@/lib/utils";

const props = defineProps({
  open: { type: Boolean, default: false },
  regional: { type: String, default: "" },
  folha: { type: Array, default: () => [] },
  ferias: { type: Array, default: () => [] },
  rescisoes: { type: Array, default: () => [] }
});
const emit = defineEmits(["close"]);

const filtro = ref("todos");
watch(
  () => props.open,
  (open) => {
    if (open) filtro.value = "todos";
  }
);

const TIPOS = {
  folha: "Folha",
  ferias: "Férias",
  rescisoes: "Rescisões"
};

function fromEntry(tipo, e) {
  const meta = e.meta || {};
  return {
    id: `${tipo}-${e.id}`,
    tipo,
    date: e.date,
    colaborador: meta.employeeName || "—",
    filial: filialDisplay(meta.filial, meta.estado) || "—",
    value: Number(e.value) || 0
  };
}

const linhas = computed(() => [
  ...props.folha.map((e) => fromEntry("folha", e)),
  ...props.ferias.map((e) => fromEntry("ferias", e)),
  ...props.rescisoes.map((r) => ({
    id: `rescisoes-${r.id}`,
    tipo: "rescisoes",
    date: r.mesReferencia || r.ultDiaAviso || "",
    colaborador: r.colaborador || "—",
    filial: r.filial || "—",
    value: rescisaoAmount(r, "total")
  }))
]);

const totais = computed(() => {
  const t = { folha: 0, ferias: 0, rescisoes: 0 };
  linhas.value.forEach((l) => (t[l.tipo] += l.value));
  return t;
});

const opcoes = computed(() => [
  { value: "todos", label: "Todos", title: "Folha, Férias e Rescisões" },
  { value: "ferias", label: "Férias", title: "Somente férias" },
  { value: "rescisoes", label: "Rescisões", title: "Somente rescisões" },
  { value: "folha", label: "Folha", title: "Somente folha" }
]);

const visiveis = computed(() =>
  linhas.value
    .filter((l) => filtro.value === "todos" || l.tipo === filtro.value)
    .sort((a, b) => compareDateDesc(a.date, b.date) || a.colaborador.localeCompare(b.colaborador, "pt-BR"))
);
const totalVisivel = computed(() => visiveis.value.reduce((s, l) => s + l.value, 0));

const resumo = computed(() => [
  { label: "Folha", value: totais.value.folha },
  { label: "Férias", value: totais.value.ferias },
  { label: "Rescisões", value: totais.value.rescisoes }
]);
</script>

<template>
  <Modal
    :title="`Custo de Pessoal — ${regional || 'Regional'}`"
    subtitle="Folha, Férias e Rescisões da regional no período filtrado"
    :open="open"
    max-width="max-w-4xl"
    @close="emit('close')"
  >
    <div v-if="linhas.length" class="flex flex-col gap-4">
      <div
        class="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-accent/25 bg-accent/5 p-4 dark:border-accent/25 dark:bg-accent/10"
      >
        <div>
          <p class="text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
            Total {{ filtro === "todos" ? "geral" : TIPOS[filtro].toLowerCase() }}
          </p>
          <p class="text-3xl font-bold tabular-nums text-zinc-900 dark:text-zinc-100">{{ formatCurrency(totalVisivel) }}</p>
        </div>
        <div class="text-right text-xs text-zinc-500 dark:text-zinc-400">
          <p>{{ visiveis.length }} {{ visiveis.length === 1 ? "lançamento" : "lançamentos" }}</p>
        </div>
      </div>

      <dl class="grid gap-3 rounded-xl border border-zinc-200 p-4 sm:grid-cols-3 dark:border-zinc-800">
        <div v-for="r in resumo" :key="r.label" class="flex flex-col gap-0.5">
          <dt class="text-[11px] font-semibold uppercase tracking-wide text-zinc-400 dark:text-zinc-400">{{ r.label }}</dt>
          <dd class="text-sm font-medium tabular-nums text-zinc-900 dark:text-zinc-100">{{ formatCurrency(r.value) }}</dd>
        </div>
      </dl>

      <ViewTabs v-model="filtro" :options="opcoes" label="Filtrar por tipo de custo" />

      <div class="overflow-hidden rounded-xl border border-zinc-200 dark:border-zinc-800">
        <div class="max-h-[22rem] overflow-auto">
          <table class="w-full min-w-max text-left text-sm">
            <thead class="sticky top-0 z-10 bg-white dark:bg-zinc-900">
              <tr class="border-b border-zinc-100 text-xs uppercase tracking-wide text-zinc-400 dark:border-zinc-800 dark:text-zinc-400">
                <th class="whitespace-nowrap px-4 py-2.5 font-semibold">Tipo</th>
                <th class="whitespace-nowrap px-4 py-2.5 font-semibold">Mês referente</th>
                <th class="whitespace-nowrap px-4 py-2.5 font-semibold">Colaborador</th>
                <th class="whitespace-nowrap px-4 py-2.5 font-semibold">Filial</th>
                <th class="whitespace-nowrap px-4 py-2.5 text-right font-semibold">Valor</th>
              </tr>
            </thead>
            <tbody class="uppercase">
              <tr v-for="l in visiveis" :key="l.id" class="border-b border-zinc-100 last:border-0 dark:border-zinc-800">
                <td class="whitespace-nowrap px-4 py-2.5 font-medium text-zinc-800 dark:text-zinc-100">{{ TIPOS[l.tipo] }}</td>
                <td class="whitespace-nowrap px-4 py-2.5 text-zinc-600 dark:text-zinc-300">{{ l.date ? ymShortLabel(l.date) : "—" }}</td>
                <td class="whitespace-nowrap px-4 py-2.5 text-zinc-600 dark:text-zinc-300">{{ l.colaborador }}</td>
                <td class="whitespace-nowrap px-4 py-2.5 text-zinc-600 dark:text-zinc-300">{{ l.filial }}</td>
                <td class="whitespace-nowrap px-4 py-2.5 text-right font-medium tabular-nums text-zinc-900 dark:text-zinc-100">
                  {{ formatCurrency(l.value) }}
                </td>
              </tr>
              <tr v-if="!visiveis.length">
                <td colspan="5" class="px-4 py-6 text-center text-sm normal-case text-zinc-500 dark:text-zinc-400">
                  Nenhum lançamento deste tipo na regional.
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>

    <EmptyState v-else title="Sem custos nesta regional" text="Nenhum lançamento de Folha, Férias ou Rescisões no período filtrado." />
  </Modal>
</template>
