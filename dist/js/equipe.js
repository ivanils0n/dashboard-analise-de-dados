/* =========================================================
   Página Equipe — cadastro e gestão de colaboradores
   ========================================================= */

const Equipe = {
  els: {},
  editingId: null,

  init() {
    this.els = {
      form: document.getElementById("employeeForm"),
      formTitle: document.getElementById("employeeFormTitle"),
      id: document.getElementById("employeeId"),
      name: document.getElementById("employeeName"),
      sector: document.getElementById("employeeSector"),
      user: document.getElementById("employeeUser"),
      hiredAt: document.getElementById("employeeHiredAt"),
      status: document.getElementById("employeeStatus"),
      firedAt: document.getElementById("employeeFiredAt"),
      firedAtField: document.getElementById("employeeFiredAtField"),
      type: document.getElementById("employeeType"),
      estado: document.getElementById("employeeEstado"),
      countsTurnover: document.getElementById("employeeCountsTurnover"),
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
    this.bindEvents();
    if (typeof ui !== "undefined" && ui.bindStateFilter) {
      ui.bindStateFilter("equipeStateButton", "equipeStateMenu", "equipeStateText", () => this.renderTable());
    }
    [this.els.name, this.els.sector].forEach(bindUppercaseInput);
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
    this.els.countsTurnover.checked = true;
    const defaultEstado = ui && ui.currentState && ui.currentState !== "todos" ? ui.currentState : DEFAULT_STATE;
    this.els.estado.value = defaultEstado;
    this.els.formTitle.textContent = "Novo colaborador";
  },

  fillForm(employee) {
    this.editingId = employee.id;
    this.els.id.value = employee.id;
    this.els.name.value = employee.name;
    this.els.sector.value = employee.sector;
    this.els.user.value = employee.user;
    this.els.hiredAt.value = employee.hiredAt ? employee.hiredAt.split("T")[0] : "";
    this.els.status.value = employee.status;
    this.els.firedAt.value = employee.firedAt ? employee.firedAt.split("T")[0] : "";
    this.toggleFiredAtField();
    this.els.type.value = employee.type;
    this.els.estado.value = employee.estado || "";
    this.els.countsTurnover.checked = !!employee.countsTurnover;
    this.els.formTitle.textContent = "Editar colaborador";
    this.els.form.scrollIntoView({ behavior: "smooth", block: "start" });
  },

  handleSubmit(e) {
    e.preventDefault();
    const data = {
      id: this.els.id.value || undefined,
      name: this.els.name.value.trim(),
      sector: this.els.sector.value.trim(),
      user: this.els.user.value.trim(),
      hiredAt: this.els.hiredAt.value || null,
      status: this.els.status.value,
      type: this.els.type.value,
      estado: this.els.estado.value || null,
      countsTurnover: this.els.countsTurnover.checked
    };

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
    const query = this.els.search.value.trim().toLowerCase();
    let list = Employees.list(ui.currentState);
    if (query) {
      list = list.filter((e) =>
        `${e.name} ${e.sector} ${e.user}`.toLowerCase().includes(query)
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
        return `
        <tr>
          <td><strong>${escapeHtml(e.name)}</strong></td>
          <td>${escapeHtml(e.sector)}</td>
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