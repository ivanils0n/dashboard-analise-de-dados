<script setup>
import { computed, ref } from "vue";
import Modal from "@/components/ui/Modal.vue";
import EmptyState from "@/components/ui/EmptyState.vue";
import HeadcountEditModal from "@/components/dashboard/HeadcountEditModal.vue";
import { STATE_NAMES, getIndicatorById } from "@/lib/config";
import { listHeadcountRecords, findBranchByShortName, deleteHeadcountRecord } from "@/lib/employees";
import { dateFilter } from "@/composables/useDateFilter";
import { formatCurrency, formatDate, normalizeText, ymLabel } from "@/lib/utils";
import { useDialog } from "@/composables/useDialog";
import { useToast } from "@/composables/useToast";
import { canEditData } from "@/lib/auth";

/* Colaboradores do quadro de um estado (barra clicada no gráfico de
   Headcount), no mês do filtro do dashboard. Usa a mesma regra da contagem da
   barra (headcountCountInRange): admitidos até o mês e ainda não desligados,
   então o total aqui é sempre o número da barra. */
const props = defineProps({
  open: { type: Boolean, default: false },
  estado: { type: String, default: "" }
});

/* Edição e exclusão são resolvidas aqui mesmo, sem passar pelo pai — clicar
   no nome do colaborador abre o HeadcountEditModal por cima deste. */
const emit = defineEmits(["close"]);

const { confirm } = useDialog();
const { show: toast } = useToast();
const canEdit = canEditData();

const search = ref("");

/* Mesmo mês usado por headcountCountInRange: sem início de período, sem
   reconstrução histórica (todos os registros). */
const ym = computed(() =>
  dateFilter.start ? String(dateFilter.end || dateFilter.start).slice(0, 7) : ""
);

/* `h.filial` é lançado como o nome abreviado da filial (ex.: "PVH 5") —
   busca o cadastro em Filiais para exibir o nome completo; sem
   correspondência, mostra o texto lançado mesmo. */
const rows = computed(() =>
  listHeadcountRecords(props.estado, ym.value || undefined).map((h) => {
    const branch = h.filial ? findBranchByShortName(h.filial, h.estado) : null;
    return { ...h, empresa: branch ? branch.name : h.filial || "" };
  })
);

const filteredRows = computed(() => {
  const q = normalizeText(search.value).trim();
  if (!q) return rows.value;
  return rows.value.filter((h) =>
    normalizeText([h.colaborador, h.empresa, h.funcao].join(" ")).includes(q)
  );
});

const totalRemuneracao = computed(() =>
  rows.value.reduce((sum, h) => sum + (Number(h.remuneracao) || 0), 0)
);

/* Sem estado (ou "todos"): abre pelo botão direito no KPI de Headcount, que
   segue o filtro de estado do dashboard em vez de uma barra específica. */
const stateName = computed(() =>
  !props.estado || props.estado === "todos" ? "Todos os estados" : STATE_NAMES[props.estado] || props.estado
);

const editId = ref(null);
const editOpen = ref(false);

function editRow(h) {
  if (!canEdit) {
    toast("Seu perfil tem acesso somente leitura.");
    return;
  }
  editId.value = h.id;
  editOpen.value = true;
}

async function removeRow(h) {
  if (!canEdit) {
    toast("Seu perfil tem acesso somente leitura.");
    return;
  }
  const ok = await confirm({
    title: "Excluir colaborador?",
    message: `O registro de "${h.colaborador}" será removido permanentemente.`,
    confirmText: "Excluir",
    danger: true
  });
  if (!ok) return;
  await deleteHeadcountRecord(h.id);
  toast("Colaborador excluído.");
}
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
          placeholder="Nome, empresa ou função..."
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
                <th class="whitespace-nowrap px-4 py-2.5 font-semibold">Colaborador</th>
                <th class="whitespace-nowrap px-4 py-2.5 font-semibold">Empresa</th>
                <th class="whitespace-nowrap px-4 py-2.5 font-semibold">Função</th>
                <th class="whitespace-nowrap px-4 py-2.5 text-right font-semibold">Remuneração</th>
                <th class="whitespace-nowrap px-4 py-2.5 font-semibold">Admissão</th>
                <th v-if="canEdit" class="px-4 py-2.5"></th>
              </tr>
            </thead>
            <tbody class="uppercase">
              <tr
                v-for="h in filteredRows"
                :key="h.id"
                class="border-b border-zinc-100 last:border-0 dark:border-zinc-800"
              >
                <td class="whitespace-nowrap px-4 py-2.5 font-medium text-zinc-900 dark:text-zinc-100">
                  <button
                    v-if="canEdit"
                    type="button"
                    class="text-left underline-offset-2 hover:text-accent-hover hover:underline dark:hover:text-accent-light"
                    :title="`Editar ${h.colaborador}`"
                    @click="editRow(h)"
                  >
                    {{ h.colaborador }}
                  </button>
                  <span v-else>{{ h.colaborador }}</span>
                </td>
                <td class="whitespace-nowrap px-4 py-2.5 text-zinc-600 dark:text-zinc-300">{{ h.empresa || "—" }}</td>
                <td class="whitespace-nowrap px-4 py-2.5 text-zinc-600 dark:text-zinc-300">{{ h.funcao || "—" }}</td>
                <td class="whitespace-nowrap px-4 py-2.5 text-right tabular-nums text-zinc-900 dark:text-zinc-100">
                  {{ h.remuneracao != null ? formatCurrency(h.remuneracao) : "—" }}
                </td>
                <td class="whitespace-nowrap px-4 py-2.5 text-zinc-600 dark:text-zinc-300">
                  {{ h.dataAdmissao ? formatDate(h.dataAdmissao) : "—" }}
                </td>
                <td v-if="canEdit" class="normal-case whitespace-nowrap px-4 py-2.5 text-right">
                  <button type="button" class="icon-btn-sm" aria-label="Excluir colaborador" @click="removeRow(h)">&times;</button>
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

    <HeadcountEditModal
      v-if="editOpen"
      :open="editOpen"
      :record-id="editId"
      @close="editOpen = false"
      @saved="editOpen = false"
    />
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
.icon-btn-sm {
  display: flex;
  height: 1.9rem;
  width: 1.9rem;
  align-items: center;
  justify-content: center;
  border-radius: 0.5rem;
  font-size: 1rem;
  line-height: 1;
  color: rgb(113 113 122);
  transition: background-color 0.15s, color 0.15s;
}
.icon-btn-sm:hover {
  background-color: rgb(244 244 245);
  color: rgb(24 24 27);
}
:global(.dark) .icon-btn-sm {
  color: rgb(161 161 170);
}
:global(.dark) .icon-btn-sm:hover {
  background-color: rgb(39 39 42);
  color: rgb(244 244 245);
}
</style>
