/* Feedback / histórico — cache local de resultados mensais consolidados.
   ---------------------------------------------------------------
   Objetivo: para MESES ANTERIORES ao mês vigente, KPIs, panorama e totais
   consultam um "snapshot" mensal pré-consolidado por indicador em vez de
   re-varrer todos os lançamentos do mês a cada renderização.

   Regras:
     • Mês vigente      -> NUNCA usa feedback (sempre dados normais/originais).
     • Mês anterior     -> usa feedback quando disponível (calculado sob demanda).
     • Para cada (ano+mês+estado) existe UM objeto de snapshot; recalcular
       apenas ATUALIZA o objeto existente (nunca duplica).
     • Alterações/exclusões em lançamentos de um mês anterior invalidam e
       recalculam o snapshot daquele mês automaticamente.

   Como os valores são derivados das mesmas regras de agregação usadas nos
   dados normais (lib/metrics.js), o resultado é matematicamente idêntico ao
   cálculo direto sobre os lançamentos. */
import { reactive } from "vue";
import { safeSetItem, localStore, ymOf, currentYm, nowLocalISO } from "./utils";
import { MANUAL_INDICATORS } from "./config";
import { getEntriesFor, onEntryMutation, queueFeedbackRecords } from "./store";
import { aggregateEntries, absenteismoTotals } from "./metrics";

const STORAGE_KEY = "gg-feedback-v1";

const cache = reactive({ months: {} });

let persistTimer = null;

function persist() {
  clearTimeout(persistTimer);
  persistTimer = setTimeout(() => {
    try {
      const plain = JSON.parse(JSON.stringify(cache.months));
      safeSetItem(localStore, STORAGE_KEY, JSON.stringify({ months: plain }));
    } catch (err) {
      /* cache é apenas otimização — falha ao gravar é irrelevante */
    }
  }, 600);
}

function load() {
  try {
    const raw = localStore.getItem(STORAGE_KEY);
    if (!raw) return;
    const parsed = JSON.parse(raw);
    if (parsed && parsed.months && typeof parsed.months === "object") {
      cache.months = parsed.months;
    }
  } catch (err) {
    /* ignora cache corrompido */
  }
}

/* Devolve true quando o mês pode/deve usar feedback (somente passado). */
export function feedbackUsableYm(ym) {
  return !!ym && ym < currentYm();
}

/* Recalcula o snapshot de um mês+estado a partir dos lançamentos. */
function computeSnapshot(ym, state) {
  const indicators = {};
  MANUAL_INDICATORS.forEach((ind) => {
    const monthList = getEntriesFor(ind.id, state).filter((e) => ymOf(e.date) === ym);
    const rec = {
      value: aggregateEntries(ind, monthList),
      count: monthList.length
    };
    if (ind.id === "absenteismo") rec.types = absenteismoTotals(monthList);
    indicators[ind.id] = rec;
  });
  return { ym, state, updatedAt: nowLocalISO(), indicators };
}

/* Converte um snapshot em registros prontos para a tabela feedback_indicadores
   (um registro por ano+mês+estado+indicador). */
function snapshotRecords(snap) {
  if (!snap || !snap.indicators) return [];
  const parts = snap.ym.split("-");
  const ano = Number(parts[0]);
  const mes = Number(parts[1]);
  if (!ano || !mes) return [];
  return Object.keys(snap.indicators).map((indicatorId) => {
    const rec = snap.indicators[indicatorId] || {};
    return {
      ano,
      mes,
      estado: snap.state || "todos",
      indicador: indicatorId,
      valor: rec.value !== undefined && rec.value !== null ? Number(rec.value) : null,
      contagem: Number(rec.count) || 0,
      tipos: rec.types ? { falta: rec.types.falta || 0, atraso: rec.types.atraso || 0, afastamento: rec.types.afastamento || 0 } : null
    };
  });
}

/* Devolve o snapshot já existente em cache (sem calcular/gravar). */
export function getMonthSnapshot(ym, state = "todos") {
  if (!feedbackUsableYm(ym)) return null;
  const buckets = cache.months[ym];
  if (!buckets) return null;
  return buckets[state] || null;
}

/* Garante (calcula e guarda) o snapshot de um mês anterior. Devolve o
   snapshot (objeto reativo estável) ou null quando não se aplica feedback
   (mês vigente ou futuro). Cada (ano+mês+estado) mantém UMA entrada, que é
   atualizada quando os dados mudam — nunca é criada uma nova linha. */
export function monthSnapshot(ym, state = "todos") {
  if (!feedbackUsableYm(ym)) return null;
  if (!cache.months[ym]) cache.months[ym] = {};
  const existing = cache.months[ym][state];
  if (existing && existing.indicators) return existing;
  const snap = computeSnapshot(ym, state);
  cache.months[ym][state] = snap;
  persist();
  queueFeedbackRecords(snapshotRecords(snap));
  return snap;
}

/* Valor consolidado de um indicador para um mês anterior (null = sem
   lançamentos naquele mês). */
export function feedbackValue(ym, state, indicatorId) {
  const snap = monthSnapshot(ym, state);
  if (!snap || !snap.indicators) return null;
  const rec = snap.indicators[indicatorId];
  return rec ? rec.value : null;
}

/* Tipos do absenteísmo consolidados para um mês anterior. */
export function feedbackAbsenteismoTypes(ym, state) {
  const snap = monthSnapshot(ym, state);
  if (!snap || !snap.indicators || !snap.indicators.absenteismo) return null;
  return snap.indicators.absenteismo.types || null;
}

/* Contagem de lançamentos de um indicador em um mês anterior. */
export function feedbackCount(ym, state, indicatorId) {
  const snap = monthSnapshot(ym, state);
  if (!snap || !snap.indicators) return null;
  const rec = snap.indicators[indicatorId];
  return rec ? rec.count : null;
}

/* Invalida e recalcula os snapshots dos meses cujos lançamentos mudaram.
   Registrado no store: toda alteração/exclusão de lançamento dispara isto. */
function handleEntryMutation(monthsAffected) {
  if (!monthsAffected || !monthsAffected.length) return;
  let dirty = false;
  const cur = currentYm();
  monthsAffected.forEach((ym) => {
    if (ym >= cur) return; // mês vigente nunca é histórico
    const buckets = cache.months[ym];
    if (!buckets) return;
    Object.keys(buckets).forEach((state) => {
      buckets[state] = computeSnapshot(ym, state); // UPDATE do registro existente
      dirty = true;
      queueFeedbackRecords(snapshotRecords(buckets[state]));
    });
  });
  if (dirty) persist();
}

/* Remove todo o cache (usado após sincronizações remotas completas ou
   troca de usuário, quando os dados de origem podem ter mudado). */
export function feedbackClearAll() {
  cache.months = {};
  clearTimeout(persistTimer);
  persistTimer = null;
  try {
    localStore.removeItem(STORAGE_KEY);
  } catch (err) {
    /* noop */
  }
}

export function initFeedback() {
  load();
  onEntryMutation(handleEntryMutation);
}
