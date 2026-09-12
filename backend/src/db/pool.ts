import { Client, types } from "pg";
import type { Bindings } from "../types";

// A coluna `date` chega como Date no pg; devolvemos a string "YYYY-MM-DD".
types.setTypeParser(1082, (value: string) => value);

function createClient(env: Bindings): Client {
  if (!env.DATABASE_URL) {
    throw new Error("DATABASE_URL não configurada.");
  }
  return new Client({
    connectionString: env.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
    connectionTimeoutMillis: 10000
  });
}

// Uma conexão nova por requisição: no runtime do Workers, sockets guardados
// em pool entre requisições podem ficar inválidos e travar a resposta.
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
