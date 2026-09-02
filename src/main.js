import { createApp } from "vue";
import "@/assets/main.css";
import App from "./App.vue";
import router from "./router";
import { bootstrapSupabase } from "./lib/supabase";
import { syncAll } from "./lib/employees";
import { getProfile, watchSupabaseAuthState, startAuthPolling } from "./lib/auth";

async function bootstrap() {
  // Dados + sincronização (Supabase com cache local via delta sync)
  await bootstrapSupabase();
  // Recalcula os snapshots dos indicadores calculados a partir da equipe
  syncAll();
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
