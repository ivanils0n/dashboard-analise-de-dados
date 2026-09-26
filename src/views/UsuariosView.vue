<script setup>
import { ref, reactive, onActivated } from "vue";
import Badge from "@/components/ui/Badge.vue";
import EmptyState from "@/components/ui/EmptyState.vue";
import Modal from "@/components/ui/Modal.vue";
import { useToast } from "@/composables/useToast";
import { useDialog } from "@/composables/useDialog";
import { beginLoading, endLoading } from "@/composables/useLoading";
import { apiFetch } from "@/lib/api";
import { formatDateTime } from "@/lib/utils";

const { show: toast } = useToast();
const { confirm } = useDialog();

const users = ref([]);
const loading = ref(true);
const modalOpen = ref(false);
const busy = ref(false);
const error = ref("");

const form = reactive({
  usuario: "",
  nome: "",
  perfil: "analista",
  senha: ""
});

const PERFIL_LABELS = { admin: "Administrador", analista: "Analista", visitante: "Visitante" };

async function load() {
  loading.value = true;
  beginLoading("Carregando usuários...");
  try {
    // Sem limit a API devolve só os 50 primeiros (ver utils/pagination.ts).
    const response = await apiFetch("/api/users?limit=500");
    users.value = (response.data || []).filter((u) => u.perfil);
  } catch (err) {
    console.error("[Usuarios] Erro ao carregar:", err);
    toast(err.message || "Não foi possível carregar os usuários.");
  } finally {
    loading.value = false;
    endLoading();
  }
}

function openModal() {
  form.usuario = "";
  form.nome = "";
  form.perfil = "analista";
  form.senha = "";
  error.value = "";
  modalOpen.value = true;
}

async function handleCreate() {
  error.value = "";
  const usuario = form.usuario.trim().toLowerCase();
  const nome = form.nome.trim();
  const senha = form.senha;

  if (!usuario || !nome || !senha) {
    error.value = "Preencha todos os campos.";
    return;
  }
  if (senha.length < 6) {
    error.value = "A senha deve ter no mínimo 6 caracteres.";
    return;
  }

  busy.value = true;
  try {
    await apiFetch("/api/users", {
      method: "POST",
      body: { nome, usuario, perfil: form.perfil, senha }
    });
    modalOpen.value = false;
    toast(`Usuário "${usuario}" criado.`);
    load();
  } catch (err) {
    error.value = err.message;
  } finally {
    busy.value = false;
  }
}

async function handleDelete(id) {
  const u = users.value.find((x) => x.id === id);
  if (!u) return;
  const ok = await confirm({
    title: "Excluir usuário?",
    message: `O usuário "${u.usuario}" (${u.nome || u.email}) será removido e perderá o acesso.`,
    confirmText: "Excluir",
    danger: true
  });
  if (!ok) return;
  try {
    await apiFetch(`/api/users/${id}`, { method: "DELETE" });
    toast("Usuário excluído.");
    load();
  } catch (err) {
    toast(err.message || "Não foi possível excluir o usuário.");
  }
}

/* Recarrega ao entrar na aba (e no primeiro acesso), já que a view fica em
   cache pelo KeepAlive. */
onActivated(load);
</script>

<template>
  <div>
    <!-- ===== HERO ===== -->
    <div class="mb-6 flex flex-wrap items-center justify-between gap-4">
      <div class="flex items-center gap-3">
        <h1 class="text-2xl font-bold text-zinc-900 dark:text-zinc-100">Usuários</h1>
        <button
          type="button"
          class="flex h-9 w-9 items-center justify-center rounded-full bg-accent text-xl font-bold text-white transition hover:bg-accent-hover"
          title="Novo usuário"
          aria-label="Novo usuário"
          @click="openModal"
        >
          +
        </button>
      </div>
      <Badge tone="accent">{{ users.length === 1 ? "1 usuário" : `${users.length} usuários` }}</Badge>
    </div>

    <!-- ===== LISTA ===== -->
    <section class="rounded-2xl border border-zinc-200 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
      <div class="border-b border-zinc-100 px-5 py-4 dark:border-zinc-800">
        <h2 class="text-sm font-bold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">Usuários cadastrados</h2>
        <p class="mt-0.5 text-xs text-zinc-400 dark:text-zinc-400">Perfis de acesso ao sistema</p>
      </div>

      <div v-if="loading" class="p-8 text-center text-sm text-zinc-400 dark:text-zinc-400">Carregando usuários...</div>

      <div v-else-if="users.length" class="max-h-[420px] overflow-auto">
        <table class="w-full text-left text-sm">
          <thead class="sticky top-0 z-10 bg-white dark:bg-zinc-900">
            <tr class="border-b border-zinc-100 text-xs uppercase tracking-wide text-zinc-400 dark:border-zinc-800 dark:text-zinc-400">
              <th class="px-5 py-3 font-semibold">Usuário</th>
              <th class="px-5 py-3 font-semibold">Nome</th>
              <th class="px-5 py-3 font-semibold">Perfil</th>
              <th class="px-5 py-3 font-semibold">Cadastro</th>
              <th class="px-5 py-3"></th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="u in users" :key="u.id" class="border-b border-zinc-100 last:border-0 dark:border-zinc-800">
              <td class="px-5 py-3"><Badge>{{ u.usuario }}</Badge></td>
              <td class="px-5 py-3 text-zinc-600 dark:text-zinc-300">{{ u.nome || "—" }}</td>
              <td class="px-5 py-3 text-zinc-600 dark:text-zinc-300">{{ PERFIL_LABELS[u.perfil] || u.perfil }}</td>
              <td class="px-5 py-3 text-zinc-600 dark:text-zinc-300">{{ formatDateTime(u.criado_em) }}</td>
              <td class="px-5 py-3 text-right">
                <button
                  type="button"
                  class="icon-btn-sm"
                  aria-label="Excluir usuário"
                  title="Excluir usuário"
                  @click="handleDelete(u.id)"
                >
                  &times;
                </button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <div v-else class="p-5">
        <EmptyState
          title="Nenhum usuário cadastrado"
          text="Use o botão “+” para cadastrar o primeiro usuário."
        />
      </div>
    </section>

    <Modal v-if="modalOpen" title="Novo usuário" max-width="max-w-md" @close="modalOpen = false">
      <form class="flex flex-col gap-4" novalidate @submit.prevent="handleCreate">
        <div class="flex flex-col gap-1.5">
          <label for="usuarioUsuario" class="text-sm font-medium text-zinc-700 dark:text-zinc-200">Usuário</label>
          <input id="usuarioUsuario" v-model="form.usuario" type="text" class="input-field" required placeholder="Ex.: ivan" autocomplete="off" />
        </div>
        <div class="flex flex-col gap-1.5">
          <label for="usuarioNome" class="text-sm font-medium text-zinc-700 dark:text-zinc-200">Nome</label>
          <input id="usuarioNome" v-model="form.nome" type="text" class="input-field" required placeholder="Nome de exibição" />
        </div>
        <div class="flex flex-col gap-1.5">
          <label for="usuarioPerfil" class="text-sm font-medium text-zinc-700 dark:text-zinc-200">Perfil</label>
          <select id="usuarioPerfil" v-model="form.perfil" class="input-field">
            <option value="admin">Administrador</option>
            <option value="analista">Analista</option>
          </select>
        </div>
        <div class="flex flex-col gap-1.5">
          <label for="usuarioSenha" class="text-sm font-medium text-zinc-700 dark:text-zinc-200">Senha</label>
          <input id="usuarioSenha" v-model="form.senha" type="password" class="input-field" required placeholder="Mínimo 6 caracteres" autocomplete="new-password" />
        </div>
        <p v-if="error" class="text-sm text-red-600 dark:text-red-400">{{ error }}</p>
        <div class="flex justify-end gap-2 border-t border-zinc-100 pt-4 dark:border-zinc-800">
          <button type="button" class="btn-ghost" @click="modalOpen = false">Cancelar</button>
          <button type="submit" class="btn-primary" :disabled="busy">{{ busy ? "Cadastrando..." : "Cadastrar" }}</button>
        </div>
      </form>
    </Modal>
  </div>
</template>

<style scoped>
.input-field {
  border-radius: 0.5rem;
  border: 1px solid rgb(212 212 216);
  background-color: #fff;
  padding: 0.5rem 0.75rem;
  font-size: 0.875rem;
  color: rgb(24 24 27);
  outline: none;
  transition: border-color 0.15s, box-shadow 0.15s;
}
.input-field:focus {
  border-color: #E8AF3E;
  box-shadow: 0 0 0 2px rgb(232 175 62 / 0.2);
}
:global(.dark) .input-field {
  border-color: rgb(63 63 70);
  background-color: rgb(9 9 11);
  color: rgb(244 244 245);
}
.btn-primary {
  border-radius: 0.5rem;
  background-color: #E8AF3E;
  padding: 0.5rem 1rem;
  font-size: 0.875rem;
  font-weight: 600;
  color: #fff;
  transition: background-color 0.15s;
}
.btn-primary:hover {
  background-color: #B7791F;
}
.btn-primary:disabled {
  opacity: 0.6;
}
.btn-ghost {
  border-radius: 0.5rem;
  border: 1px solid rgb(212 212 216);
  padding: 0.5rem 1rem;
  font-size: 0.875rem;
  font-weight: 500;
  color: rgb(63 63 70);
  transition: background-color 0.15s;
}
.btn-ghost:hover {
  background-color: rgb(244 244 245);
}
:global(.dark) .btn-ghost {
  border-color: rgb(63 63 70);
  color: rgb(228 228 231);
}
:global(.dark) .btn-ghost:hover {
  background-color: rgb(39 39 42);
}
.icon-btn-sm {
  display: flex;
  height: 1.9rem;
  width: 1.9rem;
  align-items: center;
  justify-content: center;
  border-radius: 0.5rem;
  font-size: 1rem;
  line-height: 1;
  color: rgb(113 113 122);
  transition: background-color 0.15s, color 0.15s;
}
.icon-btn-sm:hover {
  background-color: rgb(244 244 245);
  color: rgb(24 24 27);
}
:global(.dark) .icon-btn-sm {
  color: rgb(161 161 170);
}
:global(.dark) .icon-btn-sm:hover {
  background-color: rgb(39 39 42);
  color: rgb(244 244 245);
}
</style>
