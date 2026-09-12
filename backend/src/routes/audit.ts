import { Hono } from "hono";
import { requireAuth } from "../middleware/auth";
import { getChange, listChanges } from "../services/audit";
import { fail, ok, okList } from "../utils/http";
import { buildPagination, parsePagination } from "../utils/pagination";
import type { AppEnv } from "../types";

const audit = new Hono<AppEnv>();

// Auditoria/changelog: apenas leitura e apenas admin.
audit.use("*", requireAuth(["admin"]));

audit.get("/", async (c) => {
  const { page, limit } = parsePagination(c);
  const result = await listChanges(c.env, {
    page,
    limit,
    tabela: c.req.query("tabela") ?? undefined,
    registroId: c.req.query("registro_id") ?? undefined,
    operacao: c.req.query("operacao") ?? undefined,
    de: c.req.query("de") ?? undefined,
    ate: c.req.query("ate") ?? undefined
  });
  return okList(c, result.data, buildPagination(page, limit, result.total));
});

audit.get("/:id", async (c) => {
  const id = Number(c.req.param("id"));
  if (!Number.isFinite(id)) return fail(c, 400, "ID inválido.", "invalid_field");

  const change = await getChange(c.env, id);
  if (!change) return fail(c, 404, "Registro não encontrado.", "not_found");
  return ok(c, change);
});

export default audit;
