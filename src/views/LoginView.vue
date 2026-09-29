<script setup>
import { ref } from "vue";
import { login } from "@/lib/auth";
import { useToast } from "@/composables/useToast";

const { show: toast } = useToast();

const usuario = ref("");
const password = ref("");
const busy = ref(false);
const passwordInput = ref(null);

function focusPassword() {
  passwordInput.value?.focus();
}

async function handleSubmit() {
  if (!usuario.value.trim() || !password.value) {
    toast(
      !usuario.value.trim() && !password.value
        ? "Informe o usuário e a senha para entrar."
        : !usuario.value.trim()
          ? "Informe o usuário."
          : "Informe a senha.",
      "warning"
    );
    return;
  }
  busy.value = true;
  const { error: err } = await login(usuario.value.trim(), password.value);
  if (err) {
    busy.value = false;
    const friendly =
      err.message === "Invalid login credentials"
        ? "Usuário ou senha inválidos."
        : err.message;
    toast(friendly, "error");
    return;
  }
  /* O reload abaixo zera a página: deixa um aviso para o App mostrar o
     "login realizado" na nova carga. */
  try {
    sessionStorage.setItem("gg_login_toast", "1");
  } catch (e) {
    /* sessionStorage indisponível: só não mostra o aviso */
  }
  /* Usuário confirmado: recarrega a página ANTES de baixar os dados. O login já
     gravou a sessão (sessionStorage, que sobrevive ao reload); na nova carga o
     bootstrap (main.js) baixa os dados com cache + delta. Assim o Network do
     navegador é zerado e a requisição de login (com a senha) não fica listada
     junto das demais. `busy` fica ligado até a página recarregar. */
  history.replaceState(null, "", window.location.pathname + window.location.search + "#/dashboard");
  window.location.reload();
}
</script>

<template>
  <div class="flex min-h-screen flex-col items-center justify-center bg-ice px-4 pb-[max(2rem,env(safe-area-inset-bottom))] pt-[max(2rem,env(safe-area-inset-top))] dark:bg-zinc-950">
    <main
      class="w-full max-w-md px-6 py-8 slide-up sm:px-10 sm:py-10"
    >
      <header class="flex flex-col items-center text-center">
        <!-- logo.png é branca (para fundo escuro); no tema claro usa a versão com
             texto escuro. Inverter com filtro CSS deixava o amarelo azul. -->
        <img
          src="/logo-on-light.png"
          alt="Gente & Gestão"
          class="h-36 w-auto max-w-full object-contain dark:hidden"
        />
        <img
          src="/logo.png"
          alt="Gente & Gestão"
          class="hidden h-36 w-auto max-w-full object-contain dark:block"
        />
        <h1 class="mt-6 text-3xl font-extrabold tracking-tight text-zinc-900 dark:text-white">Bem-vindo</h1>
        <span class="mt-3 h-1 w-12 rounded-full bg-accent" aria-hidden="true"></span>
      </header>

      <form class="mt-8 flex flex-col gap-5 pt-2" @submit.prevent="handleSubmit">
        <div class="flex flex-col gap-1.5">
          <label for="loginUser" class="text-sm font-semibold text-zinc-900 dark:text-zinc-50">Usuário</label>
          <input
            id="loginUser"
            v-model="usuario"
            type="text"
            placeholder="Digite seu usuário"
            autocomplete="username"
            class="rounded-xl border-2 border-zinc-300 bg-white px-4 py-3 text-base text-zinc-900 shadow-sm outline-none transition placeholder:text-zinc-400 hover:border-zinc-400 focus:border-accent focus:ring-4 focus:ring-accent/25 dark:border-zinc-500 dark:bg-zinc-800 dark:text-zinc-100 dark:placeholder:text-zinc-400 dark:hover:border-zinc-500 dark:focus:border-accent"
            @keydown.enter.prevent="focusPassword"
          />
        </div>

        <div class="flex flex-col gap-1.5">
          <label for="loginPassword" class="text-sm font-semibold text-zinc-900 dark:text-zinc-50">Senha</label>
          <input
            id="loginPassword"
            ref="passwordInput"
            v-model="password"
            type="password"
            placeholder="••••••••"
            autocomplete="current-password"
            class="rounded-xl border-2 border-zinc-300 bg-white px-4 py-3 text-base text-zinc-900 shadow-sm outline-none transition placeholder:text-zinc-400 hover:border-zinc-400 focus:border-accent focus:ring-4 focus:ring-accent/25 dark:border-zinc-500 dark:bg-zinc-800 dark:text-zinc-100 dark:placeholder:text-zinc-400 dark:hover:border-zinc-500 dark:focus:border-accent"
          />
        </div>

        <button
          type="submit"
          class="mt-2 w-full rounded-xl bg-accent px-4 py-3.5 text-base font-bold text-white shadow-md shadow-accent/30 transition hover:bg-accent-hover focus:outline-none focus:ring-4 focus:ring-accent/30 disabled:opacity-60"
          :disabled="busy"
        >
          {{ busy ? "Entrando..." : "Entrar" }}
        </button>
      </form>
    </main>

    <footer class="mt-6 text-center text-xs text-zinc-500 dark:text-zinc-400">
      Copyright © <span class="font-bold text-zinc-700 dark:text-zinc-200">IBDS</span>
    </footer>
  </div>
</template>
