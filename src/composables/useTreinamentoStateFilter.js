import { ref } from "vue";
import { hydrateState } from "@/lib/db";

/* Filtro de estado próprio de um gráfico de Treinamento (usado tanto na
   Visão geral quanto no Cockpit) — independente do filtro de estado da aba.
   Cada chamada cria uma instância própria (não é um singleton
   compartilhado): os dois gráficos mantêm seus filtros de forma
   independente um do outro. Começa em "RO" por padrão. Garante que o
   estado escolhido esteja carregado em memória antes de filtrar (o app
   carrega os dados de cada estado sob demanda). */
export function useTreinamentoStateFilter() {
  const treinamentoStateFilter = ref("RO");

  async function setTreinamentoStateFilter(v) {
    treinamentoStateFilter.value = v;
    await hydrateState(v);
  }

  return { treinamentoStateFilter, setTreinamentoStateFilter };
}
