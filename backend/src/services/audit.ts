import type { Client } from "pg";
import { queryPage, withClient } from "../db/pool";
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

export type ChangeEntry = {
  tabela: string;
  registroId: string;
  operacao: Operacao;
  dados: unknown;
};

// Grava várias entradas do changelog em poucos round-trips (usado por
// bulkWrite, que processa dezenas/centenas de registros por chamada). Fatiado
// para respeitar o limite de 65535 parâmetros por instrução do Postgres.
const CHANGES_PER_STATEMENT = 5000;

export async function recordChanges(client: Client, changes: ChangeEntry[]) {
  for (let start = 0; start < changes.length; start += CHANGES_PER_STATEMENT) {
    const params: unknown[] = [];
    const rows = changes.slice(start, start + CHANGES_PER_STATEMENT).map((c) => {
      params.push(c.tabela, c.registroId, c.operacao, c.dados);
      const base = params.length - 4;
      return `($${base + 1}, $${base + 2}, $${base + 3}, $${base + 4})`;
    });
    await client.query(
      `insert into public.registro_alteracoes (tabela, registro_id, operacao, dados) values ${rows.join(", ")}`,
      params
    );
  }
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

  const offset = (options.page - 1) * options.limit;
  return withClient(env, (client) =>
    queryPage(
      client,
      {
        columns: "id, tabela, registro_id, operacao, dados, criado_em",
        from: "public.registro_alteracoes",
        whereSql,
        orderBy: "id desc"
      },
      params,
      options.limit,
      offset
    )
  );
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
