<script setup>
import { ref } from "vue";
import { useRouter } from "vue-router";
import { login } from "@/lib/auth";
import { DEFAULT_STATE } from "@/lib/config";
import { hydrateState } from "@/lib/db";
import { syncAll } from "@/lib/employees";

const router = useRouter();
const usuario = ref("");
const password = ref("");
const error = ref("");
const busy = ref(false);

async function handleSubmit() {
  error.value = "";
  if (!usuario.value.trim() || !password.value) {
    error.value = "Informe usuário e senha.";
    return;
  }
  busy.value = true;
  const { error: err } = await login(usuario.value.trim(), password.value);
  busy.value = false;
  if (err) {
    const friendly =
      err.message === "Invalid login credentials"
        ? "Usuário ou senha inválidos."
        : err.message;
    error.value = friendly;
    return;
  }
  /* Só depois de autenticar é seguro baixar os dados: carrega o estado padrão
     (e demais quando o usuário trocar o filtro) priorizando cache + delta. */
  try {
    await hydrateState(DEFAULT_STATE);
    syncAll();
  } catch (e) {
    console.warn("[Login] Falha ao carregar dados:", e);
  }
  router.replace("/dashboard");
}
</script>

<template>
  <div class="flex min-h-screen flex-col items-center justify-center bg-ice px-4 dark:bg-zinc-950">
    <div
      class="w-full max-w-sm rounded-2xl border border-zinc-200 bg-white p-8 shadow-sm slide-up dark:border-zinc-800 dark:bg-zinc-900"
    >
      <div class="mb-6 flex flex-col items-center text-center">
        <img
          src="/logo.png"
          alt="Gente & Gestão"
          class="mb-4 h-14 w-auto max-w-[220px] object-contain [filter:invert(1)] dark:filter-none"
        />
        <p class="text-sm text-zinc-500 dark:text-zinc-400">Entre para acessar o dashboard</p>
      </div>

      <form class="flex flex-col gap-4" @submit.prevent="handleSubmit">
        <div class="flex flex-col gap-1.5">
          <label for="loginUser" class="text-sm font-medium text-zinc-700 dark:text-zinc-200">Usuário</label>
          <input
            id="loginUser"
            v-model="usuario"
            type="text"
            placeholder="Usuário"
            autocomplete="username"
            class="rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 outline-none transition focus:border-accent focus:ring-2 focus:ring-accent/20 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100"
          />
        </div>

        <div class="flex flex-col gap-1.5">
          <label for="loginPassword" class="text-sm font-medium text-zinc-700 dark:text-zinc-200">Senha</label>
          <input
            id="loginPassword"
            v-model="password"
            type="password"
            placeholder="••••••••"
            autocomplete="current-password"
            class="rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 outline-none transition focus:border-accent focus:ring-2 focus:ring-accent/20 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100"
          />
        </div>

        <p v-if="error" class="text-sm text-red-600 dark:text-red-400">{{ error }}</p>

        <button
          type="submit"
          class="w-full rounded-lg bg-accent px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-accent-hover disabled:opacity-60"
          :disabled="busy"
        >
          {{ busy ? "Entrando..." : "Entrar" }}
        </button>
      </form>
    </div>

    <footer class="mt-6 text-xs text-zinc-400 dark:text-zinc-400">
      Gente &amp; Gestão · Dashboard de análise de dados RH
    </footer>
  </div>
</template>
