import { Hono } from "hono";
import { requireAuth } from "../middleware/auth";
import { ENTITIES, ESTADO_TODOS, parseStateTable } from "../db/tables";
import { bulkWrite, listAllRecords, listManyTables } from "../services/records";
import { fail, ok, readJsonBody } from "../utils/http";
import type { AppEnv } from "../types";

// Endpoint em lote usado pela sincronização do frontend (delta sync).
// Recebe o nome da tabela no formato "colaboradores_ro" (um estado) ou
// "colaboradores" puro (todos os estados — só leitura, ver parseStateTable).
const data = new Hono<AppEnv>();

// Carga em lote: GET /api/data/_batch?tables=vagas,turnover,... (sem "tables" =
// todas as entidades). Uma única chamada ao Apps Script para todas as abas.
data.get("/_batch", requireAuth(), async (c) => {
  const requested = (c.req.query("tables") ?? "")
    .split(",")
    .map((name) => name.trim())
    .filter(Boolean);
  const keys = requested.length ? requested : Object.keys(ENTITIES);
  return ok(c, await listManyTables(c.env, keys, c.req.raw.signal));
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
    // Escrever sem saber o estado é ambíguo (não dá pra gravar estado_sigla).
    return fail(c, 400, "Informe o estado (ex.: colaboradores_ro) para gravar.", "invalid_state");
  }

  const body = await readJsonBody(c);
  const upserts = Array.isArray(body.upserts) ? body.upserts : [];
  const deletes = Array.isArray(body.deletes) ? body.deletes : [];

  const result = await bulkWrite(c.env, parsed.entityKey, parsed.estado, upserts, deletes);
  return ok(c, result);
});

export default data;
