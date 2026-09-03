import { createApp } from "vue";
import "@/assets/main.css";
import App from "./App.vue";
import router from "./router";
import { bootstrapSupabase } from "./lib/supabase";
import { syncAll } from "./lib/employees";
import { isAuthenticated, getProfile, watchSupabaseAuthState, startAuthPolling, restoreSessionFromCookie } from "./lib/auth";

// Em produção o runtime é compilado com DevTools desligado (__VUE_PROD_DEVTOOLS__).
// Remove também qualquer hook global que um DevTools injetado tentaria usar.
if (import.meta.env.PROD) {
  try {
    window.__VUE_DEVTOOLS_GLOBAL_HOOK__ = undefined;
  } catch (e) {}
}

async function bootstrap() {
  let authed = isAuthenticated();
  // Sem sessão na aba, tenta restaurar via cookie HttpOnly (Pages Function).
  // Sem a função disponível, retorna false e o usuário faz login normal.
  if (!authed) {
    authed = await restoreSessionFromCookie();
  }
  // Dados + sincronização (Supabase com cache local via delta sync)
  await bootstrapSupabase();
  // Recalcula os snapshots dos indicadores calculados somente com sessão ativa
  if (authed) syncAll();
  // Perfil do usuário autenticado (se houver sessão ativa)
  getProfile();
  watchSupabaseAuthState();
  startAuthPolling();
}

bootstrap().then(() => {
  const app = createApp(App);
  app.use(router);
  app.mount("#app");
});
