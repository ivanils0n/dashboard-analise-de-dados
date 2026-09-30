import type { Context } from "hono";
import type { ContentfulStatusCode } from "hono/utils/http-status";
import type { AppEnv, Pagination } from "../types";
import { ApiError } from "./errors";

export function ok(c: Context<AppEnv>, data: unknown, status: ContentfulStatusCode = 200) {
  return c.json({ success: true, data }, status);
}

export function okList(c: Context<AppEnv>, data: unknown, pagination: Pagination) {
  return c.json({ success: true, data, pagination });
}

export function fail(
  c: Context<AppEnv>,
  status: ContentfulStatusCode,
  message: string,
  code?: string
) {
  return c.json({ success: false, error: code ? { message, code } : { message } }, status);
}

export async function readJsonBody(c: Context<AppEnv>): Promise<Record<string, unknown>> {
  const text = await c.req.text();
  if (!text.trim()) return {};

  let body: unknown;
  try {
    body = JSON.parse(text);
  } catch {
    throw new ApiError(400, "Corpo da requisição não é um JSON válido.", "invalid_json");
  }
  return body && typeof body === "object" && !Array.isArray(body)
    ? (body as Record<string, unknown>)
    : {};
}
