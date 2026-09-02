import { reactive } from "vue";
import { DEFAULT_STATE } from "@/lib/config";
import { hydrate } from "@/lib/supabase";
import { syncAll } from "@/lib/employees";

const state = reactive({
  current: DEFAULT_STATE
});

export function useFilters() {
  /* Troca o estado (RO, AM, PA ou "todos"), carregando do banco os dados
     ainda não baixados e recalculando os snapshots da equipe. */
  async function setState(next) {
    state.current = next || DEFAULT_STATE;
    await hydrate(next || DEFAULT_STATE);
    syncAll();
  }

  return { state, setState };
}
