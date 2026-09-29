import { ref, computed, watch } from "vue";

/* Estado compartilhado entre o layout e as telas: uma tela (ex.: aba Painel do
   Dashboard) pode pedir para a sidebar ficar oculta enquanto estiver ativa. */
export const sidebarHidden = ref(false);

/* Sidebar recolhida (só ícones), começa recolhida e lembra a escolha. Vale a partir de md;
   em telas pequenas a sidebar já é uma faixa no topo. */
const STORAGE_KEY = "sidebar-collapsed";

function readCollapsed() {
  try {
    return localStorage.getItem(STORAGE_KEY) !== "0";
  } catch {
    return true;
  }
}

export const sidebarCollapsed = ref(readCollapsed());

/* Tablet (de md até abaixo de lg, 768–1023px): a sidebar fica sempre recolhida
   para sobrar largura ao conteúdo, mesmo que o usuário a tenha expandido no
   desktop (a escolha dele continua salva para telas maiores). */
const tabletQuery = typeof window !== "undefined" && window.matchMedia ? window.matchMedia("(max-width: 1023px)") : null;
export const isTabletWidth = ref(!!(tabletQuery && tabletQuery.matches));
if (tabletQuery) {
  const onChange = (e) => {
    isTabletWidth.value = e.matches;
  };
  if (tabletQuery.addEventListener) tabletQuery.addEventListener("change", onChange);
  else if (tabletQuery.addListener) tabletQuery.addListener(onChange);
}

/* Estado efetivo: recolhida por escolha do usuário ou por ser tablet. */
export const sidebarEffectiveCollapsed = computed(() => sidebarCollapsed.value || isTabletWidth.value);

watch(sidebarCollapsed, (v) => {
  try {
    localStorage.setItem(STORAGE_KEY, v ? "1" : "0");
  } catch {
    /* sem storage: só não persiste */
  }
});
