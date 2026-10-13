<script setup>
import { useCountUpText } from "@/composables/useCountUp";

const props = defineProps({
  text: { type: [String, Number], default: "" }
});

const display = useCountUpText(() => props.text);
</script>

<template>
  <span class="tabular-nums">{{ display }}</span>
</template>
