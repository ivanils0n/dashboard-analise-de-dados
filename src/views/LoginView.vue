<script setup>
import { ref } from "vue";
import { login } from "@/lib/auth";

const usuario = ref("");
const password = ref("");
const error = ref("");
const busy = ref(false);
const passwordInput = ref(null);

function focusPassword() {
  passwordInput.value?.focus();
}

async function handleSubmit() {
  error.value = "";
  if (!usuario.value.trim() || !password.value) {
    error.value = "Informe usuário e senha.";
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
    error.value = friendly;
    return;
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
  <div class="flex min-h-screen flex-col items-center justify-center bg-ice px-4 py-8 dark:bg-zinc-950">
    <main
      class="w-full max-w-md rounded-2xl border border-zinc-200 bg-white px-6 py-8 shadow-sm slide-up dark:border-zinc-800 dark:bg-zinc-900 sm:px-10 sm:py-10"
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
        <h1 class="mt-5 text-xl font-bold text-zinc-900 dark:text-zinc-100">Bem-vindo</h1>
        <p class="mt-1 text-sm text-zinc-500 dark:text-zinc-400">Entre para acessar o dashboard</p>
      </header>

      <form class="mt-8 flex flex-col gap-5 border-t border-zinc-100 pt-8 dark:border-zinc-800" @submit.prevent="handleSubmit">
        <div class="flex flex-col gap-1.5">
          <label for="loginUser" class="text-sm font-medium text-zinc-700 dark:text-zinc-200">Usuário</label>
          <input
            id="loginUser"
            v-model="usuario"
            type="text"
            placeholder="Digite seu usuário"
            autocomplete="username"
            class="rounded-lg border border-zinc-300 bg-white px-3 py-2.5 text-sm text-zinc-900 outline-none transition focus:border-accent focus:ring-2 focus:ring-accent/20 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100"
            @keydown.enter.prevent="focusPassword"
          />
        </div>

        <div class="flex flex-col gap-1.5">
          <label for="loginPassword" class="text-sm font-medium text-zinc-700 dark:text-zinc-200">Senha</label>
          <input
            id="loginPassword"
            ref="passwordInput"
            v-model="password"
            type="password"
            placeholder="••••••••"
            autocomplete="current-password"
            class="rounded-lg border border-zinc-300 bg-white px-3 py-2.5 text-sm text-zinc-900 outline-none transition focus:border-accent focus:ring-2 focus:ring-accent/20 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100"
          />
        </div>

        <p
          v-if="error"
          role="alert"
          class="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-600 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-400"
        >
          {{ error }}
        </p>

        <button
          type="submit"
          class="mt-1 w-full rounded-lg bg-accent px-4 py-3 text-sm font-semibold text-white transition hover:bg-accent-hover disabled:opacity-60"
          :disabled="busy"
        >
          {{ busy ? "Entrando..." : "Entrar" }}
        </button>
      </form>
    </main>

    <footer class="mt-6 text-center text-xs text-zinc-400 dark:text-zinc-400">
      Gente &amp; Gestão · Dashboard de análise de dados RH
    </footer>
  </div>
</template>
