/* Não importar utils.js nem qualquer módulo que leia storage aqui, e manter
   este módulo como o PRIMEIRO import de main.js: a limpeza precisa rodar antes
   de qualquer outro módulo ler o storage. */
const KEEP_KEYS = ["gg-auth", "gg-theme"];

function isReload() {
  try {
    const nav = performance.getEntriesByType("navigation")[0];
    if (nav) return nav.type === "reload";
    return !!(performance.navigation && performance.navigation.type === 1);
  } catch (e) {
    return false;
  }
}

function clearKeepingAuth(name) {
  try {
    const store = window[name];
    const kept = KEEP_KEYS.map((k) => [k, store.getItem(k)]).filter(([, v]) => v !== null);
    store.clear();
    kept.forEach(([k, v]) => store.setItem(k, v));
  } catch (e) {}
}

function clearAppCaches() {
  try {
    if (!("caches" in window)) return;
    caches
      .keys()
      .then((keys) => Promise.all(keys.map((k) => caches.delete(k))))
      .catch(() => {});
  } catch (e) {}
}

if (isReload()) {
  clearKeepingAuth("localStorage");
  clearKeepingAuth("sessionStorage");
  clearAppCaches();
}
