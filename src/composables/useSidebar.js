import { ref, computed, watch } from "vue";

export const sidebarHidden = ref(false);

const STORAGE_KEY = "sidebar-collapsed";

function readCollapsed() {
  try {
    return localStorage.getItem(STORAGE_KEY) !== "0";
  } catch {
    return true;
  }
}

export const sidebarCollapsed = ref(readCollapsed());

const tabletQuery = typeof window !== "undefined" && window.matchMedia ? window.matchMedia("(max-width: 1023px)") : null;
const isTabletWidth = ref(!!(tabletQuery && tabletQuery.matches));
if (tabletQuery) {
  const onChange = (e) => {
    isTabletWidth.value = e.matches;
  };
  if (tabletQuery.addEventListener) tabletQuery.addEventListener("change", onChange);
  else if (tabletQuery.addListener) tabletQuery.addListener(onChange);
}

export const sidebarEffectiveCollapsed = computed(() => sidebarCollapsed.value || isTabletWidth.value);

watch(sidebarCollapsed, (v) => {
  try {
    localStorage.setItem(STORAGE_KEY, v ? "1" : "0");
  } catch {
  }
});
