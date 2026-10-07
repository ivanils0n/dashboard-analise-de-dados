const SUM_INDICATORS = new Set(["absenteismo", "treinamento", "custo_total", "ferias"]);

const AVG_INDICATORS = new Set(["custo_diaria", "custo_contratacao"]);

export function employeeNameKey(name) {
  return String(name ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]/g, "");
}

export function uniqueEmployeeCount(list) {
  const keys = new Set();
  (list || []).forEach((e) => {
    const m = e && e.meta;
    if (!m) return;
    const nome = employeeNameKey(m.employeeName);
    const key = nome ? `${m.codigo || ""}|${nome}` : m.employeeId;
    if (key) keys.add(key);
  });
  return keys.size;
}

export function diariaDivisor(list) {
  const unnamed = (list || []).filter(
    (e) => !(e && e.meta && (e.meta.employeeId || e.meta.employeeName))
  ).length;
  return uniqueEmployeeCount(list) + unnamed;
}

function aggregationKind(ind) {
  if (!ind) return "last";
  if (SUM_INDICATORS.has(ind.id)) return "sum";
  if (AVG_INDICATORS.has(ind.id)) return "avg";
  return "last";
}

export function aggregateEntries(ind, list) {
  if (!list || !list.length) return null;
  const kind = aggregationKind(ind);
  if (kind === "sum") return list.reduce((s, e) => s + (Number(e.value) || 0), 0);
  if (kind === "avg") {
    const sum = list.reduce((s, e) => s + (Number(e.value) || 0), 0);
    if (ind.id === "custo_diaria") return sum / (diariaDivisor(list) || list.length);
    return sum / list.length;
  }
  const raw = list[list.length - 1].value;
  if (raw === null || raw === undefined || raw === "") return null;
  const last = Number(raw);
  return Number.isFinite(last) ? last : null;
}
