/* Mapa de absenteísmo: colaboradores x dias do mês filtrado com a
   ocorrência de cada dia. Os colaboradores vêm do Headcount; as ocorrências
   ficam na aba "absenteismo" (ver getOcorrencias/saveOcorrencia em store.js). */
import { computed } from "vue";
import { getOcorrencias } from "./store";
import { listHeadcountRecords } from "./employees";
import { normalizeText } from "./utils";

/* Motivos lançáveis. "Presente" sem observação nem marcação apaga o dia. */
export const MOTIVOS = [
  { value: "Falta", label: "Falta", letter: "F", chip: "bg-red-100 text-red-700 dark:bg-red-500/20 dark:text-red-300", dot: "bg-red-400", hex: "#f87171" },
  { value: "Atestado", label: "Atestado", letter: "A", chip: "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-300", dot: "bg-emerald-400", hex: "#34d399" },
  { value: "Declaração", label: "Declaração", letter: "D", chip: "bg-amber-100 text-amber-700 dark:bg-amber-500/20 dark:text-amber-300", dot: "bg-amber-400", hex: "#fbbf24" },
  { value: "Meio Expediente", label: "Meio período", letter: "M", chip: "bg-sky-100 text-sky-700 dark:bg-sky-500/20 dark:text-sky-300", dot: "bg-sky-400", hex: "#38bdf8" }
];

/* "Presente" com observação: o dia não tem ocorrência, mas guarda uma anotação.
   Aparece como um ponto discreto na célula. */
export const PRESENTE = {
  value: "Presente",
  label: "Presente c/ obs.",
  letter: "•",
  chip: "bg-zinc-100 text-zinc-500 dark:bg-zinc-700/60 dark:text-zinc-300",
  dot: "bg-zinc-400"
};

/* Marcações independentes do motivo (caixas de seleção do lançamento): uma
   ocorrência pode ter um motivo (ex.: Atestado) e também Advertência e/ou
   Acidente de trabalho. Gravadas nas colunas advertencia e acidente_trabalho. */
export const FLAGS = [
  { key: "advertencia", value: "Advertência", label: "Advertência", plural: "Advertências", letter: "V", chip: "bg-orange-100 text-orange-700 dark:bg-orange-500/20 dark:text-orange-300", dot: "bg-orange-400", hex: "#fb923c" },
  { key: "acidente", value: "Acidente de Trabalho", label: "Acidente de trabalho", plural: "Acidentes de trabalho", short: "Acid. de trabalho", letter: "T", chip: "bg-violet-100 text-violet-700 dark:bg-violet-500/20 dark:text-violet-300", dot: "bg-violet-400", hex: "#a78bfa" }
];

const MOTIVO_PLURAL = { Falta: "Faltas", Atestado: "Atestados", Declaração: "Declarações", "Meio Expediente": "Meio período" };

/* Tipos de ocorrência contados nos KPIs e gráficos: os quatro motivos mais as
   duas marcações. `has(item)` diz se uma ocorrência (com motivo/advertencia/
   acidente) é daquele tipo — uma mesma ocorrência pode ser de mais de um. */
export const TIPOS = [
  ...MOTIVOS.map((m) => ({ ...m, plural: MOTIVO_PLURAL[m.value] || m.label, has: (o) => o.motivo === m.value })),
  ...FLAGS.map((f) => ({ ...f, has: (o) => !!o[f.key] }))
];

/* Ocorrência de ausência: tem motivo (≠ Presente) ou alguma marcação. */
export const isOcorrenciaAusencia = (o) => (o.motivo && o.motivo !== "Presente") || !!o.advertencia || !!o.acidente;

/* Como a célula do mapa se apresenta: `primary` (chip principal) e `flags`
   (marcações extras, desenhadas como pontos no canto). */
export function cellInfo(meta) {
  if (!meta) return null;
  const flags = FLAGS.filter((f) => meta[f.key]);
  const motivo = meta.motivo && meta.motivo !== PRESENTE.value ? motivoOf(meta.motivo) : null;
  const primary = motivo || flags[0] || (meta.motivo === PRESENTE.value ? PRESENTE : null);
  return primary ? { primary, flags: flags.filter((f) => f !== primary) } : null;
}

export function motivoOf(value) {
  if (value === PRESENTE.value) return PRESENTE;
  return MOTIVOS.find((m) => m.value === value) || null;
}

const collator = new Intl.Collator("pt-BR");
const pad = (n) => String(n).padStart(2, "0");

export function isoOf(date) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/* Dias do mês de referência `ym` (YYYY-MM): do dia 1 ao último. */
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

/* Colaboradores do mês de referência `ym`, vindos do Headcount (um por nome),
   exceto quem foi desligado antes do início do mês. `setor` é a função. */
export function monthEmployees(state, ym, period) {
  const startIso = isoOf(period.start);
  const byName = new Map();
  listHeadcountRecords(state, ym, { incluirDesligados: true }).forEach((h) => {
    const name = String(h.colaborador || "").trim();
    if (name) byName.set(name, h);
  });
  return [...byName.values()]
    .filter((h) => !h.dataDesligamento || h.dataDesligamento >= startIso)
    .map((h) => ({
      nome: String(h.colaborador).trim(),
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

/* Ocorrências indexadas por `nome|YYYY-MM-DD` (reativo: recalcula ao lançar). */
export function useOcorrenciaIndex() {
  return computed(() => {
    const map = new Map();
    getOcorrencias().forEach((o) => map.set(`${o.meta.colaborador}|${o.date}`, o));
    return map;
  });
}

export function matchesSearch(name, query) {
  const q = normalizeText(query).trim();
  return !q || normalizeText(name).includes(q);
}

/* Ocorrências de ausência (sem "Presente") do mês `ym` e do estado escolhido,
   já achatadas para os KPIs e gráficos. `ym` e `estado` são refs/getters. */
export function useMonthOcorrencias(ym, estado) {
  return computed(() => {
    const { start, end } = monthRange(ym.value);
    const from = isoOf(start);
    const to = isoOf(end);
    const uf = String(estado.value || "").toUpperCase();
    const all = !uf || uf === "TODOS";
    return getOcorrencias()
      .filter(
        (o) =>
          isOcorrenciaAusencia(o.meta) &&
          o.date >= from &&
          o.date <= to &&
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

/* Conta itens por chave (ordem decrescente, empate por nome). */
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
