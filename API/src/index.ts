import { Hono } from "hono";
import { cors } from "hono/cors";
import type { ContentfulStatusCode } from "hono/utils/http-status";
import type { AppEnv } from "./types";
import { ApiError } from "./utils/errors";
import authRoutes from "./routes/auth";
import usersRoutes from "./routes/users";
import dataRoutes from "./routes/data";
import cacheRoutes from "./routes/cache";

const app = new Hono<AppEnv>();

app.use(
  "*",
  cors({
    origin: (origin, c) => {
      const configured = String(c.env.CORS_ORIGIN ?? "")
        .split(",")
        .map((value) => value.trim())
        .filter(Boolean);

      if (!configured.length) return "*";
      if (!origin) return configured[0];
      return configured.includes(origin) ? origin : configured[0];
    },
    allowMethods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowHeaders: ["Content-Type", "Authorization"],
    maxAge: 86400
  })
);

app.get("/", (c) =>
  c.json({ success: true, data: { service: "gente-gestao-api-sheets", status: "ok" } })
);

app.route("/api/auth", authRoutes);
app.route("/api/users", usersRoutes);

app.route("/api/data", dataRoutes);
app.route("/api/cache", cacheRoutes);

app.notFound((c) => c.json({ success: false, error: { message: "Rota não encontrada." } }, 404));

app.onError((err, c) => {
  if (err instanceof ApiError) {
    return c.json(
      { success: false, error: { message: err.message, code: err.code } },
      err.status as ContentfulStatusCode
    );
  }

  console.error("[API]", err instanceof Error ? err.stack : err);
  return c.json({ success: false, error: { message: "Erro interno do servidor." } }, 500);
});

export { SheetWriter } from "./db/sheetWriter";

export default app;
