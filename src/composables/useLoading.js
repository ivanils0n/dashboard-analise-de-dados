import { reactive } from "vue";

/* Estado global de carregamento. Um contador permite que várias operações
   simultâneas (ex.: hidratar mais de um estado) mantenham a tela visível até
   que a última termine. */
const DEFAULT_LABEL = "Carregando informações...";
const loading = reactive({ count: 0, label: DEFAULT_LABEL });

export function useLoading() {
  return loading;
}

export function beginLoading(label) {
  if (label) loading.label = label;
  loading.count += 1;
}

export function endLoading() {
  loading.count = Math.max(0, loading.count - 1);
  /* O rótulo de uma operação específica ("Carregando período anterior...")
     não pode vazar para o próximo carregamento genérico. */
  if (loading.count === 0) loading.label = DEFAULT_LABEL;
}
