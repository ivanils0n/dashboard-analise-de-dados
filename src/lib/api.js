/* Cliente HTTP da API (Cloudflare Worker → Google Sheets).
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

/* Sem resposta em 30 s uma gravação (POST etc.) é abortada, para a tela de
   carregamento não ficar presa. Leituras (GET) ficam sem limite — ver apiFetch. */
const REQUEST_TIMEOUT_MS = 30000;

/* Registrado pelo auth.js (evita import circular): chamado quando a API
   responde 401 a uma requisição autenticada — token vencido/revogado no
   servidor — para encerrar a sessão em vez de deixar o app "logado" com todas
   as chamadas falhando. */
let onUnauthorized = null;

export function setUnauthorizedHandler(handler) {
  onUnauthorized = typeof handler === "function" ? handler : null;
}

export async function apiFetch(
  path,
  { method = "GET", body, headers = {}, auth = true, keepalive = false } = {}
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
  /* Leituras (GET) não têm limite: a 2ª tentativa do Worker à planilha fica
     ativa até responder — recarregar ou fechar a página cancela a requisição. */
  const timer = method === "GET" ? null : setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
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
  } catch (e) {
    /* resposta sem corpo */
  }

  if (!res.ok) {
    /* Só encerra a sessão se o token recusado ainda é o da sessão atual — a
       resposta atrasada de uma sessão anterior não pode derrubar um login novo. */
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
