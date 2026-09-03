/* =========================================================
   Cache local (sessionStorage) — sincronização delta por item
   ---------------------------------------------------------
   Em vez de guardar uma "foto" única (um blob gigante), cada
   registro é armazenado na própria chave do sessionStorage:

     ggd:<tabela>:<id>   ->  JSON do registro (payload do banco)
     ggd:meta            ->  { versao, savedAt } da última sincronização

   Na revalidação, o banco retorna SOMENTE os itens alterados
   (upsert) ou removidos (delete) desde a última versão.

   Por que sessionStorage: os registros incluem dados sensíveis
   (salários, CPF/CNPJ). Nada de PII sobrevive ao fechamento da aba.
   ========================================================= */

import { safeSetItem, sessionStore, localStore } from "./utils";

const PREFIX = "ggd:";
const META_KEY = "ggd:meta";
const LEGACY_KEY = "gg-data-cache";

export const DataCache = {
  /* ---------- Meta (versão da última sincronização) ---------- */

  getVersion() {
    try {
      const raw = sessionStore.getItem(META_KEY);
      if (!raw) return 0;
      const meta = JSON.parse(raw);
      return typeof meta.versao === "number" && meta.versao > 0 ? meta.versao : 0;
    } catch (e) {
      return 0;
    }
  },

  setVersion(versao) {
    safeSetItem(sessionStore, META_KEY, JSON.stringify({ versao: Number(versao) || 0, savedAt: Date.now() }));
  },

  /* ---------- Itens individuais ---------- */

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
    safeSetItem(sessionStore, this.keyFor(tabela, id), JSON.stringify(data));
  },

  removeItem(tabela, id) {
    try {
      sessionStore.removeItem(this.keyFor(tabela, id));
    } catch (e) {}
  },

  /* ---------- Varredura ---------- */

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

  /* Remove resíduos de versões antigas que gravavam PII em localStorage
     (ggd:* item a item e o blob legado gg-data-cache). */
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
