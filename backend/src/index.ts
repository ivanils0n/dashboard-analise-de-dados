import { Hono } from "hono";
import { cors } from "hono/cors";
import type { ContentfulStatusCode } from "hono/utils/http-status";
import type { AppEnv } from "./types";
import { ApiError } from "./utils/errors";
import { ENTITY_KEYS } from "./db/tables";
import authRoutes from "./routes/auth";
import usersRoutes from "./routes/users";
import estadosRoutes from "./routes/estados";
import { recordsRoutes } from "./routes/records";
import auditRoutes from "./routes/audit";
import deltaRoutes from "./routes/delta";
import dataRoutes from "./routes/data";

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
  c.json({ success: true, data: { service: "gente-gestao-api", status: "ok" } })
);

app.get("/api/test", (c) =>
  c.json({ success: true, data: { message: "Backend funcionando" } })
);

app.route("/api/auth", authRoutes);
app.route("/api/users", usersRoutes);
app.route("/api/estados", estadosRoutes);

// Recursos por estado: colaboradores, vagas, filiais, departamentos, lançamentos.
for (const entityKey of ENTITY_KEYS) {
  app.route(`/api/${entityKey}`, recordsRoutes(entityKey));
}

app.route("/api/registro-alteracoes", auditRoutes);
app.route("/api/delta", deltaRoutes);
app.route("/api/data", dataRoutes);

app.notFound((c) => c.json({ success: false, error: { message: "Rota não encontrada." } }, 404));

app.onError((err, c) => {
  // Erros controlados devolvem a mensagem; o resto vira 500 genérico
  // (evita vazar detalhes internos do banco).
  if (err instanceof ApiError) {
    return c.json(
      { success: false, error: { message: err.message, code: err.code } },
      err.status as ContentfulStatusCode
    );
  }

  console.error("[API]", err instanceof Error ? err.stack : err);
  return c.json({ success: false, error: { message: "Erro interno do servidor." } }, 500);
});

export default app;
