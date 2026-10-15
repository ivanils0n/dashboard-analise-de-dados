<script setup>
import { ref, watch } from "vue";
import Modal from "@/components/ui/Modal.vue";
import { apiFetch } from "@/lib/api";
import { activeLink, closeLink } from "@/composables/useLinks";

const src = ref("");
const error = ref("");
const loaded = ref(false);
let request = 0;

async function load(link) {
  const current = ++request;
  src.value = "";
  error.value = "";
  loaded.value = false;
  if (!link) return;
  try {
    const res = await apiFetch(`/api/links/${encodeURIComponent(link.id)}/ticket`, { method: "POST" });
    if (current !== request) return;
    src.value = res?.data?.url || "";
    if (!src.value) error.value = "Não foi possível abrir o relatório.";
  } catch (err) {
    if (current !== request) return;
    error.value = err?.message || "Não foi possível abrir o relatório.";
  }
}

watch(activeLink, load);
</script>

<template>
  <Modal v-if="activeLink" :title="activeLink.nome" fullscreen flush @close="closeLink">
    <div class="relative h-full overflow-hidden bg-white">
      <div v-if="error" class="absolute inset-0 flex flex-col items-center justify-center gap-3 p-4 text-center">
        <p class="text-sm text-zinc-600">{{ error }}</p>
        <button type="button" class="btn-ghost" @click="load(activeLink)">Tentar de novo</button>
      </div>
      <div v-else-if="!loaded" class="absolute inset-0 flex items-center justify-center" aria-busy="true">
        <span class="h-8 w-8 animate-spin rounded-full border-2 border-zinc-200 border-t-accent" aria-hidden="true"></span>
      </div>
      <iframe
        v-if="src"
        :key="src"
        :src="src"
        :title="activeLink.nome"
        class="absolute inset-0 h-full w-full border-0"
        allowfullscreen
        referrerpolicy="no-referrer"
        @load="loaded = true"
      ></iframe>
    </div>
  </Modal>
</template>
