const NAO_INFORMADO = "NAOINFORMADO";

const ROMANOS = { I: 1, II: 2, III: 3, IV: 4, V: 5, VI: 6, VII: 7, VIII: 8, IX: 9, X: 10 };

const NOMES_ALTERNATIVOS = {
  NOVABRAZILANDIA: "NBO",
  NOVABRASILANDIA: "NBO"
};

export const SEM_REGIONAL = "SEM REGIONAL";

export function regionalLabel(value) {
  return String(value ?? "").trim().toUpperCase() || SEM_REGIONAL;
}

function filialKey(value) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toUpperCase()
    .replace(/\s+(IX|IV|V?I{1,3}|V|X)\s*$/, (m, r) => ` ${ROMANOS[r]}`)
    .replace(/[^A-Z0-9]/g, "")
    .replace(/([A-Z])0+(\d)/g, "$1$2");
}

function lettersOf(key) {
  return key.replace(/\d+/g, "");
}

function digitsOf(key) {
  return key.replace(/\D+/g, "");
}

function isSubsequence(short, long) {
  let i = 0;
  for (let j = 0; j < long.length && i < short.length; j++) {
    if (short[i] === long[j]) i++;
  }
  return i === short.length;
}

function withinOneEdit(a, b) {
  if (a === b) return true;
  if (Math.abs(a.length - b.length) > 1) return false;
  let i = 0;
  while (i < a.length && i < b.length && a[i] === b[i]) i++;
  if (a.length === b.length) return a.slice(i + 1) === b.slice(i + 1);
  const [longer, shorter] = a.length > b.length ? [a, b] : [b, a];
  return longer.slice(i + 1) === shorter.slice(i);
}

function cleanSupervisor(value) {
  const text = String(value ?? "").trim().toUpperCase();
  if (!text || filialKey(text) === NAO_INFORMADO) return "";
  return text;
}

function uniqueSupervisor(list) {
  const set = new Set(list.map((e) => e.regional).filter(Boolean));
  return set.size === 1 ? [...set][0] : "";
}

function preferSameDigits(list, digits) {
  if (!digits) return list;
  const same = list.filter((e) => e.digits === digits);
  return same.length ? same : list;
}

export function buildRegionalLookup(rows) {
  const entries = [];
  (rows || []).forEach((row) => {
    const key = filialKey(row.filial);
    if (!key) return;
    entries.push({
      key,
      letters: lettersOf(key),
      digits: digitsOf(key),
      estado: String(row.estado_sigla || "").trim().toUpperCase(),
      regional: cleanSupervisor(row.supervisor)
    });
  });

  const poolsByUf = new Map();
  function poolFor(estado) {
    const uf = String(estado || "").trim().toUpperCase();
    let pool = poolsByUf.get(uf);
    if (!pool) {
      const same = uf ? entries.filter((e) => e.estado === uf) : [];
      pool = same.length ? same : entries;
      poolsByUf.set(uf, pool);
    }
    return pool;
  }

  function resolveUncached(filial, estado) {
    let key = filialKey(filial);
    if (!key) return "";
    if (key === "CD") key = `CD${String(estado || "").trim().toUpperCase()}`;
    key = key.replace(/^ARI([2-9])$/, "ARQ$1");
    key = NOMES_ALTERNATIVOS[key] || key;

    const pool = poolFor(estado);

    if (key.startsWith("CD")) return uniqueSupervisor(pool.filter((e) => e.key.startsWith("CD")));

    const letters = lettersOf(key);
    const digits = digitsOf(key);
    const tiers = [
      () => pool.filter((e) => e.key === key),
      () => pool.filter((e) => e.letters === letters),
      () =>
        preferSameDigits(
          pool.filter((e) => e.letters.length >= 4 && (e.letters.startsWith(letters) || letters.startsWith(e.letters) || letters.includes(e.letters))),
          digits
        ),
      () => (letters.length >= 3 || (letters.length >= 2 && digits) ? preferSameDigits(pool.filter((e) => e.letters[0] === letters[0] && isSubsequence(letters, e.letters)), digits) : []),
      () => pool.filter((e) => e.letters.length >= 3 && e.letters[0] === letters[0] && isSubsequence(e.letters, letters)),
      () =>
        pool.filter(
          (e) =>
            e.digits === digits &&
            Math.max(e.letters.length, letters.length) >= 3 &&
            (digits || Math.min(e.letters.length, letters.length) >= 4) &&
            withinOneEdit(e.letters, letters)
        ),
      () => pool.filter((e) => key.length >= 5 && withinOneEdit(e.key, key))
    ];

    for (const tier of tiers) {
      const found = uniqueSupervisor(tier());
      if (found) return found;
    }
    return "";
  }

  const cache = new Map();
  function resolve(filial, estado) {
    const cacheKey = `${estado ?? ""}\u0000${filial ?? ""}`;
    let found = cache.get(cacheKey);
    if (found === undefined) {
      found = resolveUncached(filial, estado);
      cache.set(cacheKey, found);
    }
    return found;
  }

  return { resolve };
}
