/* Autenticação (Supabase Auth): sessão e perfil em sessionStorage (sem tokens
   em disco); logout/expiração purgam memória+cache+fila; RBAC por perfil
   admin/analista/visitante; perfil validado via RPC meu_perfil. */
import { reactive } from "vue";
import { AUTH_EMAIL_DOMAIN } from "./config";
import { safeSetItem, sessionStore, localStore } from "./utils";
import { supabaseClient, resetLocalState } from "./supabase";

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

/* Constrói o e-mail completo (aceita "ivan" ou "ivan@gente.gestao") */
export function buildLoginEmail(value) {
  const v = String(value || "").trim();
  if (!v) return "";
  if (v.indexOf("@") !== -1) return v.toLowerCase();
  return v.toLowerCase() + "@" + AUTH_EMAIL_DOMAIN;
}

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

// Remove tokens do supabase-js (sb-*-auth-token) no sessionStorage e em
// resíduos do localStorage.
function clearSupabaseKeys() {
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

// Refresh em cookie HttpOnly via Pages Function. OPCIONAL e desligado por
// padrão (GitHub Pages não executa Functions); habilitar no Cloudflare com
// VITE_GG_SESSION_COOKIE=true.
const AUTH_COOKIE_ENDPOINT = "/api/auth/session";
const SESSION_COOKIE_ENABLED = import.meta.env.VITE_GG_SESSION_COOKIE === "true";

// Revalida o perfil no servidor com TTL (evita chamar a RPC a cada navegação).
const PROFILE_CHECK_TTL_MS = 60 * 1000;
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

// Carrega o perfil (RPC meu_perfil / security definer) e salva na sessão.
export async function loadProfile(client, userId, email) {
  if (!client || !userId) return null;
  let data = null;

  try {
    const { data: rows, error } = await client.rpc("meu_perfil");
    if (error) {
      console.warn("[Auth] RPC meu_perfil indisponível:", error.message);
    } else if (rows && rows.length) {
      data = rows[0];
    }
  } catch (err) {
    console.warn("[Auth] Falha ao chamar meu_perfil:", err);
  }

  if (!data) {
    try {
      let query = client.from("usuarios").select("id, email, usuario, nome, perfil, ativo");
      if (email) {
        query = query.or(`id.eq.${userId},email.eq.${encodeURIComponent(email)}`);
      } else {
        query = query.eq("id", userId);
      }
      const { data: row, error } = await query.maybeSingle();
      if (error) {
        console.warn("[Auth] Não foi possível carregar o perfil:", error.message);
      } else {
        data = row;
      }
    } catch (err) {
      console.error("[Auth] Erro ao carregar perfil:", err);
    }
  }

  if (!data) {
    console.warn("[Auth] Perfil não encontrado no banco.");
    return null;
  }

  const profile = {
    id: data.id,
    email: data.email,
    usuario: data.usuario,
    nome: data.nome || data.usuario || "",
    perfil: data.perfil || "visitante"
  };
  const prev = readSession() || {};
  writeSession({ ...prev, profile });
  authState.profile = profile;
  return profile;
}

export async function ensureProfile() {
  const stored = getProfile();
  const now = Date.now();
  if (stored && now - _lastProfileCheck < PROFILE_CHECK_TTL_MS) return stored;
  const data = readSession();
  const userId = data && data.user ? data.user.id : null;
  const email = data && data.user ? data.user.email : null;
  const client = supabaseClient();
  const fetched = await loadProfile(client, userId, email);
  _lastProfileCheck = Date.now();
  if (!fetched && (userId || email)) {
    handleSessionExpired();
    return null;
  }
  return fetched || stored;
}

function saveSession(session) {
  _expiredHandled = false;
  _lastProfileCheck = 0;
  const prev = readSession() || {};
  writeSession({
    token: session.access_token,
    user: session.user ? { id: session.user.id, email: session.user.email } : prev.user || null,
    profile: prev.profile || null,
    expiresAt: Date.now() + AUTH_DURATION_MS
  });
  scheduleExpiryLogout();
  mirrorSessionToCookie(session && session.refresh_token);
}

// ---------- Cookie HttpOnly (Cloudflare Pages Function) ----------
// Espelha o refresh no cookie após login/refresh local.
function mirrorSessionToCookie(refreshToken) {
  if (!SESSION_COOKIE_ENABLED || !refreshToken) return;
  fetch(AUTH_COOKIE_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "same-origin",
    body: JSON.stringify({ refresh_token: refreshToken })
  }).catch(() => {});
}

function clearSessionCookie() {
  if (!SESSION_COOKIE_ENABLED) return;
  fetch(AUTH_COOKIE_ENDPOINT, { method: "DELETE", credentials: "same-origin" }).catch(() => {});
}

// Restaura a sessão: o servidor troca o refresh (HttpOnly) por um novo par e
// devolve só em memória.
export async function restoreSessionFromCookie() {
  if (!SESSION_COOKIE_ENABLED) return false;
  try {
    const res = await fetch(AUTH_COOKIE_ENDPOINT, { method: "GET", credentials: "same-origin" });
    if (!res.ok) return false;
    const s = await res.json();
    if (!s || !s.access_token || !s.refresh_token) return false;

    const client = supabaseClient();
    if (!client) return false;

    const user = s.user && s.user.id ? s.user : null;
    if (!user) return false;

    const { error } = await client.auth.setSession({
      access_token: s.access_token,
      refresh_token: s.refresh_token
    });
    if (error) return false;

    // Valida o perfil (RLS) antes de aceitar a sessão restaurada.
    const profile = await loadProfile(client, user.id, user.email);
    if (!profile) {
      await client.auth.signOut().catch(() => {});
      return false;
    }

    saveSession({ access_token: s.access_token, refresh_token: s.refresh_token, user });
    return true;
  } catch (e) {
    return false;
  }
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
  const client = supabaseClient();
  if (!client) {
    return { error: { message: "Credenciais do Supabase não configuradas." } };
  }
  const email = buildLoginEmail(identifier);
  if (!email) return { error: { message: "Informe o usuário." } };

  const { data, error } = await client.auth.signInWithPassword({ email, password });
  if (error) {
    return { error };
  }

  const profile = await loadProfile(client, data.session.user.id, data.session.user.email);
  if (!profile) {
    await client.auth.signOut().catch(() => {});
    return { error: { message: "Não foi possível carregar o perfil. Faça login novamente." } };
  }

  saveSession(data.session);
  // Sessão nova = estado zerado (nada do usuário anterior em memória/cache).
  resetLocalState();
  return { data };
}

export async function changePassword(currentPassword, newPassword) {
  const client = supabaseClient();
  if (!client) {
    return { error: { message: "Credenciais do Supabase não configuradas." } };
  }
  const data = readSession();
  const profile = getProfile();
  const email = (data && data.user && data.user.email) || (profile && profile.email) || "";
  if (!email) return { error: { message: "Não foi possível identificar o usuário." } };

  const { error: reauthError } = await client.auth.signInWithPassword({ email, password: currentPassword });
  if (reauthError) return { error: { message: "Senha atual incorreta." } };

  const { data: upd, error } = await client.auth.updateUser({ password: newPassword });
  if (error) return { error };
  if (upd && upd.session) saveSession(upd.session);
  return { data: upd };
}

export async function changeName(newName) {
  const client = supabaseClient();
  if (!client) {
    return { error: { message: "Credenciais do Supabase não configuradas." } };
  }
  const { error } = await client.rpc("atualizar_meu_nome", { p_nome: newName });
  if (error) return { error };
  const prev = readSession() || {};
  prev.profile = { ...(prev.profile || {}), nome: newName };
  writeSession(prev);
  authState.profile = prev.profile;
  return { data: true };
}

function performFullCleanup() {
  clearExpiryTimer();
  stopAuthPolling();
  clearSession();
  clearSupabaseKeys();
  clearSessionCookie();
  authState.profile = null;
  resetLocalState();
  const client = supabaseClient();
  if (client) client.auth.signOut().catch(() => {});
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

// Encerra a sessão quando o Supabase sinaliza SIGNED_OUT; mantém o cookie
// sincronizado quando o refresh token é rotacionado em segundo plano.
export function watchSupabaseAuthState() {
  const client = supabaseClient();
  if (!client) return;
  client.auth.onAuthStateChange((event, session) => {
    if (event === "SIGNED_OUT") {
      handleSessionExpired();
    } else if (
      (event === "SIGNED_IN" || event === "TOKEN_REFRESHED") &&
      session &&
      session.refresh_token
    ) {
      mirrorSessionToCookie(session.refresh_token);
    }
  });
}

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
