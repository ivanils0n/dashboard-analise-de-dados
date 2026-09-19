<script setup>
import { computed, ref } from "vue";
import Modal from "@/components/ui/Modal.vue";
import EmptyState from "@/components/ui/EmptyState.vue";
import { STATE_NAMES, getIndicatorById } from "@/lib/config";
import { listHeadcountRecords } from "@/lib/employees";
import { getBranchById } from "@/lib/store";
import { dateFilter } from "@/composables/useDateFilter";
import { formatCurrency, formatDate, normalizeText, ymLabel } from "@/lib/utils";

/* Colaboradores do quadro de um estado (barra clicada no gráfico de
   Headcount), no mês do filtro do dashboard. Usa a mesma regra da contagem da
   barra (headcountCountInRange): admitidos até o mês e ainda não desligados,
   então o total aqui é sempre o número da barra. */
const props = defineProps({
  open: { type: Boolean, default: false },
  estado: { type: String, default: "" }
});

const emit = defineEmits(["close"]);

const search = ref("");

/* Mesmo mês usado por headcountCountInRange: sem início de período, sem
   reconstrução histórica (todos os registros). */
const ym = computed(() =>
  dateFilter.start ? String(dateFilter.end || dateFilter.start).slice(0, 7) : ""
);

const rows = computed(() =>
  listHeadcountRecords(props.estado, ym.value || undefined).map((h) => {
    const branch = h.filialId ? getBranchById(h.filialId) : null;
    return { ...h, empresa: branch ? branch.name : "" };
  })
);

const filteredRows = computed(() => {
  const q = normalizeText(search.value).trim();
  if (!q) return rows.value;
  return rows.value.filter((h) =>
    normalizeText([h.codigo, h.colaborador, h.empresa, h.funcao].join(" ")).includes(q)
  );
});

const totalRemuneracao = computed(() =>
  rows.value.reduce((sum, h) => sum + (Number(h.remuneracao) || 0), 0)
);

const stateName = computed(() => STATE_NAMES[props.estado] || props.estado);
</script>

<template>
  <Modal
    :title="`Headcount — ${stateName}`"
    :subtitle="getIndicatorById('headcount')?.calc || ''"
    :open="open"
    max-width="max-w-5xl"
    @close="emit('close')"
  >
    <div class="flex flex-col gap-4">
      <div
        class="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-accent/25 bg-accent/5 p-4 dark:border-accent/25 dark:bg-accent/10"
      >
        <div>
          <p class="text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
            Colaboradores{{ ym ? ` em ${ymLabel(ym)}` : "" }}
          </p>
          <p class="text-3xl font-bold tabular-nums text-zinc-900 dark:text-zinc-100">{{ rows.length }}</p>
        </div>
        <div v-if="totalRemuneracao" class="flex flex-wrap items-center justify-end gap-x-4 gap-y-1 text-right">
          <div>
            <p class="text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
              Remuneração total
            </p>
            <p class="text-xl font-bold tabular-nums text-zinc-900 dark:text-zinc-100">
              {{ formatCurrency(totalRemuneracao) }}
            </p>
          </div>
          <p class="max-w-[16rem] text-left text-xs text-zinc-500 dark:text-zinc-400">
            <strong class="font-semibold text-zinc-600 dark:text-zinc-300">Observação:</strong>
            salário base, sem acréscimos de bonificação, entre outros benefícios.
          </p>
        </div>
      </div>

      <div v-if="rows.length" class="flex flex-col gap-1.5">
        <label for="hcEstadoSearch" class="text-sm font-medium text-zinc-700 dark:text-zinc-200">Buscar colaborador</label>
        <input
          id="hcEstadoSearch"
          v-model="search"
          type="search"
          class="input-field"
          placeholder="Código, nome, empresa ou função..."
        />
      </div>

      <div
        v-if="filteredRows.length"
        class="overflow-hidden rounded-xl border border-zinc-200 dark:border-zinc-800"
      >
        <div class="max-h-[26rem] overflow-auto">
          <table class="w-full min-w-max text-left text-sm">
            <thead class="sticky top-0 z-10 bg-white dark:bg-zinc-900">
              <tr
                class="border-b border-zinc-100 text-xs uppercase tracking-wide text-zinc-400 dark:border-zinc-800 dark:text-zinc-400"
              >
                <th class="whitespace-nowrap px-4 py-2.5 font-semibold">Código</th>
                <th class="whitespace-nowrap px-4 py-2.5 font-semibold">Colaborador</th>
                <th class="whitespace-nowrap px-4 py-2.5 font-semibold">Empresa</th>
                <th class="whitespace-nowrap px-4 py-2.5 font-semibold">Função</th>
                <th class="whitespace-nowrap px-4 py-2.5 text-right font-semibold">Remuneração</th>
                <th class="whitespace-nowrap px-4 py-2.5 font-semibold">Admissão</th>
              </tr>
            </thead>
            <tbody>
              <tr
                v-for="h in filteredRows"
                :key="h.id"
                class="border-b border-zinc-100 last:border-0 dark:border-zinc-800"
              >
                <td class="whitespace-nowrap px-4 py-2.5 text-zinc-600 dark:text-zinc-300">{{ h.codigo || "—" }}</td>
                <td class="whitespace-nowrap px-4 py-2.5 font-medium text-zinc-900 dark:text-zinc-100">{{ h.colaborador }}</td>
                <td class="whitespace-nowrap px-4 py-2.5 text-zinc-600 dark:text-zinc-300">{{ h.empresa || "—" }}</td>
                <td class="whitespace-nowrap px-4 py-2.5 text-zinc-600 dark:text-zinc-300">{{ h.funcao || "—" }}</td>
                <td class="whitespace-nowrap px-4 py-2.5 text-right tabular-nums text-zinc-900 dark:text-zinc-100">
                  {{ h.remuneracao != null ? formatCurrency(h.remuneracao) : "—" }}
                </td>
                <td class="whitespace-nowrap px-4 py-2.5 text-zinc-600 dark:text-zinc-300">
                  {{ h.dataAdmissao ? formatDate(h.dataAdmissao) : "—" }}
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

      <EmptyState
        v-else-if="rows.length"
        title="Nenhum colaborador encontrado"
        text="Ajuste a busca e tente novamente."
      />
      <EmptyState
        v-else
        title="Sem colaboradores no quadro"
        text="Nenhum colaborador no Headcount deste estado no mês filtrado."
      />
    </div>
  </Modal>
</template>
