<script setup>
import { ref, computed, onMounted, onUnmounted } from "vue";
import { useRouter } from "vue-router";
import Modal from "@/components/ui/Modal.vue";
import { authState, getProfile, logout, changeName, changePassword, PERFIL_LABELS } from "@/lib/auth";
import { useToast } from "@/composables/useToast";

/* `compact`: só o avatar (sidebar recolhida). */
defineProps({ compact: { type: Boolean, default: false } });

const router = useRouter();
const { show: toast } = useToast();

const open = ref(false);
const modalMode = ref(null); // "name" | "password" | null

const nameInput = ref("");
const passwordCurrent = ref("");
const passwordNew = ref("");
const passwordConfirm = ref("");
const error = ref("");
const busy = ref(false);

const profile = computed(() => authState.profile || getProfile() || {});

const initial = computed(() => (profile.value.nome || profile.value.usuario || "?").trim().charAt(0).toUpperCase());
const displayName = computed(() => profile.value.nome || profile.value.usuario || "Usuário");
const roleLabel = computed(() => PERFIL_LABELS[profile.value.perfil] || profile.value.perfil || "");

function toggle() {
  open.value = !open.value;
}

function onDocumentClick() {
  open.value = false;
}

function doLogout() {
  open.value = false;
  logout();
  router.replace("/login");
}

function openModal(mode) {
  open.value = false;
  modalMode.value = mode;
  error.value = "";
  nameInput.value = profile.value.nome || "";
  passwordCurrent.value = "";
  passwordNew.value = "";
  passwordConfirm.value = "";
}

function closeModal() {
  modalMode.value = null;
}

async function saveName() {
  error.value = "";
  const name = nameInput.value.trim();
  if (!name) {
    error.value = "Informe o nome.";
    return;
  }
  busy.value = true;
  const { error: err } = await changeName(name);
  busy.value = false;
  if (err) {
    error.value = err.message;
    return;
  }
  closeModal();
  toast("Nome atualizado.");
}

async function savePassword() {
  error.value = "";
  if (!passwordCurrent.value || !passwordNew.value || !passwordConfirm.value) {
    error.value = "Preencha todos os campos.";
    return;
  }
  if (passwordNew.value.length < 6) {
    error.value = "A nova senha deve ter no mínimo 6 caracteres.";
    return;
  }
  if (passwordNew.value !== passwordConfirm.value) {
    error.value = "As senhas não conferem.";
    return;
  }
  busy.value = true;
  const { error: err } = await changePassword(passwordCurrent.value, passwordNew.value);
  busy.value = false;
  if (err) {
    error.value = err.message;
    return;
  }
  closeModal();
  toast("Senha alterada com sucesso.");
}

onMounted(() => document.addEventListener("click", onDocumentClick));
onUnmounted(() => document.removeEventListener("click", onDocumentClick));
</script>

<template>
  <div class="relative" @click.stop>
    <button
      type="button"
      class="flex w-full items-center gap-2 rounded-lg p-1 transition hover:bg-zinc-800"
      :aria-expanded="open"
      :title="displayName"
      aria-label="Minha conta"
      @click="toggle"
    >
      <span
        class="flex h-10 w-10 items-center justify-center rounded-full bg-accent text-base font-bold text-white"
      >
        {{ initial }}
      </span>
      <span v-if="!compact" class="hidden min-w-0 flex-1 truncate text-left text-[15px] font-medium text-zinc-200 sm:inline">
        {{ displayName.split(" ")[0] }}
      </span>
    </button>

    <div
      v-if="open"
      class="absolute right-0 z-40 mt-2 w-56 md:bottom-full md:left-0 md:right-auto md:mt-0 md:mb-2 overflow-hidden rounded-xl border border-zinc-200 bg-white py-1 shadow-xl slide-up dark:border-zinc-800 dark:bg-zinc-900"
    >
      <div class="border-b border-zinc-100 px-4 py-3 dark:border-zinc-800">
        <p class="truncate text-sm font-semibold text-zinc-900 dark:text-zinc-100">{{ displayName }}</p>
        <p class="text-xs text-zinc-500 dark:text-zinc-400">{{ roleLabel }}</p>
      </div>
      <button
        type="button"
        class="block w-full px-4 py-2 text-left text-sm text-zinc-700 transition hover:bg-zinc-100 dark:text-zinc-200 dark:hover:bg-zinc-800"
        @click="openModal('name')"
      >
        Alterar nome
      </button>
      <button
        type="button"
        class="block w-full px-4 py-2 text-left text-sm text-zinc-700 transition hover:bg-zinc-100 dark:text-zinc-200 dark:hover:bg-zinc-800"
        @click="openModal('password')"
      >
        Alterar senha
      </button>
      <div class="my-1 border-t border-zinc-100 dark:border-zinc-800"></div>
      <button
        type="button"
        class="block w-full px-4 py-2 text-left text-sm text-red-600 transition hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-950/50"
        @click="doLogout"
      >
        Sair da sessão
      </button>
    </div>

    <Modal
      v-if="modalMode === 'name'"
      title="Alterar nome"
      subtitle="Altera apenas a exibição do seu nome — não afeta o login."
      max-width="max-w-md"
      @close="closeModal"
    >
      <form class="flex flex-col gap-4" @submit.prevent="saveName">
        <div class="flex flex-col gap-1.5">
          <label for="profileNameInput" class="text-sm font-medium text-zinc-700 dark:text-zinc-200">Nome de exibição</label>
          <input
            id="profileNameInput"
            v-model="nameInput"
            type="text"
            class="rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 outline-none transition focus:border-accent focus:ring-2 focus:ring-accent/20 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100"
          />
        </div>
        <p v-if="error" class="text-sm text-red-600 dark:text-red-400">{{ error }}</p>
        <div class="flex justify-end gap-2">
          <button
            type="button"
            class="rounded-lg border border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-700 transition hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-800"
            @click="closeModal"
          >
            Cancelar
          </button>
          <button
            type="submit"
            class="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-semibold text-white transition hover:bg-zinc-800 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-white"
            :disabled="busy"
          >
            {{ busy ? "Salvando..." : "Salvar" }}
          </button>
        </div>
      </form>
    </Modal>

    <Modal
      v-if="modalMode === 'password'"
      title="Alterar senha"
      max-width="max-w-md"
      @close="closeModal"
    >
      <form class="flex flex-col gap-4" @submit.prevent="savePassword">
        <div class="flex flex-col gap-1.5">
          <label for="profileCurrentPassword" class="text-sm font-medium text-zinc-700 dark:text-zinc-200">Senha atual</label>
          <input
            id="profileCurrentPassword"
            v-model="passwordCurrent"
            type="password"
            autocomplete="current-password"
            class="rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 outline-none transition focus:border-accent focus:ring-2 focus:ring-accent/20 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100"
          />
        </div>
        <div class="flex flex-col gap-1.5">
          <label for="profileNewPassword" class="text-sm font-medium text-zinc-700 dark:text-zinc-200">Nova senha</label>
          <input
            id="profileNewPassword"
            v-model="passwordNew"
            type="password"
            autocomplete="new-password"
            class="rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 outline-none transition focus:border-accent focus:ring-2 focus:ring-accent/20 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100"
          />
        </div>
        <div class="flex flex-col gap-1.5">
          <label for="profileConfirmPassword" class="text-sm font-medium text-zinc-700 dark:text-zinc-200">Confirmar nova senha</label>
          <input
            id="profileConfirmPassword"
            v-model="passwordConfirm"
            type="password"
            autocomplete="new-password"
            class="rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 outline-none transition focus:border-accent focus:ring-2 focus:ring-accent/20 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100"
          />
        </div>
        <p v-if="error" class="text-sm text-red-600 dark:text-red-400">{{ error }}</p>
        <div class="flex justify-end gap-2">
          <button
            type="button"
            class="rounded-lg border border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-700 transition hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-800"
            @click="closeModal"
          >
            Cancelar
          </button>
          <button
            type="submit"
            class="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-semibold text-white transition hover:bg-zinc-800 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-white"
            :disabled="busy"
          >
            {{ busy ? "Salvando..." : "Salvar senha" }}
          </button>
        </div>
      </form>
    </Modal>
  </div>
</template>
