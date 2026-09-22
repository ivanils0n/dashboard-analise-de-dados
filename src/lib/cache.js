/* Cache local (sessionStorage) por item: ggd:<tabela>:<id> = JSON do registro.
   sessionStorage evita persistir PII em disco; vale até um logout/login novo
   ou "Recarregar Dados" (ver resetLocalState/reloadData em lib/db.js). */

import { safeSetItem, sessionStore, localStore } from "./utils";

const PREFIX = "ggd:";
const LEGACY_KEY = "gg-data-cache";

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

  /* Devolve false quando o navegador recusou a gravação (cota cheia). Quem
     grava em lote precisa checar: um cache parcial com a versão do delta
     gravada faria o próximo boot "restaurar" dados incompletos. */
  setItem(tabela, id, data) {
    return safeSetItem(sessionStore, this.keyFor(tabela, id), JSON.stringify(data));
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
