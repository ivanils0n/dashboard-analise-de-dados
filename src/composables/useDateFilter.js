import { reactive } from "vue";
import { monthYm, firstDayOfYm, lastDayOfYm } from "@/lib/utils";

/* Filtro de período do dashboard (compartilhado entre a view e o painel).
   Sempre parte do mês anterior ao corrente (revisão do mês fechado), tanto na
   Visão geral quanto no Painel. */
function previousMonthRange() {
  const ym = monthYm(-1);
  return { start: firstDayOfYm(ym), end: lastDayOfYm(ym) };
}

export const dateFilter = reactive(previousMonthRange());

export function useDateFilter() {
  function reset() {
    Object.assign(dateFilter, previousMonthRange());
  }

  return { dateFilter, reset };
}
