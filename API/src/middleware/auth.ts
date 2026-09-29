import type { MiddlewareHandler } from "hono";
import { readTable } from "../db/sheets";
import { USERS_COLUMNS, USERS_SHEET } from "../db/tables";
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

    // O token vale 6 h, mas o usuário pode ter sido desativado, apagado ou
    // rebaixado nesse meio tempo — confere na aba "usuarios" (vem do cache da
    // KV) e usa o perfil ATUAL, nunca o que ficou gravado no token.
    const { rowById } = await readTable(c.env, USERS_SHEET, USERS_COLUMNS);
    const current = rowById.get(String(payload.sub));
    if (!current || !current.ativo) {
      return c.json({ success: false, error: { message: "Não autenticado." } }, 401);
    }
    const perfil = current.perfil as Perfil;

    if (roles && roles.length && !roles.includes(perfil)) {
      return c.json({ success: false, error: { message: "Acesso negado." } }, 403);
    }

    c.set("user", { ...payload, perfil });
    await next();
  };
}
