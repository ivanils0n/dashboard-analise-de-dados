import { refreshAllSheets } from "../db/sheets";
import type { Bindings } from "../types";

// Refresh manual (botão "Recarregar dados" do admin): relê a planilha inteira
// e regrava o cache agora. A atualização periódica é do Apps Script
// (pushCache no Code.gs), não do Worker.
export async function refreshAllCaches(env: Bindings) {
  return refreshAllSheets(env);
}
