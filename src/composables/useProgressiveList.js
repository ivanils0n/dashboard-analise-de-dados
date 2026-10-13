import { computed, ref, onBeforeUnmount } from "vue";

const runIdle = (fn) =>
  typeof requestIdleCallback === "function"
    ? requestIdleCallback(fn, { timeout: 300 })
    : setTimeout(fn, 16);
const cancelIdle = (id) =>
  typeof cancelIdleCallback === "function" ? cancelIdleCallback(id) : clearTimeout(id);

export function useProgressiveList(source, { initial = 60, step = 150 } = {}) {
  const limit = ref(initial);
  let handle = null;
  let seen = null;
  let total = 0;

  function stop() {
    if (handle !== null) cancelIdle(handle);
    handle = null;
  }

  function grow() {
    handle = null;
    if (limit.value >= total) return;
    limit.value = Math.min(total, limit.value + step);
    if (limit.value < total) handle = runIdle(grow);
  }

  function restart() {
    stop();
    limit.value = initial;
    if (total > initial) handle = runIdle(grow);
  }

  onBeforeUnmount(stop);

  return computed(() => {
    const list = source.value || [];
    const lim = limit.value;
    total = list.length;
    if (list !== seen) {
      seen = list;
      queueMicrotask(restart);
      return list.length > initial ? list.slice(0, initial) : list;
    }
    return list.length > lim ? list.slice(0, lim) : list;
  });
}
