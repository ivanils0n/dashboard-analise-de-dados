<script setup>
import { ref, computed, watch, onBeforeUnmount, nextTick } from "vue";

const props = defineProps({
  open: { type: Boolean, default: false },
  tab: { type: String, default: "cockpit" }
});

const emit = defineEmits(["close"]);

const isTouch = ref(false);
const steps = ref([]);
const idx = ref(0);
const box = ref(null);
const tipPos = ref({ top: 0, left: 0 });
const tipEl = ref(null);

const PAD = 6;
const TIP_MAX_W = 360;

function pick(selectors) {
  for (const sel of selectors) {
    for (const el of document.querySelectorAll(sel)) {
      const r = el.getBoundingClientRect();
      if (r.width > 0 && r.height > 0 && getComputedStyle(el).visibility !== "hidden") return el;
    }
  }
  return null;
}

const tour = (name) => [`[data-tour="${name}"]`];

function buildSteps() {
  const acao = isTouch.value ? "Pressione e segure" : "Clique com o botão direito";
  const clique = isTouch.value ? "Toque" : "Clique";
  const common = [
    {
      title: "Bem-vindo ao tour",
      text: "Vamos conhecer, passo a passo, o que cada parte da dashboard faz. Você pode sair a qualquer momento."
    },
    {
      sel: tour("tabs"),
      title: "Visão Geral e Painel",
      text: "Alterne entre duas formas de ver os mesmos dados: a Visão Geral, com um gráfico para cada indicador, e o Painel, com um gráfico central e os indicadores ao redor."
    },
    {
      sel: tour("period"),
      title: "Período",
      text: "Escolha o mês que quer analisar. Todos os indicadores e gráficos são recalculados para o período escolhido."
    },
    {
      sel: tour("state"),
      title: "Estado",
      text: "Filtre por Rondônia, Amazonas ou Pará, ou veja todos os estados juntos."
    }
  ];
  const cockpit = [
    {
      sel: tour("hide-values"),
      title: "Ocultar valores",
      text: "Esconde os números sobre os gráficos, deixando só as formas. Útil para apresentar a tela."
    },
    {
      sel: tour("refresh"),
      title: "Recarregar dados",
      text: "Busca tudo de novo na planilha. Use depois de alterar a planilha para ver os números atualizados."
    },
    {
      sel: tour("cockpit-main"),
      title: "Indicadores e gráfico",
      text: `${clique} em um indicador para ver o gráfico dele no centro. ${acao} sobre um indicador para abrir o modal com os detalhes (por exemplo, a análise completa de Turnover ou de Headcount).`
    },
    {
      sel: tour("cockpit-chart"),
      title: "Gráfico central",
      text: `Mostra o indicador selecionado. ${clique} em uma barra ou fatia para ver os detalhes dela, e use o ícone de expandir para abrir o gráfico em tela cheia.`
    },
    {
      sel: tour("cockpit-map"),
      title: "Mapa por estado",
      text: `${clique} em um estado para filtrar só por ele; ${isTouch.value ? "toque" : "clique"} de novo para voltar a todos.`
    },
    {
      sel: tour("cockpit-indicators"),
      title: "Lista de indicadores",
      text: `Todos os indicadores e seus valores em uma lista. ${clique} para selecionar, ou ${acao.toLowerCase()} para abrir o modal de detalhes.`
    }
  ];
  const overview = [
    {
      sel: tour("refresh"),
      title: "Recarregar dados",
      text: "Busca tudo de novo na planilha. Use depois de alterar a planilha para ver os números atualizados."
    },
    {
      sel: tour("overview-kpis"),
      title: "Indicadores-chave",
      text: `${clique} em um indicador para ir até o gráfico dele. ${acao} sobre um indicador para abrir o modal com os detalhes.`
    },
    {
      sel: tour("hide-values"),
      title: "Ocultar valores",
      text: "Esconde os números sobre os gráficos, deixando só as formas."
    },
    {
      sel: tour("overview-charts"),
      title: "Gráficos por indicador",
      text: `Um gráfico para cada indicador. ${clique} em uma barra ou fatia para ver os detalhes, e use o ícone de expandir para abrir em tela cheia.`
    }
  ];
  const end = [
    {
      sel: tour("menu"),
      title: "Menu de ações",
      text: "Baixe os dados da dashboard em XLSX ou CSV."
    },
    {
      sel: tour("tour-button"),
      title: "Repetir o tour",
      text: "Quando quiser rever estas dicas, é só clicar neste botão."
    }
  ];
  return [...common, ...(props.tab === "cockpit" ? cockpit : overview), ...end];
}

const current = computed(() => steps.value[idx.value] || null);
const isFirst = computed(() => idx.value === 0);
const isLast = computed(() => idx.value === steps.value.length - 1);

let currentEl = null;
let raf = 0;

function goTo(i) {
  idx.value = Math.max(0, Math.min(steps.value.length - 1, i));
  const step = current.value;
  currentEl = step && step.sel ? pick(step.sel) : null;
  if (currentEl) {
    const r = currentEl.getBoundingClientRect();
    const tall = r.height > window.innerHeight * 0.7;
    currentEl.scrollIntoView({ block: tall ? "start" : "center", behavior: "smooth" });
  }
}

function measure() {
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const tw = Math.min(TIP_MAX_W, vw - 24);
  const th = (tipEl.value && tipEl.value.offsetHeight) || 190;

  if (!currentEl || !currentEl.isConnected) {
    if (box.value) box.value = null;
    tipPos.value = { top: Math.max(12, (vh - th) / 2), left: Math.max(12, (vw - tw) / 2) };
    return;
  }
  const r = currentEl.getBoundingClientRect();
  const top = Math.max(r.top - PAD, 6);
  const left = Math.max(r.left - PAD, 6);
  const bottom = Math.min(r.bottom + PAD, vh - 6);
  const right = Math.min(r.right + PAD, vw - 6);
  const next = {
    top: Math.round(top),
    left: Math.round(left),
    width: Math.max(0, Math.round(right - left)),
    height: Math.max(0, Math.round(bottom - top))
  };
  const prev = box.value;
  if (!prev || prev.top !== next.top || prev.left !== next.left || prev.width !== next.width || prev.height !== next.height) {
    box.value = next;
  }

  let tipTop;
  if (vh - bottom >= th + 16) tipTop = bottom + 12;
  else if (top >= th + 16) tipTop = top - th - 12;
  else tipTop = vh - th - 16;
  const tipLeft = Math.min(Math.max(left + (right - left) / 2 - tw / 2, 12), vw - tw - 12);
  const pos = { top: Math.round(tipTop), left: Math.round(tipLeft) };
  if (pos.top !== tipPos.value.top || pos.left !== tipPos.value.left) tipPos.value = pos;
}

function loop() {
  measure();
  raf = requestAnimationFrame(loop);
}

function start() {
  isTouch.value = !!(window.matchMedia && window.matchMedia("(hover: none), (pointer: coarse)").matches);
  steps.value = buildSteps().filter((s) => !s.sel || pick(s.sel));
  box.value = null;
  goTo(0);
  cancelAnimationFrame(raf);
  loop();
  document.addEventListener("keydown", onKeydown, true);
}

function stop() {
  cancelAnimationFrame(raf);
  document.removeEventListener("keydown", onKeydown, true);
  currentEl = null;
}

function next() {
  if (isLast.value) emit("close");
  else goTo(idx.value + 1);
}
function prev() {
  if (!isFirst.value) goTo(idx.value - 1);
}

function onKeydown(e) {
  if (e.key === "Escape") {
    e.preventDefault();
    e.stopPropagation();
    emit("close");
  } else if (e.key === "ArrowRight") {
    e.preventDefault();
    next();
  } else if (e.key === "ArrowLeft") {
    e.preventDefault();
    prev();
  }
}

watch(
  () => props.open,
  (open) => {
    if (open) nextTick(start);
    else stop();
  },
  { immediate: true }
);

watch(
  () => props.tab,
  () => {
    if (props.open) emit("close");
  }
);

onBeforeUnmount(stop);

const tipStyle = computed(() => ({
  top: `${tipPos.value.top}px`,
  left: `${tipPos.value.left}px`,
  width: `${Math.min(TIP_MAX_W, (typeof window !== "undefined" ? window.innerWidth : TIP_MAX_W) - 24)}px`
}));
</script>

<template>
  <Teleport to="body">
    <div
      v-if="open && current"
      class="fixed inset-0 z-[95]"
      role="dialog"
      aria-modal="true"
      aria-label="Tour pela dashboard"
      @click.stop
      @contextmenu.prevent
    >
      <div v-if="box" class="tour-spot" :style="{ top: box.top + 'px', left: box.left + 'px', width: box.width + 'px', height: box.height + 'px' }" />
      <div v-else class="absolute inset-0 bg-black/60" />

      <div
        ref="tipEl"
        class="absolute rounded-2xl border border-zinc-200 bg-white p-4 shadow-2xl dark:border-zinc-700 dark:bg-zinc-900"
        :style="tipStyle"
      >
        <div class="mb-2 flex items-center justify-between gap-3">
          <span class="rounded-full bg-accent/15 px-2.5 py-0.5 text-[11px] font-bold tabular-nums text-accent-hover dark:text-accent-light">
            {{ idx + 1 }} / {{ steps.length }}
          </span>
          <button
            type="button"
            class="flex h-7 w-7 items-center justify-center rounded-md text-zinc-400 transition hover:bg-zinc-100 hover:text-zinc-700 dark:hover:bg-zinc-800 dark:hover:text-zinc-200"
            aria-label="Sair do tour"
            title="Sair do tour"
            @click="emit('close')"
          >
            <svg class="h-3.5 w-3.5" viewBox="0 0 14 14" aria-hidden="true">
              <path fill="currentColor" d="M7.71 7.23l3.75 3.75-1.48 1.48-3.75-3.75-3.75 3.75L1 10.98l3.75-3.75L1 3.48 2.48 2l3.75 3.75L9.98 2l1.48 1.48z" />
            </svg>
          </button>
        </div>
        <h3 class="text-base font-bold text-zinc-900 dark:text-zinc-100">{{ current.title }}</h3>
        <p class="mt-1 text-sm leading-relaxed text-zinc-600 dark:text-zinc-300">{{ current.text }}</p>

        <div class="mt-4 flex items-center justify-between gap-2">
          <button
            type="button"
            class="rounded-lg px-2 py-1.5 text-sm font-medium text-zinc-500 transition hover:bg-zinc-100 hover:text-zinc-800 dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-zinc-100"
            @click="emit('close')"
          >
            Sair do tour
          </button>
          <div class="flex items-center gap-2">
            <button
              v-if="!isFirst"
              type="button"
              class="rounded-lg border border-zinc-300 px-3 py-1.5 text-sm font-medium text-zinc-700 transition hover:bg-zinc-100 dark:border-zinc-600 dark:text-zinc-200 dark:hover:bg-zinc-800"
              @click="prev"
            >
              Anterior
            </button>
            <button
              type="button"
              class="rounded-lg bg-accent px-4 py-1.5 text-sm font-semibold text-white shadow-sm transition hover:bg-accent-hover"
              @click="next"
            >
              {{ isLast ? "Concluir" : isFirst ? "Começar" : "Próximo" }}
            </button>
          </div>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.tour-spot {
  position: absolute;
  border-radius: 14px;
  box-shadow: 0 0 0 9999px rgba(0, 0, 0, 0.62), 0 0 0 3px #e8af3e;
  pointer-events: none;
  transition: top 0.25s ease, left 0.25s ease, width 0.25s ease, height 0.25s ease;
}
@media (prefers-reduced-motion: reduce) {
  .tour-spot {
    transition: none;
  }
}
</style>
