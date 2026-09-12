<script setup>
import { watch } from "vue";
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
  <LoadingOverlay :show="loading.count > 0" :label="loading.label" />
</template>
