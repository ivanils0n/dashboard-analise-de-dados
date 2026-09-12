/* Cliente HTTP da API (Cloudflare Worker → CockroachDB).
   Lê o JWT direto do sessionStorage (chave gg-auth) para evitar dependência
   circular com auth.js. Em dev, VITE_API_BASE aponta para o wrangler local. */

import { sessionStore } from "./utils";

const AUTH_STORAGE_KEY = "gg-auth";

export const API_BASE = String(import.meta.env.VITE_API_BASE || "").replace(/\/$/, "");

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
