import { appendRows, deleteRows, readTable, updateRows } from "../db/sheets";
import type { SheetRow } from "../db/sheets";
import { ENTITIES, ESTADO_TODOS, tableName } from "../db/tables";
import type { ColumnDef, Estado, EstadoFiltro, EntityDef } from "../db/tables";
import { buildCreatePayload, buildUpdatePayload, buildUpsertPayload } from "../utils/validation";
import type { Bindings } from "../types";

type Filters = Record<string, string>;

function findColumn(entity: EntityDef, name: string): ColumnDef | undefined {
  return entity.columns.find((column) => column.name === name);
}

// Coluna que guarda o estado dentro da aba compartilhada (ex.: "estado_sigla").
function stateColumn(entity: EntityDef): string | null {
  return entity.columns.find((column) => column.stateRef)?.name ?? null;
}

// Desde a consolidação das abas por estado numa aba só por entidade, isolar
// RO/AM/PA deixou de ser "ler a aba certa" e passou a ser filtrar em memória
// pela coluna estado_sigla. ESTADO_TODOS (leitura agregada) não filtra nada.
function matchesEstado(entity: EntityDef, row: SheetRow, estado: EstadoFiltro): boolean {
  if (estado === ESTADO_TODOS) return true;
  const column = stateColumn(entity);
  if (!column) return true; // entidade sem coluna de estado (não deveria ocorrer)
  return row[column] === estado;
}

function matchesFilters(entity: EntityDef, row: SheetRow, filters: Filters): boolean {
  for (const filter of entity.filters) {
    const value = filters[filter.param];
    if (value === undefined || value === "") continue;
    const cell = row[filter.column];

    if (filter.kind === "isnull") {
      const isNull = cell === null || cell === undefined;
      if (isNull !== (value === "true")) return false;
      continue;
    }
    if (filter.kind === "ilike") {
      if (!String(cell ?? "").toLowerCase().includes(value.toLowerCase())) return false;
      continue;
    }

    const numeric = findColumn(entity, filter.column)?.type === "number";
    if (filter.kind === "gte") {
      if (cell === null || cell === undefined) return false;
      if (numeric ? Number(cell) < Number(value) : String(cell) < value) return false;
      continue;
    }
    if (filter.kind === "lte") {
      if (cell === null || cell === undefined) return false;
      if (numeric ? Number(cell) > Number(value) : String(cell) > value) return false;
      continue;
    }
    // eq
    if (String(cell ?? "") !== value) return false;
  }
  return true;
}

function matchesSearch(entity: EntityDef, row: SheetRow, search?: string): boolean {
  if (!search || !entity.search.length) return true;
  const needle = search.toLowerCase();
  return entity.search.some((column) => String(row[column] ?? "").toLowerCase().includes(needle));
}

type OrderPart = { column: string; desc: boolean };

// "mes_referencia desc" / "data desc, criado_em desc" -> partes ordenáveis em memória.
function parseOrderBy(orderBy: string): OrderPart[] {
  return orderBy
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => {
      const desc = /\sdesc$/i.test(part);
      const column = part.replace(/\s+(asc|desc)$/i, "").trim();
      return { column, desc };
    });
}

function compareValues(a: unknown, b: unknown): number {
  if (a === null || a === undefined) return b === null || b === undefined ? 0 : -1;
  if (b === null || b === undefined) return 1;
  if (typeof a === "number" && typeof b === "number") return a - b;
  const [sa, sb] = [String(a), String(b)];
  return sa < sb ? -1 : sa > sb ? 1 : 0;
}

// `id` como último critério de desempate — mesmo papel do "order by ..., id"
// do serviço original: garante uma ordem estável entre páginas.
function sortRows(rows: SheetRow[], orderBy: string): SheetRow[] {
  const parts = [...parseOrderBy(orderBy), { column: "id", desc: false }];
  return [...rows].sort((a, b) => {
    for (const part of parts) {
      const cmp = compareValues(a[part.column], b[part.column]);
      if (cmp !== 0) return part.desc ? -cmp : cmp;
    }
    return 0;
  });
}

export async function listRecords(
  env: Bindings,
  entityKey: string,
  estado: EstadoFiltro,
  options: { page: number; limit: number; filters: Filters; search?: string }
) {
  const entity = ENTITIES[entityKey];
  const table = tableName(entityKey);
  const { rows } = await readTable(env, table, entity.columns);

  const filtered = rows.filter(
    (row) =>
      matchesEstado(entity, row, estado) &&
      matchesFilters(entity, row, options.filters) &&
      matchesSearch(entity, row, options.search)
  );
  const sorted = sortRows(filtered, entity.orderBy);

  const offset = (options.page - 1) * options.limit;
  const data = sorted.slice(offset, offset + options.limit);
  return { data, total: filtered.length };
}

export async function listAllRecords(env: Bindings, entityKey: string, estado: EstadoFiltro) {
  const entity = ENTITIES[entityKey];
  const table = tableName(entityKey);
  const { rows } = await readTable(env, table, entity.columns);
  return rows.filter((row) => matchesEstado(entity, row, estado));
}

export async function getRecord(env: Bindings, entityKey: string, estado: Estado, id: string) {
  const entity = ENTITIES[entityKey];
  const table = tableName(entityKey);
  const { rowById } = await readTable(env, table, entity.columns);
  const row = rowById.get(id) ?? null;
  // Isolamento entre estados: agora que a aba é compartilhada, um id de outro
  // estado não pode "vazar" pela rota /:estado/:id.
  if (row && !matchesEstado(entity, row, estado)) return null;
  return row;
}

export async function createRecord(
  env: Bindings,
  entityKey: string,
  estado: Estado,
  body: Record<string, unknown>
) {
  const entity = ENTITIES[entityKey];
  const table = tableName(entityKey);
  const payload = buildCreatePayload(entity, body, estado);
  if (!payload.id) payload.id = crypto.randomUUID();
  if (entity.hasUpdatedAt) payload.criado_em = new Date().toISOString();

  await appendRows(env, table, entity.columns, [payload]);
  return payload;
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
  const table = tableName(entityKey);
  const payload = buildUpdatePayload(entity, body, estado, full);

  const { rowNumberById, rowById } = await readTable(env, table, entity.columns);
  const rowNumber = rowNumberById.get(id);
  const current = rowById.get(id);
  // Isolamento entre estados (ver getRecord): não deixa editar um id de outro estado.
  if (!rowNumber || !current || !matchesEstado(entity, current, estado)) return null;

  const merged: SheetRow = { ...current, ...payload, id };
  if (entity.hasUpdatedAt) merged.atualizado_em = new Date().toISOString();

  await updateRows(env, table, entity.columns, [{ rowNumber, row: merged }]);
  return merged;
}

export async function deleteRecord(
  env: Bindings,
  entityKey: string,
  estado: Estado,
  id: string
) {
  const entity = ENTITIES[entityKey];
  const table = tableName(entityKey);
  const { rowNumberById, rowById } = await readTable(env, table, entity.columns);
  const rowNumber = rowNumberById.get(id);
  const current = rowById.get(id);
  if (!rowNumber || !current || !matchesEstado(entity, current, estado)) return false;

  await deleteRows(env, table, [rowNumber]);
  return true;
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
  const table = tableName(entityKey);
  const { rowNumberById, rowById } = await readTable(env, table, entity.columns);

  // Um upsert por id: o último enviado vence quando o mesmo id aparece mais de uma vez.
  const byId = new Map<string, Record<string, unknown>>();
  for (const item of upserts) {
    if (!item || typeof item !== "object") continue;
    const payload = buildUpsertPayload(entity, item as Record<string, unknown>, estado);
    if (!payload.id) payload.id = crypto.randomUUID();
    byId.set(String(payload.id), payload);
  }

  const toAppend: SheetRow[] = [];
  const toUpdate: { rowNumber: number; row: SheetRow }[] = [];
  const now = entity.hasUpdatedAt ? new Date().toISOString() : null;

  byId.forEach((payload, id) => {
    const rowNumber = rowNumberById.get(id);
    const current = rowById.get(id);
    // Isolamento entre estados (ver getRecord): um id que já existe em outro
    // estado não é sobrescrito — é tratado como criação de um registro novo.
    if (rowNumber && current && matchesEstado(entity, current, estado)) {
      const merged: SheetRow = { ...current, ...payload, id };
      if (now) merged.atualizado_em = now;
      toUpdate.push({ rowNumber, row: merged });
    } else {
      const created: SheetRow = { ...payload, id };
      if (now) created.criado_em = now;
      toAppend.push(created);
    }
  });

  await Promise.all([appendRows(env, table, entity.columns, toAppend), updateRows(env, table, entity.columns, toUpdate)]);

  // Deduplica ids marcados para exclusão mais de uma vez no mesmo lote.
  const deleteIds = [
    ...new Set(
      deletes
        .filter((value) => value !== null && value !== undefined)
        .map((value) => String(value))
        .filter(Boolean)
    )
  ];
  const rowsToDelete = deleteIds
    .filter((id) => {
      const current = rowById.get(id);
      return current && matchesEstado(entity, current, estado);
    })
    .map((id) => rowNumberById.get(id))
    .filter((n): n is number => Boolean(n));
  await deleteRows(env, table, rowsToDelete);

  return { upserts: toAppend.length + toUpdate.length, deletes: rowsToDelete.length };
}
