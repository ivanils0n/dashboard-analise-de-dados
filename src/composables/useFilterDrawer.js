import { reactive } from "vue";

const state = reactive({ open: false });

export function useFilterDrawer() {
  function openDrawer() {
    state.open = true;
  }

  function closeDrawer() {
    state.open = false;
  }

  return { state, openDrawer, closeDrawer };
}
