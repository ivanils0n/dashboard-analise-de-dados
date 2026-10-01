<script setup>
import Modal from "@/components/ui/Modal.vue";
import { formatDate } from "@/lib/utils";

defineProps({
  open: { type: Boolean, default: false },
  record: { type: Object, default: null }
});

defineEmits(["close"]);
</script>

<template>
  <Modal title="Detalhes do colaborador" :open="open" max-width="max-w-lg" @close="$emit('close')">
    <div v-if="record" class="flex flex-col gap-4">
      <h3 class="text-lg font-bold text-zinc-900 dark:text-zinc-100">{{ record.colaborador }}</h3>

      <dl class="grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
        <div>
          <dt class="text-xs font-semibold uppercase tracking-wide text-zinc-400">Data de admissão</dt>
          <dd class="mt-0.5 text-zinc-800 dark:text-zinc-100">{{ formatDate(record.dataAdmissao) }}</dd>
        </div>
        <div>
          <dt class="text-xs font-semibold uppercase tracking-wide text-zinc-400">Data de desligamento</dt>
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
            {{ record.dias != null ? `${record.dias.toFixed(1)} dias` : "—" }}
          </dd>
        </div>
      </dl>
    </div>

    <div v-else class="py-6 text-center text-sm text-zinc-500 dark:text-zinc-400">Registro não encontrado.</div>
  </Modal>
</template>
