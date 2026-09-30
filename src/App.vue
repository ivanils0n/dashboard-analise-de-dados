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

onMounted(() => {
  let justLoggedIn = false;
  try {
    justLoggedIn = sessionStorage.getItem("gg_login_toast") === "1";
    sessionStorage.removeItem("gg_login_toast");
  } catch (e) {
  }
  if (!isAuthenticated()) return;
  if (justLoggedIn) {
    toast("Login realizado com sucesso!", "success");
    setTimeout(() => toast("Todas as informações foram carregadas.", "success"), 3800);
  } else {
    toast("Todas as informações foram carregadas.", "success");
  }
});

watch(
  () => authState.profile,
  (profile) => {
    if (!profile && route.name && route.name !== "login") {
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
