<script setup>
import { computed } from "vue";
import Modal from "@/components/ui/Modal.vue";
import EmptyState from "@/components/ui/EmptyState.vue";
import { formatCurrency, formatDate } from "@/lib/utils";
import { rescisaoAmount } from "@/lib/employees";

/* Detalhe de uma função no gráfico de Rescisões (clique na barra): totais do
   período e cada rescisão da função, com os dados da aba "rescisoes". */
const props = defineProps({
  open: { type: Boolean, default: false },
  funcao: { type: String, default: "" },
  records: { type: Array, default: () => [] }
});

const emit = defineEmits(["close"]);

const sorted = computed(() =>
  props.records
    .slice()
    .sort((a, b) => String(b.mesReferencia || "").localeCompare(String(a.mesReferencia || "")))
);

const sum = (key) => props.records.reduce((s, r) => s + (Number(r[key]) || 0), 0);
const totals = computed(() => [
  { label: "Líquido (rescisão)", value: sum("valorRescisao") },
  { label: "GRRF/Consig", value: sum("grrfConsig") },
  { label: "40%", value: sum("multa40") }
]);
const grandTotal = computed(() => props.records.reduce((s, r) => s + rescisaoAmount(r, "total"), 0));

function text(v) {
  return v === undefined || v === null || String(v).trim() === "" ? "—" : String(v);
}
function date(v) {
  return v ? formatDate(v) : "—";
}
function mes(v) {
  return v ? String(v).slice(5, 7) + "/" + String(v).slice(0, 4) : "—";
}
</script>

<template>
  <Modal
    :title="`Rescisões — ${funcao || 'Função'}`"
    subtitle="Rescisões da função no período filtrado"
    :open="open"
    max-width="max-w-6xl"
    @close="emit('close')"
  >
    <div v-if="records.length" class="flex flex-col gap-4">
      <div class="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-accent/25 bg-accent/5 p-4 dark:bg-accent/10">
        <div>
          <p class="text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">Total (rescisão + GRRF/consig + 40%)</p>
          <p class="text-3xl font-bold tabular-nums text-zinc-900 dark:text-zinc-100">{{ formatCurrency(grandTotal) }}</p>
        </div>
        <p class="text-right text-xs text-zinc-500 dark:text-zinc-400">
          {{ records.length }} {{ records.length === 1 ? "rescisão" : "rescisões" }}
        </p>
      </div>

      <dl class="grid gap-3 rounded-xl border border-zinc-200 p-4 sm:grid-cols-3 dark:border-zinc-800">
        <div v-for="t in totals" :key="t.label" class="flex flex-col gap-0.5">
          <dt class="text-[11px] font-semibold uppercase tracking-wide text-zinc-400">{{ t.label }}</dt>
          <dd class="text-sm font-medium tabular-nums text-zinc-900 dark:text-zinc-100">{{ formatCurrency(t.value) }}</dd>
        </div>
      </dl>

      <ul class="flex max-h-[calc(100vh-22rem)] min-h-[16rem] flex-col gap-3 overflow-auto pr-1">
        <li v-for="r in sorted" :key="r.id" class="rounded-xl border border-zinc-200 p-5 dark:border-zinc-800">
          <div class="flex flex-wrap items-start justify-between gap-2">
            <div>
              <p class="text-base font-semibold uppercase text-zinc-900 dark:text-zinc-100">{{ text(r.colaborador) }}</p>
              <p class="text-xs uppercase text-zinc-500 dark:text-zinc-400">
                {{ text(r.filial) }} · {{ text(r.estado) }} · Ref. {{ mes(r.mesReferencia) }}
              </p>
            </div>
            <p class="text-sm font-bold tabular-nums text-zinc-900 dark:text-zinc-100">{{ formatCurrency(rescisaoAmount(r, "total")) }}</p>
          </div>

          <dl class="mt-4 grid gap-x-6 gap-y-3 text-sm sm:grid-cols-2 lg:grid-cols-4">
            <div><dt class="text-zinc-400">Empresa</dt><dd class="uppercase text-zinc-700 dark:text-zinc-200">{{ text(r.empresa) }}</dd></div>
            <div><dt class="text-zinc-400">Gerente imediato</dt><dd class="uppercase text-zinc-700 dark:text-zinc-200">{{ text(r.gerenteImediato) }}</dd></div>
            <div><dt class="text-zinc-400">Motivo</dt><dd class="uppercase text-zinc-700 dark:text-zinc-200">{{ text(r.motivo) }}</dd></div>
            <div><dt class="text-zinc-400">Admissão</dt><dd class="text-zinc-700 dark:text-zinc-200">{{ date(r.admissao) }}</dd></div>
            <div><dt class="text-zinc-400">Últ. dia do aviso</dt><dd class="text-zinc-700 dark:text-zinc-200">{{ date(r.ultDiaAviso) }}</dd></div>
            <div><dt class="text-zinc-400">Rescisão</dt><dd class="tabular-nums text-zinc-700 dark:text-zinc-200">{{ formatCurrency(r.valorRescisao) }}</dd></div>
            <div><dt class="text-zinc-400">GRRF/Consig</dt><dd class="tabular-nums text-zinc-700 dark:text-zinc-200">{{ formatCurrency(r.grrfConsig) }}</dd></div>
            <div><dt class="text-zinc-400">40%</dt><dd class="tabular-nums text-zinc-700 dark:text-zinc-200">{{ formatCurrency(r.multa40) }}</dd></div>
          </dl>

          <div v-if="r.justificativaApurada" class="mt-4 text-sm">
            <p class="text-zinc-400">Justificativa apurada</p>
            <p class="whitespace-pre-line text-zinc-700 dark:text-zinc-200">{{ r.justificativaApurada }}</p>
          </div>
          <div v-if="r.ponderacoes" class="mt-3 text-sm">
            <p class="text-zinc-400">Ponderações</p>
            <p class="whitespace-pre-line text-zinc-700 dark:text-zinc-200">{{ r.ponderacoes }}</p>
          </div>
        </li>
      </ul>
    </div>

    <EmptyState v-else title="Sem rescisões" text="Nenhuma rescisão desta função no período filtrado." />
  </Modal>
</template>
