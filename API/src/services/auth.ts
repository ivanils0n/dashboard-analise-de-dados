import { readTable, updateRows } from "../db/sheets";
import { USERS_COLUMNS, USERS_SHEET } from "../db/tables";
import { hashPassword, verifyPassword } from "../utils/password";
import { signToken, TOKEN_TTL_SECONDS } from "../utils/jwt";
import { ApiError } from "../utils/errors";
import type { Bindings, Perfil } from "../types";

type UsuarioRow = {
  id: string;
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

  const { rows } = await readTable(env, USERS_SHEET, USERS_COLUMNS);
  const user = rows.find((row) => String(row.usuario).toLowerCase() === loginValue) as
    | UsuarioRow
    | undefined;

  if (!user || !user.ativo || !(await verifyPassword(password, user.senha_hash))) {
    throw new ApiError(401, "Usuário ou senha inválidos.", "invalid_credentials");
  }

  const profile = {
    id: user.id,
    usuario: user.usuario,
    nome: user.nome,
    perfil: user.perfil
  };
  const token = await signToken({ sub: user.id, ...profile }, env.JWT_SECRET);
  return { token, expiresIn: TOKEN_TTL_SECONDS, user: profile };
}

export async function getProfile(env: Bindings, userId: string) {
  const { rowById } = await readTable(env, USERS_SHEET, USERS_COLUMNS);
  const user = rowById.get(userId);
  if (!user || !user.ativo) {
    throw new ApiError(401, "Perfil não encontrado.", "unauthorized");
  }
  const { senha_hash, ...profile } = user;
  return profile;
}

export async function changeName(env: Bindings, userId: string, nome: unknown) {
  const value = String(nome ?? "").trim();
  if (!value) throw new ApiError(400, "Informe o nome.", "missing_field");

  const { rowById } = await readTable(env, USERS_SHEET, USERS_COLUMNS);
  const current = rowById.get(userId);
  if (!current) throw new ApiError(401, "Perfil não encontrado.", "unauthorized");

  await updateRows(env, USERS_SHEET, USERS_COLUMNS, [{ ...current, nome: value, id: userId }]);
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

  const { rowById } = await readTable(env, USERS_SHEET, USERS_COLUMNS);
  const current = rowById.get(userId);
  if (!current || !(await verifyPassword(atual, String(current.senha_hash)))) {
    throw new ApiError(400, "Senha atual incorreta.", "invalid_password");
  }

  const senha_hash = await hashPassword(nova);
  await updateRows(env, USERS_SHEET, USERS_COLUMNS, [{ ...current, senha_hash, id: userId }]);
}
