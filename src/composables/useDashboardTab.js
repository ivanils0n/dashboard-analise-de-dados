import { ref } from "vue";

export const activeTab = ref("cockpit");

const TAB_ORDER = ["visao-geral", "cockpit"];

export const tabDirection = ref(1);

export function switchTab(tab) {
  if (tab === activeTab.value) return;
  tabDirection.value = TAB_ORDER.indexOf(tab) > TAB_ORDER.indexOf(activeTab.value) ? 1 : -1;
  activeTab.value = tab;
}
