import { appendRows, deleteRows, readTable, readTables, rowToValues, updateRows, valuesToRow } from "../db/sheets";
import {
  appendValues,
  deleteRowNumbers,
  googleSheetsEnabled,
  readIdRows,
  readRowsByNumber,
  sheetGid,
  updateValues
} from "../db/googleSheets";
import type { SheetRow } from "../db/sheets";
import { invalidateCachedSheet } from "../db/cache";
import { ENTITIES, ESTADO_TODOS, tableName } from "../db/tables";
import type { Estado, EstadoFiltro, EntityDef } from "../db/tables";
import { buildUpsertPayload } from "../utils/validation";
import type { Bindings } from "../types";

function stateColumn(entity: EntityDef): string | null {
  return entity.columns.find((column) => column.stateRef)?.name ?? null;
}

function matchesEstado(entity: EntityDef, row: SheetRow, estado: EstadoFiltro): boolean {
  if (estado === ESTADO_TODOS) return true;
  const column = stateColumn(entity);
  if (!column) return true; // entidade sem coluna de estado (não deveria ocorrer)
  return row[column] === estado;
}

export async function listAllRecords(
  env: Bindings,
  entityKey: string,
  estado: EstadoFiltro,
  clientSignal?: AbortSignal
) {
  const entity = ENTITIES[entityKey];
  const table = tableName(entityKey);
  const { rows } = await readTable(env, table, entity.columns, clientSignal);
  return rows.filter((row) => matchesEstado(entity, row, estado));
}

export async function listManyTables(env: Bindings, entityKeys: string[], clientSignal?: AbortSignal) {
  const keys = entityKeys.filter((key) => key in ENTITIES);
  const read = await readTables(
    env,
    keys.map((key) => ({ sheetName: tableName(key), columns: ENTITIES[key].columns })),
    clientSignal
  );
  const tables: Record<string, SheetRow[]> = {};
  const errors: Record<string, string> = {};
  keys.forEach((key) => {
    const table = read[tableName(key)];
    if (table) tables[key] = table.rows;
    else errors[key] = `Aba "${tableName(key)}" não existe.`;
  });
  return { tables, errors };
}

function isFullPayload(entity: EntityDef, payload: Record<string, unknown>): boolean {
  return entity.columns.every((column) => column.readOnly || column.name in payload);
}

export async function bulkWriteViaSheetsApi(
  env: Bindings,
  entityKey: string,
  estado: Estado,
  upserts: unknown[],
  deletes: unknown[]
) {
  const entity = ENTITIES[entityKey];
  const table = tableName(entityKey);
  const columns = entity.columns;

  const byId = new Map<string, Record<string, unknown>>();
  let allNew = upserts.length > 0;
  for (const item of upserts) {
    if (!item || typeof item !== "object") continue;
    if ((item as Record<string, unknown>)._new !== true) allNew = false;
    const payload = buildUpsertPayload(entity, item as Record<string, unknown>, estado);
    if (!payload.id) {
      payload.id = crypto.randomUUID();
      allNew = false;
    }
    byId.set(String(payload.id), payload);
  }
  const deleteIds = [
    ...new Set(deletes.filter((v) => v !== null && v !== undefined).map((v) => String(v)).filter(Boolean))
  ];

  if (allNew && !deleteIds.length && [...byId.values()].every((p) => isFullPayload(entity, p))) {
    const rows = [...byId.values()].map((payload) => rowToValues(columns, payload));
    await appendValues(env, table, rows);
    await invalidateCachedSheet(env, table);
    return { upserts: rows.length, deletes: 0 };
  }

  const stateName = stateColumn(entity);
  const stateIndex = stateName ? columns.findIndex((c) => c.name === stateName) : -1;

  const gidPromise = deleteIds.length ? sheetGid(env, table) : undefined;
  gidPromise?.catch(() => {});
  const idRows = await readIdRows(env, table, stateIndex);

  const partialIds = [...byId.entries()]
    .filter(([id, payload]) => idRows.has(id) && !isFullPayload(entity, payload))
    .map(([id]) => id);
  const partialRaw = await readRowsByNumber(
    env,
    table,
    columns.length,
    partialIds.map((id) => (idRows.get(id) as { row: number }).row)
  );

  const toAppend: unknown[][] = [];
  const toUpdate: { row: number; values: unknown[] }[] = [];
  byId.forEach((payload, id) => {
    const found = idRows.get(id);
    if (!found) {
      toAppend.push(rowToValues(columns, { ...payload, id }));
      return;
    }
    const current = isFullPayload(entity, payload) ? {} : valuesToRow(columns, partialRaw.get(found.row) ?? []);
    toUpdate.push({ row: found.row, values: rowToValues(columns, { ...current, ...payload, id }) });
  });

  const deleteRowsList = deleteIds
    .map((id) => idRows.get(id))
    .filter((found): found is { row: number; state: string } => !!found && (stateIndex < 0 || found.state === estado))
    .map((found) => found.row);

  await Promise.all([appendValues(env, table, toAppend), updateValues(env, table, columns.length, toUpdate)]);
  await deleteRowNumbers(env, table, deleteRowsList, gidPromise);

  if (toAppend.length || toUpdate.length || deleteRowsList.length) {
    await invalidateCachedSheet(env, table);
  }
  return { upserts: toAppend.length + toUpdate.length, deletes: deleteRowsList.length };
}

export async function bulkWrite(
  env: Bindings,
  entityKey: string,
  estado: Estado,
  upserts: unknown[],
  deletes: unknown[]
) {
  if (googleSheetsEnabled(env)) {
    try {
      if (env.SHEET_WRITER) {
        const stub = env.SHEET_WRITER.get(env.SHEET_WRITER.idFromName(tableName(entityKey)));
        return await stub.bulk(entityKey, estado, upserts, deletes);
      }
      return await bulkWriteViaSheetsApi(env, entityKey, estado, upserts, deletes);
    } catch (err) {
      console.error("[sheets-api] lote falhou, usando Apps Script:", err);
    }
  }

  const entity = ENTITIES[entityKey];
  const table = tableName(entityKey);
  const { rowById } = await readTable(env, table, entity.columns);

  const byId = new Map<string, Record<string, unknown>>();
  for (const item of upserts) {
    if (!item || typeof item !== "object") continue;
    const payload = buildUpsertPayload(entity, item as Record<string, unknown>, estado);
    if (!payload.id) payload.id = crypto.randomUUID();
    byId.set(String(payload.id), payload);
  }

  const toAppend: SheetRow[] = [];
  const toUpdate: SheetRow[] = [];

  byId.forEach((payload, id) => {
    const current = rowById.get(id);
    if (current) toUpdate.push({ ...current, ...payload, id });
    else toAppend.push({ ...payload, id });
  });

  const [, updatedCount] = await Promise.all([
    appendRows(env, table, entity.columns, toAppend, { skipInvalidate: true }),
    updateRows(env, table, entity.columns, toUpdate, { skipInvalidate: true })
  ]);

  const deleteIds = [
    ...new Set(
      deletes
        .filter((value) => value !== null && value !== undefined)
        .map((value) => String(value))
        .filter(Boolean)
    )
  ].filter((id) => {
    const current = rowById.get(id);
    return current && matchesEstado(entity, current, estado);
  });
  const deletedCount = await deleteRows(env, table, deleteIds, { skipInvalidate: true });

  if (toAppend.length || toUpdate.length || deleteIds.length) {
    await invalidateCachedSheet(env, table);
  }

  return { upserts: toAppend.length + updatedCount, deletes: deletedCount };
}
