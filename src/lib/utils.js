export async function mapWithConcurrency(items, limit, worker) {
  const results = new Array(items.length);
  let nextIndex = 0;

  async function runWorker() {
    while (nextIndex < items.length) {
      const current = nextIndex++;
      results[current] = await worker(items[current], current);
    }
  }

  const poolSize = Math.max(1, Math.min(limit, items.length));
  await Promise.all(Array.from({ length: poolSize }, runWorker));
  return results;
}

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

export function formatDate(isoDate) {
  if (!isoDate) return "—";
  const date = new Date(/T/.test(isoDate) ? isoDate : isoDate + "T00:00:00");
  if (isNaN(date.getTime())) return String(isoDate);
  return date.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" });
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

export function compareDateAsc(a, b) {
  return String(a || "").localeCompare(String(b || ""));
}
export function compareDateDesc(a, b) {
  return String(b || "").localeCompare(String(a || ""));
}

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

function isPlausibleDate(d) {
  const year = d.getFullYear();
  return !isNaN(d.getTime()) && year >= 1900 && year <= 2100;
}

export function daysBetween(startIso, endIso) {
  const start = new Date(startIso);
  const end = new Date(endIso);
  if (!isPlausibleDate(start) || !isPlausibleDate(end)) return null;
  return (end - start) / 86400000;
}

export function createId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

export function normalizeText(value) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

export function nameKey(value) {
  return normalizeText(value).replace(/\s+/g, " ").trim().toUpperCase();
}

const MOTIVO_CANONICO = {
  falta: "Falta",
  faltas: "Falta",
  atestado: "Atestado",
  atestados: "Atestado",
  suspensao: "Suspensão",
  suspensoes: "Suspensão",
  presente: "Presente",
  advertencia: "Advertência",
  "acidente de trabalho": "Acidente de Trabalho",
  acidente: "Acidente de Trabalho"
};
export function normalizeMotivo(value) {
  const raw = String(value ?? "").trim();
  if (!raw) return null;
  const key = normalizeText(raw).replace(/[\s_-]+/g, " ").trim();
  return MOTIVO_CANONICO[key] || raw;
}

export function filialDisplay(filial, estado) {
  const text = String(filial ?? "").trim();
  const uf = String(estado ?? "").trim().toUpperCase();
  return /^cd$/i.test(text) && uf ? `CD - ${uf}` : text;
}

export function upperText(value) {
  return value === null || value === undefined ? value : String(value).toUpperCase();
}

export function sameState(value, target) {
  if (value === target) return true;
  return (
    String(value ?? "").trim().toUpperCase() ===
    String(target ?? "").trim().toUpperCase()
  );
}

export const MONTHS_SHORT = [
  "Jan", "Fev", "Mar", "Abr", "Mai", "Jun",
  "Jul", "Ago", "Set", "Out", "Nov", "Dez"
];

const pad2 = (n) => String(n).padStart(2, "0");

export function ymOf(isoDate) {
  if (!isoDate) return "";
  return String(isoDate).slice(0, 7);
}

function ymOfDate(d = new Date()) {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}`;
}

export function currentYm() {
  return ymOfDate();
}

export function monthYm(offset = 0) {
  const d = new Date();
  d.setDate(1);
  d.setMonth(d.getMonth() + offset);
  return ymOfDate(d);
}

export function addMonthsYm(ym, delta = 0) {
  const [y, m] = String(ym || currentYm()).split("-").map(Number);
  if (!y || !m) return currentYm();
  const d = new Date(y, m - 1 + Number(delta), 1);
  return ymOfDate(d);
}

export function firstDayOfYm(ym) {
  return `${ym}-01`;
}

export function lastDayOfYm(ym) {
  const [y, m] = ym.split("-").map(Number);
  const last = new Date(y, m, 0);
  return `${last.getFullYear()}-${pad2(last.getMonth() + 1)}-${pad2(last.getDate())}`;
}

export function ymLabel(ym) {
  if (!ym) return "";
  const [y, m] = ym.split("-");
  const mi = Number(m) - 1;
  if (!y || mi < 0 || mi > 11) return ym;
  return `${MONTHS_SHORT[mi]}/${y}`;
}

export function ymShortLabel(ym) {
  if (!ym) return "";
  const [y, m] = ym.split("-");
  const mi = Number(m) - 1;
  if (!y || mi < 0 || mi > 11) return ym;
  return `${MONTHS_SHORT[mi].toLowerCase()}/${String(y).slice(-2)}`;
}

export function singleMonthOfRange(start, end) {
  if (!start || !end) return null;
  const ym = ymOf(start);
  if (ymOf(end) !== ym) return null;
  if (start !== firstDayOfYm(ym)) return null;
  if (end !== lastDayOfYm(ym)) return null;
  return ym;
}

export function yearOptions(before = 4, after = 1) {
  const cur = new Date().getFullYear();
  const out = [];
  for (let y = cur - before; y <= cur + after; y++) out.push(y);
  return out;
}

export function parseCurrencyBR(input) {
  if (input === null || input === undefined) return NaN;
  let s = String(input).replace(/[R$\s]/g, "").trim();
  if (!s) return NaN;

  const hasComma = s.includes(",");
  const hasDot = s.includes(".");

  let normalized;
  if (hasComma) {
    normalized = s.replace(/\./g, "").replace(",", ".");
  } else if (hasDot) {
    if (/^\d{1,3}(\.\d{3})+$/.test(s)) {
      normalized = s.replace(/\./g, "");
    } else {
      normalized = s;
    }
  } else {
    normalized = s;
  }

  if (!/^-?\d*\.?\d*$/.test(normalized)) return NaN;
  return Number(normalized);
}

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

export function normalizeCurrencyInput(text) {
  const masked = maskCurrencyInput(text);
  if (masked === "") return "";
  const [intPart, decPart] = masked.split(",");
  return `${intPart || "0"},${(decPart || "").padEnd(2, "0")}`;
}

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
    return Number((h + m / 60 + s / 3600).toFixed(6));
  }
  if (s.toLowerCase().includes("h")) {
    const hm = s.toLowerCase().match(/^(\d{1,4})\s*h\s*(\d{1,2})?$/);
    if (hm) {
      const h = parseInt(hm[1], 10);
      const m = hm[2] ? parseInt(hm[2], 10) : 0;
      if (m >= 60) return null;
      return Number((h + m / 60).toFixed(6));
    }
  }

  const normalized = pure.replace(",", ".");
  if (/^\d*\.?\d+$/.test(normalized)) {
    const n = Number(normalized);
    return isNaN(n) ? null : n;
  }
  return null;
}

export function formatHoursClock(value) {
  const n = Number(value);
  if (value === null || value === undefined || value === "" || isNaN(n)) return "—";
  const totalMinutes = Math.round(n * 60);
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

const DISPOSABLE_PREFIX = "ggd:";

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

    try {
      const disposable = [];
      for (let i = 0; i < storage.length; i++) {
        const k = storage.key(i);
        if (k && k !== key && k.indexOf(DISPOSABLE_PREFIX) === 0) disposable.push(k);
      }
      disposable.forEach((k) => storage.removeItem(k));
    } catch {}

    try {
      storage.setItem(key, value);
      return true;
    } catch {
      return false;
    }
  }
}

function createWebStore(name) {
  try {
    const store = window[name];
    const probe = "__gg_probe__";
    store.setItem(probe, "1");
    store.removeItem(probe);
    return store;
  } catch {
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

export const sessionStore = createWebStore("sessionStorage");
export const localStore = createWebStore("localStorage");
