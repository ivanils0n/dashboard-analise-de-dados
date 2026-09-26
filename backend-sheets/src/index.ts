import { Hono } from "hono";
import { cors } from "hono/cors";
import type { ContentfulStatusCode } from "hono/utils/http-status";
import type { AppEnv, Bindings } from "./types";
import { ApiError } from "./utils/errors";
import { ENTITY_KEYS } from "./db/tables";
import { refreshStaleCaches } from "./services/cache";
import authRoutes from "./routes/auth";
import usersRoutes from "./routes/users";
import estadosRoutes from "./routes/estados";
import { recordsRoutes } from "./routes/records";
import dataRoutes from "./routes/data";
import cacheRoutes from "./routes/cache";

const app = new Hono<AppEnv>();

// CORS configurável por CORS_ORIGIN (lista separada por vírgula).
// Sem a variável, libera "*" (a autenticação usa Bearer token, não cookies).
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

app.get("/api/test", (c) =>
  c.json({ success: true, data: { message: "Backend (Google Sheets) funcionando" } })
);

app.route("/api/auth", authRoutes);
app.route("/api/users", usersRoutes);
app.route("/api/estados", estadosRoutes);

// Recursos por estado: colaboradores, vagas, filiais, departamentos, lançamentos.
for (const entityKey of ENTITY_KEYS) {
  app.route(`/api/${entityKey}`, recordsRoutes(entityKey));
}

app.route("/api/data", dataRoutes);
app.route("/api/cache", cacheRoutes);

app.notFound((c) => c.json({ success: false, error: { message: "Rota não encontrada." } }, 404));

app.onError((err, c) => {
  // Erros controlados devolvem a mensagem; o resto vira 500 genérico
  // (evita vazar detalhes internos da planilha).
  if (err instanceof ApiError) {
    return c.json(
      { success: false, error: { message: err.message, code: err.code } },
      err.status as ContentfulStatusCode
    );
  }

  console.error("[API]", err instanceof Error ? err.stack : err);
  return c.json({ success: false, error: { message: "Erro interno do servidor." } }, 500);
});

export default {
  fetch: app.fetch,
  // Cron trigger (ver wrangler.jsonc "triggers.crons", a cada 5 min): renova
  // só as abas do cache já vencidas — se o admin acabou de dar refresh manual,
  // a contagem daquela aba ainda não venceu e este tick não faz nada com ela.
  async scheduled(_event: ScheduledEvent, env: Bindings, ctx: ExecutionContext) {
    ctx.waitUntil(
      refreshStaleCaches(env).catch((err) => {
        console.error("[cron] Falha ao atualizar o cache:", err instanceof Error ? err.stack : err);
      })
    );
  }
};
