import type { Client } from "pg";
import { withClient } from "../db/pool";
import type { Bindings } from "../types";

export type Operacao = "upsert" | "delete";

// Grava o changelog dentro da mesma transação da escrita.
// Nunca registra senhas: só as tabelas de dados por estado usam esta função.
export async function recordChange(
  client: Client,
  tabela: string,
  registroId: string,
  operacao: Operacao,
  dados: unknown
) {
  await client.query(
    "insert into public.registro_alteracoes (tabela, registro_id, operacao, dados) values ($1, $2, $3, $4)",
    [tabela, registroId, operacao, dados]
  );
}

type ListChangesOptions = {
  page: number;
  limit: number;
  tabela?: string;
  registroId?: string;
  operacao?: string;
  de?: string;
  ate?: string;
};

export async function listChanges(env: Bindings, options: ListChangesOptions) {
  const where: string[] = [];
  const params: unknown[] = [];

  if (options.tabela) {
    params.push(options.tabela);
    where.push(`tabela = $${params.length}`);
  }
  if (options.registroId) {
    params.push(options.registroId);
    where.push(`registro_id = $${params.length}`);
  }
  if (options.operacao) {
    params.push(options.operacao);
    where.push(`operacao = $${params.length}`);
  }
  if (options.de) {
    params.push(options.de);
    where.push(`criado_em >= $${params.length}`);
  }
  if (options.ate) {
    params.push(options.ate);
    where.push(`criado_em <= $${params.length}`);
  }

  const whereSql = where.length ? ` where ${where.join(" and ")}` : "";

  return withClient(env, async (client) => {
    const countResult = await client.query(
      `select count(*) as total from public.registro_alteracoes${whereSql}`,
      params
    );
    const total = Number(countResult.rows[0]?.total) || 0;

    const offset = (options.page - 1) * options.limit;
    const listParams = [...params, options.limit, offset];
    const { rows } = await client.query(
      `select id, tabela, registro_id, operacao, dados, criado_em from public.registro_alteracoes${whereSql} order by id desc limit $${listParams.length - 1} offset $${listParams.length}`,
      listParams
    );

    return { data: rows, total };
  });
}

export async function getChange(env: Bindings, id: number) {
  return withClient(env, async (client) => {
    const { rows } = await client.query(
      "select id, tabela, registro_id, operacao, dados, criado_em from public.registro_alteracoes where id = $1 limit 1",
      [id]
    );
    return rows[0] ?? null;
  });
}
