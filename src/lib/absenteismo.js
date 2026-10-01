import { computed } from "vue";
import { getOcorrencias } from "./store";
import { listHeadcountRecords, headcountMonths } from "./employees";
import { normalizeText, nameKey } from "./utils";

export const MOTIVOS = [
  { value: "Falta", label: "Falta", letter: "F", chip: "bg-red-100 text-red-700 dark:bg-red-500/20 dark:text-red-300", dot: "bg-red-400", hex: "#f87171" },
  { value: "Atestado", label: "Atestado", letter: "A", chip: "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-300", dot: "bg-emerald-400", hex: "#34d399" },
  { value: "Suspensão", label: "Suspensão", letter: "S", chip: "bg-amber-100 text-amber-700 dark:bg-amber-500/20 dark:text-amber-300", dot: "bg-amber-400", hex: "#fbbf24" }
];

export const PRESENTE = {
  value: "Presente",
  label: "Presente c/ obs.",
  letter: "•",
  chip: "bg-zinc-100 text-zinc-500 dark:bg-zinc-700/60 dark:text-zinc-300",
  dot: "bg-zinc-400"
};

export const FLAGS = [
  { key: "advertencia", value: "Advertência", label: "Advertência", plural: "Advertências", letter: "V", chip: "bg-orange-100 text-orange-700 dark:bg-orange-500/20 dark:text-orange-300", dot: "bg-orange-400", hex: "#fb923c" },
  { key: "acidente", value: "Acidente de Trabalho", label: "Acidente de trabalho", plural: "Acidentes de trabalho", short: "Acid. de trabalho", letter: "T", chip: "bg-violet-100 text-violet-700 dark:bg-violet-500/20 dark:text-violet-300", dot: "bg-violet-400", hex: "#a78bfa" }
];

const MOTIVO_PLURAL = { Falta: "Faltas", Atestado: "Atestados", Suspensão: "Suspensões" };

export const TIPOS = [
  ...MOTIVOS.map((m) => ({ ...m, plural: MOTIVO_PLURAL[m.value] || m.label, has: (o) => o.motivo === m.value })),
  ...FLAGS.map((f) => ({ ...f, has: (o) => !!o[f.key] }))
];

export const isOcorrenciaAusencia = (o) => (o.motivo && o.motivo !== "Presente") || !!o.advertencia || !!o.acidente;

export function cellInfo(meta) {
  if (!meta) return null;
  const flags = FLAGS.filter((f) => meta[f.key]);
  let motivo = meta.motivo && meta.motivo !== PRESENTE.value ? motivoOf(meta.motivo) : null;
  if (!motivo && meta.motivo && meta.motivo !== PRESENTE.value) motivo = { ...DESCONHECIDO, label: meta.motivo };
  const primary = motivo || flags[0] || (meta.motivo === PRESENTE.value ? PRESENTE : null);
  return primary ? { primary, flags: flags.filter((f) => f !== primary) } : null;
}

const DESCONHECIDO = {
  value: "?",
  label: "Motivo desconhecido",
  letter: "?",
  chip: "bg-zinc-200 text-zinc-700 dark:bg-zinc-600/50 dark:text-zinc-200",
  dot: "bg-zinc-400"
};

export function motivoOf(value) {
  if (value === PRESENTE.value) return PRESENTE;
  return MOTIVOS.find((m) => m.value === value) || null;
}

const collator = new Intl.Collator("pt-BR");
const pad = (n) => String(n).padStart(2, "0");

export function isoOf(date) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export function monthRange(ym) {
  const [y, m] = String(ym).split("-").map(Number);
  return { start: new Date(y, m - 1, 1), end: new Date(y, m, 0) };
}

export function monthDays({ start, end }) {
  const days = [];
  for (let d = new Date(start); d <= end; d = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1)) {
    days.push({
      iso: isoOf(d),
      day: d.getDate(),
      month: d.toLocaleDateString("pt-BR", { month: "short" }).replace(".", "").toUpperCase(),
      weekday: d.toLocaleDateString("pt-BR", { weekday: "short" }).replace(".", "").toUpperCase(),
      sunday: d.getDay() === 0
    });
  }
  return days;
}

export function headcountMonthFor(state, ym) {
  const months = headcountMonths(state);
  if (!months.length || months.includes(ym)) return { ym, fallback: false };
  const before = months.filter((m) => m < ym);
  return { ym: before.length ? before[before.length - 1] : months[0], fallback: true };
}

export function monthEmployees(state, ym, period) {
  const startIso = isoOf(period.start);
  const byName = new Map();
  listHeadcountRecords(state, headcountMonthFor(state, ym).ym, { incluirDesligados: true }).forEach((h) => {
    const key = nameKey(h.colaborador);
    if (key) byName.set(key, h);
  });
  return [...byName.values()]
    .filter((h) => !h.dataDesligamento || h.dataDesligamento >= startIso)
    .map((h) => ({
      nome: String(h.colaborador).trim(),
      key: nameKey(h.colaborador),
      busca: normalizeText(h.colaborador),
      setorKey: String(h.funcao || "").trim().toUpperCase(),
      filial: h.filial || "",
      filialKey: String(h.filial || "").trim().toUpperCase(),
      setor: h.funcao || "",
      estado: h.estado || null,
      desligamento: h.dataDesligamento || null
    }))
    .sort((a, b) => collator.compare(a.nome, b.nome));
}

export function useOcorrenciaIndex() {
  return computed(() => {
    const map = new Map();
    getOcorrencias().forEach((o) => map.set(`${nameKey(o.meta.colaborador)}|${o.date}`, o));
    return map;
  });
}

export function competenciaYm(meta, date) {
  return (meta && meta.competencia) || String(date || "").slice(0, 7);
}

export function useMonthOcorrencias(ym, estado) {
  return computed(() => {
    const month = ym.value;
    const uf = String(estado.value || "").toUpperCase();
    const all = !uf || uf === "TODOS";
    return getOcorrencias()
      .filter(
        (o) =>
          isOcorrenciaAusencia(o.meta) &&
          competenciaYm(o.meta, o.date) === month &&
          (all || String(o.meta.estado || "").toUpperCase() === uf)
      )
      .map((o) => ({
        date: o.date,
        colaborador: o.meta.colaborador,
        filial: o.meta.filial || "Sem filial",
        estado: String(o.meta.estado || "").toUpperCase() || "—",
        motivo: o.meta.motivo,
        advertencia: !!o.meta.advertencia,
        acidente: !!o.meta.acidente
      }));
  });
}

export function countBy(list, keyOf) {
  const map = new Map();
  list.forEach((item) => {
    const key = keyOf(item);
    map.set(key, (map.get(key) || 0) + 1);
  });
  return [...map.entries()]
    .map(([label, value]) => ({ label, value }))
    .sort((a, b) => b.value - a.value || collator.compare(a.label, b.label));
}
