import type { Bindings } from "../types";
import type { ColumnDef } from "./tables";
import {
  allSheetNames,
  invalidateCachedSheet,
  readCachedSheet,
  readManyCachedSheets,
  writeCachedSheets
} from "./cache";
import {
  appendValues,
  deleteRowNumbers,
  googleSheetsEnabled,
  readIdRows,
  readSheetsRaw,
  updateValues
} from "./googleSheets";

export type SheetRow = Record<string, unknown>;

const MAX_ATTEMPTS = 4;
const RETRY_BASE_DELAY_MS = 400;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function callAppsScriptOnce<T>(
  env: Bindings,
  action: string,
  params: Record<string, unknown>,
  clientSignal?: AbortSignal
): Promise<{ ok: true; data: T } | { ok: false; retriable: boolean; message: string }> {
  const controller = new AbortController();
  const onClientAbort = () => controller.abort();
  clientSignal?.addEventListener("abort", onClientAbort);
  let res: Response;
  try {
    res = await fetch(env.APPS_SCRIPT_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ secret: env.APPS_SCRIPT_SECRET, action, ...params }),
      signal: controller.signal
    });
  } finally {
    clientSignal?.removeEventListener("abort", onClientAbort);
  }

  const text = await res.text();
  if (!res.ok) {
    return { ok: false, retriable: true, message: `Apps Script HTTP ${res.status} na ação "${action}": ${text}` };
  }

  let payload: { success: boolean; data?: T; error?: string; retriable?: boolean };
  try {
    payload = JSON.parse(text);
  } catch {
    return { ok: false, retriable: true, message: `Apps Script devolveu resposta inválida na ação "${action}".` };
  }

  if (!payload.success) {
    return {
      ok: false,
      retriable: Boolean(payload.retriable),
      message: `Apps Script recusou a ação "${action}": ${payload.error ?? "erro desconhecido"}`
    };
  }
  return { ok: true, data: payload.data as T };
}

async function callAppsScript<T>(
  env: Bindings,
  action: string,
  params: Record<string, unknown> = {},
  clientSignal?: AbortSignal
): Promise<T> {
  let lastMessage = "";
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    if (clientSignal?.aborted) throw new Error("Requisição cancelada pelo cliente.");
    const result = await callAppsScriptOnce<T>(env, action, params, clientSignal);
    if (result.ok) return result.data;
    if (!result.retriable || attempt === MAX_ATTEMPTS) throw new Error(result.message);

    lastMessage = result.message;
    const jitter = Math.random() * RETRY_BASE_DELAY_MS;
    await sleep(RETRY_BASE_DELAY_MS * attempt + jitter);
  }
  throw new Error(lastMessage);
}

function toCellValue(column: ColumnDef | undefined, value: unknown): unknown {
  if (value === undefined || value === null) return "";
  if (column?.type === "json") return JSON.stringify(value);
  if (column?.type === "boolean") return Boolean(value);
  if (column?.type === "number") return Number(value);
  return String(value);
}

function parseFlexibleNumber(raw: string): number | null {
  const s = raw.trim().replace(/^(r\$|\$|R\$)\s*/i, "").trim();
  if (!s) return null;

  const time = /^(\d{1,3}):([0-5]?\d)(?::([0-5]?\d))?$/.exec(s);
  if (time) {
    const hours = Number(time[1]);
    const minutes = Number(time[2]);
    const seconds = time[3] ? Number(time[3]) : 0;
    return hours + minutes / 60 + seconds / 3600;
  }

  const isoTime = /T(\d{2}):(\d{2}):(\d{2})/.exec(s);
  if (isoTime) {
    const hours = Number(isoTime[1]);
    const minutes = Number(isoTime[2]);
    const seconds = Number(isoTime[3]);
    return hours + minutes / 60 + seconds / 3600;
  }

  if (/^-?[\d.,]+$/.test(s) && s.includes(",")) {
    const normalized = s.replace(/\./g, "").replace(",", ".");
    const num = Number(normalized);
    if (Number.isFinite(num)) return num;
  }

  const plain = Number(s);
  return Number.isFinite(plain) ? plain : null;
}

const MESES_PT = [
  "janeiro", "fevereiro", "marco", "abril", "maio", "junho",
  "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"
];

function mesPorNome(word: string): number | null {
  if (!word || word.length < 3) return null;
  const idx = MESES_PT.findIndex((nome) => nome.startsWith(word));
  return idx >= 0 ? idx + 1 : null;
}

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

function parseSheetsSerial(s: string): string | null {
  if (!/^\d{5}(?:\.\d+)?$/.test(s)) return null;
  const serial = Math.floor(Number(s));
  if (serial < 20000 || serial > 80000) return null;
  return new Date(Date.UTC(1899, 11, 30) + serial * 86400000).toISOString().slice(0, 10);
}

function parseFlexibleDate(raw: string): string | null {
  const s = raw.trim();
  if (!s) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const serial = parseSheetsSerial(s);
  if (serial) return serial;

  let m = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);
  if (m) return `${m[3]}-${pad2(Number(m[2]))}-${pad2(Number(m[1]))}`;
  m = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2})$/);
  if (m) return `20${m[3]}-${pad2(Number(m[2]))}-${pad2(Number(m[1]))}`;

  const text = s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/\s+/g, " ");

  m = text.match(/^(\d{1,2})[\/\-.](\d{4})$/);
  if (m) {
    const mes = Number(m[1]);
    return mes >= 1 && mes <= 12 ? `${m[2]}-${pad2(mes)}-01` : null;
  }
  m = text.match(/^(\d{4})[\/\-.](\d{1,2})$/);
  if (m) {
    const mes = Number(m[2]);
    return mes >= 1 && mes <= 12 ? `${m[1]}-${pad2(mes)}-01` : null;
  }
  m = text.match(/^(\d{1,2})[\/\-.](\d{2})$/);
  if (m) {
    const mes = Number(m[1]);
    return mes >= 1 && mes <= 12 ? `20${m[2]}-${pad2(mes)}-01` : null;
  }
  m = text.match(/^([a-z]+)\.?(?:\s*[\/\-.\s]\s*(?:de\s+)?(\d{4}|\d{2}))?$/);
  if (m) {
    const mes = mesPorNome(m[1]);
    if (mes) {
      const ano = m[2] ? (m[2].length === 2 ? 2000 + Number(m[2]) : Number(m[2])) : new Date().getFullYear();
      return `${ano}-${pad2(mes)}-01`;
    }
  }
  return null;
}

function parseFlexibleTimestamp(raw: string): string | null {
  const serial = parseSheetsSerial(raw.trim());
  if (serial) return serial;
  const m = raw
    .trim()
    .match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2}|\d{4})(?:[ T]+(\d{1,2}):(\d{2})(?::(\d{2}))?)?$/);
  if (!m) return null;
  const year = m[3].length === 2 ? `20${m[3]}` : m[3];
  const date = `${year}-${pad2(Number(m[2]))}-${pad2(Number(m[1]))}`;
  if (m[4] === undefined) return date;
  return `${date}T${pad2(Number(m[4]))}:${m[5]}:${m[6] ?? "00"}`;
}

function fromCellValue(column: ColumnDef | undefined, raw: unknown): unknown {
  if (raw === undefined || raw === null || raw === "") return null;
  if (column?.type === "json") {
    if (typeof raw !== "string") return raw;
    try {
      return JSON.parse(raw);
    } catch {
      return null;
    }
  }
  if (column?.type === "number") {
    if (typeof raw === "number") return Number.isFinite(raw) ? raw : null;
    return parseFlexibleNumber(String(raw));
  }
  if (column?.type === "boolean") {
    if (typeof raw === "boolean") return raw;
    return String(raw).toLowerCase() === "true";
  }
  if (column?.type === "timestamptz") {
    const parsed = parseFlexibleTimestamp(String(raw));
    if (parsed) return parsed;
  }
  if (column?.type === "date") {
    const parsed = parseFlexibleDate(String(raw));
    if (parsed) return parsed;
  }
  if (column?.stateRef) return String(raw).trim().toUpperCase();
  return String(raw);
}

export function rowToValues(columns: ColumnDef[], row: SheetRow): unknown[] {
  return columns.map((column) => toCellValue(column, row[column.name]));
}

export function valuesToRow(columns: ColumnDef[], values: unknown[]): SheetRow {
  const row: SheetRow = {};
  columns.forEach((column, index) => {
    row[column.name] = fromCellValue(column, values[index]);
  });
  return row;
}

async function readRawSheets(
  env: Bindings,
  names: string[],
  clientSignal?: AbortSignal
): Promise<Record<string, unknown[][] | null>> {
  if (googleSheetsEnabled(env)) {
    try {
      return await readSheetsRaw(env, names);
    } catch (err) {
      console.error("[sheets-api] leitura falhou, usando Apps Script:", err);
    }
  }
  return callAppsScript<Record<string, unknown[][] | null>>(env, "readMany", { sheets: names }, clientSignal);
}

export type IndexedTable = {
  rows: SheetRow[];
  rowById: Map<string, SheetRow>;
};

export async function readTable(
  env: Bindings,
  sheetName: string,
  columns: ColumnDef[],
  clientSignal?: AbortSignal
): Promise<IndexedTable> {
  const cached = await readCachedSheet(env, sheetName);
  if (cached) return indexRawRows(cached.rows, columns);

  const fetchedAt = Date.now();
  const rawRows = (await readRawSheets(env, [sheetName], clientSignal))[sheetName];
  if (rawRows == null) throw new Error(`Aba "${sheetName}" não existe.`);
  await writeCachedSheets(env, { [sheetName]: rawRows }, fetchedAt);
  return indexRawRows(rawRows, columns);
}

export async function readTables(
  env: Bindings,
  requests: { sheetName: string; columns: ColumnDef[] }[],
  clientSignal?: AbortSignal
): Promise<Record<string, IndexedTable | null>> {
  const out: Record<string, IndexedTable | null> = {};
  const misses: { sheetName: string; columns: ColumnDef[] }[] = [];

  const cached = await readManyCachedSheets(env, requests.map((r) => r.sheetName));
  for (const request of requests) {
    const entry = cached[request.sheetName];
    if (entry) out[request.sheetName] = indexRawRows(entry.rows, request.columns);
    else misses.push(request);
  }
  if (!misses.length) return out;

  const fetchedAt = Date.now();
  const raw = await readRawSheets(
    env,
    misses.map((r) => r.sheetName),
    clientSignal
  );
  const toCache: Record<string, unknown[][]> = {};
  misses.forEach(({ sheetName, columns }) => {
    const rows = raw?.[sheetName];
    if (rows == null) {
      out[sheetName] = null;
      return;
    }
    toCache[sheetName] = rows;
    out[sheetName] = indexRawRows(rows, columns);
  });
  if (Object.keys(toCache).length) await writeCachedSheets(env, toCache, fetchedAt);
  return out;
}

function indexRawRows(rawRows: unknown[][] | null | undefined, columns: ColumnDef[]): IndexedTable {
  const rows: SheetRow[] = [];
  const rowById = new Map<string, SheetRow>();
  (rawRows ?? []).forEach((values) => {
    if (!values.length) return;
    const row = valuesToRow(columns, values);
    const id = row.id;
    if (id === null || id === undefined || id === "") return;
    rows.push(row);
    rowById.set(String(id), row);
  });

  return { rows, rowById };
}

export async function refreshAllSheets(env: Bindings): Promise<{ refreshed: string[]; errors: Record<string, string> }> {
  const names = allSheetNames();
  const fetchedAt = Date.now();
  const raw = await readRawSheets(env, names);

  const refreshed: string[] = [];
  const errors: Record<string, string> = {};
  const toCache: Record<string, unknown[][]> = {};
  names.forEach((name) => {
    const rows = raw?.[name];
    if (rows == null) {
      errors[name] = `Aba "${name}" não existe.`;
      return;
    }
    toCache[name] = rows;
    refreshed.push(name);
  });
  await writeCachedSheets(env, toCache, fetchedAt);
  return { refreshed, errors };
}

type WriteOptions = { skipInvalidate?: boolean };

export async function appendRows(
  env: Bindings,
  sheetName: string,
  columns: ColumnDef[],
  rows: SheetRow[],
  options?: WriteOptions
): Promise<void> {
  if (!rows.length) return;
  const values = rows.map((row) => rowToValues(columns, row));
  let done = false;
  if (googleSheetsEnabled(env)) {
    try {
      await appendValues(env, sheetName, values);
      done = true;
    } catch (err) {
      console.error("[sheets-api] append falhou, usando Apps Script:", err);
    }
  }
  if (!done) await callAppsScript(env, "append", { sheet: sheetName, values });
  if (!options?.skipInvalidate) await invalidateCachedSheet(env, sheetName);
}

// quem chama não deve assumir sucesso total só porque a chamada não lançou.
export async function updateRows(
  env: Bindings,
  sheetName: string,
  columns: ColumnDef[],
  rows: SheetRow[],
  options?: WriteOptions
): Promise<number> {
  if (!rows.length) return 0;
  let updated: number | null = null;
  if (googleSheetsEnabled(env)) {
    try {
      const ids = await readIdRows(env, sheetName);
      const updates = rows
        .filter((row) => ids.has(String(row.id)))
        .map((row) => ({ row: (ids.get(String(row.id)) as { row: number }).row, values: rowToValues(columns, row) }));
      await updateValues(env, sheetName, columns.length, updates);
      updated = updates.length;
    } catch (err) {
      console.error("[sheets-api] update falhou, usando Apps Script:", err);
    }
  }
  if (updated === null) {
    const result = await callAppsScript<{ updated: number }>(env, "update", {
      sheet: sheetName,
      updates: rows.map((row) => ({
        id: row.id,
        values: rowToValues(columns, row)
      }))
    });
    updated = result.updated;
  }
  if (!options?.skipInvalidate) await invalidateCachedSheet(env, sheetName);
  return updated;
}

export async function deleteRows(
  env: Bindings,
  sheetName: string,
  ids: string[],
  options?: WriteOptions
): Promise<number> {
  if (!ids.length) return 0;
  let deleted: number | null = null;
  if (googleSheetsEnabled(env)) {
    try {
      const idRows = await readIdRows(env, sheetName);
      const rowNumbers = [...new Set(ids)].map((id) => idRows.get(String(id))?.row).filter((n): n is number => !!n);
      await deleteRowNumbers(env, sheetName, rowNumbers);
      deleted = rowNumbers.length;
    } catch (err) {
      console.error("[sheets-api] delete falhou, usando Apps Script:", err);
    }
  }
  if (deleted === null) {
    const result = await callAppsScript<{ deleted: number }>(env, "delete", {
      sheet: sheetName,
      ids: [...new Set(ids)]
    });
    deleted = result.deleted;
  }
  if (!options?.skipInvalidate) await invalidateCachedSheet(env, sheetName);
  return deleted;
}
