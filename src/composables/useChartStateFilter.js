import { ref } from "vue";
import { hydrateState } from "@/lib/db";

/* Filtro de estado próprio de um gráfico (Treinamento, Tempo médio de
   contratação, ...) — independente do filtro de estado da aba. Cada chamada
   cria uma instância própria (não é um singleton compartilhado): gráficos
   distintos mantêm seus filtros de forma independente um do outro. Começa
   em "RO" por padrão. Garante que o estado escolhido esteja carregado em
   memória antes de filtrar (o app carrega os dados de cada estado sob
   demanda). */
export function useChartStateFilter() {
  const chartStateFilter = ref("RO");

  async function setChartStateFilter(v) {
    chartStateFilter.value = v;
    await hydrateState(v);
  }

  return { chartStateFilter, setChartStateFilter };
}
