import { ref, computed } from "vue";
import { useDialog } from "@/composables/useDialog";

/* Aviso de alterações não salvas para modais de edição.

   `getForm` devolve os campos do formulário (objeto simples ou reativo). Depois
   de pré-preencher o formulário, chame `markClean()`: qualquer diferença a
   partir daí conta como alteração não salva. Antes de fechar sem salvar
   (×, Esc, Cancelar, Concluir...), `await confirmDiscard()` pergunta se deve
   descartar e devolve true/false. Depois de salvar, feche direto (sem
   confirmDiscard). */
export function useUnsavedGuard(getForm) {
  const { confirm } = useDialog();
  const snapshot = ref(null);

  const isDirty = computed(() => snapshot.value !== null && JSON.stringify(getForm()) !== snapshot.value);

  function markClean() {
    snapshot.value = JSON.stringify(getForm());
  }

  function reset() {
    snapshot.value = null;
  }

  async function confirmDiscard() {
    if (!isDirty.value) return true;
    return confirm({
      title: "Descartar alterações?",
      message: "Você alterou informações e não salvou. Se sair agora, as alterações serão perdidas.",
      confirmText: "Descartar",
      cancelText: "Continuar editando",
      danger: true
    });
  }

  return { isDirty, markClean, reset, confirmDiscard };
}
