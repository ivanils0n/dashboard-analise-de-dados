<script setup>
import { computed, ref, watch, onBeforeUnmount, onMounted } from "vue";
import EmptyState from "@/components/ui/EmptyState.vue";
import OcorrenciaModal from "@/components/dashboard/OcorrenciaModal.vue";
import { saveOcorrencia, removeOcorrencia } from "@/lib/store";
import { MOTIVOS, FLAGS, PRESENTE, cellInfo, monthRange, monthDays, monthEmployees, useOcorrenciaIndex } from "@/lib/absenteismo";
import { formatDate, ymLabel, normalizeText } from "@/lib/utils";
import { useToast } from "@/composables/useToast";
import { canEditData } from "@/lib/auth";

/* Mapa de absenteísmo: colaboradores nas linhas, dias do mês filtrado nas
   colunas. Clicar numa célula abre o lançamento da ocorrência daquele dia. */
const props = defineProps({
  estado: { type: String, default: "todos" },
  /* Mês de referência (YYYY-MM): o mês filtrado no dashboard. */
  ym: { type: String, required: true }
});

const { show: toast } = useToast();
const canEdit = canEditData();

const inputCls =
  "h-9 rounded-lg border border-zinc-200 bg-zinc-50 px-3 text-[13px] text-zinc-800 outline-none transition placeholder:text-zinc-400 focus:border-accent focus:ring-2 focus:ring-accent/20 dark:border-zinc-700/70 dark:bg-zinc-800/50 dark:text-zinc-200 dark:placeholder:text-zinc-500 dark:[color-scheme:dark]";

const search = ref("");
const setor = ref("");
const filial = ref("");

const period = computed(() => monthRange(props.ym));
const days = computed(() => monthDays(period.value));
const employees = computed(() => monthEmployees(props.estado, props.ym, period.value));
const index = useOcorrenciaIndex();

const setores = computed(() => {
  const set = new Set(employees.value.map((e) => e.setorKey).filter(Boolean));
  return [...set].sort((a, b) => a.localeCompare(b, "pt-BR"));
});
watch(setores, (opts) => {
  if (setor.value && !opts.includes(setor.value)) setor.value = "";
});

const filiais = computed(() => {
  const set = new Set(employees.value.map((e) => e.filialKey).filter(Boolean));
  return [...set].sort((a, b) => a.localeCompare(b, "pt-BR"));
});
watch(filiais, (opts) => {
  if (filial.value && !opts.includes(filial.value)) filial.value = "";
});

/* Busca com atraso: refiltrar milhares de linhas a cada tecla travava a digitação. */
const searchDebounced = ref("");
let searchTimer = null;
watch(search, (v) => {
  clearTimeout(searchTimer);
  searchTimer = setTimeout(() => (searchDebounced.value = v), 200);
});
onBeforeUnmount(() => clearTimeout(searchTimer));

const rows = computed(() => {
  const q = normalizeText(searchDebounced.value).trim();
  return employees.value.filter(
    (e) =>
      (!q || e.busca.includes(q)) &&
      (!setor.value || e.setorKey === setor.value) &&
      (!filial.value || e.filialKey === filial.value)
  );
});

/* Rolagem virtual: com milhares de colaboradores só as linhas visíveis (mais uma
   folga) existem no DOM; o resto vira dois espaçadores com a altura delas. */
const ROW_H = 40;
const OVERSCAN = 6;
const scroller = ref(null);
const scrollTop = ref(0);
const viewH = ref(480);
let raf = 0;
function onScroll(e) {
  const top = e.target.scrollTop;
  if (raf) return;
  raf = requestAnimationFrame(() => {
    raf = 0;
    scrollTop.value = top;
  });
}

/* A tabela ocupa o espaço que sobra na página: acompanha o tamanho real. */
let observer = null;
onMounted(() => {
  if (typeof ResizeObserver === "undefined") return;
  observer = new ResizeObserver(() => {
    if (scroller.value) viewH.value = scroller.value.clientHeight || viewH.value;
  });
  watch(
    scroller,
    (el) => {
      observer.disconnect();
      if (el) observer.observe(el);
    },
    { immediate: true }
  );
});
onBeforeUnmount(() => {
  if (observer) observer.disconnect();
  if (raf) cancelAnimationFrame(raf);
});

watch([() => props.ym, () => props.estado, setor, filial, searchDebounced], () => {
  scrollTop.value = 0;
  if (scroller.value) scroller.value.scrollTop = 0;
});
const range = computed(() => {
  const total = rows.value.length;
  const first = Math.max(0, Math.floor(scrollTop.value / ROW_H) - OVERSCAN);
  const last = Math.min(total, Math.ceil((scrollTop.value + viewH.value) / ROW_H) + OVERSCAN);
  return { first, last, top: first * ROW_H, bottom: (total - last) * ROW_H };
});
const visibleRows = computed(() => rows.value.slice(range.value.first, range.value.last));

function cellOf(emp, iso) {
  const o = index.value.get(`${emp.nome}|${iso}`);
  return o ? cellInfo(o.meta) : null;
}

const isDesligado = (emp, iso) => !!emp.desligamento && iso >= emp.desligamento;

/* Lançamento */
const editing = ref(null); // { emp, iso }
const editingCurrent = computed(() =>
  editing.value ? index.value.get(`${editing.value.emp.nome}|${editing.value.iso}`) || null : null
);

function openCell(emp, iso) {
  if (!canEdit) {
    toast("Seu perfil tem acesso somente leitura.");
    return;
  }
  if (isDesligado(emp, iso)) {
    toast("Colaborador desligado nesta data.", "error");
    return;
  }
  editing.value = { emp, iso };
}

function onSave({ motivo, observacao, advertencia, acidente }) {
  const { emp, iso } = editing.value;
  saveOcorrencia({
    date: iso,
    colaborador: emp.nome,
    setor: emp.setor,
    filial: emp.filial,
    motivo,
    observacao,
    advertencia,
    acidente,
    estado: emp.estado
  });
  editing.value = null;
}

function onClear() {
  const { emp, iso } = editing.value;
  removeOcorrencia(iso, emp.nome);
  editing.value = null;
}
</script>

<template>
  <div class="flex h-full min-h-0 flex-col gap-3">
    <div class="flex flex-wrap items-center gap-2">
      <input v-model="search" type="search" :class="[inputCls, 'w-full sm:w-64']" placeholder="Buscar colaborador..." aria-label="Buscar colaborador" />
      <select v-model="setor" :class="inputCls" aria-label="Filtrar por setor">
        <option value="">Todos os setores</option>
        <option v-for="s in setores" :key="s" :value="s">{{ s }}</option>
      </select>
      <select v-model="filial" :class="inputCls" aria-label="Filtrar por filial">
        <option value="">Todas as filiais</option>
        <option v-for="f in filiais" :key="f" :value="f">{{ f }}</option>
      </select>
      <slot name="after-filters" />
      <span class="text-xs font-medium tabular-nums text-zinc-400 dark:text-zinc-500">
        {{ ymLabel(ym) }} · {{ rows.length }} colaboradores
      </span>
      <div class="ml-auto flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] font-medium text-zinc-500 dark:text-zinc-400">
        <span v-for="m in MOTIVOS" :key="m.value" class="flex items-center gap-1.5">
          <span class="h-2 w-2 rounded-full" :class="m.dot"></span>
          {{ m.label }}
        </span>
        <span v-for="f in FLAGS" :key="f.key" class="flex items-center gap-1.5">
          <span class="h-2 w-2 rounded-full" :class="f.dot"></span>
          {{ f.label }}
        </span>
        <span class="flex items-center gap-1.5">
          <span class="h-2 w-2 rounded-full" :class="PRESENTE.dot"></span>
          {{ PRESENTE.label }}
        </span>
        <span class="flex items-center gap-1.5 font-semibold text-rose-500 dark:text-rose-400">
          <span class="h-2 w-2 rounded-full bg-rose-500"></span>
          Desligado
        </span>
      </div>
    </div>

    <div
      v-if="rows.length"
      class="min-h-0 flex-1 overflow-hidden rounded-xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900"
    >
      <div ref="scroller" class="h-full overflow-auto" @scroll.passive="onScroll">
        <table class="w-full border-separate border-spacing-0 text-center">
          <thead class="sticky top-0 z-20">
            <tr>
              <th
                class="sticky left-0 z-30 min-w-[15rem] border-b border-r border-zinc-200 bg-white px-4 py-2 text-left text-[10px] font-semibold uppercase tracking-wider text-zinc-400 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-500"
              >
                Colaborador
              </th>
              <th
                v-for="d in days"
                :key="d.iso"
                class="min-w-[2.25rem] border-b border-r border-zinc-200 bg-white px-0 py-1.5 dark:border-zinc-700 dark:bg-zinc-900"
              >
                <div class="text-[9px] font-medium uppercase tracking-wide" :class="d.sunday ? 'text-rose-400' : 'text-zinc-400 dark:text-zinc-500'">
                  {{ d.weekday }}
                </div>
                <div class="text-[13px] font-semibold tabular-nums" :class="d.sunday ? 'text-rose-500' : 'text-zinc-700 dark:text-zinc-200'">
                  {{ d.day }}
                </div>
              </th>
            </tr>
          </thead>
          <tbody>
            <tr v-if="range.top" aria-hidden="true"><td :colspan="days.length + 1" :style="{ height: range.top + 'px', padding: 0 }"></td></tr>
            <tr v-for="emp in visibleRows" :key="emp.nome" class="group" :style="{ height: ROW_H + 'px' }">
              <td
                class="sticky left-0 z-10 border-b border-r border-zinc-200 px-4 text-left dark:border-zinc-700"
                :class="emp.desligamento ? 'bg-rose-50 dark:bg-[#2b171b]' : 'bg-white group-hover:bg-zinc-50 dark:bg-zinc-900 dark:group-hover:bg-zinc-800'"
              >
                <div class="flex max-w-[14rem] items-center gap-1.5">
                  <span class="truncate text-xs font-semibold uppercase" :class="emp.desligamento ? 'text-rose-700 dark:text-rose-300' : 'text-zinc-800 dark:text-zinc-100'">{{ emp.nome }}</span>
                  <span
                    v-if="emp.desligamento"
                    class="shrink-0 rounded bg-rose-500 px-1 py-px text-[9px] font-bold uppercase leading-tight text-white"
                    :title="`Desligado em ${formatDate(emp.desligamento)}`"
                  >
                    Deslig. {{ formatDate(emp.desligamento).slice(0, 5) }}
                  </span>
                </div>
                <div class="max-w-[14rem] truncate text-[10px] uppercase text-zinc-400 dark:text-zinc-500">{{ emp.setor || "—" }}</div>
              </td>
              <td
                v-for="d in days"
                :key="d.iso"
                class="border-b border-r border-zinc-200 p-0 group-hover:bg-zinc-50 dark:border-zinc-700 dark:group-hover:bg-zinc-800"
                :class="isDesligado(emp, d.iso) ? 'bg-rose-100 bg-[repeating-linear-gradient(135deg,transparent_0_5px,rgba(244,63,94,0.22)_5px_6px)] dark:bg-[#451a21]' : d.sunday && 'bg-zinc-50 dark:bg-white/[0.02]'"
              >
                <button
                  type="button"
                  class="cell flex h-[39px] w-full items-center justify-center"
                  :class="canEdit && !isDesligado(emp, d.iso) ? 'cursor-pointer' : 'cursor-default'"
                  :aria-label="`${emp.nome}, ${formatDate(d.iso)}`"
                  :title="index.get(`${emp.nome}|${d.iso}`)?.meta.observacao || ''"
                  @click="openCell(emp, d.iso)"
                >
                  <span
                    v-if="cellOf(emp, d.iso)"
                    class="relative flex h-6 w-6 items-center justify-center rounded-md text-[11px] font-bold"
                    :class="cellOf(emp, d.iso).primary.chip"
                  >
                    {{ cellOf(emp, d.iso).primary.letter }}
                    <span
                      v-for="(f, i) in cellOf(emp, d.iso).flags"
                      :key="f.key"
                      class="absolute -right-1 h-2.5 w-2.5 rounded-full ring-2 ring-white dark:ring-zinc-900"
                      :class="[f.dot, i ? 'top-2.5' : '-top-1']"
                      :title="f.label"
                    ></span>
                  </span>
                </button>
              </td>
            </tr>
            <tr v-if="range.bottom" aria-hidden="true"><td :colspan="days.length + 1" :style="{ height: range.bottom + 'px', padding: 0 }"></td></tr>
          </tbody>
        </table>
      </div>
    </div>
    <EmptyState
      v-else
      title="Nenhum colaborador encontrado"
      text="Sem colaboradores no Headcount para este mês, busca ou setor."
    />

    <OcorrenciaModal
      v-if="editing"
      :open="!!editing"
      :colaborador="editing.emp.nome"
      :date="editing.iso"
      :current="editingCurrent"
      @close="editing = null"
      @save="onSave"
      @clear="onClear"
    />
  </div>
</template>

<style scoped>
.cell:hover span {
  filter: brightness(0.95);
}
.cell:focus-visible {
  outline: 2px solid #e8af3e;
  outline-offset: -2px;
}
</style>
