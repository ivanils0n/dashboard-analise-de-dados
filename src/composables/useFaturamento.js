import { ref } from "vue";
import { sessionStore, safeSetItem } from "@/lib/utils";

const STORAGE_KEY = "gg-faturamento";

function readStored() {
  try {
    const n = Number(sessionStore.getItem(STORAGE_KEY));
    return Number.isFinite(n) && n > 0 ? n : null;
  } catch (e) {
    return null;
  }
}

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
