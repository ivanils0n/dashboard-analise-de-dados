import { query, withClient, withTransaction } from "../db/pool";
import { ENTITIES, tableName } from "../db/tables";
import type { EntityDef, Estado } from "../db/tables";
import { recordChange } from "./audit";
import { buildCreatePayload, buildUpdatePayload, buildUpsertPayload } from "../utils/validation";
import type { Bindings } from "../types";

type Filters = Record<string, string>;

function buildWhere(entity: EntityDef, filters: Filters, search?: string) {
  const where: string[] = [];
  const params: unknown[] = [];

  for (const filter of entity.filters) {
    const value = filters[filter.param];
    if (value === undefined || value === "") continue;

    if (filter.kind === "isnull") {
      where.push(`${filter.column} is ${value === "true" ? "" : "not "}null`);
      continue;
    }

    params.push(filter.kind === "ilike" ? `%${value}%` : value);
    const placeholder = `$${params.length}`;
    if (filter.kind === "ilike") where.push(`${filter.column} ilike ${placeholder}`);
    else if (filter.kind === "gte") where.push(`${filter.column} >= ${placeholder}`);
    else if (filter.kind === "lte") where.push(`${filter.column} <= ${placeholder}`);
    else where.push(`${filter.column} = ${placeholder}`);
  }

  if (search && entity.search.length) {
    const parts = entity.search.map((column) => {
      params.push(`%${search}%`);
      return `${column} ilike $${params.length}`;
    });
    where.push(`(${parts.join(" or ")})`);
  }

  return { whereSql: where.length ? ` where ${where.join(" and ")}` : "", params };
}

export async function listRecords(
  env: Bindings,
  entityKey: string,
  estado: Estado,
  options: { page: number; limit: number; filters: Filters; search?: string }
) {
  const entity = ENTITIES[entityKey];
  const table = tableName(entityKey, estado);
  const { whereSql, params } = buildWhere(entity, options.filters, options.search);

  // Uma única conexão para o count + a listagem.
  return withClient(env, async (client) => {
    const countResult = await client.query(
      `select count(*) as total from public.${table}${whereSql}`,
      params
    );
    const total = Number(countResult.rows[0]?.total) || 0;

    const offset = (options.page - 1) * options.limit;
    const listParams = [...params, options.limit, offset];
    const { rows } = await client.query(
      `select * from public.${table}${whereSql} order by ${entity.orderBy} limit $${listParams.length - 1} offset $${listParams.length}`,
      listParams
    );

    return { data: rows, total };
  });
}

export async function listAllRecords(env: Bindings, entityKey: string, estado: Estado) {
  const table = tableName(entityKey, estado);
  const { rows } = await query(env, `select * from public.${table}`);
  return rows;
}

export async function getRecord(env: Bindings, entityKey: string, estado: Estado, id: string) {
  const table = tableName(entityKey, estado);
  const { rows } = await query(env, `select * from public.${table} where id = $1 limit 1`, [id]);
  return rows[0] ?? null;
}

export async function createRecord(
  env: Bindings,
  entityKey: string,
  estado: Estado,
  body: Record<string, unknown>
) {
  const entity = ENTITIES[entityKey];
  const table = tableName(entityKey, estado);
  const payload = buildCreatePayload(entity, body, estado);
  if (!payload.id) payload.id = crypto.randomUUID();

  const keys = Object.keys(payload);
  const sql = `insert into public.${table} (${keys.join(", ")}) values (${keys
    .map((_, index) => `$${index + 1}`)
    .join(", ")}) returning *`;

  return withTransaction(env, async (client) => {
    const { rows } = await client.query(sql, keys.map((key) => payload[key]));
    const row = rows[0];
    await recordChange(client, table, String(row.id), "upsert", row);
    return row;
  });
}

export async function updateRecord(
  env: Bindings,
  entityKey: string,
  estado: Estado,
  id: string,
  body: Record<string, unknown>,
  full: boolean
) {
  const entity = ENTITIES[entityKey];
  const table = tableName(entityKey, estado);
  const payload = buildUpdatePayload(entity, body, estado, full);

  const keys = Object.keys(payload);
  if (!keys.length) return getRecord(env, entityKey, estado, id);

  const setParts = keys.map((key, index) => `${key} = $${index + 1}`);
  if (entity.hasUpdatedAt) setParts.push("atualizado_em = now()");

  const setSql = setParts.join(", ");
  const params: unknown[] = keys.map((key) => payload[key]);
  params.push(id);

  return withTransaction(env, async (client) => {
    const { rows } = await client.query(
      `update public.${table} set ${setSql} where id = $${params.length} returning *`,
      params
    );
    const row = rows[0];
    if (!row) return null;
    await recordChange(client, table, String(row.id), "upsert", row);
    return row;
  });
}

export async function deleteRecord(
  env: Bindings,
  entityKey: string,
  estado: Estado,
  id: string
) {
  const table = tableName(entityKey, estado);

  return withTransaction(env, async (client) => {
    const existing = await client.query(`select * from public.${table} where id = $1 limit 1`, [id]);
    const row = existing.rows[0];
    if (!row) return false;

    await client.query(`delete from public.${table} where id = $1`, [id]);
    await recordChange(client, table, id, "delete", row);
    return true;
  });
}

// Escrita em lote (upsert/delete) usada pela sincronização do frontend.
export async function bulkWrite(
  env: Bindings,
  entityKey: string,
  estado: Estado,
  upserts: unknown[],
  deletes: unknown[]
) {
  const entity = ENTITIES[entityKey];
  const table = tableName(entityKey, estado);

  return withTransaction(env, async (client) => {
    let upserted = 0;
    for (const item of upserts) {
      if (!item || typeof item !== "object") continue;
      const payload = buildUpsertPayload(entity, item as Record<string, unknown>, estado);
      if (!payload.id) payload.id = crypto.randomUUID();

      const keys = Object.keys(payload);
      const columns = [...keys];
      const valueExprs = keys.map((_, index) => `$${index + 1}`);
      const updates = keys.filter((key) => key !== "id").map((key) => `${key} = excluded.${key}`);
      if (entity.hasUpdatedAt) {
        columns.push("atualizado_em");
        valueExprs.push("now()");
        updates.push("atualizado_em = now()");
      }
      const conflict = updates.length ? `do update set ${updates.join(", ")}` : "do nothing";
      const sql = `insert into public.${table} (${columns.join(", ")}) values (${valueExprs.join(", ")}) on conflict (id) ${conflict} returning *`;

      const { rows } = await client.query(sql, keys.map((key) => payload[key]));
      const row = rows[0] ?? payload;
      await recordChange(client, table, String(row.id), "upsert", row);
      upserted++;
    }

    let deleted = 0;
    for (const value of deletes) {
      if (value === null || value === undefined) continue;
      const id = String(value);
      if (!id) continue;
      const existing = await client.query(`select * from public.${table} where id = $1 limit 1`, [id]);
      const row = existing.rows[0];
      // Registro ausente: nada a excluir. Gravar o changelog aqui criaria uma
      // entrada fantasma (dados null) e avançaria a versão do delta à toa.
      if (!row) continue;

      await client.query(`delete from public.${table} where id = $1`, [id]);
      await recordChange(client, table, id, "delete", row);
      deleted++;
    }

    return { upserts: upserted, deletes: deleted };
  });
}
