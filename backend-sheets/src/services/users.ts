import { appendRows, deleteRows, readTable, updateRows } from "../db/sheets";
import type { SheetRow } from "../db/sheets";
import { USERS_COLUMNS, USERS_SHEET } from "../db/tables";
import { hashPassword } from "../utils/password";
import { ApiError } from "../utils/errors";
import type { Bindings, Perfil } from "../types";

// "visitante" não é mais um perfil cadastrável (ver UsuariosView.vue) — esse
// tipo de conta deixou de existir. Fica de fora daqui mesmo que o tipo Perfil
// ainda o admita, para não permitir criar/editar para esse perfil pela API.
const PERFIS: Perfil[] = ["admin", "analista"];

type UserInput = Record<string, unknown>;

function normalizePerfil(value: unknown): Perfil {
  const perfil = String(value ?? "").trim();
  if (!PERFIS.includes(perfil as Perfil)) {
    throw new ApiError(400, `Perfil deve ser um de: ${PERFIS.join(", ")}.`, "invalid_field");
  }
  return perfil as Perfil;
}

// senha_hash nunca sai da API.
function toSafeUser(row: SheetRow) {
  const { senha_hash, ...rest } = row;
  return rest;
}

export async function listUsers(
  env: Bindings,
  options: { page: number; limit: number; perfil?: string; ativo?: boolean; search?: string }
) {
  const { rows } = await readTable(env, USERS_SHEET, USERS_COLUMNS);

  const filtered = rows.filter((row) => {
    if (options.perfil && row.perfil !== options.perfil) return false;
    if (options.ativo !== undefined && Boolean(row.ativo) !== options.ativo) return false;
    if (options.search) {
      const needle = options.search.toLowerCase();
      const haystack = `${row.nome} ${row.usuario}`.toLowerCase();
      if (!haystack.includes(needle)) return false;
    }
    return true;
  });

  const sorted = [...filtered].sort((a, b) => String(a.usuario).localeCompare(String(b.usuario)));
  const offset = (options.page - 1) * options.limit;
  const data = sorted.slice(offset, offset + options.limit).map(toSafeUser);
  return { data, total: filtered.length };
}

export async function getUser(env: Bindings, id: string) {
  const { rowById } = await readTable(env, USERS_SHEET, USERS_COLUMNS);
  const row = rowById.get(id);
  return row ? toSafeUser(row) : null;
}

export async function createUser(env: Bindings, input: UserInput) {
  const usuario = String(input.usuario ?? "").trim().toLowerCase();
  const nome = String(input.nome ?? "").trim();
  const senha = String(input.senha ?? "");
  const perfil = normalizePerfil(input.perfil);

  if (!usuario || !nome || !senha) {
    throw new ApiError(400, "Preencha usuario, nome e senha.", "missing_field");
  }
  if (!/^[a-z0-9._-]+$/.test(usuario)) {
    throw new ApiError(400, "Usuário inválido.", "invalid_field");
  }
  if (senha.length < 6) {
    throw new ApiError(400, "A senha deve ter no mínimo 6 caracteres.", "invalid_field");
  }

  const { rows } = await readTable(env, USERS_SHEET, USERS_COLUMNS);
  if (rows.some((row) => row.usuario === usuario)) {
    throw new ApiError(409, "Já existe um usuário com esse login.", "conflict");
  }

  const row: SheetRow = {
    id: crypto.randomUUID(),
    usuario,
    nome,
    perfil,
    ativo: input.ativo === undefined ? true : Boolean(input.ativo),
    senha_hash: await hashPassword(senha),
    criado_em: new Date().toISOString()
  };

  await appendRows(env, USERS_SHEET, USERS_COLUMNS, [row]);
  return toSafeUser(row);
}

export async function updateUser(env: Bindings, id: string, input: UserInput, full: boolean) {
  const { rowById } = await readTable(env, USERS_SHEET, USERS_COLUMNS);
  const current = rowById.get(id);
  if (!current) return null;

  const changes: SheetRow = {};

  if (full) {
    const nome = String(input.nome ?? "").trim();
    if (!nome) throw new ApiError(400, 'Campo "nome" é obrigatório.', "missing_field");
    changes.nome = nome;
    changes.perfil = normalizePerfil(input.perfil);
    changes.ativo = input.ativo ?? true;
  } else {
    if (input.nome !== undefined) changes.nome = String(input.nome).trim();
    if (input.perfil !== undefined) changes.perfil = normalizePerfil(input.perfil);
    if (input.ativo !== undefined) changes.ativo = Boolean(input.ativo);
  }

  if (input.senha !== undefined && input.senha !== "") {
    const senha = String(input.senha);
    if (senha.length < 6) {
      throw new ApiError(400, "A senha deve ter no mínimo 6 caracteres.", "invalid_field");
    }
    changes.senha_hash = await hashPassword(senha);
  }

  if (!Object.keys(changes).length) return toSafeUser(current);

  const merged = { ...current, ...changes, id };
  await updateRows(env, USERS_SHEET, USERS_COLUMNS, [merged]);
  return toSafeUser(merged);
}

export async function deleteUser(env: Bindings, id: string) {
  const { rowById } = await readTable(env, USERS_SHEET, USERS_COLUMNS);
  if (!rowById.get(id)) return false;
  await deleteRows(env, USERS_SHEET, [id]);
  return true;
}
