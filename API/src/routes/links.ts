import { Hono } from "hono";
import type { Context } from "hono";
import { requireAuth } from "../middleware/auth";
import { readRawSheets } from "../db/sheets";
import { signPayload, verifyPayload } from "../utils/jwt";
import { fail, ok } from "../utils/http";
import type { AppEnv, Bindings } from "../types";

export const LINKS_SHEET = "links";

const TICKET_TTL_SECONDS = 5 * 60;

type Link = { id: string; nome: string; url: string };
type Ticket = { link: string; exp: number };

// Não usar o JWT_SECRET puro aqui: o link temporário não pode servir como token de login.
const ticketSecret = (env: Bindings) => `${env.JWT_SECRET}:link-temporario`;

// Não usar o cache da KV aqui: a aba "links" não está no CACHE_SHEETS do Apps Script,
// então um valor cacheado nunca seria atualizado quando o link mudar na planilha.
async function readLinks(env: Bindings, signal?: AbortSignal): Promise<Link[]> {
  let rows: unknown[][] = [];
  try {
    rows = (await readRawSheets(env, [LINKS_SHEET], signal))[LINKS_SHEET] ?? [];
  } catch (err) {
    console.error("[links] Falha ao ler a aba links:", err);
  }
  return rows
    .map((row, i) => ({
      id: String(i + 2),
      nome: String(row?.[0] ?? "").trim(),
      url: String(row?.[1] ?? "").trim()
    }))
    .filter((link) => link.nome && /^https:\/\/\S+$/i.test(link.url));
}

const links = new Hono<AppEnv>();

links.get("/", requireAuth(), async (c) => {
  const list = await readLinks(c.env, c.req.raw.signal);
  return ok(c, list.map(({ id, nome }) => ({ id, nome })));
});

links.post("/:id/ticket", requireAuth(), async (c) => {
  const id = c.req.param("id");
  const found = (await readLinks(c.env, c.req.raw.signal)).find((link) => link.id === id);
  if (!found) return fail(c, 404, "Link não encontrado na planilha.", "link_not_found");

  const ticket = await signPayload({ link: id }, ticketSecret(c.env), TICKET_TTL_SECONDS);
  const base = (c.env.LINKS_BASE_URL || new URL(c.req.url).origin).replace(/\/+$/, "");
  return ok(c, { url: `${base}/r/${ticket}`, expiresIn: TICKET_TTL_SECONDS });
});

function expiredPage(c: Context<AppEnv>) {
  c.header("Cache-Control", "no-store");
  return c.html(
    `<!doctype html><html lang="pt-BR"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">` +
      `<title>Link expirado</title><body style="margin:0;display:flex;min-height:100vh;align-items:center;justify-content:center;` +
      `font-family:system-ui,sans-serif;background:#0a0a0a;color:#e4e4e7;text-align:center;padding:16px">` +
      `<div><h1 style="font-size:20px">Link expirado</h1><p style="color:#a1a1aa">Feche e abra o relatório de novo pela dashboard.</p></div></body></html>`,
    410
  );
}

export const linkRedirect = new Hono<AppEnv>();

linkRedirect.get("/:ticket", async (c) => {
  const payload = await verifyPayload<Ticket>(c.req.param("ticket"), ticketSecret(c.env));
  if (!payload?.link) return expiredPage(c);

  const found = (await readLinks(c.env, c.req.raw.signal)).find((link) => link.id === payload.link);
  if (!found) return expiredPage(c);

  c.header("Cache-Control", "no-store");
  c.header("Referrer-Policy", "no-referrer");
  return c.redirect(found.url, 302);
});

export default links;
