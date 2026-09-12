/* Cliente HTTP da API (Cloudflare Worker → CockroachDB).
   A URL base vem de VITE_API_URL (ou VITE_API_BASE, por compatibilidade).
   Lê o JWT direto do sessionStorage (chave gg-auth) para evitar dependência
   circular com auth.js. */

import { sessionStore } from "./utils";

const AUTH_STORAGE_KEY = "gg-auth";

/* Garante uma URL absoluta. Sem o esquema, o navegador trataria o valor como
   caminho relativo do domínio atual (ex.: pages.dev/<host-do-worker>/api/...). */
export function normalizeApiBase(value) {
  let raw = String(value || "").trim();
  if (!raw) return "";
  raw = raw.replace(/\/+$/, "");
  if (!/^https?:\/\//i.test(raw)) {
    raw = "https://" + raw.replace(/^\/+/, "");
  }
  return raw;
}

const configuredBase = import.meta.env.VITE_API_URL || import.meta.env.VITE_API_BASE || "";

export const API_BASE = normalizeApiBase(configuredBase);

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
  } catch (e) {
    return null;
  }
}

export async function apiFetch(path, { method = "GET", body, headers = {}, auth = true } = {}) {
  const finalHeaders = { ...headers };
  if (body !== undefined) finalHeaders["Content-Type"] = "application/json";
  if (auth) {
    const token = readToken();
    if (token) finalHeaders["Authorization"] = `Bearer ${token}`;
  }

  const res = await fetch(API_BASE + path, {
    method,
    headers: finalHeaders,
    body: body !== undefined ? JSON.stringify(body) : undefined,
    credentials: "same-origin"
  });

  let data = null;
  try {
    data = await res.json();
  } catch (e) {
    /* resposta sem corpo */
  }

  if (!res.ok) {
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
