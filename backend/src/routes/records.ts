import { Hono } from "hono";
import type { Context } from "hono";
import { requireAuth } from "../middleware/auth";
import { ENTITIES, normalizeEstado } from "../db/tables";
import type { Estado } from "../db/tables";
import * as records from "../services/records";
import { fail, ok, okList, readJsonBody } from "../utils/http";
import { buildPagination, parsePagination } from "../utils/pagination";
import { ApiError } from "../utils/errors";
import type { AppEnv } from "../types";

function parseEstado(value: string): Estado {
  const estado = normalizeEstado(value);
  if (!estado) {
    throw new ApiError(400, "Estado inválido. Use um de: RO, AM, PA.", "invalid_state");
  }
  return estado;
}

function parseFilters(c: Context<AppEnv>, entityKey: string) {
  const entity = ENTITIES[entityKey];
  const filters: Record<string, string> = {};
  for (const filter of entity.filters) {
    const value = c.req.query(filter.param);
    if (value !== undefined && value !== "") filters[filter.param] = value;
  }
  return filters;
}

// Cria as rotas de um recurso (ex.: colaboradores) com os 3 estados.
export function recordsRoutes(entityKey: string) {
  const app = new Hono<AppEnv>();

  app.get("/:estado", requireAuth(), async (c) => {
    const estado = parseEstado(c.req.param("estado"));
    const { page, limit } = parsePagination(c);
    const filters = parseFilters(c, entityKey);
    const search = c.req.query("q") ?? undefined;

    const result = await records.listRecords(c.env, entityKey, estado, {
      page,
      limit,
      filters,
      search
    });
    return okList(c, result.data, buildPagination(page, limit, result.total));
  });

  app.get("/:estado/:id", requireAuth(), async (c) => {
    const estado = parseEstado(c.req.param("estado"));
    const row = await records.getRecord(c.env, entityKey, estado, c.req.param("id"));
    if (!row) return fail(c, 404, "Registro não encontrado.", "not_found");
    return ok(c, row);
  });

  app.post("/:estado", requireAuth(["admin", "analista"]), async (c) => {
    const estado = parseEstado(c.req.param("estado"));
    const body = await readJsonBody(c);
    const row = await records.createRecord(c.env, entityKey, estado, body);
    return ok(c, row, 201);
  });

  app.patch("/:estado/:id", requireAuth(["admin", "analista"]), async (c) => {
    const estado = parseEstado(c.req.param("estado"));
    const body = await readJsonBody(c);
    const row = await records.updateRecord(c.env, entityKey, estado, c.req.param("id"), body, false);
    if (!row) return fail(c, 404, "Registro não encontrado.", "not_found");
    return ok(c, row);
  });

  app.put("/:estado/:id", requireAuth(["admin", "analista"]), async (c) => {
    const estado = parseEstado(c.req.param("estado"));
    const body = await readJsonBody(c);
    const row = await records.updateRecord(c.env, entityKey, estado, c.req.param("id"), body, true);
    if (!row) return fail(c, 404, "Registro não encontrado.", "not_found");
    return ok(c, row);
  });

  // Exclusão é restrita ao admin (decisão documentada no README).
  app.delete("/:estado/:id", requireAuth(["admin"]), async (c) => {
    const estado = parseEstado(c.req.param("estado"));
    const removed = await records.deleteRecord(c.env, entityKey, estado, c.req.param("id"));
    if (!removed) return fail(c, 404, "Registro não encontrado.", "not_found");
    return ok(c, { deleted: true });
  });

  return app;
}
