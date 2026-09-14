/* Utilitários de formatação e de storage web seguro. */

export function formatValue(indicator, value) {
  if (value === null || value === undefined || value === "" || isNaN(Number(value))) {
    return "—";
  }
  const num = Number(value);
  const decimals = indicator.decimals ?? 1;

  switch (indicator.type) {
    case "percent":
      return num.toLocaleString("pt-BR", { minimumFractionDigits: decimals, maximumFractionDigits: decimals }) + "%";
    case "currency":
      return num.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
    case "days":
      return num.toLocaleString("pt-BR", { minimumFractionDigits: decimals, maximumFractionDigits: decimals }) + " dias";
    case "months":
      return num.toLocaleString("pt-BR", { minimumFractionDigits: decimals, maximumFractionDigits: decimals }) + " meses";
    case "hours":
      return formatHoursClock(num);
    default:
      return num.toLocaleString("pt-BR", { maximumFractionDigits: decimals });
  }
}

export function formatRawValue(indicator, value) {
  const num = Number(value);
  const decimals = indicator.decimals ?? 1;
  if (indicator.type === "currency") {
    return num.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
  }
  if (indicator.type === "hours") {
    return formatHoursClock(num);
  }
  return num.toLocaleString("pt-BR", { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
}

export function formatCurrency(value) {
  if (value === null || value === undefined || value === "" || isNaN(Number(value))) {
    return "—";
  }
  return Number(value).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

export function formatAxisValue(indicator, value) {
  if (indicator.type === "currency") {
    return "R$ " + Number(value).toLocaleString("pt-BR", { maximumFractionDigits: 0 });
  }
  if (indicator.type === "hours") {
    return formatHoursClock(value);
  }
  const decimals = indicator.decimals ?? 1;
  return Number(value).toLocaleString("pt-BR", { maximumFractionDigits: decimals });
}

export function formatDate(isoDate) {
  if (!isoDate) return "—";
  const date = new Date(/T/.test(isoDate) ? isoDate : isoDate + "T00:00:00");
  if (isNaN(date.getTime())) return String(isoDate);
  return date.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" });
}

export function formatShortDate(isoDate) {
  if (!isoDate) return "—";
  /* Aceita "YYYY-MM-DD" e timestamps: sem o teste de "T", um valor que já
     tem hora virava "...T10:00:00T00:00:00" (Invalid Date) e era exibido cru. */
  const date = new Date(/T/.test(isoDate) ? isoDate : isoDate + "T00:00:00");
  if (isNaN(date.getTime())) return String(isoDate);
  return date.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
}

export function formatDateTime(iso) {
  if (!iso) return "—";
  const date = new Date(iso);
  if (isNaN(date.getTime())) return iso;
  const pad = (n) => String(n).padStart(2, "0");
  return `${pad(date.getDate())}/${pad(date.getMonth() + 1)}/${date.getFullYear()} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export function nowLocalISO() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

export function todayISO() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function firstDayOfMonthISO() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-01`;
}

export function lastDayOfMonthISO() {
  const d = new Date();
  const last = new Date(d.getFullYear(), d.getMonth() + 1, 0);
  const pad = (n) => String(n).padStart(2, "0");
  return `${last.getFullYear()}-${pad(last.getMonth() + 1)}-${pad(last.getDate())}`;
}

/* Comparações de data ISO tolerantes a valores ausentes/inválidos.
   Evitam estouros em dados legados/importados com data nula. */
export function compareDateAsc(a, b) {
  return String(a || "").localeCompare(String(b || ""));
}
export function compareDateDesc(a, b) {
  return String(b || "").localeCompare(String(a || ""));
}

/* Agrega lançamentos por dia (soma dos valores na mesma data), usado na
   evolução de indicadores com múltiplos registros por dia (ex.: diárias). */
export function aggregateByDay(entries) {
  const byDay = new Map();
  (entries || []).forEach((e) => {
    const day = e.date;
    byDay.set(day, (byDay.get(day) || 0) + (Number(e.value) || 0));
  });
  return [...byDay.entries()]
    .map(([date, value]) => ({ date, value }))
    .sort((a, b) => compareDateAsc(a.date, b.date));
}

/* Agrega lançamentos por mês (soma ou média, conforme o tipo do indicador),
   usado no gráfico de barras da "Evolução por indicador". */
export function aggregateByMonth(entries, method = "sum") {
  const byMonth = new Map();
  (entries || []).forEach((e) => {
    if (!e || !e.date) return;
    const month = String(e.date).slice(0, 7);
    if (!byMonth.has(month)) byMonth.set(month, { sum: 0, count: 0 });
    const agg = byMonth.get(month);
    agg.sum += Number(e.value) || 0;
    agg.count += 1;
  });
  return [...byMonth.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([month, agg]) => ({
      date: month,
      value: method === "avg" ? agg.sum / agg.count : agg.sum
    }));
}

export function formatMonthLabel(monthKey) {
  if (!monthKey) return "—";
  const [y, m] = String(monthKey).split("-");
  const date = new Date(Number(y), Number(m) - 1, 1);
  if (isNaN(date.getTime())) return monthKey;
  return date.toLocaleDateString("pt-BR", { month: "short", year: "2-digit" }).replace(".", "");
}

export function daysBetween(startIso, endIso) {
  const start = new Date(startIso);
  const end = new Date(endIso);
  if (isNaN(start.getTime()) || isNaN(end.getTime())) return null;
  return (end - start) / 86400000;
}

export function createId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

/* Normaliza texto para busca: minúsculas e sem acentos.
   Ex.: "Aguíar" -> "aguiar", "São Paulo" -> "sao paulo". */
export function normalizeText(value) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

/* Compara siglas de estado tolerando caixa e espaços ("ro" = " RO " = "RO"). */
export function sameState(value, target) {
  return (
    String(value ?? "").trim().toUpperCase() ===
    String(target ?? "").trim().toUpperCase()
  );
}

/* =========================================================
   Utilitários de mês/ano e valores monetários (BRL)
   ========================================================= */

export const MONTHS_SHORT = [
  "Jan", "Fev", "Mar", "Abr", "Mai", "Jun",
  "Jul", "Ago", "Set", "Out", "Nov", "Dez"
];

const pad2 = (n) => String(n).padStart(2, "0");

/* Chave de mês "YYYY-MM" a partir de uma data ISO (YYYY-MM-DD ou timestamp). */
export function ymOf(isoDate) {
  if (!isoDate) return "";
  return String(isoDate).slice(0, 7);
}

export function ymOfDate(d = new Date()) {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}`;
}

/* Mês/ano vigente (relógio local). */
export function currentYm() {
  return ymOfDate();
}

/* Mês deslocado por `offset` meses a partir de hoje (negativo = anterior). */
export function monthYm(offset = 0) {
  const d = new Date();
  d.setDate(1);
  d.setMonth(d.getMonth() + offset);
  return ymOfDate(d);
}

/* Desloca um mês "YYYY-MM" em `delta` meses (negativo = anterior).
   Ex.: addMonthsYm("2026-09", -1) -> "2026-08". */
export function addMonthsYm(ym, delta = 0) {
  const [y, m] = String(ym || currentYm()).split("-").map(Number);
  if (!y || !m) return currentYm();
  const d = new Date(y, m - 1 + Number(delta), 1);
  return ymOfDate(d);
}

/* Primeiro e último dia (YYYY-MM-DD) de um mês "YYYY-MM". */
export function firstDayOfYm(ym) {
  return `${ym}-01`;
}

export function lastDayOfYm(ym) {
  const [y, m] = ym.split("-").map(Number);
  const last = new Date(y, m, 0);
  return `${last.getFullYear()}-${pad2(last.getMonth() + 1)}-${pad2(last.getDate())}`;
}

/* Rótulo curto "Fev/2026" para um mês "YYYY-MM". */
export function ymLabel(ym) {
  if (!ym) return "";
  const [y, m] = ym.split("-");
  const mi = Number(m) - 1;
  if (!y || mi < 0 || mi > 11) return ym;
  return `${MONTHS_SHORT[mi]}/${y}`;
}

/* Rótulo compacto "fev/26" (mês abreviado minúsculo + 2 dígitos do ano). */
export function ymShortLabel(ym) {
  if (!ym) return "";
  const [y, m] = ym.split("-");
  const mi = Number(m) - 1;
  if (!y || mi < 0 || mi > 11) return ym;
  return `${MONTHS_SHORT[mi].toLowerCase()}/${String(y).slice(-2)}`;
}

/* Se `start`/`end` corresponderem exatamente a um mês civil completo,
   devolve a chave "YYYY-MM"; caso contrário devolve null. */
export function singleMonthOfRange(start, end) {
  if (!start || !end) return null;
  const ym = ymOf(start);
  if (ymOf(end) !== ym) return null;
  if (start !== firstDayOfYm(ym)) return null;
  if (end !== lastDayOfYm(ym)) return null;
  return ym;
}

/* Lista de anos sugeridos para os seletores de mês (ex.: atual -4 .. atual +1). */
export function yearOptions(before = 4, after = 1) {
  const cur = new Date().getFullYear();
  const out = [];
  for (let y = cur - before; y <= cur + after; y++) out.push(y);
  return out;
}

/* Converte texto digitado (ex.: "1.500,50", "1500,50", "1500.50",
   "R$ 250,75") para Number. Evita ambiguidade entre vírgula e ponto:
   quando os dois existem, o ponto é separador de milhar. */
export function parseCurrencyBR(input) {
  if (input === null || input === undefined) return NaN;
  let s = String(input).replace(/[R$\s]/g, "").trim();
  if (!s) return NaN;

  const hasComma = s.includes(",");
  const hasDot = s.includes(".");

  let normalized;
  if (hasComma) {
    // Com vírgula presente ela é sempre o decimal: o ponto só pode ser milhar.
    normalized = s.replace(/\./g, "").replace(",", ".");
  } else if (hasDot) {
    // "1.500" (milhar) x "1500.50" (decimal): só é milhar se os grupos
    // forem de 3 dígitos do fim para o começo.
    if (/^\d{1,3}(\.\d{3})+$/.test(s)) {
      normalized = s.replace(/\./g, "");
    } else {
      normalized = s; // ponto como decimal
    }
  } else {
    normalized = s;
  }

  if (!/^-?\d*\.?\d*$/.test(normalized)) return NaN;
  return Number(normalized);
}

/* Máscara de digitação monetária: mantém apenas dígitos e uma vírgula
   decimal, agrupando os milhares com ponto enquanto o usuário digita.
   ""       -> ""
   "1500"   -> "1.500"
   "1500,5" -> "1.500,5"  ("1.500,50" no blur)
   "R$ 1.000,00" -> "1.000,00" */
export function maskCurrencyInput(inputValue) {
  let s = String(inputValue ?? "");
  s = s.replace(/[R$\s]/g, "");
  if (!s) return "";
  const lastComma = s.lastIndexOf(",");
  let intRaw = (lastComma >= 0 ? s.slice(0, lastComma) : s).replace(/[^\d]/g, "");
  let decRaw = lastComma >= 0 ? s.slice(lastComma + 1).replace(/[^\d]/g, "") : "";
  decRaw = decRaw.slice(0, 2);
  if (intRaw === "") intRaw = "0";
  const int = parseInt(intRaw, 10);
  const intLabel = isNaN(int) ? "0" : int.toLocaleString("pt-BR");
  if (lastComma < 0) return intLabel;
  return `${intLabel},${decRaw || ""}`;
}

/* Finaliza a exibição de um campo monetário (chamada no blur): garante que
   existam duas casas decimais. Devolve texto formatado pt-BR. */
export function normalizeCurrencyInput(text) {
  const masked = maskCurrencyInput(text);
  if (masked === "") return "";
  const [intPart, decPart] = masked.split(",");
  return `${intPart || "0"},${(decPart || "").padEnd(2, "0")}`;
}

/* Converte texto de horas em número (horas decimais). Aceita:
   "12" → 12 | "12:00" → 12 | "12:30" → 12.5 | "12,5"/"12.5" → 12.5 |
   "12h30" → 12.5. Devolve null quando inválido. */
export function parseHoursBR(input) {
  if (input === null || input === undefined) return null;
  let s = String(input).trim();
  if (!s) return null;

  const withH = s.toLowerCase().replace(/(h|horas?)\s*$/i, "").trim();
  const pure = withH || s;

  const colon = pure.match(/^(\d{1,4})\s*:\s*([0-5]?\d)(?:\s*:\s*([0-5]?\d))?$/);
  if (colon) {
    const h = parseInt(colon[1], 10);
    const m = parseInt(colon[2], 10);
    const s = colon[3] ? parseInt(colon[3], 10) : 0;
    return Number((h + m / 60 + s / 3600).toFixed(4));
  }
  if (s.toLowerCase().includes("h")) {
    const hm = s.toLowerCase().match(/^(\d{1,4})\s*h\s*(\d{1,2})?$/);
    if (hm) {
      const h = parseInt(hm[1], 10);
      const m = hm[2] ? parseInt(hm[2], 10) : 0;
      if (m >= 60) return null;
      return Number((h + m / 60).toFixed(4));
    }
  }

  const normalized = pure.replace(",", ".");
  if (/^\d*\.?\d+$/.test(normalized)) {
    const n = Number(normalized);
    return isNaN(n) ? null : n;
  }
  return null;
}

/* Formata horas decimais no padrão relógio HH:MM (zero à esquerda).
   Ex.: 1 → "01:00", 0.5 → "00:30", 10 → "10:00", 12.5 → "12:30". */
export function formatHoursClock(value) {
  const n = Number(value);
  if (value === null || value === undefined || value === "" || isNaN(n)) return "—";
  const totalMinutes = Math.round(n * 60);
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

/* Prefixo das chaves de cache de dados (ver lib/cache.js). São as únicas
   descartáveis: podem ser rebaixadas para liberar espaço porque são
   reconstruídas pelo delta sync. */
const DISPOSABLE_PREFIX = "ggd:";

// Grava no storage; em QuotaExceededError, descarta o cache de dados e regrava.
export function safeSetItem(storage, key, value) {
  try {
    storage.setItem(key, value);
    return true;
  } catch (err) {
    const isQuota =
      err &&
      (err.name === "QuotaExceededError" ||
        err.name === "NS_ERROR_DOM_QUOTA_REACHED" ||
        err.code === 22 ||
        err.code === 1014);
    if (!isQuota) return false;

    /* Antes limpava o storage inteiro — isso apagava junto a sessão (gg-auth)
       e deslogava o usuário no meio do trabalho. Remove apenas as chaves de
       cache, que o delta sync rebaixa sozinho. */
    try {
      const disposable = [];
      for (let i = 0; i < storage.length; i++) {
        const k = storage.key(i);
        if (k && k !== key && k.indexOf(DISPOSABLE_PREFIX) === 0) disposable.push(k);
      }
      disposable.forEach((k) => storage.removeItem(k));
    } catch (e) {}

    try {
      storage.setItem(key, value);
      return true;
    } catch (e2) {
      return false;
    }
  }
}

// Cria uma Storage web que nunca lança (noop se indisponível/bloqueada).
function createWebStore(name) {
  try {
    const store = window[name];
    const probe = "__gg_probe__";
    store.setItem(probe, "1");
    store.removeItem(probe);
    return store;
  } catch (e) {
    return {
      get length() {
        return 0;
      },
      clear() {},
      getItem() {
        return null;
      },
      key() {
        return null;
      },
      removeItem() {},
      setItem() {}
    };
  }
}

// Dados sensíveis (sessão + cache) só em sessionStorage; localStore limpa
// resíduos de versões antigas.
export const sessionStore = createWebStore("sessionStorage");
export const localStore = createWebStore("localStorage");
