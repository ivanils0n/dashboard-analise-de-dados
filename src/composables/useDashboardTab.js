import { ref } from "vue";

/* Aba ativa do Dashboard (Visão Geral / Painel). Compartilhada entre a TopBar
   (onde ficam as abas) e o DashboardView (que troca o conteúdo). */
export const activeTab = ref("cockpit");

const TAB_ORDER = ["visao-geral", "cockpit"];

/* Direção da animação de arrasto: 1 = arrasta para a esquerda (indo para a
   aba à direita), -1 = arrasta para a direita (voltando para a aba à
   esquerda). Usada para escolher a transição (slide-left/slide-right). */
export const tabDirection = ref(1);

export function switchTab(tab) {
  if (tab === activeTab.value) return;
  tabDirection.value = TAB_ORDER.indexOf(tab) > TAB_ORDER.indexOf(activeTab.value) ? 1 : -1;
  activeTab.value = tab;
}
