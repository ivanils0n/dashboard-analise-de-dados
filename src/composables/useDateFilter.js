import { reactive } from "vue";
import { firstDayOfMonthISO, lastDayOfMonthISO, monthYm, firstDayOfYm, lastDayOfYm } from "@/lib/utils";

/* Filtro de período do dashboard (compartilhado entre a view e o painel). */
export const dateFilter = reactive({
  start: firstDayOfMonthISO(),
  end: lastDayOfMonthISO()
});

export function useDateFilter() {
  function reset() {
    dateFilter.start = firstDayOfMonthISO();
    dateFilter.end = lastDayOfMonthISO();
  }

  return { dateFilter, reset };
}

/* O Cockpit segue o mesmo filtro de período compartilhado com a Visão geral
   (não tem filtro próprio), mas ao ser aberto pela primeira vez na sessão
   deve partir do mês anterior (revisão do mês fechado), em vez do mês
   corrente usado por padrão na Visão geral. Aplicado uma única vez — trocas
   de período feitas depois pelo usuário não são sobrescritas ao reabrir a
   aba. */
let cockpitDefaultApplied = false;
export function applyCockpitDefaultDateOnce() {
  if (cockpitDefaultApplied) return;
  cockpitDefaultApplied = true;
  const ym = monthYm(-1);
  dateFilter.start = firstDayOfYm(ym);
  dateFilter.end = lastDayOfYm(ym);
}
