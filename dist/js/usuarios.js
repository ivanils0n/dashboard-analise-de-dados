/* =========================================================
   Página Usuários — cadastro e gestão de usuários (admin)
   ========================================================= */

const Usuarios = {
  els: {},

  init() {
    this.els = {
      btnNovo: document.getElementById("novoUsuarioBtn"),
      count: document.getElementById("usuariosCount"),
      tableBody: document.querySelector("#usuariosTable tbody"),
      empty: document.getElementById("usuariosEmpty"),
      modalOverlay: document.getElementById("usuariosModalOverlay"),
      modalClose: document.getElementById("usuariosModalClose"),
      modalCancel: document.getElementById("usuariosModalCancel"),
      form: document.getElementById("usuarioForm"),
      usuario: document.getElementById("usuarioUsuario"),
      nome: document.getElementById("usuarioNome"),
      perfil: document.getElementById("usuarioPerfil"),
      senha: document.getElementById("usuarioSenha"),
      error: document.getElementById("usuarioFormError"),
      submitBtn: document.getElementById("usuarioSubmit")
    };

    Dialog.init();
    this.bindToggles();
    this.bindModal();
    this.load();
  },

  bindToggles() {
    const sidebarToggle = document.getElementById("sidebarToggle");
    if (sidebarToggle) {
      sidebarToggle.addEventListener("click", () => {
        document.querySelector(".layout").classList.toggle("is-sidebar-hidden");
      });
    }
    document.querySelectorAll(".js-theme-toggle").forEach((btn) => {
      btn.addEventListener("click", () => {
        const html = document.documentElement;
        const dark = html.getAttribute("data-theme") === "dark";
        html.setAttribute("data-theme", dark ? "light" : "dark");
        safeSetItem("gg-theme", dark ? "light" : "dark");
      });
    });
  },

  bindModal() {
    this.els.btnNovo.addEventListener("click", () => this.openModal());
    this.els.modalClose.addEventListener("click", () => this.closeModal());
    this.els.modalCancel.addEventListener("click", () => this.closeModal());
    this.els.modalOverlay.addEventListener("click", (e) => {
      if (e.target === this.els.modalOverlay) this.closeModal();
    });
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && !this.els.modalOverlay.hidden) this.closeModal();
    });
    this.els.form.addEventListener("submit", (e) => this.handleCreate(e));
  },

  openModal() {
    this.els.form.reset();
    this.els.error.hidden = true;
    this.els.modalOverlay.hidden = false;
    document.body.style.overflow = "hidden";
    this.els.usuario.focus();
  },

  closeModal() {
    this.els.modalOverlay.hidden = true;
    document.body.style.overflow = "";
  },

  async load() {
    const client = authSupabaseClient();
    if (!client) {
      this.toast("Sem conexão com o Supabase.");
      return;
    }
    let users = null;

    // RPC listar_usuarios (security definer): retorna todos para o admin,
    // independente de divergências de id entre auth e perfil.
    try {
      const { data, error } = await client.rpc("listar_usuarios");
      if (error) {
        console.warn("[Usuarios] RPC listar_usuarios indisponível:", error.message);
      } else {
        users = data;
      }
    } catch (err) {
      console.warn("[Usuarios] Falha ao chamar listar_usuarios:", err);
    }

    if (users === null) {
      // Fallback: consulta direta (caso a função não exista no banco)
      try {
        const { data, error } = await client.from("usuarios").select("*").order("usuario");
        if (error) {
          console.error("[Usuarios]", error.message);
          this.toast(error.message || "Não foi possível carregar os usuários.");
          return;
        }
        users = data || [];
      } catch (err) {
        console.error("[Usuarios] Erro ao carregar:", err);
        this.toast("Não foi possível carregar os usuários.");
        return;
      }
    }

    this.render((users || []).filter((u) => u.perfil));
  },

  render(users) {
    const tbody = this.els.tableBody;
    if (!users.length) {
      this.els.empty.hidden = false;
      tbody.innerHTML = "";
      this.els.count.textContent = "0 usuários";
      return;
    }
    this.els.empty.hidden = true;
    const labels = { admin: "Administrador", analista: "Analista", visitante: "Visitante" };
    tbody.innerHTML = users
      .map(
        (u) => `
      <tr>
        <td><span class="badge">${escapeHtml(u.usuario)}</span></td>
        <td>${escapeHtml(u.nome || "—")}</td>
        <td>${escapeHtml(labels[u.perfil] || u.perfil)}</td>
        <td>${escapeHtml(u.email || "—")}</td>
        <td>${formatDateTime(u.criado_em)}</td>
        <td class="col-action">
          <button class="btn-icon" data-remove="${escapeHtml(u.id)}" aria-label="Excluir usuário" title="Excluir usuário">&times;</button>
        </td>
      </tr>`
      )
      .join("");
    this.els.count.textContent = `${users.length} usuário(s)`;

    tbody.querySelectorAll("[data-remove]").forEach((btn) => {
      btn.addEventListener("click", () => this.handleDelete(btn.dataset.remove, users));
    });
  },

  async handleDelete(id, users) {
    const u = users.find((x) => x.id === id);
    if (!u) return;
    const ok = await Dialog.confirm({
      title: "Excluir usuário?",
      message: `O usuário "${u.usuario}" (${u.nome || u.email}) será removido e perderá o acesso.`,
      confirmText: "Excluir",
      danger: true
    });
    if (!ok) return;
    const client = authSupabaseClient();
    console.info("[Usuarios] Excluindo usuário:", u.usuario, "(" + u.id + ")");
    const { error } = await client.rpc("excluir_usuario", { p_id: id });
    if (error) {
      console.error("[Usuarios]", error.message);
      this.toast(error.message || "Não foi possível excluir o usuário.");
      return;
    }
    console.info("[Usuarios] Usuário excluído (auth + perfil).");
    // Remove da listagem imediatamente e reconcilia com o banco
    const remaining = users.filter((x) => x.id !== id);
    this.render(remaining);
    this.toast("Usuário excluído.");
    this.load();
  },

  async handleCreate(e) {
    e.preventDefault();
    const usuario = this.els.usuario.value.trim().toLowerCase();
    const nome = this.els.nome.value.trim();
    const perfil = this.els.perfil.value;
    const senha = this.els.senha.value;

    if (!usuario || !nome || !senha) {
      this.showError("Preencha todos os campos.");
      return;
    }
    if (senha.length < 6) {
      this.showError("A senha deve ter no mínimo 6 caracteres.");
      return;
    }

    this.els.submitBtn.disabled = true;
    const client = authSupabaseClient();
    console.info("[Usuarios] Criando usuário:", usuario, "(" + perfil + ")");
    const { error } = await client.rpc("criar_usuario", {
      p_nome: nome,
      p_usuario: usuario,
      p_perfil: perfil,
      p_senha: senha
    });
    this.els.submitBtn.disabled = false;

    if (error) {
      console.error("[Usuarios]", error.message);
      this.showError(error.message);
      return;
    }
    console.info("[Usuarios] Usuário criado:", usuario);
    this.closeModal();
    this.toast(`Usuário "${usuario}" criado.`);
    this.load();
  },

  showError(message) {
    this.els.error.textContent = message;
    this.els.error.hidden = false;
  },

  toast(message) {
    const el = document.getElementById("toast");
    el.textContent = message;
    el.hidden = false;
    clearTimeout(this._toastTimer);
    this._toastTimer = setTimeout(() => {
      el.hidden = true;
    }, 2600);
  }
};

document.addEventListener("DOMContentLoaded", () => {
  Usuarios.init();
});
