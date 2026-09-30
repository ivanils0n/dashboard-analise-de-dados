import { reactive } from "vue";

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
  if (loading.count === 0) loading.label = DEFAULT_LABEL;
}
