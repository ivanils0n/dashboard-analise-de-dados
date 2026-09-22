import type { Context } from "hono";
import type { AppEnv, Pagination } from "../types";

export const DEFAULT_LIMIT = 50;
/* 500 equilibra menos round-trips (o dashboard agora pagina lançamentos por
   janela de data, ver useDashboardData/db.js no frontend) sem sobrecarregar
   uma única query — o LIMIT/OFFSET simples do Postgres/CockroachDB lida bem
   com esse tamanho de página. */
export const MAX_LIMIT = 500;

// Lê ?page=1&limit=50 com limites seguros.
export function parsePagination(c: Context<AppEnv>): { page: number; limit: number } {
  const rawPage = Number.parseInt(c.req.query("page") ?? "1", 10);
  const rawLimit = Number.parseInt(c.req.query("limit") ?? String(DEFAULT_LIMIT), 10);

  const page = Number.isFinite(rawPage) && rawPage > 0 ? rawPage : 1;
  let limit = Number.isFinite(rawLimit) && rawLimit > 0 ? rawLimit : DEFAULT_LIMIT;
  if (limit > MAX_LIMIT) limit = MAX_LIMIT;

  return { page, limit };
}

export function buildPagination(page: number, limit: number, total: number): Pagination {
  return {
    page,
    limit,
    total,
    totalPages: total === 0 ? 0 : Math.ceil(total / limit)
  };
}
