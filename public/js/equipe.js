/* =========================================================
   Página Equipe — cadastro e gestão de colaboradores
   ========================================================= */

const Equipe = {
  els: {},
  editingId: null,
  departmentFilter: "todos",

  init() {
    this.els = {
      form: document.getElementById("employeeForm"),
      formTitle: document.getElementById("employeeFormTitle"),
      id: document.getElementById("employeeId"),
      name: document.getElementById("employeeName"),
      sector: document.getElementById("employeeSector"),
      branch: document.getElementById("employeeBranch"),
      branchList: document.getElementById("filiaisDatalist"),
      user: document.getElementById("employeeUser"),
      hiredAt: document.getElementById("employeeHiredAt"),
      status: document.getElementById("employeeStatus"),
      firedAt: document.getElementById("employeeFiredAt"),
      firedAtField: document.getElementById("employeeFiredAtField"),
      type: document.getElementById("employeeType"),
      estado: document.getElementById("employeeEstado"),
      clearBtn: document.getElementById("employeeClear"),
      search: document.getElementById("employeeSearch"),
      statusFilter: document.getElementById("employeeStatusFilter"),
      table: document.getElementById("employeeTable"),
      tableBody: document.querySelector("#employeeTable tbody"),
      empty: document.getElementById("employeeEmpty"),
      chip: document.getElementById("teamChip"),
      summary: document.getElementById("teamSummary"),
      filterStart: document.getElementById("equipeFilterStart"),
      filterEnd: document.getElementById("equipeFilterEnd"),
      filterClear: document.getElementById("equipeFilterClear")
    };
    /* Página Equipe ausente nesta rota (ex.: /dashboard): não inicializa. */
    if (!this.els.form) return;
    this.bindEvents();
    if (typeof ui !== "undefined" && ui.bindStateFilter) {
      ui.bindStateFilter("equipeStateButton", "equipeStateMenu", "equipeStateText", () => this.renderTable());
    }
    [this.els.name].forEach(bindUppercaseInput);
    this.els.estado.addEventListener("change", () => {
      const state = this.els.estado.value || ui.currentState || DEFAULT_STATE;
      this.populateSectorOptions(state);
      this.populateBranchDatalist(state);
    });
    this.resetForm();
  },

  bindEvents() {
    this.els.form.addEventListener("submit", (e) => this.handleSubmit(e));
    this.els.clearBtn.addEventListener("click", () => this.resetForm());
    this.els.search.addEventListener("input", () => this.renderTable());
    this.els.status.addEventListener("change", () => this.toggleFiredAtField());
    if (this.els.statusFilter) this.els.statusFilter.addEventListener("change", () => this.renderTable());
    if (this.els.filterStart) this.els.filterStart.addEventListener("change", () => this.renderTable());
    if (this.els.filterEnd) this.els.filterEnd.addEventListener("change", () => this.renderTable());
    if (this.els.filterClear) this.els.filterClear.addEventListener("click", () => {
      this.els.filterStart.value = "";
      this.els.filterEnd.value = "";
      this.renderTable();
    });
  },

  /* ---------- Departamentos (setor) e filiais no formulário ---------- */

  populateSectorOptions(state) {
    if (!this.els.sector) return;
    const deps = Employees.departments(state);
    if (!deps.length) {
      this.els.sector.innerHTML =
        '<option value="">— Cadastre um departamento (aba Departamentos) —</option>';
      return;
    }
    const current = this.els.sector.value;
    this.els.sector.innerHTML =
      '<option value="">— Selecione —</option>' +
      deps
        .map(
          (d) =>
            `<option value="${escapeHtml(d.name)}" data-department-id="${escapeHtml(d.id)}">${escapeHtml(d.name)}${d.shortName ? " (" + escapeHtml(d.shortName) + ")" : ""}</option>`
        )
        .join("");
    if (current) this.els.sector.value = current;
  },

  setSector(value) {
    const opts = Array.from(this.els.sector.options);
    const match = opts.find((o) => o.value === value);
    if (match) {
      this.els.sector.value = value;
      return;
    }
    const opt = document.createElement("option");
    opt.value = value || "";
    opt.textContent = value ? value + " (não cadastrado)" : "";
    this.els.sector.appendChild(opt);
    this.els.sector.value = value || "";
  },

  populateBranchDatalist(state) {
    if (!this.els.branchList) return;
    const filiais = (typeof Filiais !== "undefined" && Filiais.list) ? Filiais.list(state) : [];
    /* Exibe apenas o nome abreviado (sigla) da filial para busca/seleção. */
    this.els.branchList.innerHTML = filiais
      .map((f) => `<option value="${escapeHtml(f.shortName)}"></option>`)
      .join("");
  },

  /* Resolve a filial digitada/selecionada pela sigla (nome abreviado). */
  resolveBranch(value) {
    const v = String(value || "").trim();
    if (!v) return null;
    const state = this.els.estado.value || ui.currentState || DEFAULT_STATE;
    const filiais = Filiais.list(state);
    return filiais.find((f) => f.shortName === v) || null;
  },

  toggleFiredAtField() {
    const isDesligado = this.els.status.value === "desligado";
    this.els.firedAtField.hidden = !isDesligado;
    if (isDesligado && !this.els.firedAt.value) {
      this.els.firedAt.value = todayISO();
    }
  },

  resetForm() {
    this.editingId = null;
    this.els.form.reset();
    this.els.id.value = "";
    this.els.hiredAt.value = todayISO();
    this.els.firedAt.value = "";
    this.els.firedAtField.hidden = true;
    const defaultEstado = ui && ui.currentState && ui.currentState !== "todos" ? ui.currentState : DEFAULT_STATE;
    this.els.estado.value = defaultEstado;
    this.populateSectorOptions(defaultEstado);
    this.populateBranchDatalist(defaultEstado);
    this.els.formTitle.textContent = "Novo colaborador";
  },

  fillForm(employee) {
    this.editingId = employee.id;
    this.els.id.value = employee.id;
    this.els.name.value = employee.name;
    this.els.user.value = employee.user;
    this.els.hiredAt.value = employee.hiredAt ? employee.hiredAt.split("T")[0] : "";
    this.els.status.value = employee.status;
    this.els.firedAt.value = employee.firedAt ? employee.firedAt.split("T")[0] : "";
    this.toggleFiredAtField();
    this.els.type.value = employee.type;
    this.els.estado.value = employee.estado || "";
    this.populateSectorOptions(employee.estado || ui.currentState || DEFAULT_STATE);
    this.setSector(employee.sector);
    this.populateBranchDatalist(employee.estado || ui.currentState || DEFAULT_STATE);
    const filial = employee.filialId ? Storage.getBranchById(employee.filialId) : null;
    this.els.branch.value = filial ? filial.shortName : "";
    this.els.formTitle.textContent = "Editar colaborador";
    this.els.form.scrollIntoView({ behavior: "smooth", block: "start" });
  },

  handleSubmit(e) {
    e.preventDefault();
    const sectorOption = this.els.sector.selectedIndex >= 0
      ? this.els.sector.options[this.els.sector.selectedIndex]
      : null;
    const filial = this.resolveBranch(this.els.branch ? this.els.branch.value : "");
    const data = {
      id: this.els.id.value || undefined,
      name: this.els.name.value.trim(),
      sector: this.els.sector.value.trim(),
      departmentId: sectorOption && sectorOption.dataset.departmentId ? sectorOption.dataset.departmentId : null,
      filialId: filial ? filial.id : null,
      user: this.els.user.value.trim(),
      hiredAt: this.els.hiredAt.value || null,
      status: this.els.status.value,
      type: this.els.type.value,
      estado: this.els.estado.value || null
    };
    /* Turnover automático: novos colaboradores entram no cálculo; em edições
       o valor atual do colaborador é preservado. */
    if (!data.id) data.countsTurnover = true;

    if (data.status === "desligado" && this.els.firedAt.value) {
      data.firedAt = this.els.firedAt.value + "T00:00:00";
    }

    if (!data.name || !data.sector || !data.user) {
      ui.toast("Preencha todos os campos obrigatórios.");
      return;
    }
    if (!data.estado) {
      ui.toast("Selecione o estado do colaborador.");
      return;
    }
    /* Normaliza para meia-noite local (mesmo padrão do firedAt) */
    data.hiredAt = data.hiredAt ? data.hiredAt + "T00:00:00" : null;

    Employees.save(data);
    Employees.syncAll();
    this.resetForm();
    ui.renderAll();
    this.renderTable();
    ui.toast(data.id ? "Colaborador atualizado." : "Colaborador cadastrado.");
  },

  async handleDelete(id) {
    const ok = await Dialog.confirm({
      title: "Excluir colaborador?",
      message: "Os indicadores da equipe serão recalculados. Essa ação não pode ser desfeita.",
      confirmText: "Excluir",
      danger: true
    });
    if (!ok) return;
    Employees.remove(id);
    this.resetForm();
    ui.renderAll();
    this.renderTable();
    ui.toast("Colaborador excluído.");
  },

  renderTable() {
    if (!this.els.form || !this.els.tableBody) return;
    const query = this.els.search.value.trim().toLowerCase();
    let list = Employees.list(ui.currentState);
    if (query) {
      list = list.filter((e) => {
        const filial = e.filialId ? Storage.getBranchById(e.filialId) : null;
        const filialText = filial ? `${filial.shortName} ${filial.name}` : "";
        return `${e.name} ${e.sector} ${e.user} ${filialText}`.toLowerCase().includes(query);
      });
    }
    if (this.departmentFilter && this.departmentFilter !== "todos") {
      const dep = Storage.getDepartmentById(this.departmentFilter);
      const depName = dep ? dep.name : null;
      list = list.filter((e) =>
        e.departmentId === this.departmentFilter || (depName && e.sector === depName)
      );
    }
    const statusFilter = this.els.statusFilter ? this.els.statusFilter.value : "todos";
    if (statusFilter !== "todos") {
      list = list.filter((e) => e.status === statusFilter);
    }
    const start = this.els.filterStart ? this.els.filterStart.value : "";
    const end = this.els.filterEnd ? this.els.filterEnd.value : "";
    if (start || end) {
      list = list.filter((e) => {
        const d = e.hiredAt ? e.hiredAt.split("T")[0] : "";
        if (start && (!d || d < start)) return false;
        if (end && (!d || d > end)) return false;
        return true;
      });
    }
    list = list.slice().sort((a, b) => b.createdAt.localeCompare(a.createdAt));

    const total = Employees.list(ui.currentState).length;
    this.els.chip.textContent = total === 1 ? "1 colaborador" : `${total} colaboradores`;

    const ativos = Employees.list(ui.currentState).filter((e) => e.status === "ativo").length;
    const desligados = Employees.list(ui.currentState).filter((e) => e.status === "desligado").length;
    this.els.summary.textContent = `${ativos} ativos · ${desligados} desligados`;

    if (!list.length) {
      this.els.tableBody.innerHTML = "";
      this.els.table.hidden = true;
      this.els.empty.hidden = false;
      return;
    }

    this.els.table.hidden = false;
    this.els.empty.hidden = true;

    this.els.tableBody.innerHTML = list
      .map((e) => {
        const statusClass = e.status === "desligado" ? "badge-dark" : e.status === "afastado" ? "badge-muted" : "badge";
        const filial = e.filialId ? Storage.getBranchById(e.filialId) : null;
        return `
        <tr>
          <td><strong>${escapeHtml(e.name)}</strong></td>
          <td>${escapeHtml(e.sector)}</td>
          <td>${filial ? `<span class="badge badge-muted">${escapeHtml(filial.shortName)}</span>` : "—"}</td>
          <td>${escapeHtml(e.user)}</td>
          <td><span class="${statusClass}">${STATUS_LABELS[e.status] || e.status}</span></td>
          <td>${TYPE_LABELS[e.type] || e.type}</td>
          <td>${e.hiredAt ? escapeHtml(formatDate(e.hiredAt)) : "—"}</td>
          <td>${escapeHtml(formatDateTime(e.createdAt))}</td>
          <td>${escapeHtml(formatDateTime(e.updatedAt))}</td>
          <td>${e.countsTurnover ? '<span class="check-mark" title="Conta no turnover">✓</span>' : "—"}</td>
          <td class="col-action">
            <button class="btn btn-sm btn-outline" data-edit="${e.id}">Editar</button>
            <button class="btn-icon" data-del="${e.id}" aria-label="Excluir colaborador">&times;</button>
          </td>
        </tr>`;
      })
      .join("");

    this.els.tableBody.querySelectorAll("[data-edit]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const employee = Storage.getEmployeeById(btn.dataset.edit);
        if (employee) this.fillForm(employee);
      });
    });
    this.els.tableBody.querySelectorAll("[data-del]").forEach((btn) => {
      btn.addEventListener("click", () => this.handleDelete(btn.dataset.del));
    });
  }
};