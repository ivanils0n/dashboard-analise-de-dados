import { refreshAllSheets } from "../db/sheets";
import type { Bindings } from "../types";

export async function refreshAllCaches(env: Bindings) {
  return refreshAllSheets(env);
}
