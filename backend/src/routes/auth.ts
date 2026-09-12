import { Hono } from "hono";
import { requireAuth } from "../middleware/auth";
import { changeName, changePassword, getProfile, login } from "../services/auth";
import { ok, readJsonBody } from "../utils/http";
import type { AppEnv } from "../types";

const auth = new Hono<AppEnv>();

auth.post("/login", async (c) => {
  const body = await readJsonBody(c);
  const result = await login(c.env, body.usuario, body.senha);
  return ok(c, result);
});

auth.get("/me", requireAuth(), async (c) => {
  const user = await getProfile(c.env, c.get("user").sub);
  return ok(c, { user });
});

auth.post("/change-name", requireAuth(), async (c) => {
  const body = await readJsonBody(c);
  const nome = await changeName(c.env, c.get("user").sub, body.nome);
  return ok(c, { nome });
});

auth.post("/change-password", requireAuth(), async (c) => {
  const body = await readJsonBody(c);
  await changePassword(c.env, c.get("user").sub, body.senhaAtual, body.senhaNova);
  return ok(c, { changed: true });
});

export default auth;
