/* =========================================================
   Página Filiais — cadastro e gestão de filiais
   ========================================================= */

const Filiais = {
  els: {},
  editingId: null,

  init() {
    this.els = {
      form: document.getElementById("branchForm"),
      formTitle: document.getElementById("branchFormTitle"),
      id: document.getElementById("branchId"),
      branchId: document.getElementById("branchIdFilial"),
      cnpj: document.getElementById("branchCnpj"),
      name: document.getElementById("branchName"),
      shortName: document.getElementById("branchShort"),
      manager: document.getElementById("branchManager"),
      estado: document.getElementById("branchEstado"),
      clearBtn: document.getElementById("branchClear"),
      search: document.getElementById("branchSearch"),
      table: document.getElementById("branchTable"),
      tableBody: document.querySelector("#branchTable tbody"),
      empty: document.getElementById("branchEmpty"),
      chip: document.getElementById("branchChip"),
      summary: document.getElementById("branchSummary")
    };
    this.bindEvents();
    if (typeof ui !== "undefined" && ui.bindStateFilter) {
      ui.bindStateFilter("filiaisStateButton", "filiaisStateMenu", "filiaisStateText", () => this.renderTable());
    }
    if (typeof ui !== "undefined" && ui.bindExportImport) {
      ui.bindExportImport("filiais");
    }
    [this.els.name, this.els.shortName].forEach(bindUppercaseInput);
    this.resetForm();
  },

  bindEvents() {
    this.els.form.addEventListener("submit", (e) => this.handleSubmit(e));
    this.els.clearBtn.addEventListener("click", () => this.resetForm());
    this.els.search.addEventListener("input", () => this.renderTable());
  },

  resetForm() {
    this.editingId = null;
    this.els.form.reset();
    this.els.id.value = "";
    const defaultEstado = ui && ui.currentState && ui.currentState !== "todos" ? ui.currentState : DEFAULT_STATE;
    this.els.estado.value = defaultEstado;
    this.els.formTitle.textContent = "Nova filial";
  },

  fillForm(branch) {
    this.editingId = branch.id;
    this.els.id.value = branch.id;
    this.els.branchId.value = branch.branchId;
    this.els.cnpj.value = branch.cnpj;
    this.els.name.value = branch.name;
    this.els.shortName.value = branch.shortName;
    this.els.manager.value = branch.manager || "";
    this.els.estado.value = branch.estado || "";
    this.els.formTitle.textContent = "Editar filial";
    this.els.form.scrollIntoView({ behavior: "smooth", block: "start" });
  },

  handleSubmit(e) {
    e.preventDefault();
    const data = {
      id: this.els.id.value || undefined,
      branchId: this.els.branchId.value.trim().toUpperCase(),
      cnpj: this.els.cnpj.value.trim(),
      name: this.els.name.value.trim(),
      shortName: this.els.shortName.value.trim().toUpperCase(),
      manager: this.els.manager.value.trim() || null,
      estado: this.els.estado.value || null
    };

    if (!data.branchId || !data.cnpj || !data.name || !data.shortName) {
      ui.toast("Preencha os campos obrigatórios (Id, CNPJ, Nome e Abreviado).");
      return;
    }
    if (!data.estado) {
      ui.toast("Selecione o estado da filial.");
      return;
    }

    this.saveBranch(data);
    this.resetForm();
    this.renderTable();
    ui.toast(data.id ? "Filial atualizada." : "Filial cadastrada.");
  },

  saveBranch(data) {
    const now = nowLocalISO();
    const existing = data.id ? Storage.getBranchById(data.id) : null;
    if (existing) {
      Storage.upsertBranch({ ...existing, ...data, updatedAt: now });
      return;
    }
    Storage.upsertBranch({
      id: createId(),
      branchId: data.branchId,
      cnpj: data.cnpj,
      name: data.name,
      shortName: data.shortName,
      manager: data.manager,
      estado: data.estado,
      createdAt: now,
      updatedAt: now
    });
  },

  async handleDelete(id) {
    const ok = await Dialog.confirm({
      title: "Excluir filial?",
      message: "A filial será removida permanentemente. Essa ação não pode ser desfeita.",
      confirmText: "Excluir",
      danger: true
    });
    if (!ok) return;
    Storage.deleteBranch(id);
    this.resetForm();
    this.renderTable();
    ui.toast("Filial excluída.");
  },

  list(state) {
    const all = Storage.getBranches();
    if (state && state !== "todos") {
      return all.filter((b) => (b.estado || null) === state);
    }
    return all;
  },

  renderTable() {
    const query = this.els.search.value.trim().toLowerCase();
    let list = this.list(ui.currentState);
    if (query) {
      list = list.filter((b) =>
        `${b.branchId} ${b.cnpj} ${b.name} ${b.shortName} ${b.manager || ""}`.toLowerCase().includes(query)
      );
    }
    list = list.slice().sort((a, b) => (b.createdAt || "").localeCompare(a.createdAt || ""));

    const total = this.list(ui.currentState).length;
    this.els.chip.textContent = total === 1 ? "1 filial" : `${total} filiais`;

    const porEstado = total === 0
      ? "Nenhuma filial no estado selecionado"
      : `${total} filial(ais) · ${ui.currentState === "todos" ? "todos os estados" : "estado " + ui.currentState}`;
    this.els.summary.textContent = porEstado;

    if (!list.length) {
      this.els.tableBody.innerHTML = "";
      this.els.table.hidden = true;
      this.els.empty.hidden = false;
      return;
    }

    this.els.table.hidden = false;
    this.els.empty.hidden = true;

    this.els.tableBody.innerHTML = list
      .map((b) => `
        <tr>
          <td><strong>${escapeHtml(b.branchId)}</strong></td>
          <td>${escapeHtml(b.cnpj)}</td>
          <td>${escapeHtml(b.name)}</td>
          <td><span class="badge badge-muted">${escapeHtml(b.shortName)}</span></td>
          <td>${b.manager ? escapeHtml(b.manager) : "—"}</td>
          <td>${b.estado ? `<span class="badge">${escapeHtml(b.estado)}</span>` : "—"}</td>
          <td class="col-action">
            <button class="btn btn-sm btn-outline" data-edit="${b.id}">Editar</button>
            <button class="btn-icon" data-del="${b.id}" aria-label="Excluir filial">&times;</button>
          </td>
        </tr>`)
      .join("");

    this.els.tableBody.querySelectorAll("[data-edit]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const branch = Storage.getBranchById(btn.dataset.edit);
        if (branch) this.fillForm(branch);
      });
    });
    this.els.tableBody.querySelectorAll("[data-del]").forEach((btn) => {
      btn.addEventListener("click", () => this.handleDelete(btn.dataset.del));
    });
  }
};
