import { sessionStore } from "./utils";

const AUTH_STORAGE_KEY = "gg-auth";

function normalizeApiBase(value) {
  let raw = String(value || "").trim();
  if (!raw) return "";
  raw = raw.replace(/\/+$/, "");
  if (!/^https?:\/\//i.test(raw)) {
    raw = "https://" + raw.replace(/^\/+/, "");
  }
  return raw;
}

const configuredBase = import.meta.env.VITE_API_URL || import.meta.env.VITE_API_BASE || "";

const API_BASE = normalizeApiBase(configuredBase);

if (import.meta.env.PROD && !API_BASE) {
  console.error(
    "[API] VITE_API_URL/VITE_API_BASE não configurada. As chamadas irão para a mesma origem do front."
  );
}

function readToken() {
  try {
    const raw = sessionStore.getItem(AUTH_STORAGE_KEY);
    if (!raw) return null;
    const session = JSON.parse(raw);
    if (!session || !session.token) return null;
    if (session.expiresAt && Date.now() > session.expiresAt) return null;
    return session.token;
  } catch {
    return null;
  }
}

const REQUEST_TIMEOUT_MS = 30000;

let onUnauthorized = null;

export function setUnauthorizedHandler(handler) {
  onUnauthorized = typeof handler === "function" ? handler : null;
}

export async function apiFetch(
  path,
  {
    method = "GET",
    body,
    headers = {},
    auth = true,
    keepalive = false,
    timeoutMs = method === "GET" ? 0 : REQUEST_TIMEOUT_MS
  } = {}
) {
  const finalHeaders = { ...headers };
  const payload = body !== undefined ? JSON.stringify(body) : undefined;
  if (payload !== undefined) finalHeaders["Content-Type"] = "application/json";
  let sentToken = null;
  if (auth) {
    sentToken = readToken();
    if (sentToken) finalHeaders["Authorization"] = `Bearer ${sentToken}`;
  }

  const controller = new AbortController();
  const timer = timeoutMs ? setTimeout(() => controller.abort(), timeoutMs) : null;
  let res;
  try {
    res = await fetch(API_BASE + path, {
      method,
      headers: finalHeaders,
      body: payload,
      credentials: "same-origin",
      signal: controller.signal,
      keepalive
    });
  } catch (e) {
    if (e && e.name === "AbortError") {
      const err = new Error("O servidor demorou demais para responder.");
      err.status = 0;
      throw err;
    }
    throw e;
  } finally {
    if (timer) clearTimeout(timer);
  }

  let data = null;
  try {
    data = await res.json();
  } catch {
  }

  if (!res.ok) {
    if (res.status === 401 && sentToken && readToken() === sentToken && onUnauthorized) {
      onUnauthorized();
    }
    const message =
      (data && data.error && data.error.message) ||
      (data && data.message) ||
      `Erro ${res.status}`;
    const err = new Error(message);
    err.status = res.status;
    throw err;
  }
  return data;
}
