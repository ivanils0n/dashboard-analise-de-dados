<script setup>
import { reactive, computed, watch } from "vue";
import Modal from "@/components/ui/Modal.vue";
import { getIndicatorById, ABSENTEEISM_OPTIONS, ABSENTEEISM_TYPES } from "@/lib/config";
import { updateEntry } from "@/lib/store";
import {
  parseCurrencyBR,
  parseHoursBR,
  currentYm,
  yearOptions,
  MONTHS_SHORT
} from "@/lib/utils";
import { useToast } from "@/composables/useToast";

const props = defineProps({
  open: { type: Boolean, default: false },
  indicatorId: { type: String, required: true },
  entry: { type: Object, required: true }
});

const emit = defineEmits(["close", "saved"]);
const { show: toast } = useToast();

const indicator = computed(() => getIndicatorById(props.indicatorId) || { id: props.indicatorId, type: "number" });
/* Todo indicador lançado por competência (mês/ano) — não mais por dia
   exato — edita a data como mês/ano aqui também. */
const MONTHLY_FORMS = ["custo_total", "treinamento", "diaria", "mensal"];
const usesMonth = computed(() => MONTHLY_FORMS.includes(indicator.value.form));

const form = reactive({
  date: "",
  month: currentYm(),
  value: "",
  meta: {}
});

const DATE_KEYS = ["inicio", "fim", "periodEnd"];

function load() {
  form.date = props.entry.date || "";
  form.month = props.entry.date ? String(props.entry.date).slice(0, 7) : currentYm();
  form.value =
    props.entry.value === null || props.entry.value === undefined ? "" : String(props.entry.value);
  const meta = props.entry.meta && typeof props.entry.meta === "object" ? props.entry.meta : {};
  const out = {};
  Object.keys(meta).forEach((k) => {
    if (["estado", "employeeId", "employeeName", "competencia"].includes(k)) return;
    const v = meta[k];
    out[k] = v === null || v === undefined ? "" : String(v);
  });
  form.meta = out;
}

watch(
  () => props.entry,
  () => load(),
  { immediate: true }
);

const custosYearOptions = yearOptions(4, 1);
const custosMonthNum = computed(() =>
  form.month ? Number(form.month.split("-")[1]) : new Date().getMonth() + 1
);
const custosYearNum = computed(() =>
  form.month ? Number(form.month.split("-")[0]) : new Date().getFullYear()
);
function setMonth(m) {
  form.month = `${custosYearNum.value}-${String(m).padStart(2, "0")}`;
}
function setYear(y) {
  form.month = `${y}-${String(custosMonthNum.value).padStart(2, "0")}`;
}

/* Treinamento: a carga horária é o próprio "Valor (horas)" (é ele que entra na
   soma do KPI e dos gráficos); meta.cargaHoraria é só uma cópia para a tabela
   de lançamentos. Não é editável à parte — senão as duas divergem — e é
   regravada a partir do valor em save(). */
const isTreinamento = computed(() => indicator.value.form === "treinamento");

function metaKeys() {
  return Object.keys(form.meta).filter((k) => !(isTreinamento.value && k === "cargaHoraria"));
}
function metaIsDate(key) {
  return DATE_KEYS.includes(key);
}
function metaIsNumber(key) {
  const v = form.meta[key];
  return key === "percent" || key === "cargaHoraria" || (!isNaN(Number(v)) && v !== "" && !metaIsDate(key) && key !== "type");
}
function metaLabel(key) {
  const labels = {
    type: "Motivo/Tipo",
    tema: "Tema",
    cargaHoraria: "Carga horária",
    modalidade: "Modalidade",
    pagamento: "Pagamento",
    motivo: "Motivo",
    departamento: "Departamento",
    filial: "Filial",
    liderImediato: "Líder imediato",
    gerenteRegional: "Gerente regional",
    regional: "Regional",
    cargo: "Cargo",
    inicio: "Início",
    fim: "Fim",
    periodEnd: "Fim do período",
    percent: "Percentual (%)",
    razaoSocial: "Razão social",
    cnpj: "CNPJ",
    shortName: "Abreviatura"
  };
  return labels[key] || key;
}

function parseValue() {
  const type = indicator.value.type;
  if (type === "currency") return parseCurrencyBR(form.value);
  if (type === "hours") return parseHoursBR(form.value);
  const n = Number(String(form.value).replace(",", "."));
  return isNaN(n) ? NaN : n;
}

function save() {
  const value = parseValue();
  /* parseHoursBR/parseCurrencyBR devolvem null (não NaN) para texto inválido. */
  if (value === null || isNaN(value) || value < 0) {
    toast("Informe um valor válido.");
    return;
  }

  /* Campos que o formulário não mostra (ver load) precisam ser preservados:
     updateEntry substitui o meta inteiro, e sem `estado` o lançamento some dos
     filtros por estado (getEntriesFor), sem `employeeName` some dos totais por
     colaborador. */
  const original = props.entry.meta && typeof props.entry.meta === "object" ? props.entry.meta : {};
  const meta = {};
  ["estado", "employeeId", "employeeName", "competencia"].forEach((k) => {
    if (original[k] !== undefined) meta[k] = original[k];
  });
  metaKeys().forEach((k) => {
    const raw = form.meta[k];
    if (raw === "" || raw === null || raw === undefined) {
      meta[k] = null;
      return;
    }
    if (k === "type") meta[k] = raw;
    else if (metaIsNumber(k)) meta[k] = Number(String(raw).replace(",", "."));
    else meta[k] = String(raw).toUpperCase();
  });

  const date = usesMonth.value ? `${form.month}-01` : form.date;
  if (!date) {
    toast("Informe a data.");
    return;
  }
  if (usesMonth.value) meta.competencia = form.month;
  if (isTreinamento.value) meta.cargaHoraria = value;

  updateEntry(props.indicatorId, props.entry.id, { date, value, meta });
  emit("saved");
  toast("Lançamento atualizado.");
  emit("close");
}
</script>

<template>
  <Modal
    :open="open"
    :title="`Editar lançamento — ${indicator.name || ''}`"
    subtitle="Altere a data/período, o valor e os campos do registro."
    max-width="max-w-2xl"
    @close="emit('close')"
  >
    <form class="flex flex-col gap-4" novalidate @submit.prevent="save">
      <!-- Custos Totais / Treinamento: competência mês/ano -->
      <div v-if="usesMonth" class="grid gap-4 sm:grid-cols-3">
        <div class="flex flex-col gap-1.5">
          <label class="text-sm font-medium text-zinc-700 dark:text-zinc-200">Mês</label>
          <select class="input-field" :value="custosMonthNum" @change="setMonth(Number($event.target.value))">
            <option v-for="(mName, i) in MONTHS_SHORT" :key="i + 1" :value="i + 1">{{ mName }}</option>
          </select>
        </div>
        <div class="flex flex-col gap-1.5">
          <label class="text-sm font-medium text-zinc-700 dark:text-zinc-200">Ano</label>
          <select class="input-field" :value="custosYearNum" @change="setYear(Number($event.target.value))">
            <option v-for="y in custosYearOptions" :key="y" :value="y">{{ y }}</option>
          </select>
        </div>
        <div class="flex flex-col gap-1.5">
          <label class="text-sm font-medium text-zinc-700 dark:text-zinc-200">
            Valor{{ indicator.type === "currency" ? " (R$)" : indicator.type === "hours" ? " (horas)" : indicator.unit ? ` (${indicator.unit})` : "" }}
          </label>
          <input v-model="form.value" type="text" inputmode="decimal" class="input-field text-right tabular-nums" :placeholder="indicator.type === 'currency' ? '0,00' : '0'" />
        </div>
      </div>

      <!-- Demais indicadores: data exata + valor -->
      <div v-else class="grid gap-4 sm:grid-cols-2">
        <div class="flex flex-col gap-1.5">
          <label class="text-sm font-medium text-zinc-700 dark:text-zinc-200">Data</label>
          <input v-model="form.date" type="date" class="input-field" />
        </div>
        <div class="flex flex-col gap-1.5">
          <label class="text-sm font-medium text-zinc-700 dark:text-zinc-200">
            Valor{{ indicator.type === "currency" ? " (R$)" : indicator.type === "hours" ? " (horas)" : "" }}
          </label>
          <input v-model="form.value" type="text" inputmode="decimal" class="input-field" placeholder="0" />
        </div>
      </div>

      <!-- Campos do meta -->
      <div v-if="metaKeys().length" class="grid gap-4 sm:grid-cols-2">
        <div v-for="key in metaKeys()" :key="key" class="flex flex-col gap-1.5">
          <label class="text-sm font-medium text-zinc-700 dark:text-zinc-200">{{ metaLabel(key) }}</label>
          <select v-if="key === 'type'" v-model="form.meta[key]" class="input-field">
            <option v-for="opt in ABSENTEEISM_OPTIONS" :key="opt" :value="opt">{{ ABSENTEEISM_TYPES[opt] }}</option>
          </select>
          <input v-else-if="metaIsDate(key)" v-model="form.meta[key]" type="date" class="input-field" />
          <input v-else-if="metaIsNumber(key)" v-model="form.meta[key]" type="text" inputmode="decimal" class="input-field" />
          <input v-else v-model="form.meta[key]" v-upper type="text" class="input-field" />
        </div>
      </div>

      <div class="flex justify-end gap-2 border-t border-zinc-100 pt-4 dark:border-zinc-800">
        <button type="button" class="btn-ghost" @click="emit('close')">Cancelar</button>
        <button type="submit" class="btn-primary">Salvar alterações</button>
      </div>
    </form>
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
