<script setup>
import { reactive, ref, computed, watch } from "vue";
import Modal from "@/components/ui/Modal.vue";
import { STATES, STATE_NAMES } from "@/lib/config";
import { getHeadcountById } from "@/lib/store";
import { updateHeadcountRecord } from "@/lib/employees";
import { listBranches } from "@/lib/filiais";
import { hydrateState } from "@/lib/db";
import { maskCurrencyInput, normalizeCurrencyInput, parseCurrencyBR } from "@/lib/utils";
import { useToast } from "@/composables/useToast";

/* Modal dedicado à edição de um colaborador do Headcount — autocontido (não
   depende de nenhum modal "pai" ficar aberto ou fechado certo). Substitui o
   antigo botão "Editar" (que abria o formulário de Headcount dentro do
   Lançamento, via vários estados espalhados entre componentes — CockpitPanel,
   DashboardView e HeadcountEstadoModal precisavam concordar sobre qual modal
   fechar antes de qual abrir, e um deles ficava pra trás). Agora clicar no
   nome do colaborador abre isto direto, com o registro já carregado. */
const props = defineProps({
  open: { type: Boolean, default: false },
  recordId: { type: String, default: null }
});
const emit = defineEmits(["close", "saved"]);

const { show: toast } = useToast();

const form = reactive({
  colaborador: "",
  funcao: "",
  remuneracao: "",
  dataAdmissao: "",
  filial: null,
  estado: ""
});

function loadRecord(id) {
  const h = id ? getHeadcountById(id) : null;
  if (!h) return;
  form.colaborador = h.colaborador || "";
  form.funcao = h.funcao || "";
  form.remuneracao = h.remuneracao != null ? normalizeCurrencyInput(String(h.remuneracao)) : "";
  form.dataAdmissao = h.dataAdmissao ? String(h.dataAdmissao).slice(0, 10) : "";
  form.filial = h.filial || null;
  form.estado = h.estado || "";
}

/* Recarrega sempre que abre (não só quando o id muda) — reabrir pra editar
   outro colaborador troca o id, mas reabrir o MESMO logo depois de salvar
   também deve trazer os dados mais recentes. */
watch(
  () => [props.open, props.recordId],
  ([open, id]) => {
    if (open) loadRecord(id);
  },
  { immediate: true }
);

/* Filiais do estado do colaborador — recarrega ao trocar de estado no form. */
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
    if (form.filial && !branches.value.some((b) => b.shortName === form.filial)) {
      form.filial = null;
    }
  }
);

function onSalaryInput(ev) {
  form.remuneracao = maskCurrencyInput(ev.target.value);
}
function onSalaryBlur() {
  form.remuneracao = normalizeCurrencyInput(form.remuneracao);
}

const saving = ref(false);

async function submit() {
  const nome = form.colaborador.trim();
  if (!nome) return toast("Informe o colaborador.");
  if (!form.dataAdmissao) return toast("Informe a data de admissão.");
  const remuneracaoText = normalizeCurrencyInput(form.remuneracao);
  const remuneracao = remuneracaoText === "" ? null : parseCurrencyBR(remuneracaoText);
  if (remuneracao !== null && isNaN(remuneracao)) return toast("Informe uma remuneração válida (R$).");

  saving.value = true;
  try {
    updateHeadcountRecord(props.recordId, {
      colaborador: nome,
      funcao: form.funcao,
      remuneracao,
      dataAdmissao: form.dataAdmissao,
      mesReferencia: String(form.dataAdmissao).slice(0, 7),
      filial: form.filial,
      estado: form.estado
    });
    toast(`Headcount atualizado para ${nome}.`);
    emit("saved");
    emit("close");
  } finally {
    saving.value = false;
  }
}
</script>

<template>
  <Modal title="Editar colaborador" :open="open" max-width="max-w-2xl" @close="emit('close')">
    <div class="flex flex-col gap-4">
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
          <select id="hcEditEstado" v-model="form.estado" class="input-field">
            <option v-for="s in STATES" :key="s" :value="s">{{ s }} — {{ STATE_NAMES[s] }}</option>
          </select>
        </div>
        <div class="flex flex-col gap-1.5">
          <label for="hcEditFilial" class="text-sm font-medium text-zinc-700 dark:text-zinc-200">Empresa</label>
          <select id="hcEditFilial" v-model="form.filial" class="input-field">
            <option :value="null">— Sem empresa —</option>
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
          <label for="hcEditRemuneracao" class="text-sm font-medium text-zinc-700 dark:text-zinc-200">Remuneração (R$)</label>
          <input
            id="hcEditRemuneracao"
            class="input-field text-right tabular-nums"
            type="text"
            inputmode="decimal"
            autocomplete="off"
            placeholder="0,00"
            :value="form.remuneracao"
            @input="onSalaryInput"
            @blur="onSalaryBlur"
          />
        </div>
      </div>

      <div class="flex justify-end gap-2 border-t border-zinc-100 pt-3 dark:border-zinc-800">
        <button type="button" class="btn-ghost" @click="emit('close')">Cancelar</button>
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
