import { Hono } from "hono";
import { requireAuth } from "../middleware/auth";
import { parseStateTable } from "../db/tables";
import { bulkWrite, listAllRecords } from "../services/records";
import { fail, ok, readJsonBody } from "../utils/http";
import type { AppEnv } from "../types";

// Endpoint em lote usado pela sincronização do frontend (delta sync).
// Recebe o nome da tabela no formato "colaboradores_ro".
const data = new Hono<AppEnv>();

data.get("/:table", requireAuth(), async (c) => {
  const parsed = parseStateTable(c.req.param("table"));
  if (!parsed) return fail(c, 404, "Tabela inválida.", "invalid_table");

  const rows = await listAllRecords(c.env, parsed.entityKey, parsed.estado);
  return ok(c, rows);
});

data.post("/:table", requireAuth(["admin", "analista"]), async (c) => {
  const parsed = parseStateTable(c.req.param("table"));
  if (!parsed) return fail(c, 404, "Tabela inválida.", "invalid_table");

  const body = await readJsonBody(c);
  const upserts = Array.isArray(body.upserts) ? body.upserts : [];
  const deletes = Array.isArray(body.deletes) ? body.deletes : [];

  const result = await bulkWrite(c.env, parsed.entityKey, parsed.estado, upserts, deletes);
  return ok(c, result);
});

export default data;
