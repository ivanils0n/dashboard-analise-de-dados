import { ref } from "vue";
import { apiFetch } from "@/lib/api";

export const links = ref([]);

let loading = null;

export function loadLinks() {
  if (loading) return loading;
  loading = apiFetch("/api/links")
    .then((res) => {
      links.value = Array.isArray(res?.data) ? res.data : [];
    })
    .catch((err) => {
      console.warn("[API] Aba links indisponível:", err);
      loading = null;
    });
  return loading;
}

export const activeLink = ref(null);

export function openLink(link) {
  activeLink.value = link;
}

export function closeLink() {
  activeLink.value = null;
}
