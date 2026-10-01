<script setup>
import { computed, ref } from "vue";
import Modal from "@/components/ui/Modal.vue";
import { formatValue, ymLabel } from "@/lib/utils";

const props = defineProps({
  dashboard: { type: Object, required: true },
  compact: { type: Boolean, default: false }
});

const open = ref(false);
const meses = ref(1);
const MAX_MESES = 12;

const comparacao = computed(() => (open.value ? props.dashboard.comparacaoMeses(meses.value) : { months: [], rows: [] }));
const months = computed(() => comparacao.value.months);
const ultimo = computed(() => months.value.length - 1);

function variacao(row, i) {
  const cur = row.values[i];
  const base = i === 0 ? row.anterior : row.values[i - 1];
  if (cur === null || base === null || cur === undefined || base === undefined) return null;
  const diff = cur - base;
  if (base === 0) return diff === 0 ? { pct: 0, bom: null } : null;
  const pct = (diff / Math.abs(base)) * 100;
  const bom = diff === 0 ? null : row.higherIsBetter ? diff > 0 : diff < 0;
  return { pct, bom };
}

function tone(v) {
  if (!v || v.bom === null) return "text-zinc-400";
  return v.bom ? "text-green-600 dark:text-green-400" : "text-red-600 dark:text-red-400";
}

function pctText(v) {
  if (!v) return "—";
  if (v.pct === 0) return "0%";
  const abs = Math.abs(v.pct).toLocaleString("pt-BR", { maximumFractionDigits: 1 });
  return `${v.pct > 0 ? "▲" : "▼"} ${abs}%`;
}

const OPCOES = Array.from({ length: MAX_MESES }, (_, i) => i + 1);
</script>

<template>
  <button
    type="button"
    class="inline-flex items-center justify-center gap-1.5 rounded-lg border border-zinc-300 px-2.5 py-1.5 text-xs font-semibold text-zinc-700 transition hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-800"
    :class="compact ? 'w-full' : ''"
    title="Comparar os indicadores com o mês anterior"
    @click="open = true"
  >
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
      <path d="M3 3v18h18" />
      <path d="m7 15 4-4 3 3 5-6" />
    </svg>
    Comparar com mês anterior
  </button>

  <Modal
    v-if="open"
    title="Comparar indicadores"
    subtitle="Valores de cada indicador no mês filtrado e nos meses anteriores"
    :open="open"
    max-width="max-w-6xl"
    @close="open = false"
  >
    <div class="flex flex-col gap-4">
      <div class="flex flex-wrap items-center gap-3">
        <label for="cmpMeses" class="text-sm font-medium text-zinc-700 dark:text-zinc-200">Meses para comparar</label>
        <select
          id="cmpMeses"
          v-model.number="meses"
          class="w-32 rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm font-medium text-zinc-800 outline-none transition focus:border-accent focus:ring-2 focus:ring-accent/20 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-100 dark:[color-scheme:dark]"
        >
          <option v-for="n in OPCOES" :key="n" :value="n" class="bg-white text-zinc-800 dark:bg-zinc-800 dark:text-zinc-100">{{ n }} {{ n === 1 ? "mês" : "meses" }}</option>
        </select>
        <span class="text-xs text-zinc-500 dark:text-zinc-400">
          {{ ymLabel(months[0]) }} a {{ ymLabel(months[ultimo]) }} — abaixo de cada mês, a variação em % contra o mês imediatamente anterior (ex.: {{ ymLabel(months[ultimo]) }} contra {{ ymLabel(months[ultimo - 1] || months[0]) }}).
        </span>
      </div>

      <div class="overflow-hidden rounded-xl border border-zinc-200 dark:border-zinc-800">
        <div class="max-h-[30rem] overflow-auto">
          <table class="w-full min-w-max text-left text-sm">
            <thead class="sticky top-0 z-10 bg-white dark:bg-zinc-900">
              <tr class="border-b border-zinc-100 text-xs uppercase tracking-wide text-zinc-400 dark:border-zinc-800 dark:text-zinc-400">
                <th class="sticky left-0 z-20 whitespace-nowrap bg-white px-4 py-2.5 font-semibold dark:bg-zinc-900">Indicador</th>
                <th
                  v-for="(ym, i) in months"
                  :key="ym"
                  class="whitespace-nowrap px-4 py-2.5 text-right font-semibold"
                  :class="i === ultimo ? 'text-accent' : ''"
                >
                  {{ ymLabel(ym) }}
                </th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="row in comparacao.rows" :key="row.id" class="border-b border-zinc-100 last:border-0 dark:border-zinc-800">
                <td class="sticky left-0 whitespace-nowrap bg-white px-4 py-2.5 font-medium text-zinc-800 dark:bg-zinc-900 dark:text-zinc-100">{{ row.name }}</td>
                <td
                  v-for="(v, i) in row.values"
                  :key="i"
                  class="whitespace-nowrap px-4 py-2.5 text-right tabular-nums"
                  :class="i === ultimo ? 'bg-accent/5 font-semibold text-zinc-900 dark:text-zinc-100' : 'text-zinc-600 dark:text-zinc-300'"
                >
                  {{ formatValue(row, v) }}
                  <div class="text-[11px] font-medium" :class="tone(variacao(row, i))">{{ pctText(variacao(row, i)) }}</div>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
      <p class="text-[11px] text-zinc-400 dark:text-zinc-500">
        Verde = melhora e vermelho = piora, conforme o tipo de cada indicador. "—" indica mês sem dados ou sem base (valor zero) para calcular. O primeiro mês é comparado com o mês anterior a ele. Respeita o estado selecionado no filtro.
      </p>
    </div>
  </Modal>
</template>
