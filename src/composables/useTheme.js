import { ref } from "vue";
import { safeSetItem } from "@/lib/utils";

export const isDark = ref(document.documentElement.classList.contains("dark"));

export function useTheme() {
  function toggle() {
    isDark.value = !isDark.value;
    document.documentElement.classList.toggle("dark", isDark.value);
    safeSetItem("gg-theme", isDark.value ? "dark" : "light");
  }

  return { isDark, toggle };
}
