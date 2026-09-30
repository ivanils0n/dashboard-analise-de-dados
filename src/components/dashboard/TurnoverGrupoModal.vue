<script setup>
import { computed } from "vue";
import Modal from "@/components/ui/Modal.vue";
import EmptyState from "@/components/ui/EmptyState.vue";
import { findBranchByShortName } from "@/lib/employees";
import { formatDate } from "@/lib/utils";

const props = defineProps({
  open: { type: Boolean, default: false },
  title: { type: String, default: "" },
  subtitle: { type: String, default: "" },
  cards: { type: Array, default: () => [] },
  items: { type: Array, default: () => [] },
  entrada: { type: Boolean, default: true }
});

const emit = defineEmits(["close"]);

const GENERO = { masculino: "Masculino", feminino: "Feminino" };

const rows = computed(() =>
  props.items
    .map((h) => {
      const branch = h.filial ? findBranchByShortName(h.filial, h.estado) : null;
      return {
        id: h.id,
        colaborador: h.colaborador || "—",
        funcao: h.funcao || "—",
        genero: GENERO[String(h.genero || "").trim().toLowerCase()] || "—",
        empresa: branch ? branch.name : h.filial || "—",
        estado: h.estado || "",
        admissao: h.dataAdmissao || "",
        desligamento: h.dataDesligamento || "",
        data: (props.entrada ? h.dataAdmissao : h.dataDesligamento) || ""
      };
    })
    .sort((a, b) => String(b.data).localeCompare(String(a.data)) || a.colaborador.localeCompare(b.colaborador, "pt-BR"))
);
</script>

<template>
  <Modal :title="title" :subtitle="subtitle" :open="open" max-width="max-w-4xl" @close="emit('close')">
    <div class="flex flex-col gap-4">
      <div v-if="cards.length" class="flex flex-wrap gap-3">
        <div v-for="c in cards" :key="c.label" class="min-w-[8rem] rounded-2xl border border-zinc-200 p-3 dark:border-zinc-800">
          <p class="text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">{{ c.label }}</p>
          <p class="text-2xl font-bold tabular-nums text-zinc-900 dark:text-zinc-100">{{ c.value }}</p>
        </div>
      </div>

      <div v-if="rows.length" class="overflow-hidden rounded-xl border border-zinc-200 dark:border-zinc-800">
        <div class="max-h-[26rem] overflow-auto">
          <table class="w-full min-w-max text-left text-sm">
            <thead class="sticky top-0 z-10 bg-white dark:bg-zinc-900">
              <tr class="border-b border-zinc-100 text-xs uppercase tracking-wide text-zinc-400 dark:border-zinc-800">
                <th class="px-4 py-2.5 font-semibold">Colaborador</th>
                <th class="px-4 py-2.5 font-semibold">Função</th>
                <th class="px-4 py-2.5 font-semibold">Gênero</th>
                <th class="px-4 py-2.5 font-semibold">Empresa</th>
                <th class="px-4 py-2.5 font-semibold">Estado</th>
                <th class="px-4 py-2.5 font-semibold">Data de admissão</th>
                <th v-if="!entrada" class="px-4 py-2.5 font-semibold">Data de desligamento</th>
              </tr>
            </thead>
            <tbody class="uppercase">
              <tr v-for="r in rows" :key="r.id" class="border-b border-zinc-100 last:border-0 dark:border-zinc-800">
                <td class="whitespace-nowrap px-4 py-2.5 font-medium text-zinc-900 dark:text-zinc-100">{{ r.colaborador }}</td>
                <td class="whitespace-nowrap px-4 py-2.5 text-zinc-600 dark:text-zinc-300">{{ r.funcao }}</td>
                <td class="whitespace-nowrap px-4 py-2.5 text-zinc-600 dark:text-zinc-300">{{ r.genero }}</td>
                <td class="whitespace-nowrap px-4 py-2.5 text-zinc-600 dark:text-zinc-300">{{ r.empresa }}</td>
                <td class="whitespace-nowrap px-4 py-2.5 text-zinc-600 dark:text-zinc-300">{{ r.estado || "—" }}</td>
                <td class="whitespace-nowrap px-4 py-2.5 text-zinc-600 dark:text-zinc-300">{{ r.admissao ? formatDate(r.admissao) : "—" }}</td>
                <td v-if="!entrada" class="whitespace-nowrap px-4 py-2.5 text-zinc-600 dark:text-zinc-300">{{ r.desligamento ? formatDate(r.desligamento) : "—" }}</td>
              </tr>
            </tbody>
          </table>
        </div>
        <div class="border-t border-zinc-100 px-4 py-2 text-xs text-zinc-400 dark:border-zinc-800">
          {{ rows.length === 1 ? "1 colaborador" : `${rows.length} colaboradores` }}
        </div>
      </div>

      <EmptyState
        v-else
        :title="entrada ? 'Sem entradas' : 'Sem saídas'"
        text="Nenhum colaborador nesta seleção no período e estado filtrados."
      />
    </div>
  </Modal>
</template>
