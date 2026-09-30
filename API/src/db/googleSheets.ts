import type { Bindings } from "../types";

// Cliente direto da API do Google Sheets (v4), usado pelo Worker para LER e
// GRAVAR na planilha sem passar pelo Apps Script (que levava 2–3 s por
// chamada). Autentica com uma conta de serviço (JWT RS256 assinado com
// WebCrypto). É opcional: sem GOOGLE_CLIENT_EMAIL / GOOGLE_PRIVATE_KEY /
// GOOGLE_SHEET_ID configurados, o Worker segue usando só o Apps Script (ver
// db/sheets.ts).
//
// Velocidade: cada ida ao Google custa ~0,3–0,4 s, então o que importa é o
// NÚMERO de chamadas por operação. Por isso: token e gid (sheetId) das abas são
// guardados na KV (compartilhados entre os servidores do Worker, em vez de cada
// um pedir o seu ao "acordar"), ids e estados vêm numa chamada só, e as
// respostas são enxutas (majorDimension=COLUMNS e `fields`).

const SHEETS_SCOPE = "https://www.googleapis.com/auth/spreadsheets";
const TOKEN_URL = "https://oauth2.googleapis.com/token";
const API = "https://sheets.googleapis.com/v4/spreadsheets";
const MAX_ATTEMPTS = 3;
const RETRY_BASE_DELAY_MS = 300;

const TOKEN_KV_KEY = "g:token";
const GIDS_KV_KEY = "g:gids";
const GIDS_TTL_S = 24 * 3600;

export function googleSheetsEnabled(env: Bindings): boolean {
  return Boolean(env.GOOGLE_CLIENT_EMAIL && env.GOOGLE_PRIVATE_KEY && env.GOOGLE_SHEET_ID);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ---------- autenticação ----------

function base64Url(input: string | Uint8Array): string {
  const bytes = typeof input === "string" ? new TextEncoder().encode(input) : input;
  let binary = "";
  bytes.forEach((b) => (binary += String.fromCharCode(b)));
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function pemToDer(pem: string): ArrayBuffer {
  // A chave pode vir com "\n" literais (variável de ambiente numa linha só).
  const body = pem
    .replace(/\\n/g, "\n")
    .replace(/-----BEGIN PRIVATE KEY-----/, "")
    .replace(/-----END PRIVATE KEY-----/, "")
    .replace(/\s+/g, "");
  const binary = atob(body);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes.buffer;
}

async function signJwt(env: Bindings): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const header = base64Url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const claims = base64Url(
    JSON.stringify({ iss: env.GOOGLE_CLIENT_EMAIL, scope: SHEETS_SCOPE, aud: TOKEN_URL, iat: now, exp: now + 3600 })
  );
  const unsigned = `${header}.${claims}`;
  const key = await crypto.subtle.importKey(
    "pkcs8",
    pemToDer(env.GOOGLE_PRIVATE_KEY as string),
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const signature = await crypto.subtle.sign("RSASSA-PKCS1-v1_5", key, new TextEncoder().encode(unsigned));
  return `${unsigned}.${base64Url(new Uint8Array(signature))}`;
}

type StoredToken = { value: string; expiresAt: number };

// Token de acesso: memória do isolate → KV (compartilhado entre isolates, evita
// ~0,35 s de novo login quando um servidor "acorda") → Google. A chamada em
// andamento é compartilhada para não assinar/pedir várias vezes em paralelo.
let cachedToken: StoredToken | null = null;
let tokenInFlight: Promise<string> | null = null;

const tokenValid = (t: StoredToken | null | undefined): t is StoredToken =>
  !!t && typeof t.value === "string" && t.expiresAt - 120_000 > Date.now();

async function getAccessToken(env: Bindings): Promise<string> {
  if (tokenValid(cachedToken)) return cachedToken.value;
  if (tokenInFlight) return tokenInFlight;
  tokenInFlight = (async () => {
    try {
      const stored = await env.CACHE.get<StoredToken>(TOKEN_KV_KEY, { type: "json", cacheTtl: 30 });
      if (tokenValid(stored)) {
        cachedToken = stored;
        return stored.value;
      }
    } catch {
      /* KV indisponível: segue para o Google */
    }
    const res = await fetch(TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
        assertion: await signJwt(env)
      })
    });
    const json = (await res.json()) as { access_token?: string; expires_in?: number; error_description?: string };
    if (!res.ok || !json.access_token) {
      throw new Error(`Google recusou o token da conta de serviço: ${json.error_description ?? res.status}`);
    }
    const token: StoredToken = { value: json.access_token, expiresAt: Date.now() + (json.expires_in ?? 3600) * 1000 };
    cachedToken = token;
    try {
      await env.CACHE.put(TOKEN_KV_KEY, JSON.stringify(token), { expirationTtl: Math.max(60, (json.expires_in ?? 3600) - 300) });
    } catch {
      /* só perde o compartilhamento entre servidores */
    }
    return token.value;
  })().finally(() => {
    tokenInFlight = null;
  });
  return tokenInFlight;
}

// ---------- chamadas ----------

async function sheetsFetch<T>(env: Bindings, path: string, init: RequestInit = {}): Promise<T> {
  let lastMessage = "";
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    const token = await getAccessToken(env);
    const res = await fetch(`${API}/${env.GOOGLE_SHEET_ID}${path}`, {
      ...init,
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", ...(init.headers ?? {}) }
    });
    if (res.ok) return (await res.json()) as T;

    const text = await res.text();
    lastMessage = `Sheets API HTTP ${res.status}: ${text.slice(0, 300)}`;
    if (res.status === 401) {
      // token vencido/revogado: descarta (memória e KV) e pede outro
      cachedToken = null;
      try {
        await env.CACHE.delete(TOKEN_KV_KEY);
      } catch {
        /* ignora */
      }
    }
    const retriable = res.status === 429 || res.status >= 500 || res.status === 401;
    if (!retriable || attempt === MAX_ATTEMPTS) break;
    await sleep(RETRY_BASE_DELAY_MS * attempt + Math.random() * RETRY_BASE_DELAY_MS);
  }
  throw new Error(lastMessage);
}

// "A", "B", ..., "Z", "AA", ...
export function columnLetter(count: number): string {
  let n = count;
  let out = "";
  while (n > 0) {
    const rem = (n - 1) % 26;
    out = String.fromCharCode(65 + rem) + out;
    n = Math.floor((n - 1) / 26);
  }
  return out;
}

const quoteSheet = (name: string) => `'${name.replace(/'/g, "''")}'`;

// ---------- leitura de ids / linhas ----------

export type IdRow = { row: number; state: string };

// Colunas de id (A) e — se informada — de estado, sem o cabeçalho, NUMA chamada
// só (em colunas: bem menor que linha a linha). Devolve id -> { número da linha
// (1-based, contando o cabeçalho), estado em maiúsculas }. Linhas em branco no
// meio mantêm a posição certa; ids repetidos ficam com a última ocorrência.
export async function readIdRows(env: Bindings, sheetName: string, stateIndex = -1): Promise<Map<string, IdRow>> {
  const params = new URLSearchParams();
  params.append("ranges", `${quoteSheet(sheetName)}!A2:A`);
  if (stateIndex >= 0) {
    const letter = columnLetter(stateIndex + 1);
    params.append("ranges", `${quoteSheet(sheetName)}!${letter}2:${letter}`);
  }
  params.set("majorDimension", "COLUMNS");
  params.set("fields", "valueRanges.values");
  const data = await sheetsFetch<{ valueRanges?: { values?: unknown[][] }[] }>(env, `/values:batchGet?${params}`);
  const ids = data.valueRanges?.[0]?.values?.[0] ?? [];
  const states = data.valueRanges?.[1]?.values?.[0] ?? [];
  const map = new Map<string, IdRow>();
  ids.forEach((id, i) => {
    if (id === undefined || id === null || id === "") return;
    map.set(String(id), { row: i + 2, state: String(states[i] ?? "").trim().toUpperCase() });
  });
  return map;
}

// Valores brutos das linhas pedidas (mesmo formato do Apps Script: datas como
// texto ou número serial, que valuesToRow já entende), por número de linha.
export async function readRowsByNumber(
  env: Bindings,
  sheetName: string,
  columnCount: number,
  rowNumbers: number[]
): Promise<Map<number, unknown[]>> {
  const out = new Map<number, unknown[]>();
  if (!rowNumbers.length) return out;
  const last = columnLetter(columnCount);
  const params = new URLSearchParams();
  rowNumbers.forEach((r) => params.append("ranges", `${quoteSheet(sheetName)}!A${r}:${last}${r}`));
  params.set("valueRenderOption", "UNFORMATTED_VALUE");
  params.set("dateTimeRenderOption", "FORMATTED_STRING");
  params.set("fields", "valueRanges.values");
  const data = await sheetsFetch<{ valueRanges?: { values?: unknown[][] }[] }>(env, `/values:batchGet?${params}`);
  (data.valueRanges ?? []).forEach((range, i) => out.set(rowNumbers[i], range.values?.[0] ?? []));
  return out;
}

// ---------- escrita ----------

export async function appendValues(env: Bindings, sheetName: string, rows: unknown[][]): Promise<void> {
  if (!rows.length) return;
  await sheetsFetch(
    env,
    `/values/${encodeURIComponent(`${quoteSheet(sheetName)}!A1`)}:append?valueInputOption=RAW&insertDataOption=INSERT_ROWS&fields=updates.updatedRows`,
    { method: "POST", body: JSON.stringify({ majorDimension: "ROWS", values: rows }) }
  );
}

export async function updateValues(
  env: Bindings,
  sheetName: string,
  columnCount: number,
  updates: { row: number; values: unknown[] }[]
): Promise<void> {
  if (!updates.length) return;
  const last = columnLetter(columnCount);
  await sheetsFetch(env, "/values:batchUpdate?fields=totalUpdatedRows", {
    method: "POST",
    body: JSON.stringify({
      valueInputOption: "RAW",
      data: updates.map((u) => ({
        range: `${quoteSheet(sheetName)}!A${u.row}:${last}${u.row}`,
        majorDimension: "ROWS",
        values: [u.values]
      }))
    })
  });
}

// gid (sheetId) de cada aba — muda só se a aba for recriada. Memória do isolate
// → KV (1 dia) → Google (uma chamada que já traz todas as abas).
const gidCache = new Map<string, number>();

export async function sheetGid(env: Bindings, sheetName: string): Promise<number> {
  const hit = gidCache.get(sheetName);
  if (hit !== undefined) return hit;
  try {
    const stored = await env.CACHE.get<Record<string, number>>(GIDS_KV_KEY, { type: "json", cacheTtl: 60 });
    if (stored && typeof stored[sheetName] === "number") {
      Object.entries(stored).forEach(([name, gid]) => gidCache.set(name, gid));
      return stored[sheetName];
    }
  } catch {
    /* KV indisponível: segue para o Google */
  }
  const data = await sheetsFetch<{ sheets?: { properties: { sheetId: number; title: string } }[] }>(
    env,
    "?fields=sheets.properties(sheetId,title)"
  );
  const all: Record<string, number> = {};
  (data.sheets ?? []).forEach((s) => {
    gidCache.set(s.properties.title, s.properties.sheetId);
    all[s.properties.title] = s.properties.sheetId;
  });
  try {
    await env.CACHE.put(GIDS_KV_KEY, JSON.stringify(all), { expirationTtl: GIDS_TTL_S });
  } catch {
    /* só perde o compartilhamento */
  }
  const gid = gidCache.get(sheetName);
  if (gid === undefined) throw new Error(`Aba "${sheetName}" não existe na planilha.`);
  return gid;
}

// Apaga linhas pelo número, de baixo para cima, numa única requisição (atômica:
// a exclusão de uma linha não desloca as que ainda faltam apagar). `gid` pode vir
// já resolvido (em paralelo com a leitura dos ids).
export async function deleteRowNumbers(
  env: Bindings,
  sheetName: string,
  rowNumbers: number[],
  gidPromise?: Promise<number>
): Promise<void> {
  if (!rowNumbers.length) return;
  const sorted = [...new Set(rowNumbers)].sort((a, b) => b - a);
  const send = (gid: number) =>
    sheetsFetch(env, ":batchUpdate?fields=spreadsheetId", {
      method: "POST",
      body: JSON.stringify({
        requests: sorted.map((row) => ({
          deleteDimension: { range: { sheetId: gid, dimension: "ROWS", startIndex: row - 1, endIndex: row } }
        }))
      })
    });
  try {
    await send(await (gidPromise ?? sheetGid(env, sheetName)));
  } catch (err) {
    // Aba apagada e recriada: o gid guardado ficou velho. Descarta (memória e KV)
    // e tenta uma vez com o gid atual.
    if (!/No grid with id|Invalid requests/i.test(String(err instanceof Error ? err.message : err))) throw err;
    gidCache.clear();
    try {
      await env.CACHE.delete(GIDS_KV_KEY);
    } catch {
      /* ignora */
    }
    await send(await sheetGid(env, sheetName));
  }
}

// Todas as linhas de dados (sem o cabeçalho) de várias abas numa chamada só —
// o equivalente ao "readMany" do Apps Script, bem mais rápido. Os valores vêm
// tipados (números, booleanos) e datas/horas como texto formatado, que é o que
// fromCellValue (db/sheets.ts) já sabe interpretar. Aba inexistente faz a
// chamada inteira falhar; quem chama cai no Apps Script.
export async function readSheetsRaw(env: Bindings, sheetNames: string[]): Promise<Record<string, unknown[][]>> {
  const out: Record<string, unknown[][]> = {};
  if (!sheetNames.length) return out;
  const params = new URLSearchParams();
  sheetNames.forEach((name) => params.append("ranges", `${quoteSheet(name)}!A2:AZ`));
  params.set("valueRenderOption", "UNFORMATTED_VALUE");
  params.set("dateTimeRenderOption", "FORMATTED_STRING");
  params.set("fields", "valueRanges.values");
  const data = await sheetsFetch<{ valueRanges?: { values?: unknown[][] }[] }>(env, `/values:batchGet?${params}`);
  sheetNames.forEach((name, i) => {
    out[name] = data.valueRanges?.[i]?.values ?? [];
  });
  return out;
}

// Aquecimento: deixa o token (e o gid das abas) prontos antes da primeira
// gravação, para ela não pagar o "acordar" do servidor.
export async function warmSheetsApi(env: Bindings, sheetName: string): Promise<void> {
  await Promise.all([getAccessToken(env), sheetGid(env, sheetName)]);
}
