<script setup>
import { ref, watch, onMounted, nextTick } from "vue";

/* Texto longo em célula/lista: mostra só as primeiras `lines` linhas com "..."
   e, se ficou cortado, um clique expande o texto completo (outro clique
   recolhe). Texto que cabe inteiro não é clicável. */
const props = defineProps({
  text: { type: String, default: "" },
  lines: { type: Number, default: 3 }
});

const el = ref(null);
const expanded = ref(false);
const clamped = ref(false);

/* Só dá pra medir o corte com o texto recolhido; expandido, mantém o último
   resultado (assim o clique de recolher continua disponível). */
function measure() {
  if (expanded.value || !el.value) return;
  clamped.value = el.value.scrollHeight > el.value.clientHeight + 1;
}

onMounted(measure);
watch(
  () => props.text,
  () => {
    expanded.value = false;
    nextTick(measure);
  }
);

function toggle() {
  if (clamped.value) expanded.value = !expanded.value;
}
</script>

<template>
  <div
    ref="el"
    class="break-words"
    :class="[
      expanded ? '' : 'overflow-hidden',
      clamped ? 'cursor-pointer hover:text-zinc-900 dark:hover:text-zinc-100' : ''
    ]"
    :style="expanded ? null : { display: '-webkit-box', WebkitBoxOrient: 'vertical', WebkitLineClamp: lines }"
    :title="clamped ? (expanded ? 'Clique para recolher' : 'Clique para ver o texto completo') : undefined"
    :role="clamped ? 'button' : undefined"
    :tabindex="clamped ? 0 : undefined"
    :aria-expanded="clamped ? expanded : undefined"
    @click="toggle"
    @keydown.enter.prevent="toggle"
    @keydown.space.prevent="toggle"
  >
    {{ text }}
  </div>
</template>
