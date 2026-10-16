<script setup>
import { computed, ref } from "vue";
import Modal from "@/components/ui/Modal.vue";
import { INDICATORS } from "@/lib/config";
import { ANALISES, COMPARACAO, REGRAS_GERAIS } from "@/lib/calculosDocs";
import { normalizeText } from "@/lib/utils";

const emit = defineEmits(["close"]);

const ABAS = [
  { id: "indicadores", label: "Indicadores e análises" },
  { id: "comparacao", label: "Comparar com mês anterior" }
];
const aba = ref("indicadores");
const busca = ref("");

const secoesPorAba = computed(() => ({
  indicadores: [
    {
      titulo: "Indicadores (cards da dashboard)",
      itens: INDICATORS.map((i) => ({ nome: i.name, formula: i.calc || i.desc, nota: i.calc && i.desc !== i.calc ? i.desc : "" }))
    },
    ...ANALISES,
    { titulo: "Regras gerais", itens: REGRAS_GERAIS }
  ],
  comparacao: COMPARACAO
}));
const secoes = computed(() => secoesPorAba.value[aba.value]);

const secoesFiltradas = computed(() => {
  const q = normalizeText(busca.value).trim();
  if (!q) return secoes.value;
  return secoes.value
    .map((s) => ({
      ...s,
      itens: s.itens.filter((i) => normalizeText(`${s.titulo} ${i.nome} ${i.formula} ${i.nota || ""}`).includes(q))
    }))
    .filter((s) => s.itens.length);
});
</script>

<template>
  <Modal title="Cálculos" subtitle="Como cada indicador e cada análise da dashboard é calculado" max-width="max-w-4xl" @close="emit('close')">
    <div class="flex flex-col gap-5">
      <div class="inline-flex w-fit max-w-full rounded-xl border border-zinc-200 bg-zinc-50 p-1 dark:border-zinc-700 dark:bg-zinc-800" role="tablist" aria-label="Seções de cálculos">
        <button
          v-for="a in ABAS"
          :key="a.id"
          type="button"
          role="tab"
          :aria-selected="aba === a.id"
          class="rounded-lg px-3 py-1.5 text-sm font-semibold transition sm:px-4"
          :class="aba === a.id ? 'bg-accent text-white shadow-sm' : 'text-zinc-600 hover:bg-zinc-200/70 dark:text-zinc-300 dark:hover:bg-zinc-700'"
          @click="aba = a.id"
        >
          {{ a.label }}
        </button>
      </div>

      <input
        v-model="busca"
        type="search"
        class="w-full rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2.5 text-sm text-zinc-800 outline-none transition placeholder:text-zinc-400 focus:border-accent focus:ring-2 focus:ring-accent/20 dark:border-zinc-700/70 dark:bg-zinc-800/50 dark:text-zinc-200 dark:placeholder:text-zinc-500"
        placeholder="Buscar indicador, análise ou palavra da fórmula..."
        aria-label="Buscar cálculo"
      />

      <p v-if="!secoesFiltradas.length" class="py-8 text-center text-sm text-zinc-500 dark:text-zinc-400">Nenhum cálculo encontrado.</p>

      <section
        v-for="s in secoesFiltradas"
        :key="s.titulo"
        class="overflow-hidden rounded-xl border border-zinc-200 dark:border-zinc-800"
      >
        <h3 class="border-b border-zinc-100 bg-zinc-50 px-4 py-2.5 text-sm font-bold text-zinc-900 dark:border-zinc-800 dark:bg-zinc-800/40 dark:text-zinc-100">
          {{ s.titulo }}
        </h3>
        <dl class="divide-y divide-zinc-100 dark:divide-zinc-800">
          <div v-for="i in s.itens" :key="i.nome" class="grid gap-1 px-4 py-3 sm:grid-cols-[13rem_1fr] sm:gap-4">
            <dt class="text-sm font-semibold text-zinc-800 dark:text-zinc-100">{{ i.nome }}</dt>
            <dd class="min-w-0 text-sm text-zinc-600 dark:text-zinc-300">
              {{ i.formula }}
              <span v-if="i.nota" class="mt-1 block text-xs text-zinc-400 dark:text-zinc-500">{{ i.nota }}</span>
            </dd>
          </div>
        </dl>
      </section>
    </div>
  </Modal>
</template>
