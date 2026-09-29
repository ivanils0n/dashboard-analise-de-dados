<script setup>
import { ref, watch, onMounted } from "vue";
import { useRoute, useRouter } from "vue-router";
import ToastHost from "@/components/ui/ToastHost.vue";
import ConfirmDialog from "@/components/ui/ConfirmDialog.vue";
import LoadingOverlay from "@/components/ui/LoadingOverlay.vue";
import { useLoading } from "@/composables/useLoading";
import { authState, isAuthenticated } from "@/lib/auth";
import { useToast } from "@/composables/useToast";

const route = useRoute();
const router = useRouter();
const { show: toast } = useToast();
const loading = useLoading();

/* A sobreposição de carregamento só aparece se a operação demorar: cargas
   rápidas (dados já em cache, delta pequeno) não precisam piscar uma tela
   cheia com blur — isso é o que dava a sensação de trava ao navegar. */
const LOADING_DELAY_MS = 250;
const showLoading = ref(false);
let loadingTimer = null;
watch(
  () => loading.count > 0,
  (active) => {
    clearTimeout(loadingTimer);
    if (!active) {
      showLoading.value = false;
      return;
    }
    loadingTimer = setTimeout(() => {
      showLoading.value = true;
    }, LOADING_DELAY_MS);
  },
  { immediate: true }
);

/* Ao abrir a página já autenticado (F5 ou logo após o login, que recarrega a
   página): avisa o login e/ou que os dados foram carregados. Os dados iniciais
   já foram baixados antes do app montar (ver bootstrap em main.js). */
onMounted(() => {
  let justLoggedIn = false;
  try {
    justLoggedIn = sessionStorage.getItem("gg_login_toast") === "1";
    sessionStorage.removeItem("gg_login_toast");
  } catch (e) {
    /* sessionStorage indisponível */
  }
  if (!isAuthenticated()) return;
  if (justLoggedIn) {
    toast("Login realizado com sucesso!", "success");
    setTimeout(() => toast("Todas as informações foram carregadas.", "success"), 3800);
  } else {
    toast("Todas as informações foram carregadas.", "success");
  }
});

/* Sessão expirada/encerrada enquanto o usuário está em uma página interna:
   notifica e volta para o login. */
watch(
  () => authState.profile,
  (profile) => {
    if (!profile && route.name && route.name !== "login") {
      /* Só a expiração avisa; quem saiu pelo menu vê "Até a próxima!" (UserMenu). */
      if (authState.endReason === "expired") {
        toast("Tempo limite da sessão atingido. Faça login novamente.", "error");
      }
      router.replace("/login");
    }
  }
);
</script>

<template>
  <router-view />
  <ToastHost />
  <ConfirmDialog />
  <LoadingOverlay :show="showLoading" :label="loading.label" />
</template>
