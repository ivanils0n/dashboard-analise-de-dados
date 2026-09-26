import type { Bindings } from "../types";
import type { ColumnDef } from "./tables";
import { invalidateCachedSheet, readCachedSheet, readManyCachedSheets, writeCachedSheets } from "./cache";

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
// Sem limite de tempo por tentativa: a leitura espera o Apps Script responder
// (antes, a 1ª leitura era cancelada em 8 s e refeita, o que na prática
// recomeçava uma leitura já em andamento). O cliente (navegador) ainda pode
// cancelar — recarregar/fechar a página aborta a chamada (clientSignal).

async function callAppsScriptOnce<T>(
  env: Bindings,
  action: string,
  params: Record<string, unknown>,
  timeoutMs?: number,
  clientSignal?: AbortSignal
): Promise<{ ok: true; data: T } | { ok: false; retriable: boolean; message: string; timedOut?: boolean }> {
  const controller = new AbortController();
  let timedOut = false;
  const timer = timeoutMs ? setTimeout(() => { timedOut = true; controller.abort(); }, timeoutMs) : null;
  // Cliente (navegador) desistiu — recarregou/fechou a página: cancela também a chamada ao Apps Script.
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
  } catch (err) {
    if (timedOut) {
      return { ok: false, retriable: true, timedOut: true, message: `Apps Script sem resposta em ${timeoutMs! / 1000}s na ação "${action}".` };
    }
    throw err;
  } finally {
    if (timer) clearTimeout(timer);
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
    // Resposta não-JSON (página de erro do Google): sinal de sobrecarga passageira.
    return { ok: false, retriable: true, message: `Apps Script devolveu resposta inválida na ação "${action}".` };
  }

  if (!payload.success) {
    // Erro de negócio (segredo errado, aba inexistente, ...) — não adianta repetir.
    // Exceção: o Code.gs marca `retriable: true` quando o lock de escrita não
    // conseguiu a vez a tempo (ver LockService em doPost) — é sobrecarga
    // passageira, não um erro de negócio, então vale tentar de novo.
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
    const result = await callAppsScriptOnce<T>(env, action, params, undefined, clientSignal);
    if (result.ok) return result.data;
    if (!result.retriable || attempt === MAX_ATTEMPTS) throw new Error(result.message);

    lastMessage = result.message;
    if ("timedOut" in result && result.timedOut) continue; // refaz na hora, sem espera
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

// Colunas numéricas às vezes são preenchidas à mão direto na planilha (sem
// passar pelo formulário do app, que já normaliza o valor antes de enviar) —
// aceita mais formatos do que `Number(raw)` entenderia sozinho:
//   - horário "H:MM" ou "H:MM:SS" (ex.: carga horária de treinamento digitada
//     como "01:00") -> horas decimais (1, 1.5, ...);
//   - número no padrão BR, com vírgula decimal e opcionalmente ponto de
//     milhar (ex.: "1.234,56" ou "1234,56") -> ponto decimal.
function parseFlexibleNumber(raw: string): number | null {
  // Símbolo de moeda/espaços (ex.: "R$ 200,00", "$ 12.50") não fazem parte do
  // número em si — tira antes de tentar qualquer formato abaixo.
  const s = raw.trim().replace(/^(r\$|\$|R\$)\s*/i, "").trim();
  if (!s) return null;

  const time = /^(\d{1,3}):([0-5]?\d)(?::([0-5]?\d))?$/.exec(s);
  if (time) {
    const hours = Number(time[1]);
    const minutes = Number(time[2]);
    const seconds = time[3] ? Number(time[3]) : 0;
    return hours + minutes / 60 + seconds / 3600;
  }

  // Célula sem formato de texto: o Sheets converte "01:00" digitado num
  // horário de verdade, e a resposta chega como timestamp ISO (o horário do
  // dia é a parte que importa; a data em si é só a época interna do Sheets).
  const isoTime = /T(\d{2}):(\d{2}):(\d{2})/.exec(s);
  if (isoTime) {
    const hours = Number(isoTime[1]);
    const minutes = Number(isoTime[2]);
    const seconds = Number(isoTime[3]);
    return hours + minutes / 60 + seconds / 3600;
  }

  if (/^-?[\d.,]+$/.test(s) && s.includes(",")) {
    // Vírgula é o separador decimal; ponto (se houver) é separador de milhar.
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

// Colunas de data/competência também são preenchidas à mão direto na
// planilha. Aceita os mesmos formatos que o import por planilha do frontend
// já entende (ver parseDiariaMes em src/lib/export.js): dd/mm/aaaa,
// dd-mm-aaaa (e variantes com ano de 2 dígitos), mm/aaaa, aaaa-mm, mm/aa e
// nome do mês (com ou sem ano) — um campo "competência" que só tem mês vira
// o dia 1º desse mês. Sem bater com nenhum formato conhecido, devolve null
// (quem chama mantém o texto original em vez de perder o dado). */
function parseFlexibleDate(raw: string): string | null {
  const s = raw.trim();
  if (!s) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;

  // dia e mês com 1 ou 2 dígitos ("1/9/2026" também vale).
  let m = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);
  if (m) return `${m[3]}-${pad2(Number(m[2]))}-${pad2(Number(m[1]))}`;
  m = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2})$/);
  if (m) return `20${m[3]}-${pad2(Number(m[2]))}-${pad2(Number(m[1]))}`;

  const text = s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/\s+/g, " ");

  // mm/aaaa · mm-aaaa · mm.aaaa
  m = text.match(/^(\d{1,2})[\/\-.](\d{4})$/);
  if (m) {
    const mes = Number(m[1]);
    return mes >= 1 && mes <= 12 ? `${m[2]}-${pad2(mes)}-01` : null;
  }
  // aaaa-mm · aaaa/mm
  m = text.match(/^(\d{4})[\/\-.](\d{1,2})$/);
  if (m) {
    const mes = Number(m[2]);
    return mes >= 1 && mes <= 12 ? `${m[1]}-${pad2(mes)}-01` : null;
  }
  // mm/aa (assume 20aa)
  m = text.match(/^(\d{1,2})[\/\-.](\d{2})$/);
  if (m) {
    const mes = Number(m[1]);
    return mes >= 1 && mes <= 12 ? `20${m[2]}-${pad2(mes)}-01` : null;
  }
  // nome do mês, com ou sem ano ("ago", "agosto/26", "agosto de 2026")
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

// Colunas timestamptz (aberta_em/fechada_em das vagas) digitadas à mão chegam
// como "dd/mm/aaaa" ou "dd/mm/aaaa hh:mm[:ss]" — o dashboard usa
// slice(0, 10) e new Date() sobre o texto, então fora do ISO a vaga sai do
// filtro de período e os dias viram NaN (Tempo/Custo de contratação somem).
// Converte para ISO local; formatos já ISO (ou desconhecidos) passam direto.
function parseFlexibleTimestamp(raw: string): string | null {
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
  // A coluna de estado (estado_sigla) é comparada por igualdade exata em
  // vários pontos (matchesEstado em services/records.ts) — sem isso, uma
  // linha digitada à mão como " ro", "Ro" ou "RO " (espaço/caixa diferente do
  // esperado) simplesmente sumia do estado ao filtrar, mesmo "parecendo"
  // igual visualmente.
  if (column?.stateRef) return String(raw).trim().toUpperCase();
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
  columns: ColumnDef[],
  clientSignal?: AbortSignal
): Promise<IndexedTable> {
  const cached = await readCachedSheet(env, sheetName);
  if (cached) return indexRawRows(cached.rows, columns);

  const fetchedAt = Date.now();
  const rawRows = await callAppsScript<unknown[][]>(env, "read", { sheet: sheetName }, clientSignal);
  await writeCachedSheets(env, { [sheetName]: rawRows }, fetchedAt);
  return indexRawRows(rawRows, columns);
}

// Lê várias abas numa única chamada ao Apps Script (ação "readMany") — só para
// as que não estiverem em cache. Devolve, por nome de aba, a tabela indexada
// — ou null quando a aba não existe.
export async function readTables(
  env: Bindings,
  requests: { sheetName: string; columns: ColumnDef[] }[],
  clientSignal?: AbortSignal
): Promise<Record<string, IndexedTable | null>> {
  const out: Record<string, IndexedTable | null> = {};
  const misses: { sheetName: string; columns: ColumnDef[] }[] = [];

  // Uma única ida à KV para todas as abas pedidas, em vez de uma por aba.
  const cached = await readManyCachedSheets(env, requests.map((r) => r.sheetName));
  for (const request of requests) {
    const entry = cached[request.sheetName];
    if (entry) out[request.sheetName] = indexRawRows(entry.rows, request.columns);
    else misses.push(request);
  }
  if (!misses.length) return out;

  const fetchedAt = Date.now();
  const raw = await callAppsScript<Record<string, unknown[][] | null>>(
    env,
    "readMany",
    { sheets: misses.map((r) => r.sheetName) },
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
  // Uma única gravação na KV para todas as abas que vieram certas (ver db/cache.ts).
  if (Object.keys(toCache).length) await writeCachedSheets(env, toCache, fetchedAt);
  return out;
}

function indexRawRows(rawRows: unknown[][] | null | undefined, columns: ColumnDef[]): IndexedTable {
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

// ---------- atualização forçada do cache (cron + refresh manual do admin) ----------

// Busca as abas informadas direto no Apps Script (ignora o cache) e regrava o
// cache com o resultado — usado pelo cron (só para as abas vencidas, ver
// services/cache.ts) e pelo refresh manual do admin (força todas, resetando a
// contagem de todas de uma vez).
export async function refreshCachedSheets(
  env: Bindings,
  sheetNames: string[]
): Promise<{ refreshed: string[]; errors: Record<string, string> }> {
  const refreshed: string[] = [];
  const errors: Record<string, string> = {};
  if (!sheetNames.length) return { refreshed, errors };

  const fetchedAt = Date.now();
  const raw = await callAppsScript<Record<string, unknown[][] | null>>(env, "readMany", {
    sheets: sheetNames
  });

  const toCache: Record<string, unknown[][]> = {};
  sheetNames.forEach((name) => {
    const rows = raw?.[name];
    if (rows == null) {
      errors[name] = `Aba "${name}" não existe.`;
      return;
    }
    toCache[name] = rows;
    refreshed.push(name);
  });
  // Uma única gravação na KV para todas as abas de uma vez — é o que faz o
  // cron custar 1 gravação por tick, não uma por aba.
  if (Object.keys(toCache).length) await writeCachedSheets(env, toCache, fetchedAt);
  return { refreshed, errors };
}

// ---------- escrita ----------

// `skipInvalidate`: usado por bulkWrite (ver services/records.ts), que chama
// append+update da MESMA aba em paralelo e depois delete — sem isso, uma
// chamada só ao endpoint em lote invalidaria (leitura+gravação na KV) a
// mesma aba até 3 vezes. bulkWrite pede pra pular aqui e invalida 1 vez só,
// no final, depois que todas as escritas terminaram.
type WriteOptions = { skipInvalidate?: boolean };

export async function appendRows(
  env: Bindings,
  sheetName: string,
  columns: ColumnDef[],
  rows: SheetRow[],
  options?: WriteOptions
): Promise<void> {
  if (!rows.length) return;
  await callAppsScript(env, "append", {
    sheet: sheetName,
    values: rows.map((row) => rowToValues(columns, row))
  });
  // Sem isso, quem lê essa aba continuaria vendo a versão de antes da
  // gravação até o cron passar (até 5 min) — a próxima leitura busca de novo.
  if (!options?.skipInvalidate) await invalidateCachedSheet(env, sheetName);
}

// A linha é resolvida pelo id DENTRO do Code.gs, sob o lock de escrita — não
// aqui — porque um número de linha calculado antes desta chamada pode já
// estar desatualizado por outra gravação concorrente na mesma aba.
// Devolve quantas linhas o Code.gs realmente encontrou e alterou (pode ser
// menos que `rows.length` se algum id já não existir mais na planilha) —
// quem chama não deve assumir sucesso total só porque a chamada não lançou.
export async function updateRows(
  env: Bindings,
  sheetName: string,
  columns: ColumnDef[],
  rows: SheetRow[],
  options?: WriteOptions
): Promise<number> {
  if (!rows.length) return 0;
  const result = await callAppsScript<{ updated: number }>(env, "update", {
    sheet: sheetName,
    updates: rows.map((row) => ({
      id: row.id,
      values: rowToValues(columns, row)
    }))
  });
  if (!options?.skipInvalidate) await invalidateCachedSheet(env, sheetName);
  return result.updated;
}

// Mesma ideia de updateRows acima: devolve o total realmente apagado pelo
// Code.gs, não a quantidade pedida.
export async function deleteRows(
  env: Bindings,
  sheetName: string,
  ids: string[],
  options?: WriteOptions
): Promise<number> {
  if (!ids.length) return 0;
  const result = await callAppsScript<{ deleted: number }>(env, "delete", {
    sheet: sheetName,
    ids: [...new Set(ids)]
  });
  if (!options?.skipInvalidate) await invalidateCachedSheet(env, sheetName);
  return result.deleted;
}
