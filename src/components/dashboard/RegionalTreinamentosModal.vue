<script setup>
import { computed, ref } from "vue";
import Modal from "@/components/ui/Modal.vue";
import EmptyState from "@/components/ui/EmptyState.vue";
import { formatHoursClock, formatDate, normalizeText } from "@/lib/utils";

/* Card do KPI "Regional Treinamentos" (clique direito): cada gerente regional
   com o total de horas e a lista dos treinamentos dele no período filtrado.
   `groups`: [{ regional, horas, colaboradores, treinamentos: [{ id, data,
   colaborador, cargo, filial, tema, modalidade, horas }] }] — ver
   treinamentoRegionalGroups em useDashboardData.js. */
const props = defineProps({
  open: { type: Boolean, default: false },
  groups: { type: Array, default: () => [] }
});
const emit = defineEmits(["close"]);

const search = ref("");

const filteredGroups = computed(() => {
  const q = normalizeText(search.value).trim();
  if (!q) return props.groups;
  return props.groups
    .map((g) => {
      if (normalizeText(g.regional).includes(q)) return g;
      const list = g.treinamentos.filter((t) =>
        normalizeText(`${t.colaborador} ${t.cargo} ${t.filial} ${t.tema} ${t.modalidade}`).includes(q)
      );
      return list.length ? { ...g, treinamentos: list } : null;
    })
    .filter(Boolean);
});

const totalHoras = computed(() => props.groups.reduce((sum, g) => sum + g.horas, 0));
const totalTreinamentos = computed(() => props.groups.reduce((sum, g) => sum + g.treinamentos.length, 0));
</script>

<template>
  <Modal
    title="Regional Treinamentos"
    subtitle="Treinamentos de cada gerente regional no período filtrado"
    :open="open"
    max-width="max-w-5xl"
    @close="emit('close')"
  >
    <div class="flex flex-col gap-4">
      <div class="grid gap-3 sm:grid-cols-3">
        <div class="rounded-xl border border-zinc-200 px-4 py-3 dark:border-zinc-800">
          <span class="text-xs font-semibold uppercase tracking-wide text-zinc-400">Regionais</span>
          <p class="text-2xl font-bold tabular-nums text-zinc-900 dark:text-zinc-100">{{ groups.length }}</p>
        </div>
        <div class="rounded-xl border border-zinc-200 px-4 py-3 dark:border-zinc-800">
          <span class="text-xs font-semibold uppercase tracking-wide text-zinc-400">Treinamentos</span>
          <p class="text-2xl font-bold tabular-nums text-zinc-900 dark:text-zinc-100">{{ totalTreinamentos }}</p>
        </div>
        <div class="rounded-xl border border-accent/25 bg-accent/5 px-4 py-3 dark:border-accent/25 dark:bg-accent/10">
          <span class="text-xs font-semibold uppercase tracking-wide text-zinc-400">Total de horas</span>
          <p class="text-2xl font-bold tabular-nums text-zinc-900 dark:text-zinc-100">{{ formatHoursClock(totalHoras) }}</p>
        </div>
      </div>

      <input
        v-if="groups.length"
        v-model="search"
        type="search"
        class="input-field"
        placeholder="Buscar regional, colaborador, filial ou tema..."
        aria-label="Buscar"
      />

      <div v-if="filteredGroups.length" class="flex max-h-[28rem] flex-col gap-4 overflow-auto pr-1">
        <section
          v-for="g in filteredGroups"
          :key="g.regional"
          class="overflow-hidden rounded-xl border border-zinc-200 dark:border-zinc-800"
        >
          <header class="flex flex-wrap items-center justify-between gap-2 bg-zinc-50 px-4 py-2.5 dark:bg-zinc-900">
            <h3 class="text-sm font-bold uppercase tracking-wide text-zinc-700 dark:text-zinc-200">{{ g.regional }}</h3>
            <p class="text-xs text-zinc-500 dark:text-zinc-400">
              {{ g.colaboradores }} colaborador(es) · {{ g.treinamentos.length }} treinamento(s) ·
              <strong class="tabular-nums text-zinc-800 dark:text-zinc-100">{{ formatHoursClock(g.horas) }}</strong>
            </p>
          </header>
          <div class="overflow-auto">
            <table class="w-full min-w-max text-left text-sm">
              <thead>
                <tr class="border-b border-zinc-100 text-xs uppercase tracking-wide text-zinc-400 dark:border-zinc-800">
                  <th class="whitespace-nowrap px-4 py-2 font-semibold">Data</th>
                  <th class="whitespace-nowrap px-4 py-2 font-semibold">Colaborador</th>
                  <th class="whitespace-nowrap px-4 py-2 font-semibold">Filial</th>
                  <th class="whitespace-nowrap px-4 py-2 font-semibold">Tema</th>
                  <th class="whitespace-nowrap px-4 py-2 font-semibold">Modalidade</th>
                  <th class="whitespace-nowrap px-4 py-2 text-right font-semibold">Horas</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="t in g.treinamentos" :key="t.id" class="border-b border-zinc-100 last:border-0 dark:border-zinc-800">
                  <td class="whitespace-nowrap px-4 py-2 text-zinc-600 dark:text-zinc-300">{{ t.data ? formatDate(t.data) : "—" }}</td>
                  <td class="whitespace-nowrap px-4 py-2 font-medium uppercase text-zinc-900 dark:text-zinc-100">{{ t.colaborador }}</td>
                  <td class="whitespace-nowrap px-4 py-2 uppercase text-zinc-600 dark:text-zinc-300">{{ t.filial || "—" }}</td>
                  <td class="px-4 py-2 text-zinc-600 dark:text-zinc-300">{{ t.tema || "—" }}</td>
                  <td class="whitespace-nowrap px-4 py-2 capitalize text-zinc-600 dark:text-zinc-300">{{ t.modalidade || "—" }}</td>
                  <td class="whitespace-nowrap px-4 py-2 text-right tabular-nums text-zinc-900 dark:text-zinc-100">{{ formatHoursClock(t.horas) }}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>
      </div>

      <EmptyState v-else-if="groups.length" title="Nada encontrado" text="Ajuste a busca e tente novamente." />
      <EmptyState
        v-else
        title="Sem treinamentos no período"
        text="Nenhum treinamento com gerente regional no período filtrado."
      />
    </div>
  </Modal>
</template>

<style scoped>
.input-field {
  border-radius: 0.5rem;
  border: 1px solid rgb(212 212 216);
  background-color: #fff;
  padding: 0.5rem 0.75rem;
  font-size: 0.875rem;
  color: rgb(24 24 27);
  outline: none;
  transition: border-color 0.15s, box-shadow 0.15s;
}
.input-field:focus {
  border-color: #E8AF3E;
  box-shadow: 0 0 0 2px rgb(232 175 62 / 0.2);
}
:global(.dark) .input-field {
  border-color: rgb(63 63 70);
  background-color: rgb(9 9 11);
  color: rgb(244 244 245);
}
</style>
