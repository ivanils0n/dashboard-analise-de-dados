import { ApiError } from "./errors";
import type { ColumnDef, EntityDef, Estado } from "../db/tables";

function coerceValue(column: ColumnDef, value: unknown): unknown {
  switch (column.type) {
    case "text":
      return String(value);
    case "number": {
      const num = Number(value);
      if (!Number.isFinite(num)) {
        throw new ApiError(400, `Campo "${column.name}" deve ser numérico.`, "invalid_field");
      }
      return num;
    }
    case "boolean": {
      if (typeof value === "boolean") return value;
      const text = String(value).toLowerCase();
      if (text === "true" || text === "1") return true;
      if (text === "false" || text === "0") return false;
      throw new ApiError(400, `Campo "${column.name}" deve ser booleano.`, "invalid_field");
    }
    case "date": {
      const text = String(value);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) {
        throw new ApiError(400, `Campo "${column.name}" deve estar no formato YYYY-MM-DD.`, "invalid_field");
      }
      return text;
    }
    case "timestamptz": {
      const text = String(value);
      if (Number.isNaN(new Date(text).getTime())) {
        throw new ApiError(400, `Campo "${column.name}" deve ser uma data/hora válida.`, "invalid_field");
      }
      return text;
    }
    case "json":
      return value;
    default:
      return value;
  }
}

function applyColumn(
  target: Record<string, unknown>,
  column: ColumnDef,
  raw: unknown,
  required: boolean
) {
  if (raw === undefined) {
    if (required) {
      throw new ApiError(400, `Campo "${column.name}" é obrigatório.`, "missing_field");
    }
    return;
  }
  if (raw === null) {
    if (required) {
      throw new ApiError(400, `Campo "${column.name}" é obrigatório.`, "missing_field");
    }
    if (column.notNull) {
      throw new ApiError(400, `Campo "${column.name}" não pode ser nulo.`, "invalid_field");
    }
    target[column.name] = null;
    return;
  }

  const value = coerceValue(column, raw);
  if (column.values && !column.values.includes(String(value))) {
    throw new ApiError(
      400,
      `Campo "${column.name}" deve ser um de: ${column.values.join(", ")}.`,
      "invalid_field"
    );
  }
  target[column.name] = value;
}

export function buildCreatePayload(
  entity: EntityDef,
  body: Record<string, unknown>,
  estado: Estado
): Record<string, unknown> {
  const payload: Record<string, unknown> = {};

  for (const column of entity.columns) {
    if (column.readOnly) continue;
    if (column.name === "id") {
      if (body.id !== undefined && body.id !== null && body.id !== "") {
        payload.id = String(body.id);
      }
      continue;
    }
    if (column.stateRef) {
      payload[column.name] = estado;
      continue;
    }
    applyColumn(payload, column, body[column.name], Boolean(column.required));
  }

  return payload;
}

// Usado no endpoint em lote: aceita só os campos enviados, sem exigir os
// obrigatórios (o registro normalmente já existe).
export function buildUpsertPayload(
  entity: EntityDef,
  body: Record<string, unknown>,
  estado: Estado
): Record<string, unknown> {
  const payload: Record<string, unknown> = {};

  for (const column of entity.columns) {
    if (column.readOnly) continue;
    if (column.name === "id") {
      if (body.id !== undefined && body.id !== null && body.id !== "") {
        payload.id = String(body.id);
      }
      continue;
    }
    if (column.stateRef) {
      payload[column.name] = estado;
      continue;
    }
    if (body[column.name] === undefined) continue;
    applyColumn(payload, column, body[column.name], false);
  }

  return payload;
}

// full = true (PUT) exige os obrigatórios e zera os opcionais ausentes.
// full = false (PATCH) altera apenas os campos enviados.
export function buildUpdatePayload(
  entity: EntityDef,
  body: Record<string, unknown>,
  estado: Estado,
  full: boolean
): Record<string, unknown> {
  const payload: Record<string, unknown> = {};

  for (const column of entity.columns) {
    if (column.readOnly || column.name === "id") continue;
    if (column.stateRef) {
      payload[column.name] = estado;
      continue;
    }
    const raw = body[column.name];
    if (raw === undefined && full) {
      // Campos NOT NULL sem valor no PUT mantêm o valor atual.
      if (column.notNull) continue;
      applyColumn(payload, column, null, Boolean(column.required));
      continue;
    }
    applyColumn(payload, column, raw, full && Boolean(column.required));
  }

  return payload;
}
