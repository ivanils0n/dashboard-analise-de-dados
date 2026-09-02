/* =========================================================
   Autenticação — login com credenciais do Supabase Auth
   ---------------------------------------------------------
   - login(): valida usuário (ex.: "ivan" -> ivan@gente.gestao)
     + senha via signInWithPassword
   - O token da sessão fica salvo no localStorage por 6 horas;
     após esse prazo (ou sem sessão), um novo login é exigido.
   - O perfil (nome, usuário, perfil) é salvo junto com a sessão
     e usado para controlar o acesso por perfil:
       admin     : tudo + gestão de usuários
       analista  : tudo (dados), sem gestão de usuários
       visitante : somente leitura do dashboard
   ========================================================= */

import { reactive } from "vue";
import { AUTH_EMAIL_DOMAIN } from "./config";
import { safeSetItem } from "./utils";
import { supabaseClient } from "./supabase";

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

/* Constrói o e-mail completo a partir do usuário digitado.
   Aceita "ivan" ou um e-mail completo "ivan@gente.gestao". */
export function buildLoginEmail(value) {
  const v = String(value || "").trim();
  if (!v) return "";
  if (v.indexOf("@") !== -1) return v.toLowerCase();
  return v.toLowerCase() + "@" + AUTH_EMAIL_DOMAIN;
}

/* ---------- Persistência da sessão ---------- */

function readSession() {
  try {
    const raw = localStorage.getItem(AUTH_STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch (e) {
    return null;
  }
}

function writeSession(data) {
  safeSetItem(AUTH_STORAGE_KEY, JSON.stringify(data));
}

function clearSession() {
  try {
    localStorage.removeItem(AUTH_STORAGE_KEY);
  } catch (e) {}
}

/* Remove a sessão gravada pelo supabase-js (chaves sb-*-auth-token) */
function clearSupabaseKeys() {
  try {
    const toRemove = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.indexOf("sb-") === 0 && k.indexOf("-auth-token") !== -1) {
        toRemove.push(k);
      }
    }
    toRemove.forEach((k) => localStorage.removeItem(k));
  } catch (e) {}
}

let _expiredHandled = false;

export function getToken() {
  const data = readSession();
  if (!data || !data.token) return null;
  if (!data.expiresAt || Date.now() > data.expiresAt) {
    clearSession();
    clearSupabaseKeys();
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

/* Carrega o perfil do usuário logado (public.usuarios) e salva na sessão.
   Usa a RPC meu_perfil (security definer) — resolve por id ou e-mail — e
   cai para a consulta direta apenas se a função ainda não existir. */
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
    console.warn("[Auth] Perfil não encontrado no banco (userId:", userId, ")");
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
  console.info("[Auth] Perfil carregado:", profile);
  return profile;
}

export async function ensureProfile() {
  const stored = getProfile();
  const data = readSession();
  const userId = data && data.user ? data.user.id : null;
  const email = data && data.user ? data.user.email : null;
  const client = supabaseClient();
  const fetched = await loadProfile(client, userId, email);
  console.info("[Auth] ensureProfile ->", fetched ? fetched.perfil : "sem perfil (usando salvo)");
  if (!fetched && (userId || email)) {
    handleSessionExpired("Não foi possível carregar seu perfil. Faça login novamente.");
  }
  return fetched || stored;
}

function saveSession(session) {
  const prev = readSession() || {};
  writeSession({
    token: session.access_token,
    user: session.user ? { id: session.user.id, email: session.user.email } : prev.user || null,
    profile: prev.profile || null,
    expiresAt: Date.now() + AUTH_DURATION_MS
  });
  scheduleExpiryLogout();
}

let _expiryTimer = null;

function scheduleExpiryLogout() {
  clearTimeout(_expiryTimer);
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
  console.info("[Auth] Tentando login com e-mail:", email);

  const { data, error } = await client.auth.signInWithPassword({ email, password });
  if (error) {
    console.warn("[Auth] Login rejeitado:", error.message);
    return { error };
  }

  const profile = await loadProfile(client, data.session.user.id, data.session.user.email);
  if (!profile) {
    await client.auth.signOut().catch(() => {});
    return { error: { message: "Não foi possível carregar o perfil. Faça login novamente." } };
  }

  saveSession(data.session);
  console.info("[Auth] Login concluído. Perfil:", profile);
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

export function logout() {
  clearSession();
  clearSupabaseKeys();
  authState.profile = null;
  const client = supabaseClient();
  if (client) client.auth.signOut().catch(() => {});
}

export function handleSessionExpired(message) {
  if (_expiredHandled) return;
  _expiredHandled = true;
  clearSession();
  clearSupabaseKeys();
  authState.profile = null;
  const client = supabaseClient();
  if (client) client.auth.signOut().catch(() => {});
  console.info("[Auth] Sessão expirada/encerrada.");
}

/* Reage à perda de sessão no lado do Supabase (ex.: token de refresh
   inválido/expirado): invalida a sessão local e redireciona ao login. */
export function watchSupabaseAuthState() {
  const client = supabaseClient();
  if (!client) return;
  client.auth.onAuthStateChange((event) => {
    if (event === "SIGNED_OUT") {
      handleSessionExpired("Sua sessão foi encerrada ou o token é inválido. Faça login novamente.");
    }
  });
}

/* Expiração em tempo real: mesmo com a aba aberta, após as 6 horas
   a sessão é invalidada. */
export function startAuthPolling() {
  setInterval(() => {
    if (!isAuthenticated()) {
      handleSessionExpired("Tempo limite da sessão atingido. Faça login novamente.");
    }
  }, 30 * 1000);
}
