<script setup>
import { computed } from "vue";
import KpiIcon from "@/components/dashboard/KpiIcon.vue";
import { formatValue } from "@/lib/utils";
import { useCountUp } from "@/composables/useCountUp";

const props = defineProps({
  kpi: { type: Object, required: true },
  selected: { type: Boolean, default: false },
  compact: { type: Boolean, default: false }
});

const emit = defineEmits(["select", "context"]);

const PERCENT = { type: "percent", decimals: 1 };

const hasValue = computed(() => props.kpi.current !== null && props.kpi.current !== undefined);

const isPie = computed(() => props.kpi.kind === "pie");
const animatedPct = useCountUp(() => props.kpi.totalPct);
const pieText = computed(() => formatValue(PERCENT, animatedPct.value));

const currencyPrefix = computed(() =>
  props.kpi.kind !== "pie" && props.kpi.type === "currency" && hasValue.value ? "R$" : ""
);

const animatedCurrent = useCountUp(() => props.kpi.current);
const valueText = computed(() => {
  if (!hasValue.value) return "—";
  const text = formatValue({ type: props.kpi.type, decimals: props.kpi.decimals ?? 1 }, animatedCurrent.value);
  return currencyPrefix.value ? text.replace(/^R\$\s*/, "") : text;
});
</script>

<template>
  <button
    v-if="compact"
    type="button"
    class="kpi-card kpi-fluid no-callout flex min-w-0 flex-col items-center justify-center rounded-xl border bg-white text-center shadow-sm dark:bg-zinc-900"
    :class="selected
      ? 'border-accent ring-2 ring-accent/30'
      : 'border-zinc-200 hover:border-zinc-300 dark:border-zinc-800 dark:hover:border-zinc-700'"
    :title="kpi.desc"
    :aria-pressed="selected"
    @click="emit('select', kpi.id)"
    @contextmenu.prevent="emit('context', kpi.id)"
  >
    <span
      class="kpi-fluid-icon hidden shrink-0 items-center justify-center rounded-lg transition 2xl:flex"
      :class="selected
        ? 'bg-accent/10 text-accent-hover dark:text-accent-light'
        : 'bg-zinc-100 text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400'"
    >
      <KpiIcon :id="kpi.id" />
    </span>
    <span class="flex w-full min-w-0 flex-col items-center">
      <span class="kpi-fluid-name line-clamp-2 font-semibold leading-tight text-zinc-500 dark:text-zinc-400">{{ kpi.name }}</span>
      <span class="kpi-fluid-value max-w-full truncate font-bold leading-tight tabular-nums text-zinc-900 dark:text-zinc-100">
        <template v-if="isPie">{{ pieText }}</template>
        <template v-else>
          <span v-if="currencyPrefix" class="kpi-fluid-prefix mr-0.5 font-semibold text-zinc-400">{{ currencyPrefix }}</span>{{ valueText }}
        </template>
      </span>
      <span v-if="kpi.secondary" class="kpi-fluid-sub max-w-full truncate font-medium tabular-nums text-zinc-500 dark:text-zinc-400">
        {{ kpi.secondary.label }}: {{ kpi.secondary.text }}
      </span>
    </span>
  </button>
  <button
    v-else
    type="button"
    class="kpi-card no-callout flex w-[200px] min-w-0 shrink-0 flex-col items-center gap-1.5 rounded-2xl border bg-white px-2 py-2.5 sm:px-3 text-center shadow-sm dark:bg-zinc-900"
    :class="selected
      ? 'border-accent ring-2 ring-accent/30'
      : 'border-zinc-200 hover:border-zinc-300 dark:border-zinc-800 dark:hover:border-zinc-700'"
    :title="kpi.desc"
    :aria-pressed="selected"
    @click="emit('select', kpi.id)"
    @contextmenu.prevent="emit('context', kpi.id)"
  >
    <span
      class="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg transition"
      :class="selected
        ? 'bg-accent/10 text-accent-hover dark:text-accent-light'
        : 'bg-zinc-100 text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400'"
    >
      <KpiIcon :id="kpi.id" />
    </span>
    <span class="text-sm font-semibold text-zinc-600 dark:text-zinc-300">{{ kpi.name }}</span>

    <span
      v-if="isPie"
      class="max-w-full break-words text-lg font-bold sm:text-xl leading-tight tabular-nums text-zinc-900 dark:text-zinc-100"
    >
      {{ pieText }}
    </span>
    <span
      v-else
      class="max-w-full break-words text-lg font-bold sm:text-xl leading-tight tabular-nums text-zinc-900 dark:text-zinc-100"
    >
      <span v-if="currencyPrefix" class="block text-sm font-semibold text-zinc-400">{{ currencyPrefix }}</span>
      {{ valueText }}
    </span>
    <span v-if="kpi.secondary" class="max-w-full truncate text-[11px] font-medium tabular-nums text-zinc-500 dark:text-zinc-400">
      {{ kpi.secondary.label }}: {{ kpi.secondary.text }}
    </span>
  </button>
</template>

<style scoped>
.kpi-fluid {
  height: clamp(5.75rem, 14.5vh, 11rem);
  gap: clamp(0.2rem, 0.6vh, 0.5rem);
  padding: clamp(0.25rem, 0.8vh, 0.75rem) clamp(0.625rem, 0.8vw, 1.1rem);
}
.kpi-fluid-icon {
  width: clamp(1.75rem, 3vh, 2.75rem);
  height: clamp(1.75rem, 3vh, 2.75rem);
}
.kpi-fluid-icon :deep(svg) {
  width: 55%;
  height: 55%;
}
.kpi-fluid-name {
  font-size: clamp(0.85rem, min(0.94vw, 1.72vh), 1.12rem);
}
.kpi-fluid-value {
  font-size: clamp(1.12rem, min(1.5vw, 2.8vh), 1.95rem);
}
.kpi-fluid-prefix {
  font-size: 0.6em;
}
.kpi-fluid-sub {
  font-size: clamp(0.72rem, min(0.7vw, 1.3vh), 0.92rem);
}
</style>
