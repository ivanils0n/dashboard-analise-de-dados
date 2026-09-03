/* =========================================================
   Cloudflare Pages Function — cookie HttpOnly de refresh token
   ---------------------------------------------------------
   Rota: /api/auth/session

     GET    : bootstrap — troca o refresh token (HttpOnly) do cookie por um
              novo par (access + refresh) no GoTrue do Supabase e faz a
              rotação do cookie. Só o servidor lê o cookie.
     POST   : espelha — grava no cookie o refresh_token enviado pelo cliente
              (logo após login/refresh local). Não rotaciona: mantém o cookie
              sincronizado com o token que o supabase-js usa na aba.
     DELETE : limpa o cookie no logout.

   Variáveis de ambiente (Cloudflare Pages > Settings > Environment variables):
     SUPABASE_URL, SUPABASE_ANON_KEY  (mesmas já usadas no build)

   O Max-Age segue a política de sessão do app (6h): depois disso o cookie
   expira e um novo login é exigido. Logout sempre apaga o cookie.
   ========================================================= */

const COOKIE_NAME = "gg_refresh";
const COOKIE_MAX_AGE = 6 * 60 * 60; // 6 horas — mesma política do front (AUTH_DURATION_MS)

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8" }
  });
}

function cookieHeader(value, maxAge) {
  const encoded = encodeURIComponent(value);
  return `${COOKIE_NAME}=${encoded}; Path=/; Max-Age=${maxAge}; HttpOnly; Secure; SameSite=Strict`;
}

function clearCookieHeader() {
  return `${COOKIE_NAME}=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Strict`;
}

function readCookie(request) {
  const header = request.headers.get("Cookie") || "";
  const match = header.match(new RegExp(`(?:^|;\\s*)${COOKIE_NAME}=([^;]*)`));
  return match ? decodeURIComponent(match[1]) : null;
}

/* Troca refresh -> novo par de tokens no GoTrue (endpoint do Supabase).
   O GoTrue invalida o refresh antigo (rotação de tokens). */
async function goTrueRefresh(env, refreshToken) {
  const res = await fetch(`${env.SUPABASE_URL}/auth/v1/token?grant_type=refresh_token`, {
    method: "POST",
    headers: {
      apikey: env.SUPABASE_ANON_KEY,
      Authorization: `Bearer ${env.SUPABASE_ANON_KEY}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ refresh_token: refreshToken })
  });
  if (!res.ok) {
    let detail = "";
    try {
      detail = (await res.text()).slice(0, 200);
    } catch (e) {}
    return { error: { status: res.status, message: detail || "Falha no refresh token" } };
  }
  return { data: await res.json() };
}

/* Bootstrap: restaura a sessão a partir do cookie HttpOnly após reload. */
export async function onRequestGet(context) {
  const { env, request } = context;
  const refreshToken = readCookie(request);
  if (!refreshToken) return json({ error: "missing_refresh_token" }, 401);
  if (!env.SUPABASE_URL || !env.SUPABASE_ANON_KEY) return json({ error: "not_configured" }, 500);

  const { data, error } = await goTrueRefresh(env, refreshToken);
  if (error || !data || !data.access_token || !data.refresh_token) {
    const status = error && error.status >= 400 && error.status < 500 ? error.status : 400;
    return json({ error: "invalid_refresh_token" }, status);
  }

  const user = data.user || null;
  const body = {
    access_token: data.access_token,
    refresh_token: data.refresh_token,
    expires_at: data.expires_at || null,
    user: user
      ? {
          id: user.id,
          email: user.email,
          role: (user.app_metadata && user.app_metadata.role) || null
        }
      : null
  };
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Set-Cookie": cookieHeader(data.refresh_token, COOKIE_MAX_AGE)
    }
  });
}

/* Espelho: o cliente acaba de logar/renovar localmente e envia o refresh_token
   atual para persistirmos no cookie HttpOnly (sem rotacionar). */
export async function onRequestPost(context) {
  const { request } = context;
  let refreshToken = null;
  try {
    const body = await request.json();
    if (typeof body.refresh_token === "string" && body.refresh_token) {
      refreshToken = body.refresh_token;
    }
  } catch (e) {}
  if (!refreshToken) return json({ error: "missing_refresh_token" }, 400);

  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Set-Cookie": cookieHeader(refreshToken, COOKIE_MAX_AGE)
    }
  });
}

/* Logout: remove o cookie. */
export async function onRequestDelete(context) {
  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Set-Cookie": clearCookieHeader()
    }
  });
}
