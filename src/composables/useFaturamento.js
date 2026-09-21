import { ref } from "vue";
import { sessionStore, safeSetItem } from "@/lib/utils";

/* Faturamento da empresa (ESPECULATIVO): valor informado pelo usuário na
   TopBar, usado só para calcular quanto o Custo médio por colaborador
   representa dele (ver ticketMedioFaturamento em useDashboardData.js). Não é
   um dado lançado no banco. Fica em sessionStorage — como a sessão, some ao
   fechar a aba e é apagado no logout (ver performFullCleanup em lib/auth.js). */
const STORAGE_KEY = "gg-faturamento";

function readStored() {
  try {
    const n = Number(sessionStore.getItem(STORAGE_KEY));
    return Number.isFinite(n) && n > 0 ? n : null;
  } catch (e) {
    return null;
  }
}

/* null = sem faturamento informado. */
export const faturamento = ref(readStored());

export function setFaturamento(value) {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) {
    clearFaturamento();
    return;
  }
  faturamento.value = n;
  safeSetItem(sessionStore, STORAGE_KEY, String(n));
}

export function clearFaturamento() {
  faturamento.value = null;
  try {
    sessionStore.removeItem(STORAGE_KEY);
  } catch (e) {}
}
