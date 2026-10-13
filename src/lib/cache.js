import { sessionStore, localStore } from "./utils";

const LEGACY_ROW_PREFIX = "ggd:";
const TABLE_PREFIX = "ggt:";
const EDIT_PREFIX = "ggo:";
const LEGACY_KEY = "gg-data-cache";
const LEGACY_LOADED_AT_KEY = "gg-data-loaded-at";
const REMOVED = '{"__removed":true}';

function keysWith(prefix) {
  const out = [];
  try {
    for (let i = 0; i < sessionStore.length; i++) {
      const key = sessionStore.key(i);
      if (key && key.indexOf(prefix) === 0) out.push(key);
    }
  } catch {}
  return out;
}

function removeKeys(keys) {
  keys.forEach((k) => {
    try {
      sessionStore.removeItem(k);
    } catch {}
  });
}

function parse(raw) {
  try {
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

const runIdle = (fn) =>
  typeof requestIdleCallback === "function"
    ? requestIdleCallback(fn, { timeout: 4000 })
    : setTimeout(() => fn({ timeRemaining: () => 8, didTimeout: true }), 200);

const pendingTables = new Map();
let legacyKeys = null;
let pumping = false;
let generation = 0;

function pump() {
  if (pumping) return;
  pumping = true;
  const gen = generation;
  const step = (deadline) => {
    if (gen !== generation) {
      pumping = false;
      return;
    }
    if (legacyKeys === null) legacyKeys = keysWith(LEGACY_ROW_PREFIX);
    while (legacyKeys.length && deadline.timeRemaining() > 2) {
      removeKeys(legacyKeys.splice(0, 500));
    }
    if (!legacyKeys.length && pendingTables.size) {
      const [base, rows] = pendingTables.entries().next().value;
      pendingTables.delete(base);
      try {
        sessionStore.setItem(TABLE_PREFIX + base, JSON.stringify(rows));
      } catch {
        removeKeys([TABLE_PREFIX + base]);
      }
    }
    if (legacyKeys.length || pendingTables.size) runIdle(step);
    else pumping = false;
  };
  runIdle(step);
}

export const DataCache = {
  scheduleTables(tables) {
    Object.keys(tables).forEach((base) => pendingTables.set(base, tables[base]));
    pump();
  },

  cancelPending() {
    generation += 1;
    pendingTables.clear();
    pumping = false;
  },

  readTables() {
    const out = {};
    keysWith(TABLE_PREFIX).forEach((key) => {
      const rows = parse(sessionStore.getItem(key));
      if (Array.isArray(rows)) out[key.slice(TABLE_PREFIX.length)] = rows;
    });
    return out;
  },

  setEdit(tabela, id, row) {
    try {
      sessionStore.setItem(EDIT_PREFIX + tabela + ":" + id, JSON.stringify(row));
      return true;
    } catch {
      return false;
    }
  },

  markRemoved(tabela, id) {
    try {
      sessionStore.setItem(EDIT_PREFIX + tabela + ":" + id, REMOVED);
      return true;
    } catch {
      return false;
    }
  },

  readEdits() {
    return keysWith(EDIT_PREFIX)
      .map((key) => {
        const rest = key.slice(EDIT_PREFIX.length);
        const sep = rest.indexOf(":");
        if (sep < 0) return null;
        const row = parse(sessionStore.getItem(key));
        if (!row) return null;
        return { tabela: rest.slice(0, sep), id: rest.slice(sep + 1), row: row.__removed ? null : row };
      })
      .filter(Boolean);
  },

  clearEdits(bases) {
    const prefixes = bases.map((base) => EDIT_PREFIX + base + "_");
    removeKeys(keysWith(EDIT_PREFIX).filter((key) => prefixes.some((p) => key.indexOf(p) === 0)));
  },

  resetAll() {
    this.cancelPending();
    removeKeys([...keysWith(TABLE_PREFIX), ...keysWith(EDIT_PREFIX)]);
    legacyKeys = null;
    if (keysWith(LEGACY_ROW_PREFIX).length) pump();
  },

  removeLegacy() {
    try {
      sessionStore.removeItem(LEGACY_LOADED_AT_KEY);
    } catch {}
    try {
      const stale = [];
      for (let i = 0; i < localStore.length; i++) {
        const key = localStore.key(i);
        if (key && (key.indexOf(LEGACY_ROW_PREFIX) === 0 || key === LEGACY_KEY)) stale.push(key);
      }
      stale.forEach((k) => localStore.removeItem(k));
    } catch {}
  }
};
