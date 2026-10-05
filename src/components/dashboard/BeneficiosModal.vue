<script setup>
import { computed } from "vue";
import Modal from "@/components/ui/Modal.vue";
import EmptyState from "@/components/ui/EmptyState.vue";
import { formatCurrency, formatDate, ymShortLabel, compareDateDesc } from "@/lib/utils";

const props = defineProps({
  open: { type: Boolean, default: false },
  beneficio: { type: String, default: "" },
  entries: { type: Array, default: () => [] }
});
const emit = defineEmits(["close"]);

const sorted = computed(() =>
  props.entries
    .slice()
    .sort((a, b) => compareDateDesc(a.date, b.date) || String(b.id || "").localeCompare(String(a.id || "")))
);
const total = computed(() => props.entries.reduce((sum, e) => sum + (Number(e.value) || 0), 0));

function cell(entry, key) {
  const v = entry.meta && entry.meta[key];
  return v === undefined || v === null || String(v).trim() === "" ? "—" : String(v);
}

function vencimento(entry) {
  const v = entry.meta && entry.meta.vencimento;
  return v ? formatDate(v) : "—";
}
</script>

<template>
  <Modal
    :title="`Benefícios — ${beneficio || 'Todos'}`"
    subtitle="Lançamentos da aba beneficios no período filtrado"
    :open="open"
    max-width="max-w-4xl"
    @close="emit('close')"
  >
    <div v-if="entries.length" class="flex flex-col gap-4">
      <div
        class="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-accent/25 bg-accent/5 p-4 dark:border-accent/25 dark:bg-accent/10"
      >
        <div>
          <p class="text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">Total a pagar no período</p>
          <p class="text-3xl font-bold tabular-nums text-zinc-900 dark:text-zinc-100">{{ formatCurrency(total) }}</p>
        </div>
        <div class="text-right text-xs text-zinc-500 dark:text-zinc-400">
          <p>{{ entries.length }} {{ entries.length === 1 ? "lançamento" : "lançamentos" }}</p>
        </div>
      </div>

      <div class="overflow-hidden rounded-xl border border-zinc-200 dark:border-zinc-800">
        <div class="max-h-[22rem] overflow-auto">
          <table class="w-full min-w-max text-left text-sm">
            <thead class="sticky top-0 z-10 bg-white dark:bg-zinc-900">
              <tr class="border-b border-zinc-100 text-xs uppercase tracking-wide text-zinc-400 dark:border-zinc-800 dark:text-zinc-400">
                <th class="whitespace-nowrap px-4 py-2.5 font-semibold">Mês referente</th>
                <th class="whitespace-nowrap px-4 py-2.5 font-semibold">Benefício</th>
                <th class="whitespace-nowrap px-4 py-2.5 font-semibold">Estado</th>
                <th class="whitespace-nowrap px-4 py-2.5 font-semibold">Vencimento</th>
                <th class="whitespace-nowrap px-4 py-2.5 font-semibold">Forma de pagamento</th>
                <th class="whitespace-nowrap px-4 py-2.5 font-semibold">N° da NF</th>
                <th class="whitespace-nowrap px-4 py-2.5 font-semibold">Fusion/Big</th>
                <th class="whitespace-nowrap px-4 py-2.5 text-right font-semibold">Total a pagar</th>
              </tr>
            </thead>
            <tbody class="uppercase">
              <tr v-for="e in sorted" :key="e.id" class="border-b border-zinc-100 last:border-0 dark:border-zinc-800">
                <td class="whitespace-nowrap px-4 py-2.5 text-zinc-600 dark:text-zinc-300">{{ ymShortLabel(e.date) }}</td>
                <td class="whitespace-nowrap px-4 py-2.5 font-medium text-zinc-800 dark:text-zinc-100">{{ cell(e, "beneficio") }}</td>
                <td class="whitespace-nowrap px-4 py-2.5 text-zinc-600 dark:text-zinc-300">{{ cell(e, "estado") }}</td>
                <td class="whitespace-nowrap px-4 py-2.5 text-zinc-600 dark:text-zinc-300">{{ vencimento(e) }}</td>
                <td class="whitespace-nowrap px-4 py-2.5 text-zinc-600 dark:text-zinc-300">{{ cell(e, "formaPagamento") }}</td>
                <td class="whitespace-nowrap px-4 py-2.5 text-zinc-600 dark:text-zinc-300">{{ cell(e, "nf") }}</td>
                <td class="whitespace-nowrap px-4 py-2.5 text-zinc-600 dark:text-zinc-300">{{ cell(e, "fusionBig") }}</td>
                <td class="whitespace-nowrap px-4 py-2.5 text-right font-medium tabular-nums text-zinc-900 dark:text-zinc-100">
                  {{ formatCurrency(e.value) }}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>

    <EmptyState v-else title="Sem benefícios" text="Nenhum lançamento de benefício registrado no período filtrado." />
  </Modal>
</template>
