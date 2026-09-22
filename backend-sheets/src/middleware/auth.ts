import type { MiddlewareHandler } from "hono";
import { verifyToken } from "../utils/jwt";
import type { AppEnv, Perfil } from "../types";

// Protege rotas privadas. `roles` restringe por perfil quando informado.
export function requireAuth(roles?: Perfil[]): MiddlewareHandler<AppEnv> {
  return async (c, next) => {
    if (!c.env.JWT_SECRET) {
      return c.json({ success: false, error: { message: "Servidor não configurado." } }, 500);
    }

    const header = c.req.header("Authorization") ?? "";
    const token = header.startsWith("Bearer ") ? header.slice(7) : "";
    const payload = token ? await verifyToken(token, c.env.JWT_SECRET) : null;

    if (!payload) {
      return c.json({ success: false, error: { message: "Não autenticado." } }, 401);
    }
    if (roles && roles.length && !roles.includes(payload.perfil)) {
      return c.json({ success: false, error: { message: "Acesso negado." } }, 403);
    }

    c.set("user", payload);
    await next();
  };
}
