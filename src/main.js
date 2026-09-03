import { createApp } from "vue";
import "@/assets/main.css";
import App from "./App.vue";
import router from "./router";
import { bootstrapSupabase } from "./lib/supabase";
import { syncAll } from "./lib/employees";
import { isAuthenticated, getProfile, watchSupabaseAuthState, startAuthPolling, restoreSessionFromCookie } from "./lib/auth";

if (import.meta.env.PROD) {
  try {
    window.__VUE_DEVTOOLS_GLOBAL_HOOK__ = undefined;
  } catch (e) {}
}

async function bootstrap() {
  let authed = isAuthenticated();
  if (!authed) authed = await restoreSessionFromCookie();
  await bootstrapSupabase();
  if (authed) syncAll();
  getProfile();
  watchSupabaseAuthState();
  startAuthPolling();
}

bootstrap().then(() => {
  const app = createApp(App);
  app.use(router);
  app.mount("#app");
});
