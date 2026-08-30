/* =========================================================
   Autenticação — login com credenciais do Supabase Auth
   ---------------------------------------------------------
   - login(): valida usuário (ex.: "ivan" -> ivan@gente.gestao)
     + senha via signInWithPassword
   - O token da sessão fica salvo no localStorage por 6 horas;
     após esse prazo (ou sem sessão), um novo login é exigido.
   - O perfil (nome, usuário, perfil) é salvo junto com a sessão
     e usado para controlar o acesso por perfil:
       admin     : tudo + gestão de usuários
       analista  : tudo (dados), sem gestão de usuários
       visitante : somente leitura do dashboard
   - Menu do usuário na topbar: avatar com a inicial do nome,
     alterar nome (não afeta o login), alterar senha e sair.
   - requireAuth(): usado pelas páginas internas — redireciona
     para /login/ sem sessão válida.
   ========================================================= */

/* global supabase */

const AUTH_STORAGE_KEY = "gg-auth";
const AUTH_DURATION_MS = 6 * 60 * 60 * 1000; // 6 horas

/* Caminho relativo: funciona em deploy na raiz ou em subpasta
   (cada página vive em uma subpasta, login/ incluída). */
function authRel(page) {
  return "../" + page + "/";
}

function authIsLoginPage() {
  return currentPage() === "login";
}

function currentPage() {
  const meta = document.querySelector('meta[name="gg-page"]');
  return meta ? meta.getAttribute("content") : "";
}

/* Pré-carrega as demais abas (HTML fica no cache do navegador), sem
   executar o JS delas — os dados do Supabase só carregam ao clicar. */
function prefetchTabs() {
  const pages = ["dashboard", "equipe", "filiais", "usuarios"];
  const here = currentPage();
  if (typeof window.requestIdleCallback === "function") {
    window.requestIdleCallback(() => doPrefetch(pages, here), { timeout: 3000 });
  } else {
    setTimeout(() => doPrefetch(pages, here), 800);
  }
}

function doPrefetch(pages, here) {
  pages.forEach((page) => {
    if (page === here) return;
    if (document.querySelector(`link[rel="prefetch"][href="${authRel(page)}"]`)) return;
    const link = document.createElement("link");
    link.rel = "prefetch";
    link.href = authRel(page);
    document.head.appendChild(link);
  });
}

let _authClient = null;

function authSupabaseClient() {
  if (_authClient) return _authClient;
  const url = window.ENV && window.ENV.SUPABASE_URL;
  const key = window.ENV && window.ENV.SUPABASE_ANON_KEY;
  if (!url || !key) return null;
  try {
    _authClient = supabase.createClient(url, key);
  } catch (err) {
    console.error("[Auth] Falha ao criar o client:", err);
    _authClient = null;
  }
  return _authClient;
}

/* Constrói o e-mail completo a partir do usuário digitado.
   Aceita "ivan" ou um e-mail completo "ivan@gente.gestao". */
function buildLoginEmail(value) {
  const v = String(value || "").trim();
  if (!v) return "";
  if (v.indexOf("@") !== -1) return v.toLowerCase();
  const domain = typeof AUTH_EMAIL_DOMAIN !== "undefined" ? AUTH_EMAIL_DOMAIN : "gente.gestao";
  return v.toLowerCase() + "@" + domain;
}

const PERFIL_LABELS = {
  admin: "Administrador",
  analista: "Analista",
  visitante: "Visitante"
};

const Auth = {
  key: AUTH_STORAGE_KEY,
  durationMs: AUTH_DURATION_MS,

  _read() {
    try {
      const raw = localStorage.getItem(this.key);
      return raw ? JSON.parse(raw) : null;
    } catch (e) {
      return null;
    }
  },

  _write(data) {
    try {
      localStorage.setItem(this.key, JSON.stringify(data));
    } catch (e) {}
  },

  _clear() {
    try {
      localStorage.removeItem(this.key);
    } catch (e) {}
  },

  /* Remove a sessão gravada pelo supabase-js (chaves sb-*-auth-token) */
  _clearSupabaseKeys() {
    try {
      const toRemove = [];
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (k && k.indexOf("sb-") === 0 && k.indexOf("-auth-token") !== -1) {
          toRemove.push(k);
        }
      }
      toRemove.forEach((k) => localStorage.removeItem(k));
    } catch (e) {}
  },

  /* Retorna o token se a sessão for válida (dentro das 6 horas);
     caso contrário, limpa tudo e devolve null. */
  getToken() {
    const data = this._read();
    if (!data || !data.token) return null;
    if (!data.expiresAt || Date.now() > data.expiresAt) {
      this._clear();
      this._clearSupabaseKeys();
      return null;
    }
    return data.token;
  },

  isAuthenticated() {
    return !!this.getToken();
  },

  getProfile() {
    const data = this._read();
    return data && data.profile ? data.profile : null;
  },

  /* Carrega o perfil do usuário logado (public.usuarios) e salva na sessão.
     Usa a RPC meu_perfil (security definer) — resolve por id ou e-mail — e
     cai para a consulta direta apenas se a função ainda não existir. */
  async loadProfile(client, userId, email) {
    if (!client || !userId) return null;
    let data = null;

    try {
      const { data: rows, error } = await client.rpc("meu_perfil");
      if (error) {
        console.warn("[Auth] RPC meu_perfil indisponível:", error.message);
      } else if (rows && rows.length) {
        data = rows[0];
      }
    } catch (err) {
      console.warn("[Auth] Falha ao chamar meu_perfil:", err);
    }

    if (!data) {
      // Fallback: consulta direta na tabela (caso a função não exista no banco)
      try {
        let query = client
          .from("usuarios")
          .select("id, email, usuario, nome, perfil, ativo");
        if (email) {
          query = query.or(`id.eq.${userId},email.eq.${encodeURIComponent(email)}`);
        } else {
          query = query.eq("id", userId);
        }
        const { data: row, error } = await query.maybeSingle();
        if (error) {
          console.warn("[Auth] Não foi possível carregar o perfil:", error.message);
        } else {
          data = row;
        }
      } catch (err) {
        console.error("[Auth] Erro ao carregar perfil:", err);
      }
    }

    if (!data) {
      console.warn("[Auth] Perfil não encontrado no banco (userId:", userId, ")");
      return null;
    }

    const profile = {
      id: data.id,
      email: data.email,
      usuario: data.usuario,
      nome: data.nome || data.usuario || "",
      perfil: data.perfil || "visitante"
    };
    const prev = this._read() || {};
    this._write({ ...prev, profile });
    console.info("[Auth] Perfil carregado:", profile);
    return profile;
  },

  /* Garante que o perfil esteja disponível e atualizado.
     Busca no Supabase; se falhar, mantém o perfil salvo. */
  async ensureProfile() {
    const stored = this.getProfile();
    const data = this._read();
    const userId = data && data.user ? data.user.id : null;
    const email = data && data.user ? data.user.email : null;
    const client = authSupabaseClient();
    const fetched = await this.loadProfile(client, userId, email);
    console.info("[Auth] ensureProfile ->", fetched ? fetched.perfil : "sem perfil (usando salvo)");
    return fetched || stored;
  },

  saveSession(session) {
    const prev = this._read() || {};
    this._write({
      token: session.access_token,
      user: session.user
        ? { id: session.user.id, email: session.user.email }
        : prev.user || null,
      profile: prev.profile || null,
      expiresAt: Date.now() + this.durationMs
    });
    this._scheduleExpiryLogout();
  },

  /* Agenda o logout automático exatamente no momento em que a sessão
     expira (6 horas), deslogando e indo para a tela de login. */
  _scheduleExpiryLogout() {
    clearTimeout(this._expiryTimer);
    const data = this._read();
    if (!data || !data.expiresAt) return;
    const remaining = data.expiresAt - Date.now();
    if (remaining <= 0) {
      this.logout();
      return;
    }
    this._expiryTimer = setTimeout(() => this.logout(), remaining);
  },

  async login(identifier, password) {
    const client = authSupabaseClient();
    if (!client) {
      return { error: { message: "Credenciais do Supabase não configuradas." } };
    }
    const email = buildLoginEmail(identifier);
    if (!email) return { error: { message: "Informe o usuário." } };
    console.info("[Auth] Tentando login com e-mail:", email);

    const { data, error } = await client.auth.signInWithPassword({ email, password });
    if (error) {
      console.warn("[Auth] Login rejeitado:", error.message);
      return { error };
    }

    console.info("[Auth] Login OK (user:", data.session.user.id, ")");
    this.saveSession(data.session);
    await this.loadProfile(client, data.session.user.id, data.session.user.email);
    console.info("[Auth] Login concluído. Perfil:", this.getProfile());
    return { data };
  },

  /* Troca a senha do usuário logado. Reautentica com a senha atual
     primeiro para garantir que a sessão é recente (exigência do GoTrue). */
  async changePassword(currentPassword, newPassword) {
    const client = authSupabaseClient();
    if (!client) {
      return { error: { message: "Credenciais do Supabase não configuradas." } };
    }
    const data = this._read();
    const profile = this.getProfile();
    const email =
      (data && data.user && data.user.email) ||
      (profile && profile.email) ||
      "";
    if (!email) return { error: { message: "Não foi possível identificar o usuário." } };

    const { error: reauthError } = await client.auth.signInWithPassword({ email, password: currentPassword });
    if (reauthError) return { error: { message: "Senha atual incorreta." } };

    const { data: upd, error } = await client.auth.updateUser({ password: newPassword });
    if (error) return { error };
    if (upd && upd.session) this.saveSession(upd.session);
    return { data: upd };
  },

  /* Altera o nome de exibição do próprio usuário (não afeta o login) */
  async changeName(newName) {
    const client = authSupabaseClient();
    if (!client) {
      return { error: { message: "Credenciais do Supabase não configuradas." } };
    }
    const { error } = await client.rpc("atualizar_meu_nome", { p_nome: newName });
    if (error) return { error };
    const prev = this._read() || {};
    prev.profile = { ...(prev.profile || {}), nome: newName };
    this._write(prev);
    this.renderUserMenu();
    return { data: true };
  },

  logout() {
    this._clear();
    this._clearSupabaseKeys();
    const client = authSupabaseClient();
    if (client) client.auth.signOut().catch(() => {});
    location.replace(authRel("login"));
  },

  /* ---------- Perfis / permissões ---------- */

  isAdmin() {
    const p = this.getProfile();
    return !!(p && p.perfil === "admin");
  },

  canEditData() {
    const p = this.getProfile();
    return !!(p && (p.perfil === "admin" || p.perfil === "analista"));
  },

  /* Oculta a tela de carregamento após a verificação de autenticação.
     Usa dois rAF para garantir que o overlay foi pintado antes do fade. */
  hideLoading() {
    const el = document.getElementById("authLoading");
    if (!el) return;
    requestAnimationFrame(() => {
      requestAnimationFrame(() => el.classList.add("is-hidden"));
    });
  },

  /* ---------- Guardas ---------- */

  requireAuth() {
    if (!this.isAuthenticated()) {
      location.replace(authRel("login"));
      return false;
    }
    const page = currentPage();
    const profile = this.getProfile();
    if (profile) {
      if (page === "usuarios" && profile.perfil !== "admin") {
        location.replace(authRel("dashboard"));
        return false;
      }
      if (page !== "dashboard" && profile.perfil === "visitante") {
        location.replace(authRel("dashboard"));
        return false;
      }
    }
    return true;
  },

  redirectIfAuthenticated() {
    if (this.isAuthenticated()) location.replace(authRel("dashboard"));
  },

  /* ---------- UI por perfil ---------- */

  applyRoleUI() {
    const profile = this.getProfile();
    if (!profile) return;
    const isAdmin = profile.perfil === "admin";
    const canEdit = profile.perfil !== "visitante";

    // Link "Usuarios" na sidebar: só admin
    document.querySelectorAll('[data-page="usuarios"]').forEach((a) => {
      a.hidden = !isAdmin;
    });

    if (profile.perfil === "visitante") {
      document.querySelectorAll('[data-page="equipe"], [data-page="filiais"]').forEach((a) => {
        a.hidden = true;
      });
    }

    // Ações de escrita no dashboard (visível apenas para admin/analista)
    const openBtn = document.getElementById("openModalBtn");
    if (openBtn) openBtn.hidden = !canEdit;
    const clearBtn = document.getElementById("clearAllBtn");
    if (clearBtn) clearBtn.hidden = !canEdit;
    document.querySelectorAll('[data-menu="import"]').forEach((a) => {
      a.hidden = !canEdit;
    });
  },

  /* ---------- Menu do usuário (topbar) ---------- */

  renderUserMenu() {
    const container = document.getElementById("userMenu");
    if (!container) return;
    const profile = this.getProfile() || {};

    const nome = profile.nome || profile.usuario || "Usuário";
    const inicial = (nome.trim().charAt(0) || "?").toUpperCase();
    const perfilLabel = PERFIL_LABELS[profile.perfil] || profile.perfil || "";

    container.innerHTML = `
      <div class="dropdown user-menu">
        <button type="button" class="user-avatar-btn" id="userAvatarBtn" aria-haspopup="true" aria-expanded="false" title="${escapeHtml(nome)}" aria-label="Minha conta">
          <span class="user-avatar" id="userAvatar">${escapeHtml(inicial)}</span>
          <span class="user-menu-name">${escapeHtml(nome.split(" ")[0])}</span>
        </button>
        <div class="dropdown-menu user-dropdown" id="userDropdown" hidden>
          <div class="user-dropdown-header">
            <span class="user-dropdown-name" id="userMenuName">${escapeHtml(nome)}</span>
            <span class="user-dropdown-role">${escapeHtml(perfilLabel)}</span>
          </div>
          <button type="button" class="dropdown-item" data-profile-action="name">Alterar nome</button>
          <button type="button" class="dropdown-item" data-profile-action="password">Alterar senha</button>
          <hr class="dropdown-sep">
          <button type="button" class="dropdown-item js-logout-btn">Sair da sessão</button>
        </div>
      </div>
    `;

    const btn = container.querySelector("#userAvatarBtn");
    const menu = container.querySelector("#userDropdown");
    if (btn && menu) {
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        const open = btn.getAttribute("aria-expanded") === "true";
        btn.setAttribute("aria-expanded", String(!open));
        menu.hidden = open;
      });
      container.querySelectorAll("[data-profile-action]").forEach((item) => {
        item.addEventListener("click", () => {
          menu.hidden = true;
          btn.setAttribute("aria-expanded", "false");
          const action = item.dataset.profileAction;
          if (action === "name") this.openNameModal();
          else if (action === "password") this.openPasswordModal();
        });
      });
      container.querySelectorAll(".js-logout-btn").forEach((item) => {
        item.addEventListener("click", (e) => {
          e.preventDefault();
          this.logout();
        });
      });
      document.addEventListener("click", () => {
        menu.hidden = true;
        btn.setAttribute("aria-expanded", "false");
      });
    }
  },

  /* ---------- Modal do perfil (alterar nome / senha) ---------- */

  _ensureProfileModal() {
    if (this._profileModalOverlay) return this._profileModalOverlay;
    const overlay = document.createElement("div");
    overlay.className = "modal-overlay";
    overlay.id = "profileModalOverlay";
    overlay.hidden = true;
    overlay.innerHTML = `
      <div class="modal" role="dialog" aria-modal="true" aria-labelledby="profileModalTitle">
        <div class="modal-header">
          <h2 id="profileModalTitle"></h2>
          <button type="button" class="icon-btn" id="profileModalClose" aria-label="Fechar">&times;</button>
        </div>
        <div class="modal-body" id="profileModalBody"></div>
      </div>`;
    document.body.appendChild(overlay);
    this._profileModalOverlay = overlay;

    overlay.querySelector("#profileModalClose").addEventListener("click", () => this._closeProfileModal());
    overlay.addEventListener("click", (e) => {
      if (e.target === overlay) this._closeProfileModal();
    });
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && !overlay.hidden) this._closeProfileModal();
    });
    return overlay;
  },

  _closeProfileModal() {
    const overlay = this._profileModalOverlay;
    if (!overlay || overlay.hidden) return;
    overlay.hidden = true;
    document.body.style.overflow = "";
  },

  _openProfileModal(title, bodyHtml) {
    const overlay = this._ensureProfileModal();
    overlay.querySelector("#profileModalTitle").textContent = title;
    overlay.querySelector("#profileModalBody").innerHTML = bodyHtml;
    overlay.hidden = false;
    document.body.style.overflow = "hidden";
  },

  _toast(message) {
    let el = document.getElementById("gg-toast");
    if (!el) {
      el = document.createElement("div");
      el.className = "toast";
      el.id = "gg-toast";
      el.hidden = true;
      document.body.appendChild(el);
    }
    el.textContent = message;
    el.hidden = false;
    clearTimeout(this._toastTimer);
    this._toastTimer = setTimeout(() => {
      el.hidden = true;
    }, 2600);
  },

  openNameModal() {
    const profile = this.getProfile() || {};
    const current = profile.nome || "";
    this._openProfileModal(
      "Alterar nome",
      `<form id="profileNameForm" novalidate>
        <div class="field">
          <label for="profileNameInput">Nome de exibição</label>
          <input type="text" id="profileNameInput" class="input" value="${escapeHtml(current)}" required>
          <p class="field-hint">Altera apenas a exibição do seu nome — não afeta o login.</p>
        </div>
        <p class="login-error" id="profileNameError" hidden></p>
        <div class="modal-footer">
          <button type="button" class="btn btn-outline" id="profileNameCancel">Cancelar</button>
          <button type="submit" class="btn btn-primary">Salvar</button>
        </div>
      </form>`
    );

    const form = document.getElementById("profileNameForm");
    const input = document.getElementById("profileNameInput");
    const errorEl = document.getElementById("profileNameError");
    document.getElementById("profileNameCancel").addEventListener("click", () => this._closeProfileModal());
    input.focus();
    input.select();

    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      const name = input.value.trim();
      if (!name) {
        errorEl.textContent = "Informe o nome.";
        errorEl.hidden = false;
        return;
      }
      const { error } = await this.changeName(name);
      if (error) {
        errorEl.textContent = error.message;
        errorEl.hidden = false;
        return;
      }
      this._closeProfileModal();
      this._toast("Nome atualizado.");
    });
  },

  openPasswordModal() {
    this._openProfileModal(
      "Alterar senha",
      `<form id="profilePasswordForm" novalidate>
        <div class="field">
          <label for="profileCurrentPassword">Senha atual</label>
          <input type="password" id="profileCurrentPassword" class="input" autocomplete="current-password" required>
        </div>
        <div class="field">
          <label for="profileNewPassword">Nova senha</label>
          <input type="password" id="profileNewPassword" class="input" autocomplete="new-password" required>
        </div>
        <div class="field">
          <label for="profileConfirmPassword">Confirmar nova senha</label>
          <input type="password" id="profileConfirmPassword" class="input" autocomplete="new-password" required>
        </div>
        <p class="login-error" id="profilePasswordError" hidden></p>
        <div class="modal-footer">
          <button type="button" class="btn btn-outline" id="profilePasswordCancel">Cancelar</button>
          <button type="submit" class="btn btn-primary">Salvar senha</button>
        </div>
      </form>`
    );

    const form = document.getElementById("profilePasswordForm");
    const currentEl = document.getElementById("profileCurrentPassword");
    const newEl = document.getElementById("profileNewPassword");
    const confirmEl = document.getElementById("profileConfirmPassword");
    const errorEl = document.getElementById("profilePasswordError");
    document.getElementById("profilePasswordCancel").addEventListener("click", () => this._closeProfileModal());
    currentEl.focus();

    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      errorEl.hidden = true;
      const current = currentEl.value;
      const next = newEl.value;
      if (!current || !next) {
        errorEl.textContent = "Preencha todos os campos.";
        errorEl.hidden = false;
        return;
      }
      if (next.length < 6) {
        errorEl.textContent = "A nova senha deve ter no mínimo 6 caracteres.";
        errorEl.hidden = false;
        return;
      }
      if (next !== confirmEl.value) {
        errorEl.textContent = "As senhas não conferem.";
        errorEl.hidden = false;
        return;
      }
      const { error } = await this.changePassword(current, next);
      if (error) {
        errorEl.textContent = error.message;
        errorEl.hidden = false;
        return;
      }
      this._closeProfileModal();
      this._toast("Senha alterada com sucesso.");
    });
  }
};

/* Guard executado no carregamento do script:
   - página de login  -> se já autenticado, vai para o dashboard
   - páginas internas -> sem sessão válida, vai para o login
   - perfis restritos -> visitante só no dashboard; usuarios só admin */
(function initAuthGuard() {
  if (authIsLoginPage()) {
    if (Auth.isAuthenticated()) location.replace(authRel("dashboard"));
    return;
  }
  Auth.requireAuth();
})();

/* Expiração em tempo real: mesmo com a aba aberta, após as 6 horas
   a sessão é invalidada e um novo login é solicitado. */
setInterval(() => {
  if (authIsLoginPage()) return;
  if (!Auth.isAuthenticated()) location.replace(authRel("login"));
}, 30 * 1000);

/* Reage à perda de sessão no lado do Supabase (ex.: token de refresh
   inválido/expirado): desloga e volta para a tela de login. */
function watchSupabaseAuthState() {
  const client = authSupabaseClient();
  if (!client) return;
  client.auth.onAuthStateChange((event) => {
    if (event === "SIGNED_OUT" && !authIsLoginPage()) {
      Auth._clear();
      Auth._clearSupabaseKeys();
      location.replace(authRel("login"));
    }
  });
}

/* Ao carregar a página interna: atualiza o perfil, monta o menu do
   usuário, aplica a interface conforme o perfil e pré-carrega as abas. */
document.addEventListener("DOMContentLoaded", async () => {
  if (authIsLoginPage()) return;
  watchSupabaseAuthState();
  const loadingFallback = setTimeout(() => Auth.hideLoading(), 6000);
  await Auth.ensureProfile();
  clearTimeout(loadingFallback);
  Auth.requireAuth();
  Auth.renderUserMenu();
  Auth.applyRoleUI();
  Auth._scheduleExpiryLogout();
  prefetchTabs();
  Auth.hideLoading();
});
