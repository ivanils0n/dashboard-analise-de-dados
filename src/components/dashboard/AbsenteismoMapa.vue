<script setup>
import { computed, ref, watch, nextTick, onBeforeUnmount, onMounted } from "vue";
import EmptyState from "@/components/ui/EmptyState.vue";
import OcorrenciaModal from "@/components/dashboard/OcorrenciaModal.vue";
import { saveOcorrencia, removeOcorrencia, getOcorrencias } from "@/lib/store";
import {
  MOTIVOS,
  FLAGS,
  PRESENTE,
  cellInfo,
  isoOf,
  monthRange,
  monthDays,
  monthEmployees,
  headcountMonthFor,
  competenciaYm,
  useOcorrenciaIndex
} from "@/lib/absenteismo";
import { formatDate, ymLabel, normalizeText, nameKey } from "@/lib/utils";
import { useToast } from "@/composables/useToast";
import { canEditData } from "@/lib/auth";

const props = defineProps({
  estado: { type: String, default: "todos" },
  ym: { type: String, required: true }
});

const { show: toast } = useToast();
const canEdit = canEditData();

const inputCls =
  "h-10 rounded-lg border border-zinc-200 bg-zinc-50 px-3 text-[13px] text-zinc-800 outline-none transition placeholder:text-zinc-400 focus:border-accent focus:ring-2 focus:ring-accent/20 dark:border-zinc-700/70 dark:bg-zinc-800/50 dark:text-zinc-200 dark:placeholder:text-zinc-500 dark:[color-scheme:dark] sm:h-9";

const search = ref("");
const setor = ref("");
const filial = ref("");

const period = computed(() => monthRange(props.ym));
const days = computed(() => monthDays(period.value));
const employees = computed(() => monthEmployees(props.estado, props.ym, period.value));
const index = useOcorrenciaIndex();

const headcountInfo = computed(() => headcountMonthFor(props.estado, props.ym));

const orphans = computed(() => {
  const keys = new Set(employees.value.map((e) => e.key));
  const uf = String(props.estado || "").toUpperCase();
  const all = !uf || uf === "TODOS";
  return getOcorrencias().filter(
    (o) =>
      competenciaYm(o.meta, o.date) === props.ym &&
      (all || String(o.meta.estado || "").toUpperCase() === uf) &&
      !keys.has(nameKey(o.meta.colaborador))
  );
});
const orphanNames = computed(() => [...new Set(orphans.value.map((o) => o.meta.colaborador))]);

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

const isDesligado = (emp, iso) => !!emp.desligamento && iso >= emp.desligamento;

const ROW_H = 40;
const OVERSCAN = 6;
const CHUNK = 3;
const scroller = ref(null);
const scrollRow = ref(0);
const viewH = ref(480);
const scrollX = ref(0);
const maxScrollX = ref(0);
let raf = 0;

function measureX() {
  const el = scroller.value;
  if (!el) return;
  maxScrollX.value = Math.max(0, el.scrollWidth - el.clientWidth);
  scrollX.value = el.scrollLeft;
  viewH.value = el.clientHeight || viewH.value;
}

function onScroll() {
  if (raf) return;
  raf = requestAnimationFrame(() => {
    raf = 0;
    const el = scroller.value;
    if (!el) return;
    const row = Math.floor(el.scrollTop / ROW_H / CHUNK) * CHUNK;
    if (row !== scrollRow.value) scrollRow.value = row;
    if (Math.abs(el.scrollLeft - scrollX.value) > 2) scrollX.value = el.scrollLeft;
  });
}

let observer = null;
onMounted(() => {
  if (typeof ResizeObserver === "undefined") return;
  observer = new ResizeObserver(() => measureX());
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
  scrollRow.value = 0;
  if (scroller.value) scroller.value.scrollTop = 0;
});
watch(
  () => props.ym,
  () => {
    if (scroller.value) scroller.value.scrollLeft = 0;
  }
);
watch([days, () => rows.value.length], () => nextTick(measureX));

const range = computed(() => {
  const total = rows.value.length;
  const first = Math.max(0, scrollRow.value - OVERSCAN);
  const last = Math.min(total, scrollRow.value + CHUNK + Math.ceil(viewH.value / ROW_H) + OVERSCAN);
  return { first, last, top: first * ROW_H, bottom: (total - last) * ROW_H };
});
const visibleRows = computed(() => rows.value.slice(range.value.first, range.value.last));

const visibleModel = computed(() => {
  const ds = days.value;
  const idx = index.value;
  return visibleRows.value.map((emp) => {
    const cells = ds.map((d) => {
      const o = idx.get(`${emp.key}|${d.iso}`);
      return { d, info: o ? cellInfo(o.meta) : null, obs: (o && o.meta.observacao) || "", desl: isDesligado(emp, d.iso) };
    });
    const sig = cells.map((c) => (c.info ? `${c.info.primary.letter}${c.info.flags.map((f) => f.key[0]).join("")}${c.obs}` : c.desl ? "x" : "")).join("|");
    return { emp, cells, sig };
  });
});

const canLeft = computed(() => scrollX.value > 4);
const canRight = computed(() => scrollX.value < maxScrollX.value - 4);

function dayWidth() {
  const th = scroller.value && scroller.value.querySelector("th[data-iso]");
  return th ? th.getBoundingClientRect().width : 40;
}
function scrollDays(direction) {
  if (scroller.value) scroller.value.scrollBy({ left: direction * dayWidth() * 7, behavior: "smooth" });
}
const todayIso = computed(() => isoOf(new Date()));
const todayInMonth = computed(() => days.value.some((d) => d.iso === todayIso.value));
function scrollToToday() {
  const el = scroller.value;
  const th = el && el.querySelector(`th[data-iso="${todayIso.value}"]`);
  if (!th) return;
  const nameCol = el.querySelector("th").getBoundingClientRect().width;
  const left = th.offsetLeft - nameCol - (el.clientWidth - nameCol) / 2 + th.getBoundingClientRect().width / 2;
  el.scrollTo({ left: Math.max(0, left), behavior: "smooth" });
}

const editing = ref(null);
const editingCurrent = computed(() =>
  editing.value ? index.value.get(`${editing.value.emp.key}|${editing.value.iso}`) || null : null
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

function onBodyClick(e) {
  const td = e.target.closest("td[data-d]");
  const tr = td && td.closest("tr[data-k]");
  if (!td || !tr) return;
  const row = visibleModel.value.find((r) => r.emp.key === tr.dataset.k);
  if (row) openCell(row.emp, td.dataset.d);
}

function onSave({ motivo, observacao, advertencia, acidente, cid, diasAtestado, tipoAcidente, aberturaCat }) {
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
    cid,
    diasAtestado,
    tipoAcidente,
    aberturaCat,
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
  <div class="flex min-h-0 flex-col gap-3">
    <div class="flex flex-wrap items-center gap-2">
      <input
        v-model="search"
        type="search"
        :class="[inputCls, 'order-1 min-w-0 flex-1 basis-40 sm:w-56 sm:flex-none sm:basis-auto lg:w-64']"
        placeholder="Buscar colaborador..."
        aria-label="Buscar colaborador"
      />
      <select v-model="setor" :class="[inputCls, 'order-3 min-w-0 basis-[calc(50%-0.25rem)] sm:order-2 sm:basis-auto']" aria-label="Filtrar por setor">
        <option value="">Todos os setores</option>
        <option v-for="s in setores" :key="s" :value="s">{{ s }}</option>
      </select>
      <select v-model="filial" :class="[inputCls, 'order-3 min-w-0 basis-[calc(50%-0.25rem)] sm:order-3 sm:basis-auto']" aria-label="Filtrar por filial">
        <option value="">Todas as filiais</option>
        <option v-for="f in filiais" :key="f" :value="f">{{ f }}</option>
      </select>
      <div class="order-2 sm:order-4"><slot name="after-filters" /></div>
    </div>

    <div
      class="-mx-1 flex shrink-0 items-center gap-x-4 gap-y-1 overflow-x-auto whitespace-nowrap px-1 pb-1 text-[11px] font-medium text-zinc-500 lg:flex-wrap lg:overflow-visible lg:whitespace-normal dark:text-zinc-400"
    >
      <span v-for="m in MOTIVOS" :key="m.value" class="flex shrink-0 items-center gap-1.5">
        <span class="h-2 w-2 rounded-full" :class="m.dot"></span>
        {{ m.label }}
      </span>
      <span v-for="f in FLAGS" :key="f.key" class="flex shrink-0 items-center gap-1.5">
        <span class="h-2 w-2 rounded-full" :class="f.dot"></span>
        {{ f.label }}
      </span>
      <span class="flex shrink-0 items-center gap-1.5">
        <span class="h-2 w-2 rounded-full" :class="PRESENTE.dot"></span>
        {{ PRESENTE.label }}
      </span>
      <span class="flex shrink-0 items-center gap-1.5 font-semibold text-rose-500 dark:text-rose-400">
        <span class="h-2 w-2 rounded-full bg-rose-500"></span>
        Desligado
      </span>
    </div>

    <p
      v-if="headcountInfo.fallback"
      class="shrink-0 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-300"
    >
      Ainda não há Headcount de {{ ymLabel(ym) }}: os colaboradores listados são os de {{ ymLabel(headcountInfo.ym) }}.
    </p>
    <p
      v-if="orphans.length"
      class="shrink-0 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-800 dark:border-rose-500/30 dark:bg-rose-500/10 dark:text-rose-300"
      :title="orphanNames.join(', ')"
    >
      {{ orphans.length }} {{ orphans.length === 1 ? "ocorrência deste mês está" : "ocorrências deste mês estão" }} sem colaborador
      correspondente no Headcount (não aparecem no mapa, mas contam nos indicadores):
      {{ orphanNames.slice(0, 3).join(", ") }}{{ orphanNames.length > 3 ? ` e mais ${orphanNames.length - 3}` : "" }}.
    </p>

    <div
      v-if="rows.length"
      class="flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900"
    >
      <div class="flex shrink-0 items-center gap-2 border-b border-zinc-100 px-2 py-1.5 dark:border-zinc-800">
        <span class="min-w-0 flex-1 truncate text-[11px] text-zinc-400 dark:text-zinc-500">
          {{ ymLabel(ym) }} · {{ rows.length }} colaboradores · {{ canRight ? "deslize para ver todos os dias" : "fim do mês" }}
        </span>
        <button
          v-if="todayInMonth"
          type="button"
          class="h-8 rounded-md px-3 text-xs font-semibold text-zinc-600 ring-1 ring-inset ring-zinc-200 transition hover:bg-zinc-50 dark:text-zinc-300 dark:ring-zinc-700 dark:hover:bg-zinc-800"
          @click="scrollToToday"
        >
          Hoje
        </button>
        <button
          type="button"
          class="flex h-8 w-9 items-center justify-center rounded-md text-lg leading-none text-zinc-600 ring-1 ring-inset ring-zinc-200 transition enabled:hover:bg-zinc-50 disabled:opacity-30 dark:text-zinc-300 dark:ring-zinc-700 dark:enabled:hover:bg-zinc-800"
          :disabled="!canLeft"
          aria-label="Dias anteriores"
          @click="scrollDays(-1)"
        >
          &lsaquo;
        </button>
        <button
          type="button"
          class="flex h-8 w-9 items-center justify-center rounded-md text-lg leading-none text-zinc-600 ring-1 ring-inset ring-zinc-200 transition enabled:hover:bg-zinc-50 disabled:opacity-30 dark:text-zinc-300 dark:ring-zinc-700 dark:enabled:hover:bg-zinc-800"
          :disabled="!canRight"
          aria-label="Próximos dias"
          @click="scrollDays(1)"
        >
          &rsaquo;
        </button>
      </div>

      <div
        ref="scroller"
        class="min-h-0 flex-1 overflow-x-scroll overflow-y-auto overscroll-contain [scrollbar-color:#d4d4d8_transparent] dark:[scrollbar-color:#52525b_transparent] [&::-webkit-scrollbar]:h-3 [&::-webkit-scrollbar]:w-3 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-zinc-300 dark:[&::-webkit-scrollbar-thumb]:bg-zinc-600 [&::-webkit-scrollbar-track]:bg-transparent"
        @scroll.passive="onScroll"
      >
        <table class="w-full border-separate border-spacing-0 text-center">
          <thead class="sticky top-0 z-20">
            <tr>
              <th
                class="sticky left-0 z-30 min-w-[8.5rem] max-w-[8.5rem] border-b border-r border-zinc-200 bg-white px-2 py-2 text-left text-[10px] font-semibold uppercase tracking-wider text-zinc-400 sm:min-w-[12rem] sm:max-w-[12rem] sm:px-3 md:min-w-[15rem] md:max-w-[15rem] md:px-4 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-500"
              >
                Colaborador
              </th>
              <th
                v-for="d in days"
                :key="d.iso"
                :data-iso="d.iso"
                class="min-w-[2.5rem] border-b border-r border-zinc-200 bg-white px-0 py-1.5 md:min-w-[2.25rem] dark:border-zinc-700 dark:bg-zinc-900"
                :class="d.iso === todayIso && 'bg-accent/10 dark:bg-accent/10'"
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
          <tbody @click="onBodyClick">
            <tr v-if="range.top" aria-hidden="true"><td :colspan="days.length + 1" :style="{ height: range.top + 'px', padding: 0 }"></td></tr>
            <tr
              v-for="row in visibleModel"
              :key="row.emp.key"
              v-memo="[row.emp.key, row.sig, row.emp.desligamento, canEdit, ym]"
              :data-k="row.emp.key"
              class="group"
              :style="{ height: ROW_H + 'px' }"
            >
              <td
                class="sticky left-0 z-10 max-w-[8.5rem] border-b border-r border-zinc-200 px-2 text-left sm:max-w-[12rem] sm:px-3 md:max-w-[15rem] md:px-4 dark:border-zinc-700"
                :class="row.emp.desligamento ? 'bg-rose-50 dark:bg-[#2b171b]' : 'bg-white group-hover:bg-zinc-50 dark:bg-zinc-900 dark:group-hover:bg-zinc-800'"
              >
                <div class="flex items-center gap-1.5">
                  <span class="truncate text-xs font-semibold uppercase" :class="row.emp.desligamento ? 'text-rose-700 dark:text-rose-300' : 'text-zinc-800 dark:text-zinc-100'" :title="row.emp.nome">{{ row.emp.nome }}</span>
                  <span
                    v-if="row.emp.desligamento"
                    class="hidden shrink-0 rounded bg-rose-500 px-1 py-px text-[9px] font-bold uppercase leading-tight text-white sm:inline"
                    :title="`Desligado em ${formatDate(row.emp.desligamento)}`"
                  >
                    Deslig. {{ formatDate(row.emp.desligamento).slice(0, 5) }}
                  </span>
                </div>
                <div class="truncate text-[10px] uppercase text-zinc-400 dark:text-zinc-500">
                  <span v-if="row.emp.desligamento" class="font-bold text-rose-500 sm:hidden">Deslig. {{ formatDate(row.emp.desligamento).slice(0, 5) }} · </span>{{ row.emp.setor || "—" }}
                </div>
              </td>
              <td
                v-for="c in row.cells"
                :key="c.d.iso"
                :data-d="c.d.iso"
                :title="c.obs"
                class="border-b border-r border-zinc-200 p-0 group-hover:bg-zinc-50 dark:border-zinc-700 dark:group-hover:bg-zinc-800"
                :class="[
                  c.desl ? 'bg-rose-100 bg-[repeating-linear-gradient(135deg,transparent_0_5px,rgba(244,63,94,0.22)_5px_6px)] dark:bg-[#451a21]' : c.d.sunday && 'bg-zinc-50 dark:bg-white/[0.02]',
                  canEdit && !c.desl ? 'cursor-pointer' : 'cursor-default'
                ]"
              >
                <div class="flex h-[39px] items-center justify-center">
                  <span
                    v-if="c.info"
                    class="relative flex h-7 w-7 items-center justify-center rounded-md text-[11px] font-bold md:h-6 md:w-6"
                    :class="c.info.primary.chip"
                    :title="c.info.primary.label"
                  >
                    {{ c.info.primary.letter }}
                    <span
                      v-for="(f, i) in c.info.flags"
                      :key="f.key"
                      class="absolute -right-1 h-2.5 w-2.5 rounded-full ring-2 ring-white dark:ring-zinc-900"
                      :class="[f.dot, i ? 'top-2.5' : '-top-1']"
                      :title="f.label"
                    ></span>
                  </span>
                </div>
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
