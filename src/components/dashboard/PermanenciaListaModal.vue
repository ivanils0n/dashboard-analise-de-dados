<script setup>
import { computed, ref, watch } from "vue";
import Modal from "@/components/ui/Modal.vue";
import EmptyState from "@/components/ui/EmptyState.vue";
import { getIndicatorById } from "@/lib/config";
import { formatDate, normalizeText, filialDisplay } from "@/lib/utils";

const props = defineProps({
  open: { type: Boolean, default: false },
  records: { type: Array, default: () => [] },
  periodo: { type: String, default: "" },
  regional: { type: String, default: "" }
});

const emit = defineEmits(["close"]);

const search = ref("");
watch(
  () => props.open,
  (open) => {
    if (open) search.value = "";
  }
);

const rows = computed(() => {
  const q = normalizeText(search.value).trim();
  if (!q) return props.records;
  return props.records.filter((p) =>
    normalizeText([p.colaborador, filialDisplay(p.filial, p.estado), p.estado].join(" ")).includes(q)
  );
});

const media = computed(() => {
  if (!rows.value.length) return null;
  return rows.value.reduce((sum, p) => sum + p.dias, 0) / rows.value.length;
});

const dias = (n) => `${n.toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 })} dias`;
</script>

<template>
  <Modal
    :title="`Colaboradores desligados${regional ? ` — ${regional}` : periodo ? ` — ${periodo}` : ''}`"
    :subtitle="getIndicatorById('tempo_permanencia')?.calc"
    :open="open"
    max-width="max-w-4xl"
    @close="emit('close')"
  >
    <div v-if="records.length" class="flex flex-col gap-4">
      <div
        class="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-accent/25 bg-accent/5 p-4 dark:border-accent/25 dark:bg-accent/10"
      >
        <div>
          <p class="text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">Tempo médio de permanência</p>
          <p class="text-3xl font-bold tabular-nums text-zinc-900 dark:text-zinc-100">{{ media === null ? "—" : dias(media) }}</p>
        </div>
        <div class="text-right text-xs text-zinc-500 dark:text-zinc-400">
          <p>{{ rows.length }} {{ rows.length === 1 ? "colaborador desligado" : "colaboradores desligados" }}</p>
        </div>
      </div>

      <input
        v-model="search"
        type="search"
        class="input-field"
        placeholder="Buscar colaborador, filial ou estado..."
        aria-label="Buscar colaborador desligado"
      />

      <div class="overflow-hidden rounded-xl border border-zinc-200 dark:border-zinc-800">
        <div class="max-h-[24rem] overflow-auto">
          <table class="w-full min-w-max text-left text-sm">
            <thead class="sticky top-0 z-10 bg-white dark:bg-zinc-900">
              <tr class="border-b border-zinc-100 text-xs uppercase tracking-wide text-zinc-400 dark:border-zinc-800 dark:text-zinc-400">
                <th class="whitespace-nowrap px-4 py-2.5 font-semibold">Colaborador</th>
                <th class="whitespace-nowrap px-4 py-2.5 font-semibold">Filial</th>
                <th class="whitespace-nowrap px-4 py-2.5 font-semibold">Estado</th>
                <th class="whitespace-nowrap px-4 py-2.5 font-semibold">Admissão</th>
                <th class="whitespace-nowrap px-4 py-2.5 font-semibold">Desligamento</th>
                <th class="whitespace-nowrap px-4 py-2.5 text-right font-semibold">Permanência</th>
              </tr>
            </thead>
            <tbody class="uppercase">
              <tr v-for="p in rows" :key="p.id" class="border-b border-zinc-100 last:border-0 dark:border-zinc-800">
                <td class="whitespace-nowrap px-4 py-2.5 font-medium text-zinc-800 dark:text-zinc-100">{{ p.colaborador }}</td>
                <td class="whitespace-nowrap px-4 py-2.5 text-zinc-600 dark:text-zinc-300">{{ filialDisplay(p.filial, p.estado) || "—" }}</td>
                <td class="whitespace-nowrap px-4 py-2.5 text-zinc-600 dark:text-zinc-300">{{ p.estado || "—" }}</td>
                <td class="whitespace-nowrap px-4 py-2.5 text-zinc-600 dark:text-zinc-300">{{ formatDate(p.dataAdmissao) }}</td>
                <td class="whitespace-nowrap px-4 py-2.5 text-zinc-600 dark:text-zinc-300">{{ formatDate(p.dataDemissao) }}</td>
                <td class="whitespace-nowrap px-4 py-2.5 text-right font-medium tabular-nums text-zinc-900 dark:text-zinc-100">{{ dias(p.dias) }}</td>
              </tr>
            </tbody>
          </table>
          <p v-if="!rows.length" class="py-6 text-center text-sm text-zinc-500 dark:text-zinc-400">Nenhum colaborador encontrado para essa busca.</p>
        </div>
      </div>
    </div>

    <EmptyState
      v-else
      title="Sem colaboradores desligados"
      text="Nenhum colaborador do Headcount tem data de desligamento no mês filtrado."
    />
  </Modal>
</template>
