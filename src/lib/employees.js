
import {
  useData,
  getVacancies,
  upsertVacancy,
  deleteVacancy,
  getVacancyById,
  getRescisoes,
  getHeadcounts,
  upsertHeadcount,
  deleteHeadcount,
  getHeadcountById
} from "./store";
import { computed, toRaw } from "vue";
import { createId, nowLocalISO, daysBetween, sameState, ymLabel, filialDisplay } from "./utils";
import { flush } from "./db";
import { regionalLabel } from "./regionais";

function filterByState(list, state) {
  if (!state || state === "todos") return list;
  return list.filter((x) => sameState(x.estado, state));
}

const _branchKeyCache = new Map();
export function normalizeBranchKey(value) {
  const raw = String(value ?? "");
  let key = _branchKeyCache.get(raw);
  if (key === undefined) {
    const base = raw
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9]/g, "");
    key = base.replace(/0+(\d)/g, "$1");
    if (_branchKeyCache.size > 5000) _branchKeyCache.clear();
    _branchKeyCache.set(raw, key);
  }
  return key;
}

function editDistance(a, b) {
  const rows = a.length + 1;
  const cols = b.length + 1;
  const d = Array.from({ length: rows }, (_, i) => {
    const row = new Array(cols).fill(0);
    row[0] = i;
    return row;
  });
  for (let j = 0; j < cols; j++) d[0][j] = j;
  for (let i = 1; i < rows; i++) {
    for (let j = 1; j < cols; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
        d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
      }
    }
  }
  return d[rows - 1][cols - 1];
}

function fuzzyBranch(key, list) {
  const letters = key.replace(/\d/g, "");
  const digits = key.replace(/\D/g, "");
  if (!letters) return null;
  const maxDist = letters.length >= 5 ? 2 : 1;
  let best = null;
  let bestDist = Infinity;
  let tie = false;
  list.forEach((b) => {
    const bKey = normalizeBranchKey(b.shortName);
    if (!bKey) return;
    if (digits && bKey.replace(/\D/g, "") !== digits) return;
    const dist = editDistance(letters, bKey.replace(/\d/g, ""));
    if (dist > maxDist) return;
    if (dist < bestDist) {
      best = b;
      bestDist = dist;
      tie = false;
    } else if (dist === bestDist && best && normalizeBranchKey(best.shortName) !== bKey) {
      tie = true;
    }
  });
  return best && !tie ? best : null;
}

let _branchLookup = { sig: "", map: new Map(), fresh: false };

function branchLookupCache(all) {
  if (!_branchLookup.fresh) {
    const sig = all.length + "|" + all.map((b) => `${b.id}:${b.shortName}:${b.estado}`).join("|");
    if (sig !== _branchLookup.sig) _branchLookup = { sig, map: new Map(), fresh: true };
    _branchLookup.fresh = true;
    queueMicrotask(() => {
      _branchLookup.fresh = false;
    });
  }
  return _branchLookup.map;
}

export function findBranchByShortName(text, estado) {
  const key = normalizeBranchKey(text);
  if (!key) return null;
  const all = useData().branches;
  const cache = branchLookupCache(all);
  const cacheKey = `${estado || ""}|${key}`;
  if (cache.has(cacheKey)) return cache.get(cacheKey);
  let list = all;
  if (estado && estado !== "todos") list = list.filter((b) => sameState(b.estado, estado));
  const found = list.find((b) => normalizeBranchKey(b.shortName) === key) || fuzzyBranch(key, list);
  cache.set(cacheKey, found);
  return found;
}

export function branchKeyFor(text, estado) {
  const key = normalizeBranchKey(text);
  if (!key) return "";
  const b = findBranchByShortName(text, estado);
  return b ? normalizeBranchKey(b.shortName) : key;
}

const CD_LABEL = /^cd\s*-\s*([a-z]{2})$/i;

export function filialKeyFor(text, estado) {
  const key = branchKeyFor(text, estado);
  const uf = String(estado ?? "").trim().toUpperCase();
  return key === "cd" && uf ? `cd|${uf}` : key;
}

export function filialKeyOfLabel(label) {
  const m = CD_LABEL.exec(String(label ?? "").trim());
  return m ? `cd|${m[1].toUpperCase()}` : branchKeyFor(label);
}

function moneyOrNull(value) {
  if (value === undefined || value === null || value === "") return null;
  const num = Number(value);
  return isNaN(num) ? null : num;
}

export function averageHiringDays(list) {
  const days = (list || [])
    .filter((v) => v.openAt && v.closeAt)
    .map((v) => daysBetween(v.openAt, v.closeAt))
    .filter((d) => d !== null && Number.isFinite(d) && d >= 0);
  if (!days.length) return null;
  return days.reduce((sum, d) => sum + d, 0) / days.length;
}

function avgHiringDays(state) {
  return averageHiringDays(listVacancies(state));
}

export function computedSnapshot(indId, state) {
  switch (indId) {
    case "headcount":
      return headcountCount(state);
    case "tempo_contratacao":
      return avgHiringDays(state);
    default:
      return null;
  }
}

export function syncAll() {}

export function listVacancies(state) {
  return filterByState(getVacancies(), state)
    .slice()
    .sort((a, b) => String(b.openAt || "").localeCompare(String(a.openAt || "")));
}

export function addVacancy({
  name,
  openAt,
  closeAt = null,
  salario = null,
  tipoContratacao = null,
  estado,
  filial = null,
  recrutador = null,
  motivoContratacao = null
}) {
  const vacancy = {
    id: createId(),
    name,
    openAt,
    closeAt: closeAt || null,
    salario: moneyOrNull(salario),
    tipoContratacao: tipoContratacao || null,
    estado: estado || null,
    filial: filial || null,
    recrutador: recrutador || null,
    motivoContratacao: motivoContratacao || null
  };
  upsertVacancy(vacancy);
  return vacancy;
}

export function updateVacancy(
  id,
  { name, openAt, closeAt, salario, tipoContratacao, estado, filial, recrutador, motivoContratacao }
) {
  const vacancy = getVacancyById(id);
  if (!vacancy) return null;
  const updated = {
    ...vacancy,
    name,
    openAt,
    closeAt: closeAt !== undefined ? closeAt || null : vacancy.closeAt,
    salario: salario !== undefined ? moneyOrNull(salario) : vacancy.salario,
    tipoContratacao:
      tipoContratacao !== undefined ? tipoContratacao || null : vacancy.tipoContratacao,
    estado: estado !== undefined ? estado || null : vacancy.estado,
    filial: filial !== undefined ? filial || null : vacancy.filial,
    recrutador: recrutador !== undefined ? recrutador || null : vacancy.recrutador,
    motivoContratacao:
      motivoContratacao !== undefined ? motivoContratacao || null : vacancy.motivoContratacao
  };
  upsertVacancy(updated);
  return updated;
}

export function closeVacancy(id, closeDate = null) {
  const vacancy = getVacancyById(id);
  if (!vacancy || vacancy.closeAt) return null;
  const updated = { ...vacancy, closeAt: closeDate ? `${String(closeDate).slice(0, 10)}T00:00:00` : nowLocalISO() };
  upsertVacancy(updated);
  return updated;
}

export async function deleteVacancyRecord(id) {
  deleteVacancy(id);
  await flush();
}

export async function deleteVacancies(ids) {
  (ids || []).forEach((id) => deleteVacancy(id));
  await flush();
}

export function closeVacancies(ids, closeDate = null) {
  (ids || []).forEach((id) => {
    const v = getVacancyById(id);
    if (!v || v.closeAt) return;
    const closeAt = closeDate ? `${String(closeDate).slice(0, 10)}T00:00:00` : nowLocalISO();
    upsertVacancy({ ...v, closeAt });
  });
}

export function formatVacancyTempo(vacancy) {
  if (!vacancy.openAt || !vacancy.closeAt) return "—";
  const days = daysBetween(vacancy.openAt, vacancy.closeAt);
  if (days === null || isNaN(days)) return "—";
  return days.toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 }) + " dias";
}

function dateWithinRange(dateVal, range) {
  if (!dateVal) return false;
  const d = String(dateVal).slice(0, 10);
  if (range.start && d < range.start) return false;
  if (range.end && d > range.end) return false;
  return true;
}

export function rescisaoAmount(r, mode) {
  const base = Number(r.valorRescisao) || 0;
  if (mode !== "total") return base;
  return base + (Number(r.grrfConsig) || 0) + (Number(r.multa40) || 0);
}

export function listRescisoes(state, range, filters) {
  let list = filterByState(getRescisoes(), state);
  if (range) list = list.filter((r) => dateWithinRange(r.mesReferencia, range));
  if (filters && filters.filial) list = list.filter((r) => filialDisplay(r.filial, r.estado) === filters.filial);
  if (filters && filters.gerente) list = list.filter((r) => r.gerenteImediato === filters.gerente);
  return list;
}

export function rescisaoFilterOptions(state, range) {
  const filiais = new Set();
  const gerentes = new Set();
  listRescisoes(state, range).forEach((r) => {
    if (r.filial) filiais.add(filialDisplay(r.filial, r.estado));
    if (r.gerenteImediato) gerentes.add(r.gerenteImediato);
  });
  const sort = (set) => [...set].sort((a, b) => a.localeCompare(b, "pt-BR"));
  return { filiais: sort(filiais), gerentes: sort(gerentes) };
}

export function rescisaoFuncaoLabel(r) {
  return String(r.funcao || "").trim().toUpperCase() || "SEM FUNÇÃO";
}

export function rescisoesTotal(state, range, mode, filters) {
  return listRescisoes(state, range, filters).reduce((sum, r) => sum + rescisaoAmount(r, mode), 0);
}

export function rescisoesByFuncao(state, range, mode, filters) {
  const groups = new Map();
  listRescisoes(state, range, filters).forEach((r) => {
    const label = rescisaoFuncaoLabel(r);
    const g = groups.get(label) || { label, value: 0, count: 0 };
    g.value += rescisaoAmount(r, mode);
    g.count += 1;
    groups.set(label, g);
  });
  return [...groups.values()].sort((a, b) => b.value - a.value);
}

export function rescisaoRegionalLabel(r) {
  return regionalLabel(r.regionalFilial || r.regional);
}

export function rescisoesByRegional(state, range, mode, filters) {
  const groups = new Map();
  listRescisoes(state, range, filters).forEach((r) => {
    const label = rescisaoRegionalLabel(r);
    const g = groups.get(label) || { label, value: 0, count: 0 };
    g.value += rescisaoAmount(r, mode);
    g.count += 1;
    groups.set(label, g);
  });
  return [...groups.values()].sort((a, b) => b.value - a.value);
}

export function rescisoesByEstado(state, range, mode, filters) {
  const groups = new Map();
  listRescisoes(state, range, filters).forEach((r) => {
    const label = String(r.estado || "").trim().toUpperCase() || "SEM ESTADO";
    const g = groups.get(label) || { label, value: 0, count: 0 };
    g.value += rescisaoAmount(r, mode);
    g.count += 1;
    groups.set(label, g);
  });
  return [...groups.values()].sort((a, b) => b.value - a.value);
}

function monthWithinRange(ym, range) {
  if (!ym) return false;
  if (!range) return true;
  const startYm = range.start ? String(range.start).slice(0, 7) : null;
  const endYm = range.end ? String(range.end).slice(0, 7) : null;
  if (startYm && ym < startYm) return false;
  if (endYm && ym > endYm) return false;
  return true;
}

function turnoverQuantitiesInRange(state, range) {
  const { admissoes, demissoes } = headcountMovements(state, range);
  return {
    admitidos: admissoes.length,
    demitidos: demissoes.length,
    ativos: headcountCountInRange(state, range)
  };
}

export function permanenciaDesligados(state, range) {
  return headcountMovements(state, range)
    .demissoes.filter((h) => h.dataAdmissao && h.dataDesligamento)
    .map((h) => ({
      id: h.id,
      colaborador: h.colaborador,
      dataAdmissao: String(h.dataAdmissao).slice(0, 10),
      dataDemissao: String(h.dataDesligamento).slice(0, 10),
      filial: h.filial || null,
      regional: h.regional || null,
      estado: h.estado || null,
      dias: daysBetween(h.dataAdmissao, h.dataDesligamento)
    }))
    .filter((p) => p.dias !== null && Number.isFinite(p.dias) && p.dias >= 0);
}

export function turnoverAvgTenureDays(state, range) {
  const days = permanenciaDesligados(state, range).map((p) => p.dias);
  if (!days.length) return null;
  return days.reduce((sum, d) => sum + d, 0) / days.length;
}

const _ymCache = new Map();
function toYm(value) {
  const cached = _ymCache.get(value);
  if (cached !== undefined) return cached;
  const ym = parseYm(value);
  if (_ymCache.size > 20000) _ymCache.clear();
  _ymCache.set(value, ym);
  return ym;
}

function parseYm(value) {
  const s = String(value ?? "").trim();
  let m = s.match(/^(\d{4})-(\d{2})/);
  if (m) return `${m[1]}-${m[2]}`;
  m = s.match(/^(\d{1,2})[\/.\-](\d{1,2})[\/.\-](\d{4}|\d{2})(?!\d)/);
  if (m) {
    const month = Number(m[2]);
    const year = m[3].length === 2 ? `20${m[3]}` : m[3];
    return month >= 1 && month <= 12 ? `${year}-${String(month).padStart(2, "0")}` : "";
  }
  m = s.match(/^(\d{1,2})[\/.\-](\d{4})$/);
  if (m) {
    const month = Number(m[1]);
    return month >= 1 && month <= 12 ? `${m[2]}-${String(month).padStart(2, "0")}` : "";
  }
  return "";
}

export function isHeadcountAtivo(h, ym) {
  const desligYm = toYm(h.dataDesligamento);
  return !desligYm || !ym || desligYm > ym;
}

const EMPTY_ROWS = Object.freeze([]);

function normUpper(v) {
  return String(v ?? "").trim().toUpperCase();
}

const headcountIndex = computed(() => {
  const list = getHeadcounts();
  const all = [];
  const byState = new Map();
  const byYm = new Map();
  const byStateYm = new Map();
  const push = (map, key, row) => {
    const bucket = map.get(key);
    if (bucket) bucket.push(row);
    else map.set(key, [row]);
  };
  for (let i = 0; i < list.length; i++) {
    const h = list[i];
    const raw = toRaw(h);
    const row = {
      h,
      raw,
      estado: normUpper(raw.estado),
      ym: toYm(raw.mesReferente),
      admYm: toYm(raw.dataAdmissao),
      desligYm: toYm(raw.dataDesligamento),
      empresa: normUpper(raw.empresa),
      funcao: normUpper(raw.funcao),
      genero: String(raw.genero || "").trim().toLowerCase()
    };
    all.push(row);
    push(byState, row.estado, row);
    push(byYm, row.ym, row);
    push(byStateYm, `${row.estado}|${row.ym}`, row);
  }
  return { all, byState, byYm, byStateYm, options: new Map() };
});

function isAllStates(state) {
  return !state || state === "todos";
}

function rowsOf(state) {
  const idx = headcountIndex.value;
  if (isAllStates(state)) return idx.all;
  return idx.byState.get(normUpper(state)) || EMPTY_ROWS;
}

function monthRowsOf(state, ym) {
  const idx = headcountIndex.value;
  if (isAllStates(state)) return idx.byYm.get(ym) || EMPTY_ROWS;
  return idx.byStateYm.get(`${normUpper(state)}|${ym}`) || EMPTY_ROWS;
}

function rowAtivoInMonth(row, ym) {
  return row.ym === ym && (!row.desligYm || row.desligYm > ym);
}

function activeRowsOf(state, ym) {
  return monthRowsOf(state, ym).filter((row) => rowAtivoInMonth(row, ym));
}

function rangeYm(range) {
  return range ? String(range.end || range.start || "").slice(0, 7) : "";
}

function personKey(h) {
  return `${h.estado || ""}|${String(h.codigo || h.colaborador || "").trim().toUpperCase()}|${String(h.dataAdmissao || "").slice(0, 10)}`;
}

let _movementsCache = new Map();
let _movementsFresh = false;
let _movementsIndex = null;

export function headcountMovements(state, range) {
  const idx = headcountIndex.value;
  if (!_movementsFresh || _movementsIndex !== idx) {
    _movementsCache = new Map();
    _movementsIndex = idx;
    if (!_movementsFresh) {
      _movementsFresh = true;
      queueMicrotask(() => {
        _movementsFresh = false;
      });
    }
  }
  const cacheKey = `${state || ""}|${range ? `${range.start || ""}|${range.end || ""}` : ""}`;
  const hit = _movementsCache.get(cacheKey);
  if (hit) return hit;
  const result = computeHeadcountMovements(rowsOf(state), range);
  _movementsCache.set(cacheKey, result);
  return result;
}

function computeHeadcountMovements(rows, range) {
  const seenA = new Set();
  const seenD = new Set();
  const admissoes = [];
  const demissoes = [];
  rows.forEach((row) => {
    const admIn = monthWithinRange(row.admYm, range);
    const desligIn = monthWithinRange(row.desligYm, range);
    if (!admIn && !desligIn) return;
    const key = personKey(row.raw);
    if (admIn && !seenA.has(key)) {
      seenA.add(key);
      admissoes.push(row.h);
    }
    if (desligIn && !seenD.has(key)) {
      seenD.add(key);
      demissoes.push(row.h);
    }
  });
  return { admissoes, demissoes };
}

export function headcountMonths(state) {
  const idx = headcountIndex.value;
  if (isAllStates(state)) return [...idx.byYm.keys()].filter(Boolean).sort();
  const prefix = `${normUpper(state)}|`;
  const out = [];
  idx.byStateYm.forEach((_, key) => {
    if (key.startsWith(prefix) && key.length > prefix.length) out.push(key.slice(prefix.length));
  });
  return out.sort();
}

export function listHeadcountRecords(state, mesReferencia, { incluirDesligados = false } = {}) {
  let rows = rowsOf(state);
  if (mesReferencia) {
    rows = incluirDesligados ? monthRowsOf(state, mesReferencia) : activeRowsOf(state, mesReferencia);
  }
  return rows
    .slice()
    .sort((a, b) => String(a.raw.colaborador || "").localeCompare(String(b.raw.colaborador || "")))
    .map((row) => row.h);
}

export function headcountCount(state, mesReferencia, regional = "") {
  const rows = mesReferencia ? activeRowsOf(state, mesReferencia) : rowsOf(state);
  return regional ? rows.filter((row) => regionalLabel(row.raw.regional) === regional).length : rows.length;
}

export function filterByRegional(list, regional) {
  return regional ? list.filter((h) => regionalLabel(h.regional) === regional) : list;
}

export function headcountRegionalOptions(state) {
  return [...new Set(rowsOf(state).map((row) => regionalLabel(row.raw.regional)))].sort((a, b) => a.localeCompare(b, "pt-BR"));
}

export function headcountCountInRange(state, range) {
  const ym = rangeYm(range);
  if (!ym) return rowsOf(state).length;
  return activeRowsOf(state, ym).length;
}

export function headcountActiveInRange(state, range) {
  const ym = rangeYm(range);
  const rows = ym ? activeRowsOf(state, ym) : rowsOf(state);
  return rows.map((row) => row.h);
}

export function headcountFilialOptions(state, empresas = []) {
  const seen = new Map();
  const tried = new Set();
  rowsOf(state).forEach((row) => {
    if (empresas.length && !empresas.includes(row.empresa)) return;
    const { filial, estado } = row.raw;
    const pair = `${estado}\u0000${filial}`;
    if (tried.has(pair)) return;
    tried.add(pair);
    const key = filialKeyFor(filial, estado);
    if (!key || seen.has(key)) return;
    const b = findBranchByShortName(filial, estado);
    seen.set(key, filialDisplay(String((b && b.shortName) || filial).trim().toUpperCase(), estado));
  });
  return [...seen.values()].sort((a, b) => a.localeCompare(b, "pt-BR"));
}

function distinctOptions(state, field) {
  const idx = headcountIndex.value;
  const cacheKey = `${field}|${isAllStates(state) ? "todos" : normUpper(state)}`;
  let result = idx.options.get(cacheKey);
  if (!result) {
    const seen = new Set();
    rowsOf(state).forEach((row) => {
      if (row[field]) seen.add(row[field]);
    });
    result = [...seen].sort((a, b) => a.localeCompare(b, "pt-BR"));
    idx.options.set(cacheKey, result);
  }
  return result.slice();
}

export function headcountEmpresaOptions(state) {
  return distinctOptions(state, "empresa");
}

export function headcountFuncaoOptions(state) {
  return distinctOptions(state, "funcao");
}

export function headcountGenderCountByRegional(state, range, filiais = [], empresas = [], funcoes = []) {
  const groups = new Map();
  headcountFilteredRows(state, range, filiais, empresas, funcoes).forEach((row) => {
    const label = regionalLabel(row.raw.regional);
    const g = groups.get(label) || { masculino: 0, feminino: 0, total: 0 };
    if (row.genero === "masculino") g.masculino += 1;
    else if (row.genero === "feminino") g.feminino += 1;
    g.total += 1;
    groups.set(label, g);
  });
  return groups;
}

export function headcountGenderCountInRange(state, range, filiais = [], empresas = [], funcoes = []) {
  const rows = headcountFilteredRows(state, range, filiais, empresas, funcoes);
  let masculino = 0;
  let feminino = 0;
  rows.forEach((row) => {
    if (row.genero === "masculino") masculino += 1;
    else if (row.genero === "feminino") feminino += 1;
  });
  return { masculino, feminino, total: rows.length };
}

function headcountFilteredRows(state, range, filiais, empresas, funcoes) {
  const ym = rangeYm(range);
  let rows = ym ? activeRowsOf(state, ym) : rowsOf(state);
  if (funcoes.length) {
    const set = new Set(funcoes.map((f) => normUpper(f)));
    rows = rows.filter((row) => set.has(row.funcao));
  }
  if (filiais.length) {
    const keys = new Set(filiais.map((f) => filialKeyOfLabel(f)));
    const memo = new Map();
    rows = rows.filter((row) => {
      const { filial, estado } = row.raw;
      const pair = `${estado}\u0000${filial}`;
      let hit = memo.get(pair);
      if (hit === undefined) {
        hit = keys.has(filialKeyFor(filial, estado));
        memo.set(pair, hit);
      }
      return hit;
    });
  }
  if (empresas.length) {
    const set = new Set(empresas.map((e) => normUpper(e)));
    rows = rows.filter((row) => set.has(row.empresa));
  }
  return rows;
}

export function addHeadcountRecord({
  codigo = null,
  colaborador,
  funcao = null,
  dataAdmissao = null,
  genero = null,
  dataDesligamento = null,
  mesReferente = null,
  empresa = null,
  filial = null,
  estado,
  dataNascimento = null
}) {
  const record = {
    id: createId(),
    codigo: codigo != null && codigo !== "" ? String(codigo) : null,
    colaborador: String(colaborador || "").toUpperCase(),
    funcao: funcao != null ? String(funcao).toUpperCase() : null,
    dataAdmissao: dataAdmissao || null,
    genero: genero || null,
    dataDesligamento: dataDesligamento || null,
    mesReferente: mesReferente ? String(mesReferente).slice(0, 7) : null,
    empresa: empresa != null ? String(empresa).toUpperCase() : null,
    filial: filial || null,
    estado: estado || null,
    dataNascimento: dataNascimento || null
  };
  upsertHeadcount(record);
  return record;
}

export function updateHeadcountRecord(
  id,
  { codigo, colaborador, funcao, dataAdmissao, genero, dataDesligamento, mesReferente, empresa, filial, estado, dataNascimento }
) {
  const record = getHeadcountById(id);
  if (!record) return null;
  const updated = {
    ...record,
    codigo: codigo !== undefined ? (codigo != null && codigo !== "" ? String(codigo) : null) : record.codigo,
    colaborador: colaborador !== undefined ? String(colaborador || "").toUpperCase() : record.colaborador,
    funcao: funcao !== undefined ? (funcao != null ? String(funcao).toUpperCase() : null) : record.funcao,
    dataAdmissao: dataAdmissao !== undefined ? dataAdmissao || null : record.dataAdmissao,
    genero: genero !== undefined ? genero || null : record.genero,
    dataDesligamento: dataDesligamento !== undefined ? dataDesligamento || null : record.dataDesligamento,
    mesReferente: mesReferente !== undefined ? (mesReferente ? String(mesReferente).slice(0, 7) : null) : record.mesReferente,
    empresa: empresa !== undefined ? (empresa != null ? String(empresa).toUpperCase() : null) : record.empresa,
    filial: filial !== undefined ? filial || null : record.filial,
    estado: estado !== undefined ? estado || null : record.estado,
    dataNascimento: dataNascimento !== undefined ? dataNascimento || null : record.dataNascimento
  };
  upsertHeadcount(updated);
  flush();
  return updated;
}

export async function deleteHeadcountRecord(id) {
  deleteHeadcount(id);
  await flush();
}

export async function deleteHeadcountRecords(ids) {
  (ids || []).forEach((id) => deleteHeadcount(id));
  await flush();
}

export function turnoverRateStats(state, range) {
  const { admitidos: admissoes, demitidos: desligamentos, ativos: headcountAtual } = turnoverQuantitiesInRange(
    state,
    range
  );
  const turnoverPct = headcountAtual ? ((admissoes + desligamentos) / 2 / headcountAtual) * 100 : null;
  const turnoverEntradaPct = headcountAtual ? (admissoes / headcountAtual) * 100 : null;
  const turnoverSaidaPct = headcountAtual ? (desligamentos / headcountAtual) * 100 : null;
  return {
    admissoes,
    desligamentos,
    headcountAtual,
    turnoverPct,
    turnoverEntradaPct,
    turnoverSaidaPct
  };
}

export function retentionRate(state, range, prevRange) {
  const headcountFinal = headcountCountInRange(state, range);
  const { admitidos: novasContratacoes, demitidos: demissoes } = turnoverQuantitiesInRange(state, range);
  const anterior = headcountCountInRange(state, prevRange);
  const headcountInicial = anterior || Math.max(headcountFinal - novasContratacoes + demissoes, 0);
  const retencaoPct =
    headcountFinal && headcountInicial ? ((headcountFinal - novasContratacoes) / headcountInicial) * 100 : null;
  return {
    headcountInicial,
    headcountFinal,
    novasContratacoes,
    demissoes,
    retencaoPct
  };
}

function divergenceReason(c, mes, anterior) {
  if (c.ini && c.adm) return `Admissão em ${mes}, mas já constava em ${anterior}`;
  if (c.dem && c.fin) return `Desligamento em ${mes}, mas consta como ativo no mês`;
  if (c.ini && !c.fin && !c.dem) {
    return c.noMes
      ? `Ativo em ${anterior}, mas em ${mes} consta com desligamento fora do mês`
      : `Ativo em ${anterior}, não aparece em ${mes} e não tem data de desligamento`;
  }
  if (c.fin && !c.ini && !c.adm) return `Aparece em ${mes} sem constar em ${anterior} e sem admissão no mês`;
  if (c.adm && !c.fin && !c.dem) return `Admissão em ${mes}, mas não consta como ativo no mês`;
  if (c.dem && !c.ini && !c.adm) return `Desligamento em ${mes}, mas não constava como ativo em ${anterior}`;
  return "Registros inconsistentes entre os meses";
}

export function retentionDivergences(state, range, prevRange) {
  const ym = rangeYm(range);
  const prevYm = rangeYm(prevRange);
  if (!ym || !prevYm) return [];
  const inicial = activeRowsOf(state, prevYm);
  if (!inicial.length) return [];

  const people = new Map();
  const entry = (h) => {
    const key = personKey(h);
    let c = people.get(key);
    if (!c) {
      c = { h, ini: 0, fin: 0, adm: 0, dem: 0, noMes: false };
      people.set(key, c);
    }
    return c;
  };
  inicial.forEach((row) => { entry(row.raw).ini += 1; });
  activeRowsOf(state, ym).forEach((row) => { entry(row.raw).fin += 1; });
  const { admissoes, demissoes } = headcountMovements(state, range);
  admissoes.forEach((h) => { entry(h).adm += 1; });
  demissoes.forEach((h) => { entry(h).dem += 1; });
  monthRowsOf(state, ym).forEach((row) => {
    const c = people.get(personKey(row.raw));
    if (c) c.noMes = true;
  });

  const mes = ymLabel(ym);
  const anterior = ymLabel(prevYm);
  const out = [];
  people.forEach((c, key) => {
    const delta = c.ini + c.adm - c.dem - c.fin;
    if (!delta) return;
    out.push({
      key,
      colaborador: c.h.colaborador || "",
      codigo: c.h.codigo || null,
      filial: c.h.filial || null,
      estado: c.h.estado || null,
      delta,
      motivo: divergenceReason(c, mes, anterior)
    });
  });
  return out.sort((a, b) => String(a.colaborador).localeCompare(String(b.colaborador), "pt-BR"));
}

export function turnoverEntriesInRange(state, range) {
  const { admissoes, demissoes } = headcountMovements(state, range);
  const groups = new Map();
  const bucket = (h, ym) => {
    const key = `${ym}|${h.estado || ""}|${branchKeyFor(h.filial, h.estado)}`;
    if (!groups.has(key)) {
      groups.set(key, { id: key, mesReferencia: ym, filial: h.filial || null, estado: h.estado || null, regional: regionalLabel(h.regional), admitidos: 0, demitidos: 0, ativos: 0 });
    }
    return groups.get(key);
  };
  admissoes.forEach((h) => { bucket(h, toYm(h.dataAdmissao)).admitidos += 1; });
  demissoes.forEach((h) => { bucket(h, toYm(h.dataDesligamento)).demitidos += 1; });
  const ym = range ? String(range.end || range.start || "").slice(0, 7) : "";
  if (ym) {
    activeRowsOf(state, ym).forEach((row) => { bucket(row.h, ym).ativos += 1; });
  }
  return [...groups.values()].sort((a, b) => String(b.mesReferencia).localeCompare(String(a.mesReferencia)));
}
