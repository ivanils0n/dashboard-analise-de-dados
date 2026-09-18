import { Client, types } from "pg";
import type { Bindings } from "../types";

// A coluna `date` chega como Date no pg; devolvemos a string "YYYY-MM-DD".
types.setTypeParser(1082, (value: string) => value);

function createClient(env: Bindings): Client {
  if (!env.HYPERDRIVE) {
    throw new Error("Binding HYPERDRIVE não configurado.");
  }
  return new Client({
    connectionString: env.HYPERDRIVE.connectionString,
    ssl: { rejectUnauthorized: false },
    connectionTimeoutMillis: 10000
  });
}

// Uma conexão nova por requisição: o Hyperdrive mantém o pool real de
// conexões com o banco por trás do binding, então abrir/fechar aqui é
// barato e evita sockets travados entre requisições do Worker.
export async function withClient<T>(
  env: Bindings,
  fn: (client: Client) => Promise<T>
): Promise<T> {
  const client = createClient(env);
  await client.connect();
  try {
    return await fn(client);
  } finally {
    await client.end().catch(() => {
      // ignora erro ao encerrar a conexão
    });
  }
}

export function query(env: Bindings, text: string, params?: unknown[]) {
  return withClient(env, (client) => client.query(text, params));
}

type PageSource = {
  columns: string;
  from: string;
  whereSql: string;
  orderBy: string;
};

// Página + total em uma única ida ao banco (count(*) over ()), em vez de um
// count separado antes da listagem — cada round-trip via Hyperdrive custa
// latência de rede. Só quando a página pedida passa do fim (sem linhas para
// carregar o total) é que roda o count à parte.
export async function queryPage(
  client: Client,
  source: PageSource,
  params: unknown[],
  limit: number,
  offset: number
): Promise<{ data: Record<string, unknown>[]; total: number }> {
  const listParams = [...params, limit, offset];
  const { rows } = await client.query(
    `select ${source.columns}, count(*) over () as __total from ${source.from}${source.whereSql} order by ${source.orderBy} limit $${listParams.length - 1} offset $${listParams.length}`,
    listParams
  );

  if (rows.length) {
    const total = Number(rows[0].__total) || 0;
    for (const row of rows) delete row.__total;
    return { data: rows, total };
  }
  if (offset === 0) return { data: [], total: 0 };

  const countResult = await client.query(
    `select count(*) as total from ${source.from}${source.whereSql}`,
    params
  );
  return { data: [], total: Number(countResult.rows[0]?.total) || 0 };
}

export async function withTransaction<T>(
  env: Bindings,
  fn: (client: Client) => Promise<T>
): Promise<T> {
  return withClient(env, async (client) => {
    await client.query("BEGIN");
    try {
      const result = await fn(client);
      await client.query("COMMIT");
      return result;
    } catch (err) {
      try {
        await client.query("ROLLBACK");
      } catch {
        // ignora erro no rollback
      }
      throw err;
    }
  });
}
