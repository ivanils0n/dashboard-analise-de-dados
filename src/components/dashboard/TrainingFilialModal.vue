<script setup>
import { computed, ref } from "vue";
import Modal from "@/components/ui/Modal.vue";
import EmptyState from "@/components/ui/EmptyState.vue";
import { getIndicatorById } from "@/lib/config";
import { removeEntries } from "@/lib/store";
import { canEditData } from "@/lib/auth";
import { useDialog } from "@/composables/useDialog";
import { useToast } from "@/composables/useToast";
import { formatHoursClock, normalizeText } from "@/lib/utils";

const props = defineProps({
  open: { type: Boolean, default: false },
  filial: { type: String, default: "" },
  entries: { type: Array, default: () => [] }
});

const emit = defineEmits(["close"]);

const { confirm } = useDialog();
const { show: toast } = useToast();
const canEdit = canEditData();

const search = ref("");

/* `entries` é uma foto tirada ao abrir o modal: os lançamentos excluídos aqui
   saem da lista por este controle local (o store já os removeu, e os KPIs e
   gráficos se atualizam sozinhos). */
const removedIds = ref(new Set());
const liveEntries = computed(() => props.entries.filter((e) => !removedIds.value.has(e.id)));

const total = computed(() =>
  liveEntries.value.reduce((sum, e) => sum + (Number(e.value) || 0), 0)
);

function employeeName(entry) {
  return (entry.meta && entry.meta.employeeName) || "Sem colaborador";
}

/* Soma as horas por colaborador (um colaborador pode ter vários treinamentos). */
const rows = computed(() => {
  const byEmployee = new Map();
  liveEntries.value.forEach((e) => {
    const meta = e.meta || {};
    const name = employeeName(e);
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

/* ---------- Seleção múltipla / exclusão em lote ----------
   Cada linha é um colaborador: excluir os selecionados remove todos os
   treinamentos deles que compõem esta lista (filial e período filtrados). */
const selectedNames = ref(new Set());

const allVisibleSelected = computed(
  () => filteredRows.value.length > 0 && filteredRows.value.every((r) => selectedNames.value.has(r.name))
);

function toggleRow(name) {
  const next = new Set(selectedNames.value);
  if (next.has(name)) next.delete(name);
  else next.add(name);
  selectedNames.value = next;
}

function toggleSelectAll() {
  selectedNames.value = allVisibleSelected.value
    ? new Set()
    : new Set(filteredRows.value.map((r) => r.name));
}

async function handleBulkDelete() {
  const names = selectedNames.value;
  const list = liveEntries.value.filter((e) => names.has(employeeName(e)));
  if (!list.length) return;
  const ok = await confirm({
    title: `Excluir ${list.length} treinamento(s)?`,
    message: `Serão removidos definitivamente os ${list.length} treinamento(s) de ${names.size} colaborador(es) selecionado(s) nesta filial e período, e os totais serão recalculados.`,
    confirmText: `Excluir ${list.length}`,
    danger: true
  });
  if (!ok) return;
  removeEntries(list.map((entry) => ({ indicatorId: "treinamento", entry })));
  removedIds.value = new Set([...removedIds.value, ...list.map((e) => e.id)]);
  selectedNames.value = new Set();
  toast(`${list.length} treinamento(s) excluído(s).`);
}

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
          <p>{{ liveEntries.length }} treinamento(s) registrado(s)</p>
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
        v-if="canEdit && selectedNames.size"
        class="flex flex-wrap items-center gap-2 rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-2 dark:border-zinc-800 dark:bg-zinc-900"
      >
        <span class="rounded-full bg-accent/10 px-2.5 py-1 text-xs font-semibold text-accent-hover dark:text-accent-light">
          {{ selectedNames.size }} selecionado(s)
        </span>
        <button
          type="button"
          class="rounded-lg bg-red-600 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-red-700"
          @click="handleBulkDelete"
        >
          Excluir selecionados
        </button>
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
                <th v-if="canEdit" class="w-10 px-4 py-2.5 font-semibold">
                  <input
                    type="checkbox"
                    class="h-4 w-4 cursor-pointer accent-accent"
                    :checked="allVisibleSelected"
                    aria-label="Selecionar todos os colaboradores visíveis"
                    @change="toggleSelectAll"
                  />
                </th>
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
                <td v-if="canEdit" class="px-4 py-2.5">
                  <input
                    type="checkbox"
                    class="h-4 w-4 cursor-pointer accent-accent"
                    :checked="selectedNames.has(r.name)"
                    aria-label="Selecionar colaborador"
                    @change="toggleRow(r.name)"
                  />
                </td>
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
