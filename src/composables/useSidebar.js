import { ref } from "vue";

/* Estado compartilhado entre o layout e as telas: uma tela (ex.: aba Painel do
   Dashboard) pode pedir para a sidebar ficar oculta enquanto estiver ativa. */
export const sidebarHidden = ref(false);
