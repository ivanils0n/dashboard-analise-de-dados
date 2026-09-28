import { Hono } from "hono";
import { requireAuth } from "../middleware/auth";
import { refreshAllCaches } from "../services/cache";
import { ok } from "../utils/http";
import type { AppEnv } from "../types";

const cache = new Hono<AppEnv>();

// Botão "Recarregar dados" do admin: busca tudo de novo no Apps Script e
// reseta a contagem dos 5 min do cache a partir de agora (ver services/cache.ts).
cache.post("/refresh", requireAuth(["admin"]), async (c) => {
  const result = await refreshAllCaches(c.env);
  return ok(c, result);
});

export default cache;
