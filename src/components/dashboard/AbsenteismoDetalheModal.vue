<script setup>
import { computed } from "vue";
import Modal from "@/components/ui/Modal.vue";
import EmptyState from "@/components/ui/EmptyState.vue";
import { FLAGS, motivoOf } from "@/lib/absenteismo";
import { exportOcorrencias } from "@/lib/export";
import { formatDate } from "@/lib/utils";

/* Lista das ocorrências de absenteísmo por trás de um número do modal de análise
   (fatia da pizza, barra, filial, colaborador...). O total daqui é sempre o do
   gráfico clicado (mesma fonte: as ocorrências já calculadas na análise). */
const props = defineProps({
  open: { type: Boolean, default: false },
  title: { type: String, default: "Ocorrências" },
  subtitle: { type: String, default: "" },
  /* Ocorrências já achatadas: { date, colaborador, setor, filial, estado, motivo,
     advertencia, acidente, observacao, dias } */
  rows: { type: Array, default: () => [] }
});
const emit = defineEmits(["close"]);

const sorted = computed(() =>
  props.rows
    .slice()
    .sort((a, b) => String(b.date).localeCompare(String(a.date)) || String(a.colaborador).localeCompare(String(b.colaborador), "pt-BR"))
);
const totalDias = computed(() => props.rows.reduce((s, o) => s + (Number(o.dias) || 0), 0));
const fmtDias = (n) => n.toLocaleString("pt-BR", { maximumFractionDigits: 1 });

function chipOf(o) {
  const m = o.motivo && o.motivo !== "Presente" ? motivoOf(o.motivo) : null;
  return m || null;
}
const flagsOf = (o) => FLAGS.filter((f) => o[f.key]);

function exportar() {
  exportOcorrencias(sorted.value, "absenteismo");
}
</script>

<template>
  <Modal :title="title" :subtitle="subtitle" :open="open" max-width="max-w-6xl" @close="emit('close')">
    <template #actions>
      <button
        v-if="sorted.length"
        type="button"
        class="mr-2 rounded-lg px-3 py-1.5 text-xs font-semibold text-zinc-600 ring-1 ring-inset ring-zinc-200 transition hover:bg-zinc-50 dark:text-zinc-300 dark:ring-zinc-700 dark:hover:bg-zinc-800"
        @click="exportar"
      >
        Exportar Excel
      </button>
    </template>

    <div class="flex flex-col gap-4">
      <div
        class="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-accent/25 bg-accent/5 p-4 dark:border-accent/25 dark:bg-accent/10"
      >
        <div>
          <p class="text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">Ocorrências</p>
          <p class="text-3xl font-bold tabular-nums text-zinc-900 dark:text-zinc-100">{{ rows.length }}</p>
        </div>
        <div class="text-right">
          <p class="text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">Dias de ausência</p>
          <p class="text-3xl font-bold tabular-nums text-zinc-900 dark:text-zinc-100">{{ fmtDias(totalDias) }}</p>
        </div>
      </div>

      <div v-if="sorted.length" class="overflow-hidden rounded-xl border border-zinc-200 dark:border-zinc-800">
        <div class="max-h-[28rem] overflow-auto">
          <table class="w-full min-w-max text-left text-sm">
            <thead class="sticky top-0 z-10 bg-white dark:bg-zinc-900">
              <tr class="border-b border-zinc-100 text-xs uppercase tracking-wide text-zinc-400 dark:border-zinc-800 dark:text-zinc-400">
                <th class="whitespace-nowrap px-4 py-2.5 font-semibold">Data</th>
                <th class="whitespace-nowrap px-4 py-2.5 font-semibold">Colaborador</th>
                <th class="whitespace-nowrap px-4 py-2.5 font-semibold">Função</th>
                <th class="whitespace-nowrap px-4 py-2.5 font-semibold">Filial</th>
                <th class="whitespace-nowrap px-4 py-2.5 font-semibold">Estado</th>
                <th class="whitespace-nowrap px-4 py-2.5 font-semibold">Ocorrência</th>
                <th class="whitespace-nowrap px-4 py-2.5 text-right font-semibold">Dias</th>
                <th class="whitespace-nowrap px-4 py-2.5 font-semibold">Observação</th>
              </tr>
            </thead>
            <tbody class="uppercase">
              <tr
                v-for="o in sorted"
                :key="o.id"
                class="border-b border-zinc-100 last:border-0 dark:border-zinc-800"
              >
                <td class="whitespace-nowrap px-4 py-2.5 tabular-nums text-zinc-600 dark:text-zinc-300">{{ formatDate(o.date) }}</td>
                <td class="whitespace-nowrap px-4 py-2.5 font-medium text-zinc-900 dark:text-zinc-100">{{ o.colaborador }}</td>
                <td class="whitespace-nowrap px-4 py-2.5 text-zinc-600 dark:text-zinc-300">{{ o.setor || "—" }}</td>
                <td class="whitespace-nowrap px-4 py-2.5 text-zinc-600 dark:text-zinc-300">{{ o.filial || "—" }}</td>
                <td class="whitespace-nowrap px-4 py-2.5 text-zinc-600 dark:text-zinc-300">{{ o.estado }}</td>
                <td class="whitespace-nowrap px-4 py-2.5 normal-case">
                  <span class="flex items-center gap-1.5">
                    <span
                      v-if="chipOf(o)"
                      class="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-xs font-semibold"
                      :class="chipOf(o).chip"
                    >
                      {{ chipOf(o).letter }} · {{ chipOf(o).label }}
                    </span>
                    <span
                      v-for="f in flagsOf(o)"
                      :key="f.key"
                      class="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-xs font-semibold"
                      :class="f.chip"
                    >
                      {{ f.letter }} · {{ f.label }}
                    </span>
                  </span>
                </td>
                <td class="whitespace-nowrap px-4 py-2.5 text-right tabular-nums text-zinc-600 dark:text-zinc-300">{{ fmtDias(o.dias) }}</td>
                <td class="max-w-[18rem] truncate px-4 py-2.5 normal-case text-zinc-500 dark:text-zinc-400" :title="o.observacao">{{ o.observacao || "—" }}</td>
              </tr>
            </tbody>
          </table>
        </div>
        <div class="border-t border-zinc-100 px-4 py-2 text-xs text-zinc-400 dark:border-zinc-800 dark:text-zinc-400">
          {{ sorted.length === 1 ? "1 ocorrência" : `${sorted.length} ocorrências` }}
        </div>
      </div>
      <EmptyState v-else title="Sem ocorrências" text="Nenhuma ocorrência para este recorte." />
    </div>
  </Modal>
</template>
