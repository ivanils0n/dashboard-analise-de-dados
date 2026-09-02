import { reactive } from "vue";

/* Filtros da aba Equipe (compartilhados entre a view e o painel lateral). */
export const equipeFilter = reactive({
  status: "todos",
  department: "todos",
  start: "",
  end: "",
  search: ""
});

export function useEquipeFilters() {
  function reset() {
    equipeFilter.status = "todos";
    equipeFilter.department = "todos";
    equipeFilter.start = "";
    equipeFilter.end = "";
    equipeFilter.search = "";
  }

  return { equipeFilter, reset };
}
