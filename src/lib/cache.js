/* Cache local (sessionStorage) por item: ggd:<tabela>:<id> = JSON do registro.
   sessionStorage evita persistir PII em disco. Vale por LOCAL_CACHE_TTL_MS
   (ver lib/db.js) a partir do último download completo, até um logout/login
   novo ou até "Recarregar Dados". */

import { sessionStore, localStore } from "./utils";

const PREFIX = "ggd:";
const LEGACY_KEY = "gg-data-cache";
// Fora do prefixo "ggd:" de propósito: keys()/resetAll() varrem só os itens.
const LOADED_AT_KEY = "gg-data-loaded-at";

export const DataCache = {
  /* ---- Itens ---- */
  keyFor(tabela, id) {
    return PREFIX + tabela + ":" + id;
  },

  readItem(key) {
    try {
      const raw = sessionStore.getItem(key);
      return raw ? JSON.parse(raw) : null;
    } catch (e) {
      return null;
    }
  },

  /* Devolve false quando o navegador recusou a gravação (cota cheia) — quem
     chama descarta o cache inteiro. Não usa safeSetItem: ele abre espaço
     apagando os OUTROS itens do cache e devolve true, o que deixava um cache
     parcial que o próximo boot restaurava como se estivesse completo. */
  setItem(tabela, id, data) {
    try {
      sessionStore.setItem(this.keyFor(tabela, id), JSON.stringify(data));
      return true;
    } catch (e) {
      return false;
    }
  },

  /* ---- Validade ---- */
  markLoaded() {
    try {
      sessionStore.setItem(LOADED_AT_KEY, String(Date.now()));
    } catch (e) {}
  },

  isFresh(maxAgeMs) {
    const loadedAt = Number(sessionStore.getItem(LOADED_AT_KEY)) || 0;
    return loadedAt > 0 && Date.now() - loadedAt < maxAgeMs;
  },

  removeItem(tabela, id) {
    try {
      sessionStore.removeItem(this.keyFor(tabela, id));
    } catch (e) {}
  },

  removeKey(key) {
    try {
      sessionStore.removeItem(key);
    } catch (e) {}
  },

  /* ---- Varredura ---- */
  keys() {
    const out = [];
    for (let i = 0; i < sessionStore.length; i++) {
      const key = sessionStore.key(i);
      if (key && key.indexOf(PREFIX) === 0) out.push(key);
    }
    return out;
  },

  resetAll() {
    this.keys().forEach((k) => sessionStore.removeItem(k));
    try {
      sessionStore.removeItem(LOADED_AT_KEY);
    } catch (e) {}
  },

  // Remove resíduos legados (ggd:* e gg-data-cache) que ficaram em localStorage.
  removeLegacy() {
    try {
      const stale = [];
      for (let i = 0; i < localStore.length; i++) {
        const key = localStore.key(i);
        if (key && (key.indexOf(PREFIX) === 0 || key === LEGACY_KEY)) stale.push(key);
      }
      stale.forEach((k) => localStore.removeItem(k));
    } catch (e) {}
  }
};
