<script setup>
import { computed } from "vue";
import Modal from "@/components/ui/Modal.vue";
import Badge from "@/components/ui/Badge.vue";
import { getVacancyById, getBranchById } from "@/lib/store";
import { formatVacancyTempo, deleteVacancyRecord } from "@/lib/employees";
import { formatDate, formatCurrency } from "@/lib/utils";
import { canEditData } from "@/lib/auth";
import { useDialog } from "@/composables/useDialog";
import { useToast } from "@/composables/useToast";

/* Detalhe de uma vaga clicada na barra do gráfico de Tempo médio de
   contratação (Visão geral e Cockpit) — mostra os dados da vaga e, quando o
   perfil permite, botões para editá-la (abre o mesmo formulário de
   lançamento usado pelo modal de Vagas, aba "Vaga") ou excluí-la. */
const props = defineProps({
  open: { type: Boolean, default: false },
  vacancyId: { type: String, default: null }
});

const emit = defineEmits(["close", "edit", "deleted"]);

const canEdit = canEditData();
const { confirm } = useDialog();
const { show: toast } = useToast();

const vacancy = computed(() => (props.vacancyId ? getVacancyById(props.vacancyId) : null));

const filialName = computed(() => {
  const v = vacancy.value;
  if (!v || !v.filialId) return "—";
  const b = getBranchById(v.filialId);
  return b ? b.shortName || b.name : "—";
});

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
  deleteVacancyRecord(id);
  toast("Vaga excluída.");
  emit("deleted", id);
  close();
}
</script>

<template>
  <Modal title="Detalhes da vaga" :open="open" max-width="max-w-lg" @close="close">
    <div v-if="vacancy" class="flex flex-col gap-4">
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
          <dd class="mt-0.5 text-zinc-800 dark:text-zinc-100">{{ filialName }}</dd>
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

    <div v-else class="py-6 text-center text-sm text-zinc-500 dark:text-zinc-400">Vaga não encontrada.</div>
  </Modal>
</template>

<style scoped>
.btn-primary {
  border-radius: 0.5rem;
  background-color: #ef4444;
  padding: 0.5rem 1rem;
  font-size: 0.875rem;
  font-weight: 600;
  color: #fff;
  transition: background-color 0.15s;
}
.btn-primary:hover {
  background-color: #dc2626;
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
