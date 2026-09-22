<script setup>
import { computed } from "vue";
import Modal from "@/components/ui/Modal.vue";
import EmptyState from "@/components/ui/EmptyState.vue";
import { getIndicatorById } from "@/lib/config";
import { formatCurrency, ymShortLabel, compareDateDesc } from "@/lib/utils";

/* Detalhe de um colaborador no gráfico de Custo médio da diária geral (clique
   na barra): dados cadastrais vindos dos próprios lançamentos e as diárias
   pagas no período filtrado. */
const props = defineProps({
  open: { type: Boolean, default: false },
  colaborador: { type: String, default: "" },
  entries: { type: Array, default: () => [] }
});

const emit = defineEmits(["close"]);

const sorted = computed(() =>
  props.entries
    .slice()
    .sort((a, b) => compareDateDesc(a.date, b.date) || String(b.id || "").localeCompare(String(a.id || "")))
);

const total = computed(() => props.entries.reduce((sum, e) => sum + (Number(e.value) || 0), 0));

/* Primeiro valor preenchido do campo, do lançamento mais recente para o mais
   antigo. */
function latest(key) {
  for (const e of sorted.value) {
    const v = e.meta && e.meta[key];
    if (v !== undefined && v !== null && String(v).trim() !== "") return String(v);
  }
  return "";
}

const info = computed(() => [
  { label: "Função", value: latest("funcao") },
  { label: "Departamento", value: latest("departamento") },
  { label: "Filial", value: latest("filial") },
  { label: "Líder imediato", value: latest("liderImediato") },
  { label: "Gerente regional", value: latest("gerenteRegional") },
  { label: "Regional", value: latest("regional") || latest("estado") }
]);

function competencia(entry) {
  return entry.meta && entry.meta.semPeriodo ? "Sem período" : ymShortLabel(entry.date);
}

function cell(entry, key) {
  const v = entry.meta && entry.meta[key];
  return v === undefined || v === null || String(v).trim() === "" ? "—" : String(v);
}

function close() {
  emit("close");
}
</script>

<template>
  <Modal
    :title="`Custo da diária — ${colaborador || 'Colaborador'}`"
    :subtitle="getIndicatorById('custo_diaria')?.calc"
    :open="open"
    max-width="max-w-3xl"
    @close="close"
  >
    <div v-if="entries.length" class="flex flex-col gap-4">
      <div
        class="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-accent/25 bg-accent/5 p-4 dark:border-accent/25 dark:bg-accent/10"
      >
        <div>
          <p class="text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">Total pago no período</p>
          <p class="text-3xl font-bold tabular-nums text-zinc-900 dark:text-zinc-100">{{ formatCurrency(total) }}</p>
        </div>
        <div class="text-right text-xs text-zinc-500 dark:text-zinc-400">
          <p>{{ entries.length }} {{ entries.length === 1 ? "diária registrada" : "diárias registradas" }}</p>
        </div>
      </div>

      <dl class="grid gap-3 rounded-xl border border-zinc-200 p-4 sm:grid-cols-2 dark:border-zinc-800">
        <div v-for="item in info" :key="item.label" class="flex flex-col gap-0.5">
          <dt class="text-[11px] font-semibold uppercase tracking-wide text-zinc-400 dark:text-zinc-400">{{ item.label }}</dt>
          <dd class="text-sm font-medium text-zinc-900 dark:text-zinc-100">{{ item.value || "—" }}</dd>
        </div>
      </dl>

      <div class="overflow-hidden rounded-xl border border-zinc-200 dark:border-zinc-800">
        <div class="max-h-[20rem] overflow-auto">
          <table class="w-full min-w-max text-left text-sm">
            <thead class="sticky top-0 z-10 bg-white dark:bg-zinc-900">
              <tr class="border-b border-zinc-100 text-xs uppercase tracking-wide text-zinc-400 dark:border-zinc-800 dark:text-zinc-400">
                <th class="whitespace-nowrap px-4 py-2.5 font-semibold">Competência</th>
                <th class="whitespace-nowrap px-4 py-2.5 font-semibold">Filial</th>
                <th class="whitespace-nowrap px-4 py-2.5 font-semibold">Diária</th>
                <th class="whitespace-nowrap px-4 py-2.5 text-right font-semibold">Valor pago</th>
              </tr>
            </thead>
            <tbody>
              <tr
                v-for="e in sorted"
                :key="e.id"
                class="border-b border-zinc-100 last:border-0 dark:border-zinc-800"
              >
                <td class="whitespace-nowrap px-4 py-2.5 text-zinc-600 dark:text-zinc-300">{{ competencia(e) }}</td>
                <td class="whitespace-nowrap px-4 py-2.5 text-zinc-600 dark:text-zinc-300">{{ cell(e, "filial") }}</td>
                <td class="whitespace-nowrap px-4 py-2.5 text-zinc-600 dark:text-zinc-300">{{ cell(e, "motivo") }}</td>
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
      title="Sem diárias para este colaborador"
      text="Nenhuma diária registrada para o colaborador no período filtrado."
    />
  </Modal>
</template>
