import { reactive } from "vue";
import { DEFAULT_STATE, DEFAULT_FILTER_STATE } from "@/lib/config";
import { hydrateState } from "@/lib/db";
import { syncAll } from "@/lib/employees";

const state = reactive({
  current: DEFAULT_FILTER_STATE,
  revision: 0
});

export function useFilters() {
  /* Troca o estado (RO, AM, PA ou "todos"). Carrega do banco apenas o que
     ainda não está em memória (priorizando cache + delta) e recalcula os
     snapshots. Nunca lança erro — a troca de estado nunca deve travar a UI. */
  async function setState(next) {
    const target = next || DEFAULT_STATE;
    state.current = target;
    state.revision++;
    try {
      await hydrateState(target);
    } catch (err) {
      console.warn("[useFilters] Falha ao carregar dados do estado:", err);
    }
    try {
      syncAll();
    } catch (err) {
      console.warn("[useFilters] Falha ao recalcular indicadores:", err);
    }
  }

  return { state, setState };
}
