<script setup>
import { computed } from "vue";
import Modal from "@/components/ui/Modal.vue";
import { getPermanenciaById } from "@/lib/store";
import { deletePermanenciaRecord } from "@/lib/employees";
import { formatDate, daysBetween } from "@/lib/utils";
import { canEditData } from "@/lib/auth";
import { useDialog } from "@/composables/useDialog";
import { useToast } from "@/composables/useToast";

/* Detalhe de um colaborador desligado clicado na barra do gráfico de Tempo
   médio de permanência (Visão geral e Painel) — mostra os dados do registro
   e, quando o perfil permite, botões para editá-lo (abre o mesmo formulário
   usado pelo modal de Tempo médio de permanência) ou excluí-lo. */
const props = defineProps({
  open: { type: Boolean, default: false },
  recordId: { type: String, default: null }
});

const emit = defineEmits(["close", "edit", "deleted"]);

const canEdit = canEditData();
const { confirm } = useDialog();
const { show: toast } = useToast();

const record = computed(() => (props.recordId ? getPermanenciaById(props.recordId) : null));

const days = computed(() => {
  const p = record.value;
  if (!p || !p.dataAdmissao || !p.dataDemissao) return null;
  return daysBetween(p.dataAdmissao, p.dataDemissao);
});

function close() {
  emit("close");
}

function edit() {
  if (!record.value) return;
  emit("edit", record.value.id);
}

async function remove() {
  if (!record.value) return;
  const ok = await confirm({
    title: "Excluir registro?",
    message: `O registro de "${record.value.colaborador}" será removido permanentemente.`,
    confirmText: "Excluir",
    danger: true
  });
  if (!ok) return;
  const id = record.value.id;
  await deletePermanenciaRecord(id);
  toast("Registro excluído.");
  emit("deleted", id);
  close();
}
</script>

<template>
  <Modal title="Detalhes do colaborador" :open="open" max-width="max-w-lg" @close="close">
    <div v-if="record" class="flex flex-col gap-4">
      <h3 class="text-lg font-bold text-zinc-900 dark:text-zinc-100">{{ record.colaborador }}</h3>

      <dl class="grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
        <div>
          <dt class="text-xs font-semibold uppercase tracking-wide text-zinc-400">Data de admissão</dt>
          <dd class="mt-0.5 text-zinc-800 dark:text-zinc-100">{{ formatDate(record.dataAdmissao) }}</dd>
        </div>
        <div>
          <dt class="text-xs font-semibold uppercase tracking-wide text-zinc-400">Data de demissão</dt>
          <dd class="mt-0.5 text-zinc-800 dark:text-zinc-100">{{ formatDate(record.dataDemissao) }}</dd>
        </div>
        <div>
          <dt class="text-xs font-semibold uppercase tracking-wide text-zinc-400">Filial</dt>
          <dd class="mt-0.5 text-zinc-800 dark:text-zinc-100">{{ record.filial || "—" }}</dd>
        </div>
        <div>
          <dt class="text-xs font-semibold uppercase tracking-wide text-zinc-400">Estado</dt>
          <dd class="mt-0.5 text-zinc-800 dark:text-zinc-100">{{ record.estado || "—" }}</dd>
        </div>
        <div class="col-span-2">
          <dt class="text-xs font-semibold uppercase tracking-wide text-zinc-400">Tempo de permanência</dt>
          <dd class="mt-0.5 text-zinc-800 dark:text-zinc-100">
            {{ days !== null ? `${days.toFixed(1)} dias` : "—" }}
          </dd>
        </div>
      </dl>

      <div v-if="canEdit" class="flex justify-end gap-2 border-t border-zinc-100 pt-3 dark:border-zinc-800">
        <button type="button" class="btn-danger-ghost" @click="remove">Excluir</button>
        <button type="button" class="btn-primary" @click="edit">Editar</button>
      </div>
    </div>

    <div v-else class="py-6 text-center text-sm text-zinc-500 dark:text-zinc-400">Registro não encontrado.</div>
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
