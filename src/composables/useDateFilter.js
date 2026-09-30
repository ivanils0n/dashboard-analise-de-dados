import { reactive } from "vue";
import { monthYm, firstDayOfYm, lastDayOfYm } from "@/lib/utils";

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
