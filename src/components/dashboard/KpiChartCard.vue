<script setup>
import { ref, computed, onMounted } from "vue";
import LineChart from "@/components/charts/LineChart.vue";
import BarChart from "@/components/charts/BarChart.vue";
import PieChart from "@/components/charts/PieChart.vue";
import Badge from "@/components/ui/Badge.vue";
import { getIndicatorById } from "@/lib/config";

const props = defineProps({
  card: { type: Object, required: true },
  entries: { type: Array, default: () => [] },
  pieData: { type: Array, default: () => [] },
  barData: { type: Array, default: () => [] },
  showValues: { type: Boolean, default: false }
});

const flash = ref(false);
let flashTimer = null;

const indicator = computed(() => getIndicatorById(props.card.id) || { id: props.card.id, name: props.card.title });

onMounted(() => {
  flash.value = true;
  flashTimer = setTimeout(() => (flash.value = false), 1800);
});
</script>

<template>
  <div
    class="w-[280px] shrink-0 rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-900"
    :class="flash ? 'is-flash' : ''"
  >
    <div class="mb-3 flex items-start justify-between gap-2">
      <div>
        <h3 class="text-sm font-semibold text-zinc-900 dark:text-zinc-100">{{ card.title }}</h3>
        <span class="text-xs text-zinc-500 dark:text-zinc-400">{{ card.sub }}</span>
      </div>
      <Badge v-if="card.unit" tone="accent">{{ card.unit }}</Badge>
    </div>

    <PieChart v-if="card.kind === 'pie'" :data="pieData" :show-values="showValues" height="h-52" />
    <BarChart v-else-if="card.kind === 'bar'" :data="barData" />
    <LineChart v-else :indicator="indicator" :entries="entries" :show-values="showValues" />
  </div>
</template>
