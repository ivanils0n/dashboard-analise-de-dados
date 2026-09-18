<script setup>
import { ref, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import ToastHost from "@/components/ui/ToastHost.vue";
import ConfirmDialog from "@/components/ui/ConfirmDialog.vue";
import LoadingOverlay from "@/components/ui/LoadingOverlay.vue";
import { useLoading } from "@/composables/useLoading";
import { authState } from "@/lib/auth";
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

/* Sessão expirada/encerrada enquanto o usuário está em uma página interna:
   notifica e volta para o login. */
watch(
  () => authState.profile,
  (profile) => {
    if (!profile && route.name && route.name !== "login") {
      toast("Tempo limite da sessão atingido. Faça login novamente.");
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
