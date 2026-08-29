// Injetado pelo Vite em tempo de build a partir do .env / variáveis do provedor.
// Aceita os dois padrões de nome: VITE_SUPABASE_URL ou SUPABASE_URL.
// Só define window.ENV se houver credenciais reais — assim o
// desenvolvimento local continua usando o .env via js/env.js.
const BUILD_ENV = {
  SUPABASE_URL: import.meta.env.VITE_SUPABASE_URL || import.meta.env.SUPABASE_URL || "",
  SUPABASE_ANON_KEY: import.meta.env.VITE_SUPABASE_ANON_KEY || import.meta.env.SUPABASE_ANON_KEY || ""
};

if (BUILD_ENV.SUPABASE_URL && BUILD_ENV.SUPABASE_ANON_KEY) {
  window.ENV = BUILD_ENV;
}
