import type { Bindings } from "../types";

// Cliente direto da API do Google Sheets (v4), usado pelo Worker para GRAVAR na
// planilha sem passar pelo Apps Script (que levava 2–3 s por chamada). Autentica
// com uma conta de serviço (JWT RS256 assinado com WebCrypto). É opcional: sem
// GOOGLE_CLIENT_EMAIL / GOOGLE_PRIVATE_KEY / GOOGLE_SHEET_ID configurados, o
// Worker segue usando só o Apps Script (ver db/sheets.ts).

const SHEETS_SCOPE = "https://www.googleapis.com/auth/spreadsheets";
const TOKEN_URL = "https://oauth2.googleapis.com/token";
const API = "https://sheets.googleapis.com/v4/spreadsheets";
const MAX_ATTEMPTS = 3;
const RETRY_BASE_DELAY_MS = 300;

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

// Token de acesso em memória do isolate (vale ~1 h); a chamada em andamento é
// compartilhada para não assinar/pedir várias vezes em paralelo.
let cachedToken: { value: string; expiresAt: number } | null = null;
let tokenInFlight: Promise<string> | null = null;

async function getAccessToken(env: Bindings): Promise<string> {
  if (cachedToken && cachedToken.expiresAt - 60_000 > Date.now()) return cachedToken.value;
  if (tokenInFlight) return tokenInFlight;
  tokenInFlight = (async () => {
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
    cachedToken = { value: json.access_token, expiresAt: Date.now() + (json.expires_in ?? 3600) * 1000 };
    return cachedToken.value;
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
    if (res.status === 401) cachedToken = null; // token vencido/revogado: pede outro
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

// Coluna A (ids), sem o cabeçalho: id -> número da linha (1-based, já contando
// o cabeçalho). Linhas em branco no meio mantêm a posição certa.
export async function readIdRows(env: Bindings, sheetName: string): Promise<Map<string, number>> {
  const data = await sheetsFetch<{ values?: unknown[][] }>(
    env,
    `/values/${encodeURIComponent(`${quoteSheet(sheetName)}!A2:A`)}?majorDimension=ROWS`
  );
  const map = new Map<string, number>();
  (data.values ?? []).forEach((cells, i) => {
    const id = cells?.[0];
    if (id !== undefined && id !== null && id !== "") map.set(String(id), i + 2);
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
  const data = await sheetsFetch<{ valueRanges?: { values?: unknown[][] }[] }>(env, `/values:batchGet?${params}`);
  (data.valueRanges ?? []).forEach((range, i) => out.set(rowNumbers[i], range.values?.[0] ?? []));
  return out;
}

// ---------- escrita ----------

export async function appendValues(env: Bindings, sheetName: string, rows: unknown[][]): Promise<void> {
  if (!rows.length) return;
  await sheetsFetch(
    env,
    `/values/${encodeURIComponent(`${quoteSheet(sheetName)}!A1`)}:append?valueInputOption=RAW&insertDataOption=INSERT_ROWS`,
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
  await sheetsFetch(env, "/values:batchUpdate", {
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

// gid (sheetId) de cada aba — muda só se a aba for recriada.
const gidCache = new Map<string, number>();

async function sheetGid(env: Bindings, sheetName: string): Promise<number> {
  const hit = gidCache.get(sheetName);
  if (hit !== undefined) return hit;
  const data = await sheetsFetch<{ sheets?: { properties: { sheetId: number; title: string } }[] }>(
    env,
    "?fields=sheets.properties(sheetId,title)"
  );
  (data.sheets ?? []).forEach((s) => gidCache.set(s.properties.title, s.properties.sheetId));
  const gid = gidCache.get(sheetName);
  if (gid === undefined) throw new Error(`Aba "${sheetName}" não existe na planilha.`);
  return gid;
}

// Apaga linhas pelo número, de baixo para cima, numa única requisição (atômica:
// a exclusão de uma linha não desloca as que ainda faltam apagar).
export async function deleteRowNumbers(env: Bindings, sheetName: string, rowNumbers: number[]): Promise<void> {
  if (!rowNumbers.length) return;
  const gid = await sheetGid(env, sheetName);
  const sorted = [...new Set(rowNumbers)].sort((a, b) => b - a);
  await sheetsFetch(env, ":batchUpdate", {
    method: "POST",
    body: JSON.stringify({
      requests: sorted.map((row) => ({
        deleteDimension: { range: { sheetId: gid, dimension: "ROWS", startIndex: row - 1, endIndex: row } }
      }))
    })
  });
}
