/* =========================================================
   Configuração (credenciais do Supabase)
   ---------------------------------------------------------
   As credenciais são injetadas pelo Vite no build/dev via
   env.build.js (import.meta.env), lendo:
     - .env local (desenvolvimento) — nomes aceitos:
       SUPABASE_URL / SUPABASE_ANON_KEY ou VITE_*
     - variáveis e segredos do provedor (Cloudflare/GitHub)

   Este arquivo apenas garante a forma final de window.ENV
   e avisa quando não houver credenciais.
   ========================================================= */

async function loadEnv() {
  window.ENV = window.ENV && typeof window.ENV === "object" ? window.ENV : {};

  if (!window.ENV.SUPABASE_URL || !window.ENV.SUPABASE_ANON_KEY) {
    console.warn(
      "[env] Sem credenciais (defina-as no .env em desenvolvimento, ou nos secrets do provedor de deploy) — Supabase desativado."
    );
  }

  return window.ENV;
}
