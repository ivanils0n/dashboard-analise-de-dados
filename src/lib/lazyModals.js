import { defineAsyncComponent } from "vue";

const loaders = new Set();

export function lazyModal(loader) {
  loaders.add(loader);
  return defineAsyncComponent({ loader, delay: 0 });
}

let prefetched = false;

export function prefetchModals() {
  if (prefetched) return;
  prefetched = true;
  const queue = [...loaders];
  const step = (deadline) => {
    while (queue.length && (!deadline || deadline.timeRemaining() > 4)) {
      queue.shift()().catch(() => {});
    }
    if (queue.length) schedule();
  };
  const schedule = () =>
    typeof requestIdleCallback === "function"
      ? requestIdleCallback(step, { timeout: 5000 })
      : setTimeout(() => step(null), 1500);
  schedule();
}
