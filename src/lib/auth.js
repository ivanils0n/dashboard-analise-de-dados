/* Autenticação própria (API → Google Sheets): sessão e perfil em sessionStorage
   (sem tokens em disco); logout/expiração purgam memória+cache+fila; RBAC por
   perfil admin/analista/visitante; perfil validado via /api/auth/me. */
import { reactive } from "vue";
import { safeSetItem, sessionStore, localStore } from "./utils";
import { apiFetch, setUnauthorizedHandler } from "./api";
import { resetLocalState } from "./db";
import { clearFaturamento } from "@/composables/useFaturamento";

const AUTH_STORAGE_KEY = "gg-auth";
const AUTH_DURATION_MS = 6 * 60 * 60 * 1000; // 6 horas

export const PERFIL_LABELS = {
  admin: "Administrador",
  analista: "Analista",
  visitante: "Visitante"
};

export const authState = reactive({
  profile: null,
  loading: true
});

/* Nota: a montagem do e-mail a partir do usuário ("ivan" -> "ivan@...") é
   feita pelo backend (services/auth.ts) — não duplicar aqui. */

// ---------- Sessão (sessionStorage) ----------
function readSession() {
  try {
    const raw = sessionStore.getItem(AUTH_STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch (e) {
    return null;
  }
}

function writeSession(data) {
  safeSetItem(sessionStore, AUTH_STORAGE_KEY, JSON.stringify(data));
}

function clearSession() {
  try {
    sessionStore.removeItem(AUTH_STORAGE_KEY);
  } catch (e) {}
}

// Remove resíduos de tokens do supabase-js (sb-*-auth-token) de versões antigas.
function clearLegacyKeys() {
  const scan = (store) => {
    try {
      const toRemove = [];
      for (let i = 0; i < store.length; i++) {
        const k = store.key(i);
        if (k && k.indexOf("sb-") === 0 && k.indexOf("-auth-token") !== -1) {
          toRemove.push(k);
        }
      }
      toRemove.forEach((k) => store.removeItem(k));
    } catch (e) {}
  };
  scan(sessionStore);
  scan(localStore);
}

let _expiredHandled = false;

// Revalida o perfil no servidor com TTL (evita chamar a API a cada navegação).
const PROFILE_CHECK_TTL_MS = 60 * 60 * 1000; // 1 hora
let _lastProfileCheck = 0;

export function getToken() {
  const data = readSession();
  if (!data || !data.token) return null;
  if (!data.expiresAt || Date.now() > data.expiresAt) {
    // Sessão vencida: purga completa (memória + cache + timers).
    handleSessionExpired();
    return null;
  }
  return data.token;
}

export function isAuthenticated() {
  return !!getToken();
}

export function getProfile() {
  const data = readSession();
  const profile = data && data.profile ? data.profile : null;
  authState.profile = profile;
  return profile;
}

export function isAdmin() {
  const p = getProfile();
  return !!(p && p.perfil === "admin");
}

export function canEditData() {
  const p = getProfile();
  return !!(p && (p.perfil === "admin" || p.perfil === "analista"));
}

// Carrega o perfil via API e salva na sessão.
export async function loadProfile() {
  try {
    const data = await apiFetch("/api/auth/me");
    const row = data && data.data && data.data.user;
    if (!row || !row.ativo) return null;
    return {
      id: row.id,
      email: row.email,
      usuario: row.usuario,
      nome: row.nome || row.usuario || "",
      perfil: row.perfil || "visitante"
    };
  } catch (err) {
    if (err.status !== 401) console.warn("[Auth] Falha ao carregar perfil:", err.message);
    return null;
  }
}

export async function ensureProfile() {
  const stored = getProfile();
  const now = Date.now();
  if (stored && now - _lastProfileCheck < PROFILE_CHECK_TTL_MS) return stored;
  const fetched = await loadProfile();
  _lastProfileCheck = Date.now();
  if (!fetched) {
    handleSessionExpired();
    return null;
  }
  const prev = readSession() || {};
  writeSession({ ...prev, profile: fetched });
  authState.profile = fetched;
  return fetched;
}

function saveSession(token, profile) {
  _expiredHandled = false;
  _lastProfileCheck = 0;
  writeSession({
    token,
    user: profile ? { id: profile.id, email: profile.email } : null,
    profile: profile || null,
    expiresAt: Date.now() + AUTH_DURATION_MS
  });
  scheduleExpiryLogout();
}

let _expiryTimer = null;

export function clearExpiryTimer() {
  if (_expiryTimer) {
    clearTimeout(_expiryTimer);
    _expiryTimer = null;
  }
}

function scheduleExpiryLogout() {
  clearExpiryTimer();
  const data = readSession();
  if (!data || !data.expiresAt) return;
  const remaining = data.expiresAt - Date.now();
  if (remaining <= 0) {
    handleSessionExpired();
    return;
  }
  _expiryTimer = setTimeout(() => handleSessionExpired(), remaining);
}

export async function login(identifier, password) {
  const usuario = String(identifier || "").trim();
  if (!usuario) return { error: { message: "Informe o usuário." } };

  try {
    const response = await apiFetch("/api/auth/login", {
      method: "POST",
      auth: false,
      body: { usuario, senha: password }
    });
    const data = response && response.data ? response.data : {};
    const profile = data.user || null;
    saveSession(data.token, profile);
    // Sessão nova = estado zerado (nada do usuário anterior em memória/cache).
    resetLocalState();
    return { data };
  } catch (err) {
    return { error: { message: err.message } };
  }
}

export async function changePassword(currentPassword, newPassword) {
  try {
    await apiFetch("/api/auth/change-password", {
      method: "POST",
      body: { senhaAtual: currentPassword, senhaNova: newPassword }
    });
    return { data: true };
  } catch (err) {
    return { error: { message: err.message } };
  }
}

export async function changeName(newName) {
  try {
    await apiFetch("/api/auth/change-name", {
      method: "POST",
      body: { nome: newName }
    });
    const prev = readSession() || {};
    prev.profile = { ...(prev.profile || {}), nome: newName };
    writeSession(prev);
    authState.profile = prev.profile;
    return { data: true };
  } catch (err) {
    return { error: { message: err.message } };
  }
}

function performFullCleanup() {
  clearExpiryTimer();
  stopAuthPolling();
  clearSession();
  clearLegacyKeys();
  authState.profile = null;
  clearFaturamento();
  resetLocalState();
}

export function logout() {
  _expiredHandled = true;
  performFullCleanup();
}

export function handleSessionExpired() {
  if (_expiredHandled) return;
  _expiredHandled = true;
  performFullCleanup();
}

// Token recusado pelo servidor (401): encerra a sessão local imediatamente.
setUnauthorizedHandler(() => handleSessionExpired());

// Expiração em tempo real (6h): intervalo rastreado e encerrado no logout.
let _pollTimer = null;

export function startAuthPolling() {
  stopAuthPolling();
  _pollTimer = setInterval(() => {
    if (!isAuthenticated()) {
      handleSessionExpired();
    }
  }, 30 * 1000);
}

export function stopAuthPolling() {
  if (_pollTimer) {
    clearInterval(_pollTimer);
    _pollTimer = null;
  }
}
