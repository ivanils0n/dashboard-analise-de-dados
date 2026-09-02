import { reactive } from "vue";
import { firstDayOfMonthISO, lastDayOfMonthISO } from "@/lib/utils";

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
