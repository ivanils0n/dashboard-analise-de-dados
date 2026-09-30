import { Hono } from "hono";
import { requireAuth } from "../middleware/auth";
import { refreshAllCaches } from "../services/cache";
import { ok } from "../utils/http";
import type { AppEnv } from "../types";

const cache = new Hono<AppEnv>();

cache.post("/refresh", requireAuth(["admin"]), async (c) => {
  const result = await refreshAllCaches(c.env);
  return ok(c, result);
});

export default cache;
