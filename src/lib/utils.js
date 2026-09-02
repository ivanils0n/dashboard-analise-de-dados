/* =========================================================
   Utilitários de formatação de valores, datas e horas
   ========================================================= */

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
  return num.toLocaleString("pt-BR", { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
}

export function formatAxisValue(indicator, value) {
  if (indicator.type === "currency") {
    return "R$ " + Number(value).toLocaleString("pt-BR", { maximumFractionDigits: 0 });
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

export function daysBetween(startIso, endIso) {
  const start = new Date(startIso);
  const end = new Date(endIso);
  if (isNaN(start.getTime()) || isNaN(end.getTime())) return null;
  return (end - start) / 86400000;
}

export function createId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

/* Grava no localStorage com fallback para limite de capacidade.
   Se a gravação falhar por QuotaExceededError, limpa TODO o localStorage
   e tenta gravar novamente a chave no storage limpo. */
export function safeSetItem(key, value) {
  try {
    localStorage.setItem(key, value);
    return true;
  } catch (err) {
    const isQuota =
      err &&
      (err.name === "QuotaExceededError" ||
        err.name === "NS_ERROR_DOM_QUOTA_REACHED" ||
        err.code === 22 ||
        err.code === 1014);
    if (isQuota) {
      console.warn("[storage] QuotaExceededError — limpando localStorage e regravando:", key);
      try {
        localStorage.clear();
      } catch (e) {}
      try {
        localStorage.setItem(key, value);
        return true;
      } catch (e2) {
        console.warn("[storage] Falha ao gravar mesmo após limpar o localStorage:", key);
        return false;
      }
    }
    return false;
  }
}
