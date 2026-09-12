import { Hono } from "hono";
import { requireAuth } from "../middleware/auth";
import { query } from "../db/pool";
import { ok } from "../utils/http";
import type { AppEnv } from "../types";

const delta = new Hono<AppEnv>();

delta.use("*", requireAuth());

delta.get("/version", async (c) => {
  const { rows } = await query(
    c.env,
    "select coalesce(max(id), 0) as versao from public.registro_alteracoes"
  );
  return ok(c, { versao: Number(rows[0]?.versao) || 0 });
});

delta.get("/sync", async (c) => {
  const versao = Number(c.req.query("versao")) || 0;
  const { rows } = await query(
    c.env,
    "select id, tabela, registro_id, operacao, dados from public.registro_alteracoes where id > $1 order by id",
    [versao]
  );
  const versaoAtual = rows.length ? Number(rows[rows.length - 1].id) : versao;
  return ok(c, {
    versaoAtual,
    changes: rows.map((row) => ({
      tabela: row.tabela,
      registro_id: row.registro_id,
      operacao: row.operacao,
      dados: row.dados
    }))
  });
});

export default delta;
