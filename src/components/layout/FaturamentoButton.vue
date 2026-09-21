<script setup>
import { ref } from "vue";
import Modal from "@/components/ui/Modal.vue";
import { faturamento, setFaturamento, clearFaturamento } from "@/composables/useFaturamento";
import { formatCurrency, maskCurrencyInput, normalizeCurrencyInput, parseCurrencyBR } from "@/lib/utils";

/* Botão do cabeçalho do gráfico de Custo de folha de salário para informar o
   faturamento da empresa (especulativo) — usado no KPI "% do faturamento".
   `compact`: mostra o valor abreviado (ex.: "R$ 1,5 mi") para caber em
   cabeçalhos estreitos; o valor completo fica no tooltip. */
const props = defineProps({
  compact: { type: Boolean, default: false }
});

const compactFormat = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
  notation: "compact",
  maximumFractionDigits: 2
});
function label(value) {
  return props.compact ? compactFormat.format(value) : formatCurrency(value);
}

const open = ref(false);
/* Texto do campo, já com a máscara brasileira (ex.: "1.500.000,00"). */
const draft = ref("");

function openModal() {
  draft.value = faturamento.value ? normalizeCurrencyInput(faturamento.value.toFixed(2).replace(".", ",")) : "";
  open.value = true;
}

function onInput(ev) {
  draft.value = maskCurrencyInput(ev.target.value);
}

function onBlur() {
  draft.value = normalizeCurrencyInput(draft.value);
}

function save() {
  setFaturamento(parseCurrencyBR(draft.value));
  open.value = false;
}

function clear() {
  clearFaturamento();
  open.value = false;
}
</script>

<template>
  <button
    type="button"
    class="relative flex items-center gap-1.5 whitespace-nowrap rounded-lg border px-3 py-1.5 text-xs font-medium text-zinc-700 transition hover:bg-zinc-100 dark:text-zinc-200 dark:hover:bg-zinc-800"
    :class="faturamento ? 'border-accent/60' : 'border-zinc-300 dark:border-zinc-700'"
    :title="faturamento ? `Faturamento (especulativo): ${formatCurrency(faturamento)} — clique para alterar` : 'Informar o faturamento da empresa (especulativo)'"
    aria-label="Faturamento da empresa (especulativo)"
    @click="openModal"
  >
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
      <path d="M3 3v18h18" />
      <path d="M7 15l4-4 3 3 5-6" />
    </svg>
    {{ faturamento ? label(faturamento) : "Faturamento" }}
  </button>

  <Modal
    v-if="open"
    title="Faturamento da empresa"
    subtitle="Valor especulativo, usado só para calcular o % do Custo médio por colaborador sobre o faturamento."
    max-width="max-w-md"
    @close="open = false"
  >
    <form class="flex flex-col gap-4" novalidate @submit.prevent="save">
      <div class="flex flex-col gap-1.5">
        <label for="faturamentoValue" class="text-sm font-medium text-zinc-700 dark:text-zinc-200">Faturamento (R$)</label>
        <input
          id="faturamentoValue"
          class="input-field text-right tabular-nums"
          type="text"
          inputmode="decimal"
          autocomplete="off"
          placeholder="0,00"
          autofocus
          :value="draft"
          @input="onInput"
          @blur="onBlur"
        />
        <p class="text-xs text-zinc-500 dark:text-zinc-400">
          % do faturamento = Custo médio por colaborador ÷ Faturamento médio por colaborador × 100, onde o faturamento
          médio é este valor ÷ Headcount. Informe o faturamento do mês/estado que está analisando. O valor fica só
          nesta sessão e não é gravado no banco.
        </p>
      </div>
      <div class="flex justify-end gap-2 border-t border-zinc-100 pt-4 dark:border-zinc-800">
        <button v-if="faturamento" type="button" class="btn-ghost mr-auto text-red-600 dark:text-red-400" @click="clear">Remover</button>
        <button type="button" class="btn-ghost" @click="open = false">Cancelar</button>
        <button type="submit" class="btn-primary">Salvar</button>
      </div>
    </form>
  </Modal>
</template>
