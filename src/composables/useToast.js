import { reactive } from "vue";

const TOAST_DURATION = 2600;

const state = reactive({
  message: "",
  visible: false,
  _timer: null
});

export function useToast() {
  function show(message) {
    state.message = message;
    state.visible = true;
    clearTimeout(state._timer);
    state._timer = setTimeout(() => {
      state.visible = false;
    }, TOAST_DURATION);
  }

  return { state, show };
}
