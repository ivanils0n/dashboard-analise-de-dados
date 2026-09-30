<script setup>
import { reactive, ref, computed, watch, nextTick } from "vue";
import Modal from "@/components/ui/Modal.vue";
import { STATES, STATE_NAMES } from "@/lib/config";
import { getHeadcountById } from "@/lib/store";
import { updateHeadcountRecord } from "@/lib/employees";
import { listBranches } from "@/lib/filiais";
import { hydrateState } from "@/lib/db";
import { useToast } from "@/composables/useToast";
import { useUnsavedGuard } from "@/composables/useUnsavedGuard";

const props = defineProps({
  open: { type: Boolean, default: false },
  recordId: { type: String, default: null }
});
const emit = defineEmits(["close", "saved"]);

const { show: toast } = useToast();

const form = reactive({
  codigo: "",
  genero: "",
  dataDesligamento: "",
  mesReferente: "",
  colaborador: "",
  funcao: "",
  dataAdmissao: "",
  empresa: "",
  filial: null,
  estado: ""
});
const filialOriginal = ref(null);

const unsaved = useUnsavedGuard(() => form);

function loadRecord(id) {
  const h = id ? getHeadcountById(id) : null;
  if (!h) return;
  form.codigo = h.codigo || "";
  form.genero = h.genero || "";
  form.dataDesligamento = h.dataDesligamento ? String(h.dataDesligamento).slice(0, 10) : "";
  form.mesReferente = h.mesReferente ? String(h.mesReferente).slice(0, 7) : "";
  form.colaborador = h.colaborador || "";
  form.funcao = h.funcao || "";
  form.dataAdmissao = h.dataAdmissao ? String(h.dataAdmissao).slice(0, 10) : "";
  form.empresa = h.empresa || "";
  form.filial = h.filial || null;
  filialOriginal.value = form.filial;
  form.estado = h.estado || "";
}

watch(
  () => [props.open, props.recordId],
  ([open, id]) => {
    if (open) {
      loadRecord(id);
      nextTick(unsaved.markClean);
    } else {
      unsaved.reset();
    }
  },
  { immediate: true }
);

async function requestClose() {
  if (!(await unsaved.confirmDiscard())) return;
  emit("close");
}

const branches = computed(() => listBranches(form.estado || "todos"));
watch(
  () => form.estado,
  async (estado) => {
    if (!estado) return;
    try {
      await hydrateState(estado);
    } catch (err) {
      console.warn("[HeadcountEditModal] Falha ao carregar filiais do estado:", err);
    }
  }
);

const filialOriginalForaDaLista = computed(
  () => !!filialOriginal.value && !branches.value.some((b) => b.shortName === filialOriginal.value)
);

function onEstadoChange() {
  if (form.filial && !branches.value.some((b) => b.shortName === form.filial)) form.filial = null;
}

const saving = ref(false);

async function submit() {
  const nome = form.colaborador.trim();
  if (!nome) return toast("Informe o colaborador.");
  if (!form.dataAdmissao) return toast("Informe a data de admissão.");
  if (!form.mesReferente) return toast("Informe o mês referente.");

  saving.value = true;
  try {
    updateHeadcountRecord(props.recordId, {
      codigo: form.codigo.trim(),
      genero: form.genero,
      dataDesligamento: form.dataDesligamento,
      mesReferente: form.mesReferente,
      colaborador: nome,
      funcao: form.funcao,
      dataAdmissao: form.dataAdmissao,
      empresa: form.empresa,
      filial: form.filial,
      estado: form.estado
    });
    toast(`Colaborador ${nome} atualizado com sucesso!`, "success");
    emit("saved");
    emit("close");
  } finally {
    saving.value = false;
  }
}
</script>

<template>
  <Modal title="Editar colaborador" :open="open" max-width="max-w-2xl" @close="requestClose">
    <div class="flex flex-col gap-4">
      <div class="grid gap-4 sm:grid-cols-3">
      <div class="flex flex-col gap-1.5">
        <label for="hcEditCodigo" class="text-sm font-medium text-zinc-700 dark:text-zinc-200">Código</label>
        <input id="hcEditCodigo" v-model="form.codigo" type="text" class="input-field" />
      </div>
      <div class="flex flex-col gap-1.5">
        <label for="hcEditGenero" class="text-sm font-medium text-zinc-700 dark:text-zinc-200">Gênero</label>
        <select id="hcEditGenero" v-model="form.genero" class="input-field">
          <option value="">— Não informado —</option>
          <option value="masculino">Masculino</option>
          <option value="feminino">Feminino</option>
        </select>
      </div>
      <div class="flex flex-col gap-1.5">
        <label for="hcEditMes" class="text-sm font-medium text-zinc-700 dark:text-zinc-200">Mês referente</label>
        <input id="hcEditMes" v-model="form.mesReferente" type="month" class="input-field" required />
      </div>
    </div>

      <div class="flex flex-col gap-1.5">
        <label for="hcEditColaborador" class="text-sm font-medium text-zinc-700 dark:text-zinc-200">Colaborador</label>
        <input id="hcEditColaborador" v-model="form.colaborador" type="text" class="input-field uppercase" placeholder="Nome do colaborador" />
      </div>

      <div class="flex flex-col gap-1.5">
        <label for="hcEditFuncao" class="text-sm font-medium text-zinc-700 dark:text-zinc-200">Função</label>
        <input id="hcEditFuncao" v-model="form.funcao" type="text" class="input-field uppercase" />
      </div>

      <div class="grid gap-4 sm:grid-cols-2">
        <div class="flex flex-col gap-1.5">
          <label for="hcEditEstado" class="text-sm font-medium text-zinc-700 dark:text-zinc-200">Estado</label>
          <select id="hcEditEstado" v-model="form.estado" class="input-field" @change="onEstadoChange">
            <option v-for="s in STATES" :key="s" :value="s">{{ s }} — {{ STATE_NAMES[s] }}</option>
          </select>
        </div>
        <div class="flex flex-col gap-1.5">
          <label for="hcEditEmpresa" class="text-sm font-medium text-zinc-700 dark:text-zinc-200">Empresa</label>
          <input id="hcEditEmpresa" v-model="form.empresa" type="text" class="input-field uppercase" />
        </div>
        <div class="flex flex-col gap-1.5">
          <label for="hcEditFilial" class="text-sm font-medium text-zinc-700 dark:text-zinc-200">Filial</label>
          <select id="hcEditFilial" v-model="form.filial" class="input-field">
            <option :value="null">— Sem filial —</option>
            <option v-if="filialOriginalForaDaLista" :value="filialOriginal">{{ filialOriginal }} (atual)</option>
            <option v-for="b in branches" :key="b.id" :value="b.shortName">{{ b.shortName }} — {{ b.name }}</option>
          </select>
        </div>
      </div>

      <div class="grid gap-4 sm:grid-cols-2">
        <div class="flex flex-col gap-1.5">
          <label for="hcEditAdmissao" class="text-sm font-medium text-zinc-700 dark:text-zinc-200">Data de admissão</label>
          <input id="hcEditAdmissao" v-model="form.dataAdmissao" type="date" class="input-field" />
        </div>
        <div class="flex flex-col gap-1.5">
          <label for="hcEditDesligamento" class="text-sm font-medium text-zinc-700 dark:text-zinc-200">Data de desligamento</label>
          <input id="hcEditDesligamento" v-model="form.dataDesligamento" type="date" class="input-field" />
        </div>
      </div>

      <div class="flex justify-end gap-2 border-t border-zinc-100 pt-3 dark:border-zinc-800">
        <button type="button" class="btn-ghost" @click="requestClose">Cancelar</button>
        <button type="button" class="btn-primary" :disabled="saving" @click="submit">Salvar alterações</button>
      </div>
    </div>
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
.btn-primary:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}
.btn-ghost {
  border-radius: 0.5rem;
  border: 1px solid rgb(212 212 216);
  padding: 0.5rem 1rem;
  font-size: 0.875rem;
  font-weight: 500;
  color: rgb(63 63 70);
  transition: background-color 0.15s;
}
.btn-ghost:hover {
  background-color: rgb(244 244 245);
}
:global(.dark) .btn-ghost {
  border-color: rgb(63 63 70);
  color: rgb(228 228 231);
}
:global(.dark) .btn-ghost:hover {
  background-color: rgb(39 39 42);
}
</style>
