<script setup>
import Modal from "@/components/ui/Modal.vue";
import { formatCurrency } from "@/lib/utils";

/* Filiais agrupadas na fatia "OUTRAS" da pizza de Custo médio de contratação:
   filial, quantidade de vagas fechadas e custo médio. Clicar numa linha abre
   as vagas daquela filial ("select" com a key da filial). */
defineProps({
  open: { type: Boolean, default: false },
  /* [{ key, label, count, value }] — value = custo médio. */
  items: { type: Array, default: () => [] }
});
const emit = defineEmits(["close", "select"]);
</script>

<template>
  <Modal
    title="Custo médio de contratação — Outras filiais"
    :subtitle="`${items.length} filial(is) fora das maiores fatias. Clique numa filial para ver as vagas.`"
    :open="open"
    max-width="max-w-2xl"
    @close="emit('close')"
  >
    <div class="overflow-hidden rounded-xl border border-zinc-200 dark:border-zinc-800">
      <div class="max-h-[26rem] overflow-auto">
        <table class="w-full text-left text-sm">
          <thead class="sticky top-0 z-10 bg-white dark:bg-zinc-900">
            <tr class="border-b border-zinc-100 text-xs uppercase tracking-wide text-zinc-400 dark:border-zinc-800">
              <th class="px-4 py-2.5 font-semibold">Filial</th>
              <th class="px-4 py-2.5 text-right font-semibold">Vagas</th>
              <th class="px-4 py-2.5 text-right font-semibold">Custo médio</th>
            </tr>
          </thead>
          <tbody class="uppercase">
            <tr
              v-for="it in items"
              :key="it.key"
              class="cursor-pointer border-b border-zinc-100 transition last:border-0 hover:bg-zinc-50 dark:border-zinc-800 dark:hover:bg-zinc-800/50"
              @click="emit('select', it.key)"
            >
              <td class="px-4 py-2.5 font-medium text-zinc-900 dark:text-zinc-100">{{ it.label }}</td>
              <td class="px-4 py-2.5 text-right tabular-nums text-zinc-600 dark:text-zinc-300">{{ it.count }}</td>
              <td class="px-4 py-2.5 text-right font-medium tabular-nums text-zinc-900 dark:text-zinc-100">{{ formatCurrency(it.value) }}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  </Modal>
</template>
