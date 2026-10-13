<script setup>
import { computed, ref } from "vue";
import Modal from "@/components/ui/Modal.vue";
import Badge from "@/components/ui/Badge.vue";
import { getVacancyById } from "@/lib/store";
import { formatVacancyTempo, deleteVacancyRecord, listVacancies } from "@/lib/employees";
import { formatDate, formatCurrency, daysBetween, todayISO } from "@/lib/utils";
import { canEditData } from "@/lib/auth";
import { useDialog } from "@/composables/useDialog";
import { useToast } from "@/composables/useToast";

const props = defineProps({
  open: { type: Boolean, default: false },
  vacancyId: { type: String, default: null },
  vacancyIds: { type: Array, default: () => [] },
  fallback: { type: Object, default: null }
});

const emit = defineEmits(["close", "edit", "deleted"]);

const canEdit = canEditData();
const { confirm } = useDialog();
const { show: toast } = useToast();

const pickedId = ref(null);

const groupList = computed(() => {
  if (props.vacancyIds.length < 2) return [];
  const ids = new Set(props.vacancyIds);
  const hoje = todayISO();
  return listVacancies("todos")
    .filter((v) => ids.has(v.id))
    .map((v) => ({ ...v, dias: v.openAt ? daysBetween(v.openAt, v.closeAt || hoje) : null }))
    .sort((a, b) => (b.dias ?? -1) - (a.dias ?? -1));
});

const isGroup = computed(() => groupList.value.length > 1);

const groupSummary = computed(() => {
  const list = groupList.value;
  const dias = list.map((v) => v.dias).filter((d) => d !== null && Number.isFinite(d) && d >= 0);
  const salarios = list.map((v) => Number(v.salario)).filter((s) => s > 0);
  return {
    nome: list[0] ? list[0].name : "Vaga",
    total: list.length,
    abertas: list.filter((v) => !v.closeAt).length,
    media: dias.length ? dias.reduce((s, d) => s + d, 0) / dias.length : null,
    min: dias.length ? Math.min(...dias) : null,
    max: dias.length ? Math.max(...dias) : null,
    salarioMedio: salarios.length ? salarios.reduce((s, x) => s + x, 0) / salarios.length : null
  };
});

const currentId = computed(() => pickedId.value || (isGroup.value ? null : props.vacancyId || props.vacancyIds[0] || null));
const vacancy = computed(() => (currentId.value ? getVacancyById(currentId.value) : null));
const fmtDias = (d) => (d === null || d === undefined ? "—" : `${d.toFixed(1).replace(".", ",")} dias`);

const tipoLabel = computed(() => {
  const t = vacancy.value && vacancy.value.tipoContratacao;
  return t ? String(t).toUpperCase() : "—";
});

function close() {
  emit("close");
}

function edit() {
  if (!vacancy.value) return;
  emit("edit", vacancy.value.id);
}

async function remove() {
  if (!vacancy.value) return;
  const ok = await confirm({
    title: "Excluir vaga?",
    message: `A vaga "${vacancy.value.name}" será removida permanentemente.`,
    confirmText: "Excluir",
    danger: true
  });
  if (!ok) return;
  const id = vacancy.value.id;
  await deleteVacancyRecord(id);
  toast("Vaga excluída.");
  emit("deleted", id);
  if (isGroup.value && pickedId.value) pickedId.value = null;
  else close();
}
</script>

<template>
  <Modal
    :title="isGroup && !pickedId ? 'Informações da vaga' : 'Detalhes da vaga'"
    :open="open"
    :max-width="isGroup && !pickedId ? 'max-w-3xl' : 'max-w-lg'"
    @close="close"
  >
    <div v-if="isGroup && !pickedId" class="flex flex-col gap-4">
      <h3 class="text-lg font-bold uppercase text-zinc-900 dark:text-zinc-100">{{ groupSummary.nome }}</h3>

      <div class="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div class="rounded-xl border border-accent/30 bg-accent/5 px-3 py-2.5">
          <p class="text-[11px] font-semibold uppercase tracking-wide text-zinc-400">Tempo médio</p>
          <p class="mt-0.5 text-lg font-bold tabular-nums text-zinc-900 dark:text-zinc-100">{{ fmtDias(groupSummary.media) }}</p>
        </div>
        <div class="rounded-xl border border-zinc-200 px-3 py-2.5 dark:border-zinc-800">
          <p class="text-[11px] font-semibold uppercase tracking-wide text-zinc-400">Vagas</p>
          <p class="mt-0.5 text-lg font-bold tabular-nums text-zinc-900 dark:text-zinc-100">
            {{ groupSummary.total }}
            <span class="text-xs font-medium text-zinc-500">({{ groupSummary.abertas }} em aberto)</span>
          </p>
        </div>
        <div class="rounded-xl border border-zinc-200 px-3 py-2.5 dark:border-zinc-800">
          <p class="text-[11px] font-semibold uppercase tracking-wide text-zinc-400">Menor / maior</p>
          <p class="mt-0.5 text-lg font-bold tabular-nums text-zinc-900 dark:text-zinc-100">
            {{ groupSummary.min === null ? "—" : `${groupSummary.min.toFixed(0)} / ${groupSummary.max.toFixed(0)} d` }}
          </p>
        </div>
        <div class="rounded-xl border border-zinc-200 px-3 py-2.5 dark:border-zinc-800">
          <p class="text-[11px] font-semibold uppercase tracking-wide text-zinc-400">Salário médio</p>
          <p class="mt-0.5 text-lg font-bold tabular-nums text-zinc-900 dark:text-zinc-100">
            {{ groupSummary.salarioMedio === null ? "—" : formatCurrency(groupSummary.salarioMedio) }}
          </p>
        </div>
      </div>

      <div class="max-h-[22rem] overflow-auto rounded-xl border border-zinc-200 dark:border-zinc-800">
        <table class="w-full min-w-max text-left text-sm">
          <thead class="sticky top-0 bg-white dark:bg-zinc-900">
            <tr class="border-b border-zinc-100 text-xs uppercase tracking-wide text-zinc-400 dark:border-zinc-800">
              <th class="px-3 py-2 font-semibold">Filial</th>
              <th class="px-3 py-2 font-semibold">Recrutador</th>
              <th class="px-3 py-2 font-semibold">Abertura</th>
              <th class="px-3 py-2 font-semibold">Fechamento</th>
              <th class="px-3 py-2 text-right font-semibold">Tempo</th>
              <th class="px-3 py-2 font-semibold">Status</th>
            </tr>
          </thead>
          <tbody class="uppercase">
            <tr
              v-for="v in groupList"
              :key="v.id"
              class="cursor-pointer border-b border-zinc-100 transition last:border-0 hover:bg-zinc-50 dark:border-zinc-800 dark:hover:bg-zinc-800/60"
              title="Ver detalhes desta vaga"
              @click="pickedId = v.id"
            >
              <td class="whitespace-nowrap px-3 py-2 text-zinc-700 dark:text-zinc-300">{{ v.filial || "—" }}</td>
              <td class="whitespace-nowrap px-3 py-2 text-zinc-700 dark:text-zinc-300">{{ v.recrutador || "—" }}</td>
              <td class="whitespace-nowrap px-3 py-2 text-zinc-700 dark:text-zinc-300">{{ formatDate(v.openAt) }}</td>
              <td class="whitespace-nowrap px-3 py-2 text-zinc-700 dark:text-zinc-300">{{ v.closeAt ? formatDate(v.closeAt) : "—" }}</td>
              <td class="whitespace-nowrap px-3 py-2 text-right font-semibold normal-case tabular-nums text-zinc-900 dark:text-zinc-100">{{ fmtDias(v.dias) }}</td>
              <td class="whitespace-nowrap px-3 py-2">
                <Badge :tone="v.closeAt ? 'dark' : 'accent'">{{ v.closeAt ? "Fechada" : "Aberta" }}</Badge>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
      <p class="text-xs text-zinc-400">Clique em uma vaga para ver todos os detalhes.</p>
    </div>

    <div v-else-if="vacancy" class="flex flex-col gap-4">
      <button
        v-if="isGroup"
        type="button"
        class="self-start text-xs font-medium text-zinc-500 transition hover:text-accent dark:text-zinc-400"
        @click="pickedId = null"
      >
        ← Voltar para a lista
      </button>
      <div class="flex items-start justify-between gap-2">
        <h3 class="text-lg font-bold text-zinc-900 dark:text-zinc-100">{{ vacancy.name || "Vaga" }}</h3>
        <Badge :tone="vacancy.closeAt ? 'dark' : 'accent'">{{ vacancy.closeAt ? "Fechada" : "Aberta" }}</Badge>
      </div>

      <dl class="grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
        <div>
          <dt class="text-xs font-semibold uppercase tracking-wide text-zinc-400">Tipo de contratação</dt>
          <dd class="mt-0.5 text-zinc-800 dark:text-zinc-100">{{ tipoLabel }}</dd>
        </div>
        <div>
          <dt class="text-xs font-semibold uppercase tracking-wide text-zinc-400">Salário</dt>
          <dd class="mt-0.5 text-zinc-800 dark:text-zinc-100">
            {{ vacancy.salario != null ? formatCurrency(vacancy.salario) : "—" }}
          </dd>
        </div>
        <div>
          <dt class="text-xs font-semibold uppercase tracking-wide text-zinc-400">Filial</dt>
          <dd class="mt-0.5 text-zinc-800 dark:text-zinc-100">{{ vacancy.filial || "—" }}</dd>
        </div>
        <div>
          <dt class="text-xs font-semibold uppercase tracking-wide text-zinc-400">Estado</dt>
          <dd class="mt-0.5 text-zinc-800 dark:text-zinc-100">{{ vacancy.estado || "—" }}</dd>
        </div>
        <div>
          <dt class="text-xs font-semibold uppercase tracking-wide text-zinc-400">Abertura</dt>
          <dd class="mt-0.5 text-zinc-800 dark:text-zinc-100">{{ formatDate(vacancy.openAt) }}</dd>
        </div>
        <div>
          <dt class="text-xs font-semibold uppercase tracking-wide text-zinc-400">Fechamento</dt>
          <dd class="mt-0.5 text-zinc-800 dark:text-zinc-100">
            {{ vacancy.closeAt ? formatDate(vacancy.closeAt) : "—" }}
          </dd>
        </div>
        <div>
          <dt class="text-xs font-semibold uppercase tracking-wide text-zinc-400">Recrutador</dt>
          <dd class="mt-0.5 text-zinc-800 dark:text-zinc-100">{{ vacancy.recrutador || "—" }}</dd>
        </div>
        <div>
          <dt class="text-xs font-semibold uppercase tracking-wide text-zinc-400">Motivo da Contratação</dt>
          <dd class="mt-0.5 text-zinc-800 dark:text-zinc-100">{{ vacancy.motivoContratacao || "—" }}</dd>
        </div>
        <div class="col-span-2">
          <dt class="text-xs font-semibold uppercase tracking-wide text-zinc-400">Tempo de contratação</dt>
          <dd class="mt-0.5 text-zinc-800 dark:text-zinc-100">{{ formatVacancyTempo(vacancy) }}</dd>
        </div>
      </dl>

      <div v-if="canEdit" class="flex justify-end gap-2 border-t border-zinc-100 pt-3 dark:border-zinc-800">
        <button type="button" class="btn-danger-ghost" @click="remove">Excluir</button>
        <button type="button" class="btn-primary" @click="edit">Editar</button>
      </div>
    </div>

    <div v-else-if="fallback" class="flex flex-col gap-4">
      <h3 class="text-lg font-bold text-zinc-900 dark:text-zinc-100">{{ fallback.name || "Vaga" }}</h3>
      <dl class="grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
        <div>
          <dt class="text-xs font-semibold uppercase tracking-wide text-zinc-400">Salário</dt>
          <dd class="mt-0.5 text-zinc-800 dark:text-zinc-100">{{ formatCurrency(fallback.salario) }}</dd>
        </div>
        <div>
          <dt class="text-xs font-semibold uppercase tracking-wide text-zinc-400">Data do lançamento</dt>
          <dd class="mt-0.5 text-zinc-800 dark:text-zinc-100">{{ formatDate(fallback.date) }}</dd>
        </div>
      </dl>
      <p class="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-700 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-400">
        Falta de informações suficientes.
      </p>
    </div>

    <div v-else class="py-6 text-center text-sm text-zinc-500 dark:text-zinc-400">Vaga não encontrada.</div>
  </Modal>
</template>

<style scoped>
.btn-primary {
  border-radius: 0.5rem;
  background-color: #E8AF3E;
  padding: 0.5rem 1rem;
  font-size: 0.875rem;
  font-weight: 600;
  color: #fff;
  transition: background-color 0.15s;
}
.btn-primary:hover {
  background-color: #B7791F;
}
.btn-danger-ghost {
  border-radius: 0.5rem;
  padding: 0.5rem 1rem;
  font-size: 0.875rem;
  font-weight: 500;
  color: rgb(220 38 38);
  transition: background-color 0.15s;
}
.btn-danger-ghost:hover {
  background-color: rgb(254 242 242);
}
:global(.dark) .btn-danger-ghost {
  color: rgb(248 113 113);
}
:global(.dark) .btn-danger-ghost:hover {
  background-color: rgb(69 10 10);
}
</style>
