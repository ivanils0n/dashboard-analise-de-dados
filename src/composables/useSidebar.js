import { ref, watch } from "vue";

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

watch(sidebarCollapsed, (v) => {
  try {
    localStorage.setItem(STORAGE_KEY, v ? "1" : "0");
  } catch {
    /* sem storage: só não persiste */
  }
});
