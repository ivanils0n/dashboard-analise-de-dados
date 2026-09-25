/* Marcação de "mês incompleto": avisa quem abre o dashboard que aquele mês
   ainda não tem todas as informações lançadas.

   É gravada como um lançamento especial (indicador "mes_incompleto", data =
   1º dia do mês, um por estado), na aba dedicada "meses_incompletos" (ver
   backend-sheets/src/db/tables.ts) — a existência da linha já é o marcador,
   sem nenhum outro dado. Reaproveita getEntriesFor/addEntry/removeEntries e a
   fila de escrita do store/db já existentes, e a marca fica compartilhada
   entre usuários. Não pertence a INDICATORS, então não aparece em KPIs,
   gráficos, tabela de lançamentos nem na exportação. */
import { STATES } from "./config";
import { getEntriesFor, addEntry, removeEntries } from "./store";
import { firstDayOfYm, sameState } from "./utils";

export const INCOMPLETE_MONTH_IND = "mes_incompleto";

/* "todos" marca/desmarca os três estados de uma vez. */
function targetStates(state) {
  return !state || state === "todos" ? STATES.slice() : [state];
}

/* Lançamentos de marcação do mês, indexados pelo estado. */
function marksOf(ym, states) {
  const day = firstDayOfYm(ym);
  const marks = new Map();
  getEntriesFor(INCOMPLETE_MONTH_IND).forEach((entry) => {
    if (entry.date !== day) return;
    const estado = states.find((s) => sameState(entry.meta && entry.meta.estado, s));
    if (estado) marks.set(estado, [...(marks.get(estado) || []), entry]);
  });
  return marks;
}

/* Estados (dentre os do filtro) em que o mês está marcado como incompleto. */
export function incompleteStates(ym, state) {
  if (!ym) return [];
  return [...marksOf(ym, targetStates(state)).keys()];
}

export function setMonthIncomplete(ym, state, incomplete) {
  if (!ym) return;
  const states = targetStates(state);
  const marks = marksOf(ym, states);

  if (incomplete) {
    states.forEach((s) => {
      if (!marks.has(s)) addEntry(INCOMPLETE_MONTH_IND, { date: firstDayOfYm(ym), value: 1, state: s });
    });
    return;
  }

  const rows = [];
  marks.forEach((entries) =>
    entries.forEach((entry) => rows.push({ indicatorId: INCOMPLETE_MONTH_IND, entry }))
  );
  removeEntries(rows);
}
