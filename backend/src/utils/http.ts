import type { Context } from "hono";
import type { ContentfulStatusCode } from "hono/utils/http-status";
import type { AppEnv, Pagination } from "../types";

// Resposta de sucesso: { success: true, data }
export function ok(c: Context<AppEnv>, data: unknown, status: ContentfulStatusCode = 200) {
  return c.json({ success: true, data }, status);
}

// Resposta de lista: { success: true, data, pagination }
export function okList(c: Context<AppEnv>, data: unknown, pagination: Pagination) {
  return c.json({ success: true, data, pagination });
}

// Resposta de erro: { success: false, error: { message, code } }
export function fail(
  c: Context<AppEnv>,
  status: ContentfulStatusCode,
  message: string,
  code?: string
) {
  return c.json({ success: false, error: code ? { message, code } : { message } }, status);
}

// Lê o corpo JSON; devolve {} se ausente ou inválido.
export async function readJsonBody(c: Context<AppEnv>): Promise<Record<string, unknown>> {
  try {
    const body = await c.req.json();
    return body && typeof body === "object" ? (body as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}
