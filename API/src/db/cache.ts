import type { Bindings } from "../types";
import { ENTITY_KEYS, tableName, USERS_SHEET } from "./tables";

export type CachedSheet = { updatedAt: number; rows: unknown[][] };

type StoredSheet = { t?: number; rows?: unknown[][]; parts?: number };
type StoredPart = { t?: number; rows?: unknown[][] };

const sheetKey = (name: string) => `s:${name}`;
const partKey = (name: string, index: number) => `s:${name}:${index}`;
const markerKey = (name: string) => `inv:${name}`;

const MAX_VALUE_CHARS = 15 * 1024 * 1024;

const BULK_GET_MAX = 100;

const READ_CACHE_TTL_S = 30;

export function allSheetNames(): string[] {
  return [...ENTITY_KEYS.map(tableName), USERS_SHEET];
}

function logError(action: string, err: unknown) {
  console.error(`[cache] Falha ao ${action}:`, err instanceof Error ? err.message : err);
}

// Não definir CACHE_MAX_AGE_S em produção: lá o Apps Script só regrava a KV
// quando a aba muda, então um cache "velho" é o normal e expirar por idade
// faria o Worker reler a planilha inteira à toa.
function maxAgeMsOf(env: Bindings): number {
  const seconds = Number(env.CACHE_MAX_AGE_S);
  return Number.isFinite(seconds) && seconds > 0 ? seconds * 1000 : 0;
}

async function bulkGet(env: Bindings, keys: string[]): Promise<Map<string, unknown>> {
  const out = new Map<string, unknown>();
  for (let i = 0; i < keys.length; i += BULK_GET_MAX) {
    const batch = await env.CACHE.get<unknown>(keys.slice(i, i + BULK_GET_MAX), {
      type: "json",
      cacheTtl: READ_CACHE_TTL_S
    });
    batch.forEach((value, key) => out.set(key, value));
  }
  return out;
}

export async function readManyCachedSheets(
  env: Bindings,
  sheetNames: string[]
): Promise<Record<string, CachedSheet | null>> {
  const out: Record<string, CachedSheet | null> = {};
  sheetNames.forEach((name) => {
    out[name] = null;
  });

  let values: Map<string, unknown>;
  try {
    values = await bulkGet(env, [...sheetNames.map(sheetKey), ...sheetNames.map(markerKey)]);
    const partKeys: string[] = [];
    sheetNames.forEach((name) => {
      const stored = values.get(sheetKey(name)) as StoredSheet | null;
      for (let i = 0; i < (stored?.parts ?? 0); i++) partKeys.push(partKey(name, i));
    });
    if (partKeys.length) (await bulkGet(env, partKeys)).forEach((value, key) => values.set(key, value));
  } catch (err) {
    logError("ler o cache da KV", err);
    return out;
  }

  const maxAgeMs = maxAgeMsOf(env);
  sheetNames.forEach((name) => {
    const stored = values.get(sheetKey(name)) as StoredSheet | null;
    if (!stored || typeof stored.t !== "number") return;
    if (maxAgeMs && Date.now() - stored.t > maxAgeMs) return;
    const invalidatedAt = values.get(markerKey(name));
    if (typeof invalidatedAt === "number" && stored.t <= invalidatedAt) return;

    let rows: unknown[][] | undefined = stored.rows;
    if (stored.parts) {
      const parts = Array.from({ length: stored.parts }, (_, i) => values.get(partKey(name, i)) as StoredPart | null);
      if (!parts.every((part) => Array.isArray(part?.rows) && part?.t === stored.t)) return;
      rows = parts.flatMap((part) => part!.rows!);
    }
    if (Array.isArray(rows)) out[name] = { updatedAt: stored.t, rows };
  });
  return out;
}

export async function readCachedSheet(env: Bindings, sheetName: string): Promise<CachedSheet | null> {
  return (await readManyCachedSheets(env, [sheetName]))[sheetName];
}

export async function writeCachedSheets(
  env: Bindings,
  updates: Record<string, unknown[][]>,
  fetchedAt: number
): Promise<void> {
  await Promise.all(
    Object.entries(updates).map(async ([name, rows]) => {
      const text = JSON.stringify({ t: fetchedAt, rows });
      if (text.length > MAX_VALUE_CHARS) {
        console.warn(`[cache] Aba "${name}" grande demais para o Worker gravar — fica para o Apps Script.`);
        return;
      }
      try {
        await env.CACHE.put(sheetKey(name), text);
      } catch (err) {
        logError(`gravar a aba "${name}" na KV`, err);
      }
    })
  );
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function invalidateCachedSheet(env: Bindings, sheetName: string): Promise<void> {
  const put = () => env.CACHE.put(markerKey(sheetName), String(Date.now()));
  try {
    await put();
  } catch {
    await sleep(1100);
    try {
      await put();
    } catch (err) {
      logError(`invalidar a aba "${sheetName}"`, err);
    }
  }
}
