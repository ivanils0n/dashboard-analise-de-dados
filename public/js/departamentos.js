/* =========================================================
   Página Departamentos — cadastro e gestão de departamentos
   ---------------------------------------------------------
   Cada departamento pertence a um estado e funciona como
   "setor" dos colaboradores. A listagem mostra métricas:
   ativos, entradas, saídas e total — segmentadas por filial
   (filtro de unidade) quando selecionada.
   ========================================================= */

const Departamentos = {
  els: {},
  editingId: null,
  branchFilter: "todos",

  init() {
    this.els = {
      form: document.getElementById("departmentForm"),
      formTitle: document.getElementById("departmentFormTitle"),
      id: document.getElementById("departmentId"),
      name: document.getElementById("departmentName"),
      short: document.getElementById("departmentShort"),
      estado: document.getElementById("departmentEstado"),
      clearBtn: document.getElementById("departmentClear"),
      search: document.getElementById("departmentSearch"),
      branchFilter: document.getElementById("deptBranchFilter"),
      branchList: document.getElementById("deptFiliaisList"),
      filterStart: document.getElementById("deptFilterStart"),
      filterEnd: document.getElementById("deptFilterEnd"),
      table: document.getElementById("departmentTable"),
      tableBody: document.querySelector("#departmentTable tbody"),
      empty: document.getElementById("departmentEmpty"),
      chip: document.getElementById("deptChip"),
      summary: document.getElementById("deptSummary")
    };
    /* Página Departamentos ausente nesta rota: não inicializa. */
    if (!this.els.form) return;
    this.bindEvents();
    if (typeof ui !== "undefined" && ui.bindStateFilter) {
      ui.bindStateFilter("departamentosStateButton", "departamentosStateMenu", "departamentosStateText", () => {
        this.populateBranchFilter(ui.currentState || DEFAULT_STATE);
        this.renderTable();
      });
    }
    [this.els.name, this.els.short].forEach(bindUppercaseInput);
    this.resetForm();
    this.populateBranchFilter(ui.currentState || DEFAULT_STATE);
  },

  bindEvents() {
    this.els.form.addEventListener("submit", (e) => this.handleSubmit(e));
    this.els.clearBtn.addEventListener("click", () => this.resetForm());
    this.els.search.addEventListener("input", () => this.renderTable());
    if (this.els.branchFilter) {
      /* Aplica o filtro apenas quando o valor corresponde a uma sigla válida
         (ou está vazio) — enquanto o usuário digita nada é alterado. */
      this.els.branchFilter.addEventListener("input", () => this.applyBranchFilter(true));
      this.els.branchFilter.addEventListener("change", () => this.applyBranchFilter(false));
    }
    if (this.els.filterStart) this.els.filterStart.addEventListener("change", () => this.renderTable());
    if (this.els.filterEnd) this.els.filterEnd.addEventListener("change", () => this.renderTable());
  },

  /* Intervalo de datas (por data de entrada) selecionado na listagem. */
  getDateRange() {
    let start = this.els.filterStart ? this.els.filterStart.value || null : null;
    let end = this.els.filterEnd ? this.els.filterEnd.value || null : null;
    if (start && end && start > end) {
      const tmp = start;
      start = end;
      end = tmp;
    }
    return { start, end };
  },

  /* Resolve o que foi digitado (sigla) para o id da filial e re-renderiza. */
  applyBranchFilter(onlyIfMatch) {
    if (!this.els.branchFilter) return;
    const v = this.els.branchFilter.value.trim();
    const state = ui.currentState || DEFAULT_STATE;
    const filiais = Filiais.list(state);
    const match = v ? filiais.find((f) => f.shortName === v) : null;
    if (onlyIfMatch && v && !match) return; // usuário ainda digitando
    this.branchFilter = match ? match.id : "todos";
    this.renderTable();
  },

  resetForm() {
    this.editingId = null;
    this.els.form.reset();
    this.els.id.value = "";
    const defaultEstado = ui && ui.currentState && ui.currentState !== "todos" ? ui.currentState : DEFAULT_STATE;
    this.els.estado.value = defaultEstado;
    this.els.formTitle.textContent = "Novo departamento";
  },

  fillForm(department) {
    this.editingId = department.id;
    this.els.id.value = department.id;
    this.els.name.value = department.name;
    this.els.short.value = department.shortName || "";
    this.els.estado.value = department.estado || "";
    this.els.formTitle.textContent = "Editar departamento";
    this.els.form.scrollIntoView({ behavior: "smooth", block: "start" });
  },

  handleSubmit(e) {
    e.preventDefault();
    const data = {
      id: this.els.id.value || undefined,
      name: this.els.name.value.trim(),
      shortName: this.els.short.value.trim().toUpperCase() || null,
      estado: this.els.estado.value || null
    };

    if (!data.name) {
      ui.toast("Informe o nome do departamento.");
      return;
    }
    if (!data.estado) {
      ui.toast("Selecione o estado do departamento.");
      return;
    }
    if (this.nameInUse(data)) return;

    this.saveDepartment(data);
    this.resetForm();
    this.renderTable();
    ui.toast(data.id ? "Departamento atualizado." : "Departamento cadastrado.");
  },

  /* Evita departamentos com o mesmo nome dentro do mesmo estado. */
  nameInUse(data) {
    const dup = Employees.departments(data.estado).find(
      (d) => d.name.toUpperCase() === data.name.toUpperCase() && d.id !== data.id
    );
    if (dup) {
      ui.toast(`Já existe o departamento "${dup.name}" no estado ${data.estado}.`);
      return true;
    }
    return false;
  },

  saveDepartment(data) {
    const now = nowLocalISO();
    const existing = data.id ? Storage.getDepartmentById(data.id) : null;
    if (existing) {
      Storage.upsertDepartment({ ...existing, ...data, updatedAt: now });
      return;
    }
    Storage.upsertDepartment({
      id: createId(),
      name: data.name,
      shortName: data.shortName,
      estado: data.estado,
      createdAt: now,
      updatedAt: now
    });
  },

  async handleDelete(id) {
    const department = Storage.getDepartmentById(id);
    if (!department) return;
    const ok = await Dialog.confirm({
      title: "Excluir departamento?",
      message: `O departamento "${department.name}" será removido. Colaboradores vinculados ficarão sem setor. Essa ação não pode ser desfeita.`,
      confirmText: "Excluir",
      danger: true
    });
    if (!ok) return;
    Storage.deleteDepartment(id);
    this.resetForm();
    this.renderTable();
    ui.toast("Departamento excluído.");
  },

  list(state) {
    return Employees.departments(state);
  },

  renderTable() {
    if (!this.els.form || !this.els.tableBody) return;
    const query = this.els.search.value.trim().toLowerCase();
    let list = this.list(ui.currentState);
    if (query) {
      list = list.filter((d) => `${d.name} ${d.shortName || ""}`.toLowerCase().includes(query));
    }
    list = list.slice().sort((a, b) => (b.createdAt || "").localeCompare(a.createdAt || ""));

    const total = this.list(ui.currentState).length;
    this.els.chip.textContent = total === 1 ? "1 departamento" : `${total} departamentos`;

    const dateRange = this.getDateRange();
    const branchName = this.branchFilter && this.branchFilter !== "todos"
      ? (Storage.getBranchById(this.branchFilter) || {}).shortName || ""
      : "";
    const filialText = branchName ? ` · filial ${branchName}` : "";
    const periodText = dateRange.start || dateRange.end
      ? ` · período ${dateRange.start || "…"} a ${dateRange.end || "…"}`
      : "";
    this.els.summary.textContent = `${total} departamento(s) · ${ui.currentState === "todos" ? "todos os estados" : "estado " + ui.currentState}${filialText}${periodText}`;

    if (!list.length) {
      this.els.tableBody.innerHTML = "";
      this.els.table.hidden = true;
      this.els.empty.hidden = false;
      return;
    }

    this.els.table.hidden = false;
    this.els.empty.hidden = true;

    this.els.tableBody.innerHTML = list
      .map((d) => {
        const m = Employees.departmentMetrics(
          d,
          ui.currentState,
          this.branchFilter !== "todos" ? this.branchFilter : null,
          dateRange
        );
        return `
        <tr>
          <td><strong>${escapeHtml(d.name)}</strong></td>
          <td>${d.shortName ? `<span class="badge badge-muted">${escapeHtml(d.shortName)}</span>` : "—"}</td>
          <td>${d.estado ? `<span class="badge">${escapeHtml(d.estado)}</span>` : "—"}</td>
          <td><span class="badge badge-accent">${m.ativos}</span></td>
          <td>${m.entradas}</td>
          <td>${m.saidas}</td>
          <td>${m.total}</td>
          <td class="col-action">
            <button class="btn btn-sm btn-outline" data-edit="${d.id}">Editar</button>
            <button class="btn-icon" data-del="${d.id}" aria-label="Excluir departamento">&times;</button>
          </td>
        </tr>`;
      })
      .join("");

    this.els.tableBody.querySelectorAll("[data-edit]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const department = Storage.getDepartmentById(btn.dataset.edit);
        if (department) this.fillForm(department);
      });
    });
    this.els.tableBody.querySelectorAll("[data-del]").forEach((btn) => {
      btn.addEventListener("click", () => this.handleDelete(btn.dataset.del));
    });
  },

  /* Popula o filtro de filial (digitação + datalist) apenas com as siglas. */
  populateBranchFilter(state) {
    const filiais = (typeof Filiais !== "undefined" && Filiais.list) ? Filiais.list(state) : [];
    if (this.els.branchList) {
      this.els.branchList.innerHTML = filiais
        .map((f) => `<option value="${escapeHtml(f.shortName)}"></option>`)
        .join("");
    }
    /* Se a filial selecionada não existe mais no estado, limpa o filtro. */
    if (this.branchFilter && this.branchFilter !== "todos") {
      const still = filiais.some((f) => f.id === this.branchFilter);
      if (!still) {
        this.branchFilter = "todos";
        if (this.els.branchFilter) this.els.branchFilter.value = "";
      }
    }
  }
};
