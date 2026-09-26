import type { Bindings } from "../types";

// Cache das abas da planilha (linhas cruas, como o Apps Script devolve) na KV
// do Worker. Evita bater no Apps Script (lento e com limite de execuções
// simultâneas) a cada leitura — a aba só é buscada de novo quando o cache
// está frio, vencido, ou foi invalidado por uma escrita.
//
// Duas estruturas na KV:
//
// 1. "sheets" — UMA chave com todas as abas (mapa aba -> {updatedAt, rows}).
//    Uma chave só porque o cron regrava as ~12 abas a cada 5 min: com uma
//    chave por aba seriam ~3.400 gravações/dia, acima das 1.000/dia do plano
//    gratuito; assim é 1 gravação por tick (~288/dia).
//
// 2. "inv:<aba>" — um marcador por aba com o horário da última escrita nela.
//    A invalidação NÃO mexe em "sheets": a KV aceita no máximo 1 gravação por
//    segundo na mesma chave, e o front grava várias tabelas em paralelo a cada
//    sincronização — invalidar tudo em "sheets" faria parte dessas gravações
//    ser recusada. Com um marcador por aba, tabelas diferentes nunca disputam
//    a mesma chave. Uma entrada de "sheets" só vale se for mais nova que o
//    marcador da aba — então nem uma cópia antiga regravada por engano (duas
//    atualizações de "sheets" concorrentes) volta a ser servida.

export type CachedSheet = {
  // Momento em que a BUSCA ao Apps Script começou (não quando terminou): se
  // uma escrita acontecer durante a busca, o marcador dela sai mais novo que
  // isto e a cópia (que pode não ter a escrita) é descartada.
  updatedAt: number;
  rows: unknown[][];
};
type CachedSheetMap = Record<string, CachedSheet>;

const DATA_KEY = "sheets";
const markerKey = (sheetName: string) => `inv:${sheetName}`;

// Mesmo intervalo do cron (ver wrangler.jsonc "triggers.crons"): abaixo disso
// o dado é considerado fresco e o cron não o renova.
const FRESH_TTL_MS = 5 * 60 * 1000;

// Rede de segurança se o cron parar: a KV apaga "sheets" sozinha 15 min
// depois da última gravação, e a próxima leitura busca direto no Apps Script.
const DATA_TTL_S = 15 * 60;

// O marcador precisa viver mais que qualquer cópia antiga que ele esteja
// "vetando" — o cron repõe a aba em até 5 min, então 1h sobra com folga.
// Expirar não conta como operação na cota da KV.
const MARKER_TTL_S = 60 * 60;

// O cache é só uma otimização: se a KV falhar ou estourar cota, quem chama não
// pode quebrar por isso — os dados continuam corretos vindos direto do Apps
// Script, só um pouco mais devagar. Por isso "fail-open": erro na leitura vira
// cache-miss; erro na gravação só loga e segue.
function logError(action: string, err: unknown) {
  console.error(`[cache] Falha ao ${action}:`, err instanceof Error ? err.message : err);
}

async function readData(env: Bindings): Promise<CachedSheetMap> {
  try {
    return (await env.CACHE.get<CachedSheetMap>(DATA_KEY, "json")) ?? {};
  } catch (err) {
    logError("ler os dados da KV", err);
    return {};
  }
}

// Leitura em lote (1 ida à KV para todos os marcadores). Se falhar, devolve
// null e quem chama trata tudo como cache-miss — sem saber dos marcadores,
// não dá pra garantir que a cópia em cache não está desatualizada.
async function readMarkers(env: Bindings, sheetNames: string[]): Promise<Map<string, number> | null> {
  if (!sheetNames.length) return new Map();
  try {
    const raw = await env.CACHE.get(sheetNames.map(markerKey), "text");
    const out = new Map<string, number>();
    sheetNames.forEach((name) => {
      const value = raw.get(markerKey(name));
      if (value) out.set(name, Number(value));
    });
    return out;
  } catch (err) {
    logError("ler os marcadores da KV", err);
    return null;
  }
}

// Lê o cache das abas pedidas (2 idas à KV em paralelo, qualquer que seja o
// número de abas). Aba invalidada depois da cópia em cache volta como null.
export async function readManyCachedSheets(
  env: Bindings,
  sheetNames: string[]
): Promise<Record<string, CachedSheet | null>> {
  const [data, markers] = await Promise.all([readData(env), readMarkers(env, sheetNames)]);
  const out: Record<string, CachedSheet | null> = {};
  sheetNames.forEach((name) => {
    const entry = data[name];
    const invalidatedAt = markers?.get(name);
    const valid = entry && markers && (invalidatedAt === undefined || entry.updatedAt > invalidatedAt);
    out[name] = valid ? entry : null;
  });
  return out;
}

export async function readCachedSheet(env: Bindings, sheetName: string): Promise<CachedSheet | null> {
  return (await readManyCachedSheets(env, [sheetName]))[sheetName];
}

// Grava (mescla) uma ou mais abas em "sheets" numa única gravação. `fetchedAt`
// é o horário em que a busca ao Apps Script COMEÇOU (ver CachedSheet). Não
// sobrescreve uma cópia que já esteja lá e seja mais nova (ex.: o cron gravou
// enquanto esta busca, mais lenta, ainda estava em andamento).
export async function writeCachedSheets(
  env: Bindings,
  updates: Record<string, unknown[][]>,
  fetchedAt: number
): Promise<void> {
  const data = await readData(env);
  for (const [sheetName, rows] of Object.entries(updates)) {
    const current = data[sheetName];
    if (!current || current.updatedAt < fetchedAt) data[sheetName] = { updatedAt: fetchedAt, rows };
  }
  try {
    await env.CACHE.put(DATA_KEY, JSON.stringify(data), { expirationTtl: DATA_TTL_S });
  } catch (err) {
    logError("gravar os dados na KV", err);
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Chamado depois de toda escrita (append/update/delete) na aba: grava só o
// marcador dela, sem ler nem regravar "sheets". Se a mesma aba foi invalidada
// há menos de 1s (limite da KV por chave), tenta de novo uma vez após 1s —
// perder essa invalidação faria a aba servir dado antigo por até 5 min.
export async function invalidateCachedSheet(env: Bindings, sheetName: string): Promise<void> {
  const put = () =>
    env.CACHE.put(markerKey(sheetName), String(Date.now()), { expirationTtl: MARKER_TTL_S });
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

// Usado só pelo cron (ver services/cache.ts) para decidir o que vale a pena
// buscar de novo.
export function isFresh(entry: CachedSheet): boolean {
  return Date.now() - entry.updatedAt < FRESH_TTL_MS;
}
