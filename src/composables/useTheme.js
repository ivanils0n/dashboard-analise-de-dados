import { ref } from "vue";
import { safeSetItem, localStore } from "@/lib/utils";

export const isDark = ref(document.documentElement.classList.contains("dark"));

export function useTheme() {
  function toggle() {
    isDark.value = !isDark.value;
    document.documentElement.classList.toggle("dark", isDark.value);
    safeSetItem(localStore, "gg-theme", isDark.value ? "dark" : "light");
  }

  return { isDark, toggle };
}
