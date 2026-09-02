/* =========================================================
   Cache local (localStorage) — sincronização delta por item
   ---------------------------------------------------------
   Em vez de guardar uma "foto" única (um blob gigante), cada
   registro é armazenado na própria chave do localStorage:

     ggd:<tabela>:<id>   ->  JSON do registro (payload do banco)
     ggd:meta            ->  { versao, savedAt } da última sincronização

   Na revalidação, o banco retorna SOMENTE os itens alterados
   (upsert) ou removidos (delete) desde a última versão.
   ========================================================= */

import { safeSetItem } from "./utils";

const PREFIX = "ggd:";
const META_KEY = "ggd:meta";
const LEGACY_KEY = "gg-data-cache";

export const DataCache = {
  /* ---------- Meta (versão da última sincronização) ---------- */

  getVersion() {
    try {
      const raw = localStorage.getItem(META_KEY);
      if (!raw) return 0;
      const meta = JSON.parse(raw);
      return typeof meta.versao === "number" && meta.versao > 0 ? meta.versao : 0;
    } catch (e) {
      return 0;
    }
  },

  setVersion(versao) {
    safeSetItem(META_KEY, JSON.stringify({ versao: Number(versao) || 0, savedAt: Date.now() }));
  },

  /* ---------- Itens individuais ---------- */

  keyFor(tabela, id) {
    return PREFIX + tabela + ":" + id;
  },

  readItem(key) {
    try {
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : null;
    } catch (e) {
      return null;
    }
  },

  setItem(tabela, id, data) {
    safeSetItem(this.keyFor(tabela, id), JSON.stringify(data));
  },

  removeItem(tabela, id) {
    try {
      localStorage.removeItem(this.keyFor(tabela, id));
    } catch (e) {}
  },

  /* ---------- Varredura ---------- */

  keys() {
    const out = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.indexOf(PREFIX) === 0) out.push(key);
    }
    return out;
  },

  resetAll() {
    this.keys().forEach((k) => localStorage.removeItem(k));
  },

  removeLegacy() {
    try {
      localStorage.removeItem(LEGACY_KEY);
    } catch (e) {}
  }
};
