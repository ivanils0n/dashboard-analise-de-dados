import { query } from "../db/pool";
import { hashPassword, verifyPassword } from "../utils/password";
import { signToken, TOKEN_TTL_SECONDS } from "../utils/jwt";
import { ApiError } from "../utils/errors";
import type { Bindings, Perfil } from "../types";

type UsuarioRow = {
  id: string;
  email: string;
  usuario: string;
  nome: string;
  perfil: Perfil;
  ativo: boolean;
  senha_hash: string;
};

export async function login(env: Bindings, usuario: unknown, senha: unknown) {
  const loginValue = String(usuario ?? "").trim().toLowerCase();
  const password = String(senha ?? "");
  if (!loginValue || !password) {
    throw new ApiError(400, "Informe usuário e senha.", "missing_field");
  }

  const email = loginValue.includes("@") ? loginValue : `${loginValue}@gente.gestao`;
  const { rows } = await query(
    env,
    "select id, email, usuario, nome, perfil, ativo, senha_hash from public.usuarios where lower(email) = $1 limit 1",
    [email]
  );
  const user = rows[0] as UsuarioRow | undefined;

  if (!user || !user.ativo || !(await verifyPassword(password, user.senha_hash))) {
    throw new ApiError(401, "Usuário ou senha inválidos.", "invalid_credentials");
  }

  const profile = {
    id: user.id,
    email: user.email,
    usuario: user.usuario,
    nome: user.nome,
    perfil: user.perfil
  };
  const token = await signToken({ sub: user.id, ...profile }, env.JWT_SECRET);
  return { token, expiresIn: TOKEN_TTL_SECONDS, user: profile };
}

export async function getProfile(env: Bindings, userId: string) {
  const { rows } = await query(
    env,
    "select id, email, usuario, nome, perfil, ativo, criado_em from public.usuarios where id = $1 limit 1",
    [userId]
  );
  const user = rows[0];
  if (!user || !user.ativo) {
    throw new ApiError(401, "Perfil não encontrado.", "unauthorized");
  }
  return user;
}

export async function changeName(env: Bindings, userId: string, nome: unknown) {
  const value = String(nome ?? "").trim();
  if (!value) throw new ApiError(400, "Informe o nome.", "missing_field");
  await query(env, "update public.usuarios set nome = $1 where id = $2", [value, userId]);
  return value;
}

export async function changePassword(
  env: Bindings,
  userId: string,
  senhaAtual: unknown,
  senhaNova: unknown
) {
  const atual = String(senhaAtual ?? "");
  const nova = String(senhaNova ?? "");
  if (!atual || !nova) {
    throw new ApiError(400, "Informe a senha atual e a nova.", "missing_field");
  }
  if (nova.length < 6) {
    throw new ApiError(400, "A nova senha deve ter no mínimo 6 caracteres.", "invalid_field");
  }

  const { rows } = await query(
    env,
    "select senha_hash from public.usuarios where id = $1 limit 1",
    [userId]
  );
  if (!rows[0] || !(await verifyPassword(atual, rows[0].senha_hash as string))) {
    throw new ApiError(400, "Senha atual incorreta.", "invalid_password");
  }

  await query(env, "update public.usuarios set senha_hash = $1 where id = $2", [
    await hashPassword(nova),
    userId
  ]);
}
