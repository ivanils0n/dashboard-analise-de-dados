import type { Bindings } from "../types";
import type { ColumnDef } from "./tables";

// Cliente para a "API" da planilha: um Google Apps Script publicado como Web
// App (ver apps-script/Code.gs), vinculado à própria planilha. Sem service
// account, sem chave privada — o script roda com a identidade de quem o
// publicou (dona da planilha) e só aceita chamadas com o segredo combinado.

export type SheetRow = Record<string, unknown>;

const MAX_ATTEMPTS = 4;
const RETRY_BASE_DELAY_MS = 400;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Contas pessoais do Google limitam quantas execuções simultâneas um Web App
// do Apps Script aceita; acima disso ele devolve uma página HTML genérica de
// erro em vez do JSON esperado. O boot do front dispara várias tabelas em
// paralelo, então isso acontece na prática — repete com backoff (+jitter)
// antes de desistir, em vez de propagar um 500 por uma sobrecarga passageira.
async function callAppsScriptOnce<T>(
  env: Bindings,
  action: string,
  params: Record<string, unknown>
): Promise<{ ok: true; data: T } | { ok: false; retriable: boolean; message: string }> {
  const res = await fetch(env.APPS_SCRIPT_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ secret: env.APPS_SCRIPT_SECRET, action, ...params })
  });

  const text = await res.text();
  if (!res.ok) {
    return { ok: false, retriable: true, message: `Apps Script HTTP ${res.status} na ação "${action}": ${text}` };
  }

  let payload: { success: boolean; data?: T; error?: string };
  try {
    payload = JSON.parse(text);
  } catch {
    // Resposta não-JSON (página de erro do Google): sinal de sobrecarga passageira.
    return { ok: false, retriable: true, message: `Apps Script devolveu resposta inválida na ação "${action}".` };
  }

  if (!payload.success) {
    // Erro de negócio (segredo errado, aba inexistente, ...) — não adianta repetir.
    return {
      ok: false,
      retriable: false,
      message: `Apps Script recusou a ação "${action}": ${payload.error ?? "erro desconhecido"}`
    };
  }
  return { ok: true, data: payload.data as T };
}

async function callAppsScript<T>(
  env: Bindings,
  action: string,
  params: Record<string, unknown> = {}
): Promise<T> {
  let lastMessage = "";
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    const result = await callAppsScriptOnce<T>(env, action, params);
    if (result.ok) return result.data;
    if (!result.retriable || attempt === MAX_ATTEMPTS) throw new Error(result.message);

    lastMessage = result.message;
    const jitter = Math.random() * RETRY_BASE_DELAY_MS;
    await sleep(RETRY_BASE_DELAY_MS * attempt + jitter);
  }
  // Inalcançável (o loop sempre retorna ou lança), mas satisfaz o TypeScript.
  throw new Error(lastMessage);
}

// ---------- conversão de valores (coluna tipada <-> célula da planilha) ----------

function toCellValue(column: ColumnDef | undefined, value: unknown): unknown {
  if (value === undefined || value === null) return "";
  if (column?.type === "json") return JSON.stringify(value);
  if (column?.type === "boolean") return Boolean(value);
  if (column?.type === "number") return Number(value);
  return String(value);
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
    const num = Number(raw);
    return Number.isFinite(num) ? num : null;
  }
  if (column?.type === "boolean") {
    if (typeof raw === "boolean") return raw;
    return String(raw).toLowerCase() === "true";
  }
  // Datas/timestamps: o Apps Script pode devolver um Date (célula formatada
  // como data) — nesse caso já chega como string ISO (JSON.stringify de um
  // Date vira toJSON()). Texto puro passa direto.
  return String(raw);
}

function rowToValues(columns: ColumnDef[], row: SheetRow): unknown[] {
  return columns.map((column) => toCellValue(column, row[column.name]));
}

function valuesToRow(columns: ColumnDef[], values: unknown[]): SheetRow {
  const row: SheetRow = {};
  columns.forEach((column, index) => {
    row[column.name] = fromCellValue(column, values[index]);
  });
  return row;
}

// ---------- leitura ----------

export type IndexedTable = {
  rows: SheetRow[];
  // Número da linha na planilha (1-based, já contando o cabeçalho) por id.
  rowNumberById: Map<string, number>;
  rowById: Map<string, SheetRow>;
};

export async function readTable(
  env: Bindings,
  sheetName: string,
  columns: ColumnDef[]
): Promise<IndexedTable> {
  const rawRows = await callAppsScript<unknown[][]>(env, "read", { sheet: sheetName });

  const rows: SheetRow[] = [];
  const rowNumberById = new Map<string, number>();
  const rowById = new Map<string, SheetRow>();
  (rawRows ?? []).forEach((values, index) => {
    if (!values.length) return; // linha em branco no meio da planilha
    const row = valuesToRow(columns, values);
    const id = row.id;
    if (id === null || id === undefined || id === "") return;
    rows.push(row);
    rowNumberById.set(String(id), index + 2); // +2: 1-based e pula o cabeçalho
    rowById.set(String(id), row);
  });

  return { rows, rowNumberById, rowById };
}

// ---------- escrita ----------

export async function appendRows(
  env: Bindings,
  sheetName: string,
  columns: ColumnDef[],
  rows: SheetRow[]
): Promise<void> {
  if (!rows.length) return;
  await callAppsScript(env, "append", {
    sheet: sheetName,
    values: rows.map((row) => rowToValues(columns, row))
  });
}

export async function updateRows(
  env: Bindings,
  sheetName: string,
  columns: ColumnDef[],
  updates: { rowNumber: number; row: SheetRow }[]
): Promise<void> {
  if (!updates.length) return;
  await callAppsScript(env, "update", {
    sheet: sheetName,
    updates: updates.map(({ rowNumber, row }) => ({
      rowNumber,
      values: rowToValues(columns, row)
    }))
  });
}

export async function deleteRows(env: Bindings, sheetName: string, rowNumbers: number[]): Promise<void> {
  if (!rowNumbers.length) return;
  await callAppsScript(env, "delete", { sheet: sheetName, rows: [...new Set(rowNumbers)] });
}
