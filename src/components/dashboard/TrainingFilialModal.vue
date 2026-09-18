<script setup>
import { computed, ref } from "vue";
import Modal from "@/components/ui/Modal.vue";
import EmptyState from "@/components/ui/EmptyState.vue";
import { getIndicatorById } from "@/lib/config";
import { formatHoursClock, normalizeText } from "@/lib/utils";

const props = defineProps({
  open: { type: Boolean, default: false },
  filial: { type: String, default: "" },
  entries: { type: Array, default: () => [] }
});

const emit = defineEmits(["close"]);

const search = ref("");

const total = computed(() =>
  props.entries.reduce((sum, e) => sum + (Number(e.value) || 0), 0)
);

/* Soma as horas por colaborador (um colaborador pode ter vários treinamentos). */
const rows = computed(() => {
  const byEmployee = new Map();
  props.entries.forEach((e) => {
    const meta = e.meta || {};
    const name = meta.employeeName || "Sem colaborador";
    if (!byEmployee.has(name)) {
      byEmployee.set(name, { name, cargo: meta.cargo || "", horas: 0, treinamentos: 0 });
    }
    const row = byEmployee.get(name);
    row.horas += Number(e.value) || 0;
    row.treinamentos += 1;
    if (!row.cargo && meta.cargo) row.cargo = meta.cargo;
  });
  return [...byEmployee.values()].sort((a, b) => b.horas - a.horas);
});

/* Busca por nome/cargo (ignora maiúsculas/minúsculas e acentos). */
const filteredRows = computed(() => {
  const q = normalizeText(search.value).trim();
  if (!q) return rows.value;
  return rows.value.filter((r) => normalizeText(`${r.name} ${r.cargo || ""}`).includes(q));
});

function close() {
  emit("close");
}
</script>

<template>
  <Modal
    :title="`Treinamento — ${filial || 'Filial'}`"
    :subtitle="getIndicatorById('treinamento')?.calc"
    :open="open"
    max-width="max-w-3xl"
    @close="close"
  >
    <div class="flex flex-col gap-4">
      <div
        class="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-accent/25 bg-accent/5 p-4 dark:border-accent/25 dark:bg-accent/10"
      >
        <div>
          <p class="text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
            Total de horas
          </p>
          <p class="text-3xl font-bold tabular-nums text-zinc-900 dark:text-zinc-100">
            {{ formatHoursClock(total) }}
          </p>
        </div>
        <div class="text-right text-xs text-zinc-500 dark:text-zinc-400">
          <p>{{ rows.length }} colaborador(es) treinado(s)</p>
          <p>{{ entries.length }} treinamento(s) registrado(s)</p>
        </div>
      </div>

      <div v-if="rows.length" class="flex flex-col gap-1.5">
        <label for="trFilialSearch" class="text-sm font-medium text-zinc-700 dark:text-zinc-200">Buscar colaborador</label>
        <input
          id="trFilialSearch"
          v-model="search"
          type="search"
          class="input-field"
          placeholder="Nome ou cargo..."
        />
      </div>

      <div
        v-if="filteredRows.length"
        class="overflow-hidden rounded-xl border border-zinc-200 dark:border-zinc-800"
      >
        <div class="max-h-[24rem] overflow-auto">
          <table class="w-full min-w-max text-left text-sm">
            <thead class="sticky top-0 z-10 bg-white dark:bg-zinc-900">
              <tr
                class="border-b border-zinc-100 text-xs uppercase tracking-wide text-zinc-400 dark:border-zinc-800 dark:text-zinc-400"
              >
                <th class="whitespace-nowrap px-4 py-2.5 font-semibold">Colaborador</th>
                <th class="whitespace-nowrap px-4 py-2.5 font-semibold">Cargo</th>
                <th class="whitespace-nowrap px-4 py-2.5 text-right font-semibold">Horas</th>
              </tr>
            </thead>
            <tbody>
              <tr
                v-for="r in filteredRows"
                :key="r.name"
                class="border-b border-zinc-100 last:border-0 dark:border-zinc-800"
              >
                <td class="whitespace-nowrap px-4 py-2.5 font-medium text-zinc-900 dark:text-zinc-100">
                  {{ r.name }}
                </td>
                <td class="whitespace-nowrap px-4 py-2.5 text-zinc-600 dark:text-zinc-300">
                  {{ r.cargo || "—" }}
                </td>
                <td
                  class="whitespace-nowrap px-4 py-2.5 text-right font-medium tabular-nums text-zinc-900 dark:text-zinc-100"
                >
                  {{ formatHoursClock(r.horas) }}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
        <div
          class="border-t border-zinc-100 px-4 py-2 text-xs text-zinc-400 dark:border-zinc-800 dark:text-zinc-400"
        >
          {{ filteredRows.length === 1 ? "1 colaborador" : `${filteredRows.length} colaboradores` }}
          <span v-if="search.trim()"> de {{ rows.length }}</span>
        </div>
      </div>

      <div v-else-if="rows.length">
        <EmptyState
          title="Nenhum colaborador encontrado"
          text="Ajuste a busca e tente novamente."
        />
      </div>

      <div v-else>
        <EmptyState
          title="Sem treinamentos nesta filial"
          text="Nenhum treinamento registrado para a filial no período filtrado."
        />
      </div>
    </div>
  </Modal>
</template>
