import { Hono } from "hono";
import { requireAuth } from "../middleware/auth";
import { ENTITIES, ESTADO_TODOS, parseStateTable } from "../db/tables";
import { bulkWrite, listAllRecords, listManyTables } from "../services/records";
import { googleSheetsEnabled, warmSheetsApi } from "../db/googleSheets";
import { fail, ok, readJsonBody } from "../utils/http";
import type { AppEnv } from "../types";

const data = new Hono<AppEnv>();

data.get("/_batch", requireAuth(), async (c) => {
  const requested = (c.req.query("tables") ?? "")
    .split(",")
    .map((name) => name.trim())
    .filter(Boolean);
  const keys = requested.length ? requested : Object.keys(ENTITIES);
  return ok(c, await listManyTables(c.env, keys, c.req.raw.signal));
});

data.get("/_warm", requireAuth(), async (c) => {
  if (googleSheetsEnabled(c.env)) {
    try {
      await warmSheetsApi(c.env, "absenteismo");
    } catch {
    }
  }
  return ok(c, { warm: true });
});

data.get("/:table", requireAuth(), async (c) => {
  const parsed = parseStateTable(c.req.param("table"));
  if (!parsed) return fail(c, 404, "Tabela inválida.", "invalid_table");

  const rows = await listAllRecords(c.env, parsed.entityKey, parsed.estado, c.req.raw.signal);
  return ok(c, rows);
});

data.post("/:table", requireAuth(["admin", "analista"]), async (c) => {
  const parsed = parseStateTable(c.req.param("table"));
  if (!parsed) return fail(c, 404, "Tabela inválida.", "invalid_table");
  if (parsed.estado === ESTADO_TODOS) {
    return fail(c, 400, "Informe o estado (ex.: colaboradores_ro) para gravar.", "invalid_state");
  }

  const body = await readJsonBody(c);
  const upserts = Array.isArray(body.upserts) ? body.upserts : [];
  const deletes = Array.isArray(body.deletes) ? body.deletes : [];

  const result = await bulkWrite(c.env, parsed.entityKey, parsed.estado, upserts, deletes);
  return ok(c, result);
});

export default data;
