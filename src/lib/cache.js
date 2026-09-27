/* Cópia local (sessionStorage) por item: ggd:<tabela>:<id> = JSON do registro.
   sessionStorage evita persistir PII em disco. É só reserva: o boot sempre
   baixa do servidor e só usa esta cópia se o download falhar (ver lib/db.js). */

import { sessionStore, localStore } from "./utils";

const PREFIX = "ggd:";
const LEGACY_KEY = "gg-data-cache";
// Resíduo da versão que dava validade de 5 min à cópia local.
const LEGACY_LOADED_AT_KEY = "gg-data-loaded-at";

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

  /* Apaga todos os itens das tabelas informadas numa varredura só (em vez de
     uma varredura do sessionStorage inteiro por tabela). */
  removeTables(tabelas) {
    const prefixes = tabelas.map((tabela) => PREFIX + tabela + ":");
    this.keys()
      .filter((key) => prefixes.some((p) => key.indexOf(p) === 0))
      .forEach((key) => sessionStore.removeItem(key));
  },

  resetAll() {
    this.keys().forEach((k) => sessionStore.removeItem(k));
  },

  // Remove resíduos legados (ggd:* e gg-data-cache em localStorage, validade antiga).
  removeLegacy() {
    try {
      sessionStore.removeItem(LEGACY_LOADED_AT_KEY);
    } catch (e) {}
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
