import { Hono } from "hono";
import { requireAuth } from "../middleware/auth";
import { getEstado, listEstados } from "../services/estados";
import { fail, ok } from "../utils/http";
import type { AppEnv } from "../types";

const estados = new Hono<AppEnv>();

// Tabela de referência: apenas leitura.
estados.use("*", requireAuth());

estados.get("/", async (c) => {
  const data = await listEstados(c.env);
  return ok(c, data);
});

estados.get("/:sigla", async (c) => {
  const estado = await getEstado(c.env, c.req.param("sigla"));
  if (!estado) return fail(c, 404, "Estado não encontrado.", "not_found");
  return ok(c, estado);
});

export default estados;
