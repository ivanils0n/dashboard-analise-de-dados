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
      return num.toLocaleString("pt-BR", { minimumFractionDigits: decimals, maximumFractionDigits: decimals }) + " h";
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
    return num.toLocaleString("pt-BR", { minimumFractionDigits: decimals, maximumFractionDigits: decimals }) + " h";
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
    return Number(value).toLocaleString("pt-BR", { maximumFractionDigits: 1 }) + "h";
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
  const date = new Date(isoDate + "T00:00:00");
  if (isNaN(date.getTime())) return isoDate;
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
    .sort((a, b) => a.date.localeCompare(b.date));
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

// Grava no storage; em QuotaExceededError, limpa o storage e regrava.
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
    if (isQuota) {
      try {
        storage.clear();
      } catch (e) {}
      try {
        storage.setItem(key, value);
        return true;
      } catch (e2) {
        return false;
      }
    }
    return false;
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
