<script setup>
import { computed, ref, watch } from "vue";
import Modal from "@/components/ui/Modal.vue";
import { MOTIVOS, FLAGS } from "@/lib/absenteismo";
import { formatDate } from "@/lib/utils";

/* Lançamento de uma ocorrência (colaborador + dia) do mapa de absenteísmo.
   "Presente" limpa o dia; os demais motivos gravam/atualizam a ocorrência. */
const props = defineProps({
  open: { type: Boolean, default: false },
  colaborador: { type: String, default: "" },
  date: { type: String, default: "" },
  /* Ocorrência já lançada nesse dia (ou null). */
  current: { type: Object, default: null }
});
const emit = defineEmits(["close", "save", "clear"]);

const inputCls =
  "w-full rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2.5 text-sm text-zinc-800 outline-none transition placeholder:text-zinc-400 focus:border-accent focus:ring-2 focus:ring-accent/20 disabled:opacity-50 dark:border-zinc-700/70 dark:bg-zinc-800/50 dark:text-zinc-200 dark:placeholder:text-zinc-500 dark:[color-scheme:dark]";

const motivo = ref("");

/* Lista de motivos própria (em vez do <select> nativo) para centralizar as
   opções e deixar a seta logo à direita do texto. "" = Presente. */
const listOpen = ref(false);
const triggerRef = ref(null);
const listStyle = ref({});
const ROW_PX = 28;

/* A lista é desenhada no <body> (fora do modal), posicionada sobre o botão: assim
   pode passar da borda do modal e até da tela (abre para cima se faltar espaço). */
function toggleList() {
  if (listOpen.value) {
    listOpen.value = false;
    return;
  }
  const rect = triggerRef.value.getBoundingClientRect();
  const height = OPTIONS.length * ROW_PX + 12;
  const below = window.innerHeight - rect.bottom - 8;
  const up = below < height && rect.top > below;
  listStyle.value = {
    left: `${rect.left}px`,
    width: `${rect.width}px`,
    ...(up ? { bottom: `${window.innerHeight - rect.top + 4}px` } : { top: `${rect.bottom + 4}px` })
  };
  listOpen.value = true;
}
const OPTIONS = [{ value: "", label: "Presente" }, ...MOTIVOS.map((m) => ({ value: m.value, label: m.label }))];
const currentLabel = computed(() => (OPTIONS.find((o) => o.value === motivo.value) || OPTIONS[0]).label);
function pick(value) {
  motivo.value = value;
  listOpen.value = false;
}
const observacao = ref("");
/* Marcacoes independentes do motivo: { advertencia, acidente } => boolean. */
const marks = ref({ advertencia: false, acidente: false });

watch(
  () => props.open,
  (open) => {
    if (!open) return;
    listOpen.value = false;
    const saved = props.current && props.current.meta.motivo;
    motivo.value = saved && saved !== "Presente" ? saved : "";
    observacao.value = (props.current && props.current.meta.observacao) || "";
    const meta = (props.current && props.current.meta) || {};
    marks.value = { advertencia: !!meta.advertencia, acidente: !!meta.acidente };
  },
  { immediate: true }
);

function submit() {
  const obs = observacao.value.trim();
  if (!motivo.value && !obs && !marks.value.advertencia && !marks.value.acidente) {
    emit("clear");
    return;
  }
  /* Sem motivo mas com observação ou marcação: dia "Presente" com anotação. */
  emit("save", {
    motivo: motivo.value || "Presente",
    observacao: obs,
    advertencia: marks.value.advertencia,
    acidente: marks.value.acidente
  });
}
</script>

<template>
  <Modal :title="formatDate(date)" centered :open="open" max-width="max-w-xl" @close="emit('close')">
    <form class="flex flex-col gap-4" @submit.prevent="submit">
      <div class="grid gap-4 sm:grid-cols-2">
        <div class="flex min-w-0 flex-col gap-1.5">
          <span class="text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">Colaborador</span>
          <div
            class="flex min-h-[2.6rem] items-center rounded-lg border border-zinc-200 bg-zinc-100/70 px-3 py-2 text-sm font-semibold uppercase text-zinc-800 dark:border-zinc-700/70 dark:bg-zinc-800/30 dark:text-zinc-100"
            :title="colaborador"
          >
            <span class="truncate">{{ colaborador }}</span>
          </div>
        </div>
        <div class="flex min-w-0 flex-col gap-1.5">
          <label for="ocMotivo" class="text-center text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
            Motivo da ocorrência
          </label>
          <div class="relative">
            <button
              id="ocMotivo"
              ref="triggerRef"
              type="button"
              :class="[inputCls, 'flex items-center justify-center gap-2 font-semibold']"
              aria-haspopup="listbox"
              :aria-expanded="listOpen"
              @click="toggleList"
              @keydown.esc.stop="listOpen = false"
            >
              <span>{{ currentLabel }}</span>
              <svg class="h-3.5 w-3.5 shrink-0 text-zinc-400" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
                <path fill-rule="evenodd" d="M5.23 7.21a.75.75 0 011.06.02L10 11.17l3.71-3.94a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z" clip-rule="evenodd" />
              </svg>
            </button>
            <Teleport to="body">
            <div v-if="listOpen" class="fixed inset-0 z-[69]" aria-hidden="true" @click="listOpen = false"></div>
            <ul
              v-if="listOpen"
              role="listbox"
              class="fixed z-[70] overflow-hidden rounded-lg border border-zinc-200 bg-white py-1 shadow-xl dark:border-zinc-700 dark:bg-zinc-800"
              :style="listStyle"
            >
              <li v-for="o in OPTIONS" :key="o.value" role="option" :aria-selected="o.value === motivo">
                <button
                  type="button"
                  class="flex h-7 w-full items-center justify-center px-3 text-center text-sm font-medium transition"
                  :class="o.value === motivo ? 'bg-accent/15 text-accent' : 'text-zinc-700 hover:bg-zinc-100 dark:text-zinc-200 dark:hover:bg-zinc-700'"
                  @click="pick(o.value)"
                  @keydown.esc.stop="listOpen = false"
                >
                  {{ o.label }}
                </button>
              </li>
            </ul>
            </Teleport>
          </div>
        </div>
      </div>

      <div class="grid gap-3 sm:grid-cols-2">
        <label
          v-for="f in FLAGS"
          :key="f.key"
          class="flex cursor-pointer select-none items-center gap-3 rounded-lg border px-3 py-2.5 text-sm font-semibold transition"
          :class="marks[f.key] ? f.chip + ' border-transparent' : 'border-zinc-200 bg-zinc-50 text-zinc-600 hover:bg-zinc-100 dark:border-zinc-700/70 dark:bg-zinc-800/50 dark:text-zinc-300 dark:hover:bg-zinc-800'"
        >
          <input v-model="marks[f.key]" type="checkbox" class="h-4 w-4 shrink-0 cursor-pointer accent-orange-500" />
          {{ f.label }}
        </label>
      </div>

      <div class="flex flex-col gap-1.5">
        <label for="ocObs" class="text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
          Observações
        </label>
        <textarea
          id="ocObs"
          v-model="observacao"
          rows="3"
          :class="[inputCls, 'resize-y']"
          placeholder="Observações..."
        />
        <p v-if="!motivo" class="text-[11px] text-zinc-400 dark:text-zinc-500">
          Presente sem observação nem marcação deixa o dia em branco. Com observação, o dia fica marcado com um ponto.
        </p>
      </div>

      <div class="grid grid-cols-2 gap-3">
        <button type="button" class="rounded-lg bg-zinc-100 px-4 py-2.5 text-sm font-semibold text-zinc-600 transition hover:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-700" @click="emit('close')">
          Cancelar
        </button>
        <button type="submit" class="rounded-lg bg-accent px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-accent-hover">Salvar</button>
      </div>
    </form>
  </Modal>
</template>
