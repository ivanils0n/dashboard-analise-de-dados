import { reactive } from "vue";

const state = reactive({
  visible: false,
  title: "Confirmar ação",
  message: "",
  confirmText: "Confirmar",
  cancelText: "Cancelar",
  danger: false,
  _resolve: null
});

/* Dialog.confirm({ title, message, confirmText, cancelText, danger })
   -> Promise<boolean> — substitui o confirm() nativo. */
export function useDialog() {
  function confirm(options = {}) {
    return new Promise((resolve) => {
      state.title = options.title || "Confirmar ação";
      state.message = options.message || "";
      state.confirmText = options.confirmText || "Confirmar";
      state.cancelText = options.cancelText || "Cancelar";
      state.danger = !!options.danger;
      state.visible = true;
      state._resolve = resolve;
    });
  }

  function close(result) {
    if (!state.visible) return;
    state.visible = false;
    const resolve = state._resolve;
    state._resolve = null;
    if (resolve) resolve(result);
  }

  return { state, confirm, close };
}
