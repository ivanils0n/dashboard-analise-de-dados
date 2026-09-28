import type { Bindings } from "../types";
import { ENTITY_KEYS, tableName, USERS_SHEET } from "./tables";

// Cache das abas da planilha na KV do Worker — evita bater no Apps Script
// (lento e com limite de execuções simultâneas) a cada leitura.
//
// Quem mantém o cache atualizado é o PRÓPRIO Apps Script (pushCache em
// apps-script/Code.gs): um gatilho de tempo lá lê a planilha a cada 10 min e
// grava na KV, pela API da Cloudflare, só as abas que mudaram. O Worker só
// lê — e grava apenas no refresh manual do admin e quando uma leitura acha
// a aba ausente ou invalidada. Nenhum trabalho pesado roda no Worker fora
// de uma requisição (antes era o cron, limitado a 10 ms de CPU no plano
// gratuito, que não dava conta dos dados).
//
// SEM EXPIRAÇÃO: a KV é armazenamento permanente, não um cache que descarta
// itens sozinho. Uma aba fica gravada até ser substituída por uma atualização
// (Apps Script, refresh do admin) ou invalidada por uma escrita do dashboard.
//
// Estruturas (o formato é o mesmo gravado pelo Code.gs — mudar um exige mudar o outro):
//   "s:<aba>"    {"t": ms, "rows": [...]}   — t = quando a leitura da planilha COMEÇOU
//   "s:<aba>"    {"t": ms, "parts": N}      — aba grande repartida em pedaços:
//   "s:<aba>:<i>" {"t": ms, "rows": [...]}  — pedaço i (0..N-1), na ordem, com
//                                              o MESMO t da principal (a
//                                              Cloudflare não garante a ordem em
//                                              que cada chave aparece; pedaço
//                                              com outro t é de outra gravação)
//   "inv:<aba>"  ms                         — hora da última escrita na aba pelo
//                                              dashboard; a aba só vale se t > isto.

export type CachedSheet = { updatedAt: number; rows: unknown[][] };

type StoredSheet = { t?: number; rows?: unknown[][]; parts?: number };
type StoredPart = { t?: number; rows?: unknown[][] };

const sheetKey = (name: string) => `s:${name}`;
const partKey = (name: string, index: number) => `s:${name}:${index}`;
const markerKey = (name: string) => `inv:${name}`;

// Folga abaixo do limite de 25 MiB por valor da KV (texto com acento ocupa
// mais bytes que caracteres). Mesmo valor de KV_MAX_VALUE_CHARS no Code.gs.
const MAX_VALUE_CHARS = 15 * 1024 * 1024;

// A KV devolve no máximo 100 chaves por leitura em lote.
const BULK_GET_MAX = 100;

// Por quanto tempo cada servidor da Cloudflare reaproveita uma leitura da KV
// antes de buscar de novo. O padrão é 60 s; 30 s é o mínimo aceito. Importa
// porque o Apps Script grava de FORA da Cloudflare: até esse prazo vencer, um
// servidor que já tinha lido a aba continua devolvendo a versão anterior.
const READ_CACHE_TTL_S = 30;

// Todas as abas guardadas no cache.
export function allSheetNames(): string[] {
  return [...ENTITY_KEYS.map(tableName), USERS_SHEET];
}

// O cache é só uma otimização: se a KV falhar ou estourar cota, quem chama não
// pode quebrar por isso — os dados continuam corretos vindos direto do Apps
// Script, só um pouco mais devagar. Por isso "fail-open": erro na leitura vira
// cache-miss; erro na gravação só loga e segue.
function logError(action: string, err: unknown) {
  console.error(`[cache] Falha ao ${action}:`, err instanceof Error ? err.message : err);
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

// Lê o cache das abas pedidas: dados e marcadores numa única leitura em lote
// (+ uma para os pedaços, se alguma aba for repartida). Volta null para a aba
// ausente ou invalidada por uma escrita posterior à cópia.
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

  sheetNames.forEach((name) => {
    const stored = values.get(sheetKey(name)) as StoredSheet | null;
    if (!stored || typeof stored.t !== "number") return;
    const invalidatedAt = values.get(markerKey(name));
    if (typeof invalidatedAt === "number" && stored.t <= invalidatedAt) return;

    let rows: unknown[][] | undefined = stored.rows;
    if (stored.parts) {
      const parts = Array.from({ length: stored.parts }, (_, i) => values.get(partKey(name, i)) as StoredPart | null);
      // Pedaço faltando ou de outra gravação: trata a aba como ausente.
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

// Grava abas no cache (sem expiração) — usado pelo refresh manual do admin e
// quando uma leitura acha a aba ausente/invalidada. `fetchedAt` é o horário
// em que a leitura da planilha COMEÇOU (se uma escrita acontecer durante a
// leitura, o marcador dela sai mais novo e esta cópia não é servida). Aba
// maior que MAX_VALUE_CHARS fica de fora: quem reparte em pedaços é o Code.gs.
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

// Chamado depois de toda escrita (append/update/delete) na aba. Sem
// expiração, como os dados: o marcador precisa durar até a próxima
// atualização da aba. Se a mesma aba foi invalidada há menos de 1s (limite
// da KV por chave), tenta de novo uma vez após 1s — perder a invalidação
// faria a aba servir o dado de antes da escrita.
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
