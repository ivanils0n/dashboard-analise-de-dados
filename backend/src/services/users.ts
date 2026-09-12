import { query, withClient } from "../db/pool";
import { hashPassword } from "../utils/password";
import { ApiError } from "../utils/errors";
import type { Bindings, Perfil } from "../types";

const PERFIS: Perfil[] = ["admin", "analista", "visitante"];
const SAFE_COLUMNS = "id, email, usuario, nome, perfil, ativo, criado_em";

type UserInput = Record<string, unknown>;

function isUniqueViolation(err: unknown): boolean {
  return (
    typeof err === "object" &&
    err !== null &&
    "code" in err &&
    (err as { code?: string }).code === "23505"
  );
}

function normalizePerfil(value: unknown): Perfil {
  const perfil = String(value ?? "").trim();
  if (!PERFIS.includes(perfil as Perfil)) {
    throw new ApiError(400, `Perfil deve ser um de: ${PERFIS.join(", ")}.`, "invalid_field");
  }
  return perfil as Perfil;
}

export async function listUsers(
  env: Bindings,
  options: { page: number; limit: number; perfil?: string; ativo?: boolean; search?: string }
) {
  const where: string[] = [];
  const params: unknown[] = [];

  if (options.perfil) {
    params.push(options.perfil);
    where.push(`perfil = $${params.length}`);
  }
  if (options.ativo !== undefined) {
    params.push(options.ativo);
    where.push(`ativo = $${params.length}`);
  }
  if (options.search) {
    params.push(`%${options.search}%`);
    where.push(
      `(nome ilike $${params.length} or usuario ilike $${params.length} or email ilike $${params.length})`
    );
  }

  const whereSql = where.length ? ` where ${where.join(" and ")}` : "";

  return withClient(env, async (client) => {
    const countResult = await client.query(
      `select count(*) as total from public.usuarios${whereSql}`,
      params
    );
    const total = Number(countResult.rows[0]?.total) || 0;

    const offset = (options.page - 1) * options.limit;
    const listParams = [...params, options.limit, offset];
    const { rows } = await client.query(
      `select ${SAFE_COLUMNS} from public.usuarios${whereSql} order by usuario limit $${listParams.length - 1} offset $${listParams.length}`,
      listParams
    );

    return { data: rows, total };
  });
}

export async function getUser(env: Bindings, id: string) {
  const { rows } = await query(
    env,
    `select ${SAFE_COLUMNS} from public.usuarios where id = $1 limit 1`,
    [id]
  );
  return rows[0] ?? null;
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

  const email = `${usuario}@gente.gestao`;
  const senhaHash = await hashPassword(senha);

  try {
    const { rows } = await query(
      env,
      `insert into public.usuarios (email, usuario, nome, perfil, ativo, senha_hash) values ($1, $2, $3, $4, $5, $6) returning ${SAFE_COLUMNS}`,
      [email, usuario, nome, perfil, input.ativo === undefined ? true : Boolean(input.ativo), senhaHash]
    );
    return rows[0];
  } catch (err) {
    if (isUniqueViolation(err)) {
      throw new ApiError(409, "Já existe um usuário com esse login ou e-mail.", "conflict");
    }
    throw err;
  }
}

export async function updateUser(
  env: Bindings,
  id: string,
  input: UserInput,
  full: boolean
) {
  const sets: string[] = [];
  const params: unknown[] = [];

  if (full) {
    const nome = String(input.nome ?? "").trim();
    if (!nome) throw new ApiError(400, 'Campo "nome" é obrigatório.', "missing_field");
    sets.push(`nome = $${params.length + 1}`);
    params.push(nome);
    sets.push(`perfil = $${params.length + 1}`);
    params.push(normalizePerfil(input.perfil));
    sets.push(`ativo = $${params.length + 1}`);
    params.push(input.ativo ?? true);
  } else {
    if (input.nome !== undefined) {
      sets.push(`nome = $${params.length + 1}`);
      params.push(String(input.nome).trim());
    }
    if (input.perfil !== undefined) {
      sets.push(`perfil = $${params.length + 1}`);
      params.push(normalizePerfil(input.perfil));
    }
    if (input.ativo !== undefined) {
      sets.push(`ativo = $${params.length + 1}`);
      params.push(Boolean(input.ativo));
    }
  }

  if (input.senha !== undefined && input.senha !== "") {
    const senha = String(input.senha);
    if (senha.length < 6) {
      throw new ApiError(400, "A senha deve ter no mínimo 6 caracteres.", "invalid_field");
    }
    sets.push(`senha_hash = $${params.length + 1}`);
    params.push(await hashPassword(senha));
  }

  if (!sets.length) return getUser(env, id);

  params.push(id);
  const { rows } = await query(
    env,
    `update public.usuarios set ${sets.join(", ")} where id = $${params.length} returning ${SAFE_COLUMNS}`,
    params
  );
  return rows[0] ?? null;
}

export async function deleteUser(env: Bindings, id: string) {
  const { rowCount } = await query(env, "delete from public.usuarios where id = $1", [id]);
  return (rowCount ?? 0) > 0;
}
