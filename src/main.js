import { createApp } from "vue";
import "@/assets/main.css";
import App from "./App.vue";
import router from "./router";
import { bootstrapSupabase } from "./lib/supabase";
import { syncAll } from "./lib/employees";
import { initFeedback } from "./lib/feedback";
import { isAuthenticated, getProfile, watchSupabaseAuthState, startAuthPolling, restoreSessionFromCookie } from "./lib/auth";

if (import.meta.env.PROD) {
  try {
    window.__VUE_DEVTOOLS_GLOBAL_HOOK__ = undefined;
  } catch (e) {}
}

async function bootstrap() {
  initFeedback();
  let authed = isAuthenticated();
  if (!authed) authed = await restoreSessionFromCookie();
  await bootstrapSupabase();
  if (authed) syncAll();
  getProfile();
  watchSupabaseAuthState();
  startAuthPolling();
}

/* Diretiva v-upper: campos de texto digitáveis passam a trabalhar em letras
   maiúsculas — visualmente e no valor vinculado ao v-model (que é o valor
   persistido). Não usar em campos case-sensitive (e-mail, senha, URL, token). */
const upperDirective = {
  mounted(el) {
    if (!el || typeof el.value !== "string") return;
    const apply = (ev) => {
      const target = ev && ev.target ? ev.target : el;
      const value = String(target.value || "");
      if (!value) return;
      const upper = value.toUpperCase();
      if (upper === value) return;
      const pos = target.selectionStart;
      target.value = upper;
      try {
        target.setSelectionRange(pos, pos);
      } catch (err) {
        /* noop */
      }
      target.dispatchEvent(new Event("input", { bubbles: true }));
    };
    el._ggUpper = apply;
    el.addEventListener("input", apply, true);
  },
  unmounted(el) {
    if (el && el._ggUpper) {
      el.removeEventListener("input", el._ggUpper, true);
      delete el._ggUpper;
    }
  }
};

bootstrap().then(() => {
  const app = createApp(App);
  app.directive("upper", upperDirective);
  app.use(router);
  app.mount("#app");
});
