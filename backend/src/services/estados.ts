import { query } from "../db/pool";
import type { Bindings } from "../types";

export async function listEstados(env: Bindings) {
  const { rows } = await query(env, "select sigla, nome from public.estados order by sigla");
  return rows;
}

export async function getEstado(env: Bindings, sigla: string) {
  const { rows } = await query(
    env,
    "select sigla, nome from public.estados where sigla = $1 limit 1",
    [sigla.toUpperCase()]
  );
  return rows[0] ?? null;
}
