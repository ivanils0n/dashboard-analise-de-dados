import { sessionStore, localStore } from "./utils";

const PREFIX = "ggd:";
const LEGACY_KEY = "gg-data-cache";
const LEGACY_LOADED_AT_KEY = "gg-data-loaded-at";

export const DataCache = {
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

  keys() {
    const out = [];
    for (let i = 0; i < sessionStore.length; i++) {
      const key = sessionStore.key(i);
      if (key && key.indexOf(PREFIX) === 0) out.push(key);
    }
    return out;
  },

  removeTables(tabelas) {
    const prefixes = tabelas.map((tabela) => PREFIX + tabela + ":");
    this.keys()
      .filter((key) => prefixes.some((p) => key.indexOf(p) === 0))
      .forEach((key) => sessionStore.removeItem(key));
  },

  resetAll() {
    this.keys().forEach((k) => sessionStore.removeItem(k));
  },

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
