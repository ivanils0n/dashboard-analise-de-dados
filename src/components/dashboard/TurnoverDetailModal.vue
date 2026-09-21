<script setup>
import { computed } from "vue";
import Modal from "@/components/ui/Modal.vue";
import EmptyState from "@/components/ui/EmptyState.vue";
import { STATE_NAMES } from "@/lib/config";
import { turnoverEntriesInRange } from "@/lib/employees";
import { getBranchById } from "@/lib/store";
import { dateFilter } from "@/composables/useDateFilter";
import { useFilters } from "@/composables/useFilters";
import { formatValue, ymLabel } from "@/lib/utils";

/* Detalhe de Admissões ou Demissões do Turnover (cards ao lado da pizza no
   Painel): mostra os lançamentos por empresa e mês que compõem o número, no
   período e estado filtrados. O total daqui é sempre o do card (mesma fonte:
   turnoverQuantitiesInRange). */
const props = defineProps({
  open: { type: Boolean, default: false },
  /* "admissoes" | "demissoes" */
  kind: { type: String, default: "admissoes" }
});

const emit = defineEmits(["close"]);

const { state } = useFilters();

const isAdmissao = computed(() => props.kind === "admissoes");
const label = computed(() => (isAdmissao.value ? "Admissões" : "Demissões"));
const rateLabel = computed(() => (isAdmissao.value ? "Entrada" : "Saída"));
const PERCENT = { type: "percent", decimals: 1 };

const range = computed(() =>
  dateFilter.start ? { start: dateFilter.start, end: dateFilter.end } : null
);

const rows = computed(() =>
  turnoverEntriesInRange(state.current, range.value).map((t) => {
    const branch = t.filialId ? getBranchById(t.filialId) : null;
    const quantidade = Number(isAdmissao.value ? t.admitidos : t.demitidos) || 0;
    const ativos = Number(t.ativos) || 0;
    return {
      id: t.id,
      mes: t.mesReferencia,
      empresa: branch ? branch.name : "—",
      estado: t.estado || "",
      quantidade,
      ativos,
      taxa: ativos ? (quantidade / ativos) * 100 : null
    };
  })
);

const total = computed(() => rows.value.reduce((sum, r) => sum + r.quantidade, 0));
const totalAtivos = computed(() => rows.value.reduce((sum, r) => sum + r.ativos, 0));
const totalTaxa = computed(() => (totalAtivos.value ? (total.value / totalAtivos.value) * 100 : null));

const escopo = computed(() => {
  const st = state.current;
  return !st || st === "todos" ? "Todos os estados" : STATE_NAMES[st] || st;
});
const periodo = computed(() => (dateFilter.start ? ymLabel(String(dateFilter.end || dateFilter.start).slice(0, 7)) : "Todo o período"));
</script>

<template>
  <Modal
    :title="`Turnover — ${label}`"
    :subtitle="`${escopo} · ${periodo}`"
    :open="open"
    max-width="max-w-4xl"
    @close="emit('close')"
  >
    <div class="flex flex-col gap-4">
      <div
        class="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-accent/25 bg-accent/5 p-4 dark:border-accent/25 dark:bg-accent/10"
      >
        <div>
          <p class="text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">{{ label }}</p>
          <p class="text-3xl font-bold tabular-nums text-zinc-900 dark:text-zinc-100">{{ total }}</p>
        </div>
        <div class="flex flex-wrap items-center justify-end gap-x-6 gap-y-1 text-right">
          <div>
            <p class="text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">{{ rateLabel }}</p>
            <p class="text-xl font-bold tabular-nums text-zinc-900 dark:text-zinc-100">
              {{ totalTaxa === null ? "—" : formatValue(PERCENT, totalTaxa) }}
            </p>
          </div>
        </div>
      </div>

      <div v-if="rows.length" class="overflow-hidden rounded-xl border border-zinc-200 dark:border-zinc-800">
        <div class="max-h-[26rem] overflow-auto">
          <table class="w-full min-w-max text-left text-sm">
            <thead class="sticky top-0 z-10 bg-white dark:bg-zinc-900">
              <tr class="border-b border-zinc-100 text-xs uppercase tracking-wide text-zinc-400 dark:border-zinc-800 dark:text-zinc-400">
                <th class="whitespace-nowrap px-4 py-2.5 font-semibold">Mês</th>
                <th class="whitespace-nowrap px-4 py-2.5 font-semibold">Empresa</th>
                <th class="whitespace-nowrap px-4 py-2.5 font-semibold">Estado</th>
                <th class="whitespace-nowrap px-4 py-2.5 text-right font-semibold">{{ label }}</th>
                <th class="whitespace-nowrap px-4 py-2.5 text-right font-semibold">{{ rateLabel }} (%)</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="r in rows" :key="r.id" class="border-b border-zinc-100 last:border-0 dark:border-zinc-800">
                <td class="whitespace-nowrap px-4 py-2.5 text-zinc-600 dark:text-zinc-300">{{ r.mes ? ymLabel(r.mes) : "—" }}</td>
                <td class="whitespace-nowrap px-4 py-2.5 font-medium text-zinc-900 dark:text-zinc-100">{{ r.empresa }}</td>
                <td class="whitespace-nowrap px-4 py-2.5 text-zinc-600 dark:text-zinc-300">{{ r.estado || "—" }}</td>
                <td class="whitespace-nowrap px-4 py-2.5 text-right font-semibold tabular-nums text-zinc-900 dark:text-zinc-100">{{ r.quantidade }}</td>
                <td class="whitespace-nowrap px-4 py-2.5 text-right tabular-nums text-zinc-600 dark:text-zinc-300">
                  {{ r.taxa === null ? "—" : formatValue(PERCENT, r.taxa) }}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
        <div class="border-t border-zinc-100 px-4 py-2 text-xs text-zinc-400 dark:border-zinc-800 dark:text-zinc-400">
          {{ rows.length === 1 ? "1 lançamento" : `${rows.length} lançamentos` }}
        </div>
      </div>

      <EmptyState
        v-else
        title="Sem lançamentos de Turnover"
        text="Nenhum lançamento de Turnover no período e estado filtrados."
      />
    </div>
  </Modal>
</template>
