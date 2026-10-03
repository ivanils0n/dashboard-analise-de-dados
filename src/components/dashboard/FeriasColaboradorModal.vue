<script setup>
import { computed } from "vue";
import Modal from "@/components/ui/Modal.vue";
import EmptyState from "@/components/ui/EmptyState.vue";
import { getIndicatorById } from "@/lib/config";
import { formatCurrency, formatDate, ymShortLabel, compareDateDesc, filialDisplay } from "@/lib/utils";
import { uniqueEmployeeCount } from "@/lib/metrics";

const props = defineProps({
  open: { type: Boolean, default: false },
  colaborador: { type: String, default: "" },
  groupBy: { type: String, default: "colaborador" },
  entries: { type: Array, default: () => [] }
});

const porColaborador = computed(() => props.groupBy === "colaborador");
const colaboradores = computed(() => uniqueEmployeeCount(props.entries));

const filiais = computed(
  () => new Set(props.entries.map((e) => filialDisplay(e.meta && e.meta.filial, e.meta && e.meta.estado)).filter(Boolean)).size
);

const emit = defineEmits(["close"]);

const sorted = computed(() =>
  props.entries
    .slice()
    .sort((a, b) => compareDateDesc(a.date, b.date) || String(b.id || "").localeCompare(String(a.id || "")))
);

const total = computed(() => props.entries.reduce((sum, e) => sum + (Number(e.value) || 0), 0));

function latest(key) {
  for (const e of sorted.value) {
    const v = key === "filial" ? filialDisplay(e.meta && e.meta.filial, e.meta && e.meta.estado) : e.meta && e.meta[key];
    if (v !== undefined && v !== null && String(v).trim() !== "") return String(v);
  }
  return "";
}

const info = computed(() => [
  { label: "Código", value: latest("codigo") },
  { label: "Filial", value: latest("filial") },
  { label: "Regional", value: latest("regional") },
  { label: "Banco", value: latest("banco") },
  { label: "Estado", value: latest("estado") }
]);

function cell(entry, key) {
  const v = key === "filial" ? filialDisplay(entry.meta && entry.meta.filial, entry.meta && entry.meta.estado) : entry.meta && entry.meta[key];
  return v === undefined || v === null || String(v).trim() === "" ? "—" : String(v);
}

function pagamento(entry) {
  const v = entry.meta && entry.meta.dataPagto;
  return v ? formatDate(v) : "—";
}
</script>

<template>
  <Modal
    :title="`Férias — ${colaborador || (porColaborador ? 'Colaborador' : 'Filial')}`"
    :subtitle="getIndicatorById('ferias')?.calc"
    :open="open"
    max-width="max-w-3xl"
    @close="emit('close')"
  >
    <div v-if="entries.length" class="flex flex-col gap-4">
      <div
        class="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-accent/25 bg-accent/5 p-4 dark:border-accent/25 dark:bg-accent/10"
      >
        <div>
          <p class="text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">Total de férias no período</p>
          <p class="text-3xl font-bold tabular-nums text-zinc-900 dark:text-zinc-100">{{ formatCurrency(total) }}</p>
        </div>
        <div class="text-right text-xs text-zinc-500 dark:text-zinc-400">
          <p>{{ entries.length }} {{ entries.length === 1 ? "pagamento registrado" : "pagamentos registrados" }}</p>
          <p v-if="!porColaborador">{{ colaboradores }} {{ colaboradores === 1 ? "colaborador" : "colaboradores" }}</p>
          <p v-if="groupBy === 'regional'">{{ filiais }} {{ filiais === 1 ? "filial" : "filiais" }}</p>
        </div>
      </div>

      <dl v-if="porColaborador" class="grid gap-3 rounded-xl border border-zinc-200 p-4 sm:grid-cols-2 dark:border-zinc-800">
        <div v-for="item in info" :key="item.label" class="flex flex-col gap-0.5">
          <dt class="text-[11px] font-semibold uppercase tracking-wide text-zinc-400 dark:text-zinc-400">{{ item.label }}</dt>
          <dd class="text-sm font-medium uppercase text-zinc-900 dark:text-zinc-100">{{ item.value || "—" }}</dd>
        </div>
      </dl>

      <div class="overflow-hidden rounded-xl border border-zinc-200 dark:border-zinc-800">
        <div class="max-h-[20rem] overflow-auto">
          <table class="w-full min-w-max text-left text-sm">
            <thead class="sticky top-0 z-10 bg-white dark:bg-zinc-900">
              <tr class="border-b border-zinc-100 text-xs uppercase tracking-wide text-zinc-400 dark:border-zinc-800 dark:text-zinc-400">
                <th class="whitespace-nowrap px-4 py-2.5 font-semibold">Mês referente</th>
                <th v-if="!porColaborador" class="whitespace-nowrap px-4 py-2.5 font-semibold">Colaborador</th>
                <th v-if="groupBy !== 'filial'" class="whitespace-nowrap px-4 py-2.5 font-semibold">Filial</th>
                <th class="whitespace-nowrap px-4 py-2.5 font-semibold">Data de pagamento</th>
                <th class="whitespace-nowrap px-4 py-2.5 font-semibold">Regional</th>
                <th class="whitespace-nowrap px-4 py-2.5 font-semibold">Banco</th>
                <th class="whitespace-nowrap px-4 py-2.5 text-right font-semibold">Valor total</th>
              </tr>
            </thead>
            <tbody class="uppercase">
              <tr v-for="e in sorted" :key="e.id" class="border-b border-zinc-100 last:border-0 dark:border-zinc-800">
                <td class="whitespace-nowrap px-4 py-2.5 text-zinc-600 dark:text-zinc-300">{{ ymShortLabel(e.date) }}</td>
                <td v-if="!porColaborador" class="whitespace-nowrap px-4 py-2.5 font-medium text-zinc-800 dark:text-zinc-100">{{ cell(e, "employeeName") }}</td>
                <td v-if="groupBy !== 'filial'" class="whitespace-nowrap px-4 py-2.5 text-zinc-600 dark:text-zinc-300">{{ cell(e, "filial") }}</td>
                <td class="whitespace-nowrap px-4 py-2.5 text-zinc-600 dark:text-zinc-300">{{ pagamento(e) }}</td>
                <td class="whitespace-nowrap px-4 py-2.5 text-zinc-600 dark:text-zinc-300">{{ cell(e, "regional") }}</td>
                <td class="whitespace-nowrap px-4 py-2.5 text-zinc-600 dark:text-zinc-300">{{ cell(e, "banco") }}</td>
                <td class="whitespace-nowrap px-4 py-2.5 text-right font-medium tabular-nums text-zinc-900 dark:text-zinc-100">
                  {{ formatCurrency(e.value) }}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>

    <EmptyState
      v-else
      :title="porColaborador ? 'Sem férias para este colaborador' : 'Sem férias neste grupo'"
      text="Nenhum pagamento de férias registrado no período filtrado."
    />
  </Modal>
</template>
