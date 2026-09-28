import { Hono } from "hono";
import { requireAuth } from "../middleware/auth";
import * as usersService from "../services/users";
import { fail, ok, okList, readJsonBody } from "../utils/http";
import { buildPagination, parsePagination } from "../utils/pagination";
import type { AppEnv } from "../types";

const users = new Hono<AppEnv>();

// Toda a gestão de usuários é exclusiva do perfil admin.
users.use("*", requireAuth(["admin"]));

users.get("/", async (c) => {
  const { page, limit } = parsePagination(c);
  const perfil = c.req.query("perfil") ?? undefined;
  const ativoParam = c.req.query("ativo");
  const ativo = ativoParam === undefined ? undefined : ativoParam === "true";
  const search = c.req.query("q") ?? undefined;

  const result = await usersService.listUsers(c.env, { page, limit, perfil, ativo, search });
  return okList(c, result.data, buildPagination(page, limit, result.total));
});

users.get("/:id", async (c) => {
  const user = await usersService.getUser(c.env, c.req.param("id"));
  if (!user) return fail(c, 404, "Usuário não encontrado.", "not_found");
  return ok(c, { user });
});

users.post("/", async (c) => {
  const body = await readJsonBody(c);
  const user = await usersService.createUser(c.env, body);
  return ok(c, { user }, 201);
});

users.patch("/:id", async (c) => {
  const body = await readJsonBody(c);
  const user = await usersService.updateUser(c.env, c.req.param("id"), body, false);
  if (!user) return fail(c, 404, "Usuário não encontrado.", "not_found");
  return ok(c, { user });
});

users.put("/:id", async (c) => {
  const body = await readJsonBody(c);
  const user = await usersService.updateUser(c.env, c.req.param("id"), body, true);
  if (!user) return fail(c, 404, "Usuário não encontrado.", "not_found");
  return ok(c, { user });
});

users.delete("/:id", async (c) => {
  const id = c.req.param("id");
  if (id === c.get("user").sub) {
    return fail(c, 400, "Você não pode excluir o próprio usuário.", "invalid_operation");
  }
  const removed = await usersService.deleteUser(c.env, id);
  if (!removed) return fail(c, 404, "Usuário não encontrado.", "not_found");
  return ok(c, { deleted: true });
});

export default users;
