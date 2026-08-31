/* =========================================================
   Interface — KPIs, tabela, páginas, modal dinâmico e toast
   ========================================================= */

const ui = {
  selectedIndicatorId: null,
  editingVacancyId: null,
  custoSelectedEmployeeId: null,
  currentState: typeof DEFAULT_STATE !== "undefined" ? DEFAULT_STATE : "RO",
  showKpiValues: false,

  els: {},

  cacheElements() {
    this.els = {
      pageDashboard: document.getElementById("page-dashboard"),
      pageEquipe: document.getElementById("page-equipe"),
      pageFiliais: document.getElementById("page-filiais"),
      pageDepartamentos: document.getElementById("page-departamentos"),
      sidebar: document.getElementById("sidebar"),
      sidebarToggle: document.getElementById("sidebarToggle"),
      kpiGrid: document.getElementById("kpiGrid"),
      kpiChartsValuesBtn: document.getElementById("kpiChartsValuesBtn"),
      filterStart: document.getElementById("filterStart"),
      filterEnd: document.getElementById("filterEnd"),
      filterClear: document.getElementById("filterClear"),
      tableSearch: document.getElementById("tableSearch"),
      entriesTable: document.getElementById("entriesTable"),
      entriesTableBody: document.querySelector("#entriesTable tbody"),
      emptyState: document.getElementById("emptyState"),
      clearAllBtn: document.getElementById("clearAllBtn"),
      openModalBtn: document.getElementById("openModalBtn"),
      modalOverlay: document.getElementById("modalOverlay"),
      modalClose: document.getElementById("modalClose"),
      modalCancel: document.getElementById("modalCancel"),
      modalBack: document.getElementById("modalBack"),
      modalSubmit: document.getElementById("modalSubmit"),
      modalTitle: document.getElementById("modalTitle"),
      modalSubtitle: document.getElementById("modalSubtitle"),
      modalEnterHint: document.getElementById("modalEnterHint"),
      modalTabs: document.getElementById("modalTabs"),
      modalFormBody: document.getElementById("modalFormBody"),
      entryForm: document.getElementById("entryForm"),
      entryIndicator: document.getElementById("entryIndicator"),
      menuBtn: document.getElementById("menuBtn"),
      menuMenu: document.getElementById("menuMenu"),
      importFile: document.getElementById("importFile"),
      toast: document.getElementById("toast"),
      presentationOverlay: document.getElementById("presentationOverlay"),
      presentationClose: document.getElementById("presentationClose"),
      presentationFilterStart: document.getElementById("presentationFilterStart"),
      presentationFilterEnd: document.getElementById("presentationFilterEnd"),
      presentationFilterClear: document.getElementById("presentationFilterClear"),
      presentationPrev: document.getElementById("presentationPrev"),
      presentationNext: document.getElementById("presentationNext"),
      presentationIndicatorName: document.getElementById("presentationIndicatorName"),
      presentationShowValues: document.getElementById("presentationShowValues"),
      presentationLineCard: document.getElementById("presentationLineCard"),
      presentationPieCard: document.getElementById("presentationPieCard"),
      presentationLineChart: document.getElementById("presentationLineChart"),
      presentationPieCanvas: document.getElementById("presentationPieChart"),
      filterDrawerOverlay: document.getElementById("filterDrawerOverlay"),
      filterDrawerClose: document.getElementById("filterDrawerClose"),
      filterDrawerApply: document.getElementById("filterDrawerApply"),
      filterDrawerClear: document.getElementById("filterDrawerClear")
    };
  },

  /* ---------- Sidebar (ocultar / reexibir, mantendo os ícones) ---------- */
  initSidebar() {
    if (this.els.sidebarToggle) {
      this.els.sidebarToggle.addEventListener("click", () => this.toggleSidebar());
    }
  },

  toggleSidebar() {
    document.querySelector(".layout").classList.toggle("is-sidebar-hidden");
  },

  /* ---------- Dropdown de Estado ---------- */
  initDropdownState() {
    this.bindStateFilter("stateFilterDropdownButton", "stateFilterDropdownMenu", "selectedStateText", () => this.renderAll());
  },

  /* Vincula um filtro de estado a qualquer contêiner (dashboard, equipe, filiais).
     Mantém todos os filtros de estado sincronizados e chama onChange após atualizar
     ui.currentState (RO, AM, PA ou "todos"). */
  bindStateFilter(btnId, menuId, textId, onChange) {
    const btn = document.getElementById(btnId);
    const menu = document.getElementById(menuId);
    const text = document.getElementById(textId);
    if (!btn || !menu || !text) return;

    if (!this._stateFilters) this._stateFilters = [];
    this._stateFilters.push({ btn, text, menu });

    const sync = () => {
      const current = this.currentState || "todos";
      this._stateFilters.forEach((f) => {
        f.btn.dataset.stateValue = current;
        const item = f.menu.querySelector(`[data-state-value="${current}"]`);
        if (item) f.text.textContent = item.textContent;
      });
    };

    const close = () => {
      menu.hidden = true;
      btn.setAttribute("aria-expanded", "false");
    };

    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      const isOpen = btn.getAttribute("aria-expanded") === "true";
      btn.setAttribute("aria-expanded", !isOpen);
      menu.hidden = isOpen;
    });

    menu.querySelectorAll(".dropdown-item").forEach((item) => {
      item.addEventListener("click", async (e) => {
        e.stopPropagation();
        this.currentState = item.dataset.stateValue; // Filtra dados por estado (RO, AM, PA)
        sync();
        close();
        await this.ensureStateLoaded(this.currentState);
        if (typeof onChange === "function") onChange(this.currentState);
      });
    });

    document.addEventListener("click", close);
    sync();
  },

  /* Carrega do banco apenas os dados do(s) estado(s) ainda não carregados
     (otimização: no boot só o estado padrão RO é puxado). */
  async ensureStateLoaded(state) {
    if (typeof SupabaseDB === "undefined" || !SupabaseDB.enabled) return;
    await SupabaseDB.hydrate(state);
    if (typeof Employees !== "undefined" && Employees.syncAll) Employees.syncAll();
  },

  init() {
    this.cacheElements();
    this.initSidebar();
    this.initTheme();
    this.initFiltersDrawer();
    this.initKpiValuesToggle();
    if (this.els.filterStart && this.els.filterEnd) {
      this.els.filterStart.value = firstDayOfMonthISO();
      this.els.filterEnd.value = lastDayOfMonthISO();
    }
    this.populateIndicatorSelects();
    this.bindEvents();
  },

  /* ---------- Filtros (painel lateral) ---------- */

  getActivePage() {
    if (this.els.pageDashboard && !this.els.pageDashboard.hidden) return "dashboard";
    if (this.els.pageEquipe && !this.els.pageEquipe.hidden) return "equipe";
    if (this.els.pageFiliais && !this.els.pageFiliais.hidden) return "filiais";
    if (this.els.pageDepartamentos && !this.els.pageDepartamentos.hidden) return "departamentos";
    return "dashboard";
  },

  /* Preenche o select de departamento do painel de filtros. */
  populateDrawerDepartments(state) {
    const el = document.getElementById("drawerDepartment");
    if (!el) return;
    const deps = (typeof Employees !== "undefined" && Employees.departments) ? Employees.departments(state) : [];
    el.innerHTML =
      '<option value="todos">Departamentos: Todos</option>' +
      deps.map((d) => `<option value="${escapeHtml(d.id)}">${escapeHtml(d.name)}</option>`).join("");
  },

  /* Abre o painel de filtros com os valores atuais de cada página */
  openFiltersDrawer() {
    const page = this.getActivePage();

    const estadoSel = document.getElementById("drawerEstado");
    const startInput = document.getElementById("drawerStart");
    const endInput = document.getElementById("drawerEnd");
    const statusField = document.getElementById("drawerStatusField");
    const statusSel = document.getElementById("drawerStatus");
    const deptField = document.getElementById("drawerDepartmentField");
    const branchField = document.getElementById("drawerBranchField");
    const searchInput = document.getElementById("drawerSearch");

    estadoSel.value = this.currentState || "todos";

    // Período: dashboard e equipe
    const periodField = document.getElementById("drawerPeriodField");
    periodField.hidden = page === "filiais" || page === "departamentos";

    // Status: apenas equipe
    statusField.hidden = page !== "equipe";

    // Departamento: apenas equipe
    if (deptField) {
      deptField.hidden = page !== "equipe";
      if (page === "equipe") this.populateDrawerDepartments(this.currentState);
    }

    // Filial: apenas departamentos
    if (branchField) {
      branchField.hidden = page !== "departamentos";
      if (page === "departamentos" && typeof Departamentos !== "undefined") {
        Departamentos.populateBranchFilter(this.currentState);
      }
    }

    if (page === "dashboard") {
      startInput.value = this.els.filterStart.value;
      endInput.value = this.els.filterEnd.value;
      if (searchInput) searchInput.value = this.els.tableSearch.value;
    } else if (page === "equipe") {
      startInput.value = Equipe.els.filterStart.value;
      endInput.value = Equipe.els.filterEnd.value;
      statusSel.value = Equipe.els.statusFilter.value;
      if (searchInput) searchInput.value = Equipe.els.search.value;
      const drawerDepartment = document.getElementById("drawerDepartment");
      if (drawerDepartment && Equipe.departmentFilter) {
        drawerDepartment.value = Equipe.departmentFilter;
      }
    } else if (page === "departamentos") {
      const drawerBranch = document.getElementById("drawerBranch");
      if (drawerBranch && Departamentos.branchFilter) {
        drawerBranch.value = Departamentos.branchFilter;
      }
      if (searchInput) searchInput.value = Departamentos.els.search.value;
    } else {
      if (searchInput) searchInput.value = Filiais.els.search.value;
    }

    this.els.filterDrawerOverlay.hidden = false;
    document.body.style.overflow = "hidden";
  },

  closeFiltersDrawer() {
    const overlay = this.els.filterDrawerOverlay;
    if (overlay.hidden) return;
    overlay.classList.add("is-closing");
    setTimeout(() => {
      overlay.hidden = true;
      overlay.classList.remove("is-closing");
      document.body.style.overflow = "";
    }, 300);
  },

  /* Aplica os valores do painel nos filtros reais da página ativa */
  async applyFiltersDrawer() {
    const page = this.getActivePage();
    const estado = document.getElementById("drawerEstado").value;
    const searchEl = document.getElementById("drawerSearch");
    const search = searchEl ? searchEl.value : "";

    if (estado !== this.currentState) {
      this.currentState = estado;
      await this.ensureStateLoaded(estado);
    }

    if (page === "dashboard") {
      // A busca do dashboard agora fica na tabela "Lançamentos recentes"
      this.els.filterStart.value = document.getElementById("drawerStart").value;
      this.els.filterEnd.value = document.getElementById("drawerEnd").value;
      this.renderAll();
    } else if (page === "equipe") {
      Equipe.els.filterStart.value = document.getElementById("drawerStart").value;
      Equipe.els.filterEnd.value = document.getElementById("drawerEnd").value;
      Equipe.els.statusFilter.value = document.getElementById("drawerStatus").value;
      const drawerDepartment = document.getElementById("drawerDepartment");
      if (drawerDepartment) Equipe.departmentFilter = drawerDepartment.value;
      if (searchEl) Equipe.els.search.value = search;
      Equipe.renderTable();
    } else if (page === "departamentos") {
      Departamentos.populateBranchFilter(estado);
      const drawerBranch = document.getElementById("drawerBranch");
      if (drawerBranch) {
        drawerBranch.value = Departamentos.branchFilter;
        Departamentos.branchFilter = drawerBranch.value || "todos";
        if (Departamentos.els.branchFilter) Departamentos.els.branchFilter.value = Departamentos.branchFilter;
      }
      if (searchEl) Departamentos.els.search.value = search;
      Departamentos.renderTable();
    } else {
      if (searchEl) Filiais.els.search.value = search;
      Filiais.renderTable();
    }

    this.closeFiltersDrawer();
  },

  clearFiltersDrawer() {
    const page = this.getActivePage();
    const estadoSel = document.getElementById("drawerEstado");
    const startInput = document.getElementById("drawerStart");
    const endInput = document.getElementById("drawerEnd");
    const statusSel = document.getElementById("drawerStatus");
    const searchInput = document.getElementById("drawerSearch");

    // Volta ao padrão: mês inteiro atual e estado RO
    estadoSel.value = "RO";
    startInput.value = firstDayOfMonthISO();
    endInput.value = lastDayOfMonthISO();
    statusSel.value = "todos";
    const deptSel = document.getElementById("drawerDepartment");
    if (deptSel) deptSel.value = "todos";
    const branchSel = document.getElementById("drawerBranch");
    if (branchSel) branchSel.value = "todos";
    if (searchInput) searchInput.value = "";

    // Aplica imediatamente
    this.applyFiltersDrawer();
  },

  initFiltersDrawer() {
    /* Páginas sem o painel de filtros (ex.: Departamentos/Filiais) têm o botão
       "Filtro" substituído pelo "Filtro por Estado" — aqui apenas garantimos
       que a ausência do drawer não quebre a inicialização. */
    const { filterDrawerOverlay, filterDrawerClose, filterDrawerApply, filterDrawerClear } = this.els;
    document.querySelectorAll(".js-filters-btn").forEach((btn) => {
      btn.addEventListener("click", () => this.openFiltersDrawer());
    });
    if (filterDrawerClose) filterDrawerClose.addEventListener("click", () => this.closeFiltersDrawer());
    if (filterDrawerOverlay) {
      filterDrawerOverlay.addEventListener("click", (e) => {
        if (e.target === filterDrawerOverlay) this.closeFiltersDrawer();
      });
    }
    if (filterDrawerApply) filterDrawerApply.addEventListener("click", () => this.applyFiltersDrawer());
    if (filterDrawerClear) filterDrawerClear.addEventListener("click", () => this.clearFiltersDrawer());

    // Ao trocar o estado no painel, atualiza os selects de departamento/filial
    const drawerEstado = document.getElementById("drawerEstado");
    if (drawerEstado) {
      drawerEstado.addEventListener("change", () => {
        const page = this.getActivePage();
        const deptField = document.getElementById("drawerDepartmentField");
        if (deptField && !deptField.hidden) this.populateDrawerDepartments(drawerEstado.value);
        const branchField = document.getElementById("drawerBranchField");
        if (branchField && !branchField.hidden && typeof Departamentos !== "undefined") {
          Departamentos.populateBranchFilter(drawerEstado.value);
        }
      });
    }
  },

  /* ---------- Modo noturno ---------- */

  initTheme() {
    document.querySelectorAll(".js-theme-toggle").forEach((btn) => {
      btn.addEventListener("click", () => this.toggleTheme());
    });
  },

  toggleTheme() {
    const html = document.documentElement;
    const dark = html.getAttribute("data-theme") === "dark";
    html.setAttribute("data-theme", dark ? "light" : "dark");
    safeSetItem("gg-theme", dark ? "light" : "dark");
    if (typeof Charts !== "undefined" && Charts.applyTheme) {
      Charts.applyTheme();
    }
    this.renderAll();
  },

  bindEvents() {
    // Navegação entre páginas é feita por links reais (Dashboard / Equipe / Filiais).

    // Modal
    if (this.els.openModalBtn) this.els.openModalBtn.addEventListener("click", () => this.openModal());
    if (this.els.modalClose) this.els.modalClose.addEventListener("click", () => this.closeModal());
    if (this.els.modalCancel) this.els.modalCancel.addEventListener("click", () => this.closeModal());
    if (this.els.modalBack) this.els.modalBack.addEventListener("click", () => this.modalGoBack());
    if (this.els.modalOverlay) this.els.modalOverlay.addEventListener("click", (e) => {
      if (e.target === this.els.modalOverlay) this.closeModal();
    });
    if (this.els.entryIndicator) this.els.entryIndicator.addEventListener("change", () => this.buildModalForm());
    if (this.els.entryForm) this.els.entryForm.addEventListener("submit", (e) => this.handleSubmit(e));
    if (this.els.modalFormBody) this.els.modalFormBody.addEventListener("keydown", (e) => this.handleModalEnter(e));

    // Tabela / filtro / dropdowns
    if (this.els.tableSearch) this.els.tableSearch.addEventListener("input", () => this.renderTable());
    if (this.els.clearAllBtn) this.els.clearAllBtn.addEventListener("click", () => this.handleClearAll());
    if (this.els.filterStart) this.els.filterStart.addEventListener("change", () => this.renderAll());
    if (this.els.filterEnd) this.els.filterEnd.addEventListener("change", () => this.renderAll());
    if (this.els.filterClear) this.els.filterClear.addEventListener("click", () => this.clearDateFilter());

    // Menu hamburguer (Baixar / Importar / Apresentação)
    if (this.els.menuBtn && this.els.menuMenu) {
      this.els.menuBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        this.els.menuMenu.hidden = !this.els.menuMenu.hidden;
        this.els.menuBtn.setAttribute("aria-expanded", String(!this.els.menuMenu.hidden));
      });
      this.els.menuMenu.querySelectorAll("[data-menu]").forEach((item) => {
        item.addEventListener("click", () => {
          this.els.menuMenu.hidden = true;
          this.els.menuBtn.setAttribute("aria-expanded", "false");
          const action = item.dataset.menu;
          if (action === "xlsx") Export.toXLSX();
          else if (action === "csv") Export.toCSV();
          else if (action === "template") Export.template();
          else if (action === "import") this.els.importFile.click();
          else if (action === "presentation") this.openPresentation();
        });
      });
      document.addEventListener("click", () => {
        this.els.menuMenu.hidden = true;
        this.els.menuBtn.setAttribute("aria-expanded", "false");
      });
    }
    if (this.els.importFile) this.els.importFile.addEventListener("change", () => {
      const file = this.els.importFile.files && this.els.importFile.files[0];
      if (file) Export.importFile(file);
      this.els.importFile.value = "";
    });

    // Apresentação
    if (this.els.presentationClose) this.els.presentationClose.addEventListener("click", () => this.closePresentation());
    if (this.els.presentationOverlay) this.els.presentationOverlay.addEventListener("click", (e) => {
      if (e.target === this.els.presentationOverlay) this.closePresentation();
    });
    if (this.els.presentationFilterStart) this.els.presentationFilterStart.addEventListener("change", () => this.updatePresentationCharts());
    if (this.els.presentationFilterEnd) this.els.presentationFilterEnd.addEventListener("change", () => this.updatePresentationCharts());
    if (this.els.presentationFilterClear) this.els.presentationFilterClear.addEventListener("click", () => this.clearPresentationFilter());
    if (this.els.presentationPrev) this.els.presentationPrev.addEventListener("click", () => this.navigatePresentationIndicator(-1));
    if (this.els.presentationNext) this.els.presentationNext.addEventListener("click", () => this.navigatePresentationIndicator(1));
    if (this.els.presentationShowValues) this.els.presentationShowValues.addEventListener("change", () => {
      const show = this.els.presentationShowValues.checked;
      if (this.presentationLineChart) Charts.setShowValues(this.presentationLineChart, show);
      if (this.presentationAbsBar) Charts.setShowValues(this.presentationAbsBar, show);
      if (this.presentationPie) Charts.setShowValues(this.presentationPie, show);
    });

    // Fechar modal/apresentação/filtros com ESC (não interfere com o Dialog)
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape") {
        const dialogOpen =
          typeof Dialog !== "undefined" && Dialog.els.overlay && !Dialog.els.overlay.hidden;
        if (dialogOpen) return;
        if (this.els.filterDrawerOverlay && !this.els.filterDrawerOverlay.hidden) {
          this.closeFiltersDrawer();
          return;
        }
        if (this.els.presentationOverlay && !this.els.presentationOverlay.hidden) this.closePresentation();
        else if (this.els.modalOverlay && !this.els.modalOverlay.hidden) this.closeModal();
      }
    });

    // Redesenhar gráficos da apresentação quando a janela mudar de tamanho
    // (inclui entrada/saída do modo tela cheia — F11)
    window.addEventListener("resize", () => this.resizePresentationCharts());
    document.addEventListener("fullscreenchange", () => this.resizePresentationCharts());
  },

  /* ---------- Modal ---------- */

  openModal(preSelectedId) {
    if (typeof Auth !== "undefined" && !Auth.canEditData()) {
      this.toast("Seu perfil tem acesso somente leitura.");
      return;
    }
    const target = preSelectedId || MANUAL_INDICATORS[0].id;
    this.els.entryIndicator.value = target;
    this.buildModalForm();
    this.els.modalOverlay.hidden = false;
    document.body.style.overflow = "hidden";
  },

  closeModal() {
    this.els.modalOverlay.hidden = true;
    document.body.style.overflow = "";
    this.editingVacancyId = null;
    this.custoSelectedEmployeeId = null;
  },

  openPresentation() {
    this.els.presentationOverlay.hidden = false;
    document.body.style.overflow = "hidden";

    // Set default filter to current month
    this.els.presentationFilterStart.value = firstDayOfMonthISO();
    this.els.presentationFilterEnd.value = lastDayOfMonthISO();
    this.els.presentationShowValues.checked = false;

    // Slides: linha para cada indicador (exceto turnovers) + 1 slide de pizza
    // no lugar deles; Absenteísmo ganha barras por tipo.
    this.presentationSlides = [];
    INDICATORS.forEach((ind) => {
      if (ind.id === "turnover_entradas") {
        this.presentationSlides.push({ type: "pie" });
      } else if (ind.id === "absenteismo") {
        this.presentationSlides.push({ type: "bar", ind });
      } else if (ind.id !== "turnover_saidas") {
        this.presentationSlides.push({ type: "line", ind });
      }
    });

    this.presentationIndicatorIndex = 0;
    this.updatePresentationCharts();
  },

  closePresentation() {
    this.els.presentationOverlay.hidden = true;
    document.body.style.overflow = "";
    this.destroyPresentationCharts();
  },

  clearPresentationFilter() {
    this.els.presentationFilterStart.value = "";
    this.els.presentationFilterEnd.value = "";
    this.updatePresentationCharts();
  },

  getPresentationFilter() {
    const start = this.els.presentationFilterStart.value;
    const end = this.els.presentationFilterEnd.value;
    return { start, end };
  },

  filterPresentationEntries(entries) {
    const filter = this.getPresentationFilter();
    return entries.filter((e) => {
      if (filter.start && e.date < filter.start) return false;
      if (filter.end && e.date > filter.end) return false;
      if (this.currentState !== "todos" && !(e.meta && e.meta.estado === this.currentState)) return false;
      return true;
    });
  },

  updatePresentationCharts() {
    const slides = this.presentationSlides || [{ type: "line", ind: INDICATORS[0] }];
    const slide = slides[this.presentationIndicatorIndex] || slides[0];
    const showVals = this.els.presentationShowValues.checked;

    if (slide.type === "pie") {
      if (this.presentationAbsBar) { this.presentationAbsBar.destroy(); this.presentationAbsBar = null; }
      this.els.presentationIndicatorName.textContent = "Turnover — Entradas vs Saídas";
      this.els.presentationLineCard.hidden = true;
      this.els.presentationPieCard.hidden = false;

      if (!this.presentationPie) {
        this.presentationPie = Charts.createPieChart(this.els.presentationPieCanvas);
      }
      Charts.setShowValues(this.presentationPie, showVals);

      const latestIn = (id) => {
        const list = this.filterPresentationEntries(Storage.getEntriesFor(id));
        return list.length ? list[list.length - 1].value : 0;
      };
      Charts.updatePieChart(this.presentationPie, [
        { label: "Entradas", value: latestIn("turnover_entradas") },
        { label: "Saídas", value: latestIn("turnover_saidas") }
      ]);
    } else if (slide.type === "bar") {
      if (this.presentationLineChart) { this.presentationLineChart.destroy(); this.presentationLineChart = null; }
      this.els.presentationIndicatorName.textContent = slide.ind.name;
      this.els.presentationLineCard.hidden = false;
      this.els.presentationPieCard.hidden = true;

      if (!this.presentationAbsBar) {
        this.presentationAbsBar = Charts.createAbsenteismoBar(this.els.presentationLineChart);
      }
      Charts.setShowValues(this.presentationAbsBar, showVals);

      const filtered = this.filterPresentationEntries(Storage.getEntriesFor("absenteismo"));
      const totals = this.absTotalsFromEntries(filtered);
      Charts.updateAbsenteismoBar(this.presentationAbsBar, [
        { label: "Faltas", value: totals.falta },
        { label: "Atrasos", value: totals.atraso },
        { label: "Afastamentos", value: totals.afastamento }
      ]);
    } else {
      if (this.presentationAbsBar) { this.presentationAbsBar.destroy(); this.presentationAbsBar = null; }
      const selected = slide.ind;
      this.els.presentationIndicatorName.textContent = selected.name;
      this.els.presentationLineCard.hidden = false;
      this.els.presentationPieCard.hidden = true;

      if (!this.presentationLineChart) {
        this.presentationLineChart = Charts.createLineChart(this.els.presentationLineChart);
      }
      Charts.setShowValues(this.presentationLineChart, showVals);

      const filtered = this.filterPresentationEntries(Storage.getEntriesFor(selected.id));
      Charts.updateLineChart(this.presentationLineChart, selected, filtered);
    }
  },

  navigatePresentationIndicator(delta) {
    const total = (this.presentationSlides || []).length || 1;
    this.presentationIndicatorIndex = (this.presentationIndicatorIndex + delta + total) % total;
    this.updatePresentationCharts();
  },

  destroyPresentationCharts() {
    if (this.presentationLineChart) {
      this.presentationLineChart.destroy();
      this.presentationLineChart = null;
    }
    if (this.presentationAbsBar) {
      this.presentationAbsBar.destroy();
      this.presentationAbsBar = null;
    }
    if (this.presentationPie) {
      this.presentationPie.destroy();
      this.presentationPie = null;
    }
  },

  /* Redimensiona os gráficos ativos para o novo tamanho da janela */
  resizePresentationCharts() {
    if (!this.els.presentationOverlay || this.els.presentationOverlay.hidden) return;
    requestAnimationFrame(() => {
      if (this.presentationLineChart && !this.els.presentationLineCard.hidden) {
        this.presentationLineChart.resize();
      }
      if (this.presentationAbsBar && !this.els.presentationLineCard.hidden) {
        this.presentationAbsBar.resize();
      }
      if (this.presentationPie && !this.els.presentationPieCard.hidden) {
        this.presentationPie.resize();
      }
    });
  },

  presentationLineChart: null,
  presentationAbsBar: null,
  presentationPie: null,
  presentationIndicatorIndex: 0,
  presentationSlides: [],
  _kpiCharts: [],

  tabsHtml(tabs) {
    return `<div class="modal-tabs" role="tablist">${tabs
      .map(
        (t, i) =>
          `<button type="button" class="modal-tab${i === 0 ? " is-active" : ""}" data-tab="${t.id}">
            <span class="tab-num">${i + 1}</span>
            <span>${t.label}</span>
          </button>`
      )
      .join("")}</div>`;
  },

  buildModalForm() {
    const ind = getIndicatorById(this.els.entryIndicator.value);
    if (!ind) return;

    let tabs = null;
    let html = "";
    let submitLabel = "Salvar lançamento";

    if (ind.form === "absenteismo") {
      tabs = [
        { id: "periodo", label: "Período" },
        { id: "ocorrencia", label: "Ocorrência" }
      ];
      html = this.absenteismoForm();
    } else if (ind.form === "vaga") {
      tabs = [
        { id: "nova", label: "Nova vaga" },
        { id: "historico", label: "Histórico" }
      ];
      html = this.vagaForm();
      submitLabel = "Concluir";
    } else if (ind.form === "custo") {
      tabs = [
        { id: "colaborador", label: "Colaborador" },
        { id: "custo", label: "Custo" }
      ];
      html = this.custoForm();
    }

    this.els.modalTabs.innerHTML = tabs ? this.tabsHtml(tabs) : "";
    this.els.modalTabs.hidden = !tabs;
    this.els.modalFormBody.innerHTML = this.indicatorPanelHtml(ind) + html + this.stateFieldHtml();
    this.els.modalSubmit.textContent = submitLabel;
    if (this.els.modalSubtitle) this.els.modalSubtitle.textContent = ind.desc || "Preencha os dados do indicador escolhido.";
    if (this.els.modalEnterHint) this.els.modalEnterHint.hidden = !tabs || tabs.length < 2;
    this.editingVacancyId = null;
    this.custoSelectedEmployeeId = null;

    this.bindModalTabs();
    this.bindModalFormEvents(ind);
    this.updateModalNav();
  },

  indicatorPanelHtml(ind) {
    return `
      <div class="indicator-panel">
        <span class="indicator-panel-ico">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><line x1="12" y1="20" x2="12" y2="10"/><line x1="18" y1="20" x2="18" y2="4"/><line x1="6" y1="20" x2="6" y2="16"/></svg>
        </span>
        <div class="indicator-panel-body">
          <strong>${escapeHtml(ind.name)}</strong>
          <span>${escapeHtml(ind.desc || "")}</span>
        </div>
      </div>`;
  },

  updateModalNav() {
    const tabs = this.els.modalTabs;
    const back = this.els.modalBack;
    if (!back) return;
    const panels = this.els.modalFormBody.querySelectorAll(".modal-panel");
    const multiStep = tabs && !tabs.hidden && tabs.querySelectorAll(".modal-tab").length > 1;
    if (!multiStep || !panels.length) {
      back.hidden = true;
      return;
    }
    const active = Array.from(panels).findIndex((p) => !p.hidden);
    back.hidden = active <= 0;
  },

  modalGoBack() {
    const panels = Array.from(this.els.modalFormBody.querySelectorAll(".modal-panel"));
    const active = panels.findIndex((p) => !p.hidden);
    if (active > 0) this.switchModalTab(panels[active - 1].dataset.panel);
  },

  bindModalTabs() {
    this.els.modalTabs.querySelectorAll(".modal-tab").forEach((btn) => {
      btn.addEventListener("click", () => {
        this.els.modalTabs.querySelectorAll(".modal-tab").forEach((b) => b.classList.remove("is-active"));
        btn.classList.add("is-active");
        this.els.modalFormBody.querySelectorAll(".modal-panel").forEach((p) => {
          p.hidden = p.dataset.panel !== btn.dataset.tab;
        });
        this.updateModalNav();
      });
    });
  },

  switchModalTab(tabId) {
    const btn = this.els.modalTabs.querySelector(`[data-tab="${tabId}"]`);
    if (btn) btn.click();
  },

  /* Enter avança para a próxima aba; na última aba, submete o formulário */
  handleModalEnter(e) {
    if (e.key !== "Enter") return;
    const tag = (e.target.tagName || "").toLowerCase();
    if (tag !== "input" && tag !== "select") return;
    e.preventDefault();

    const panels = Array.from(this.els.modalFormBody.querySelectorAll(".modal-panel"));
    if (!panels.length) return;

    const active = panels.findIndex((p) => !p.hidden);
    if (active >= 0 && active < panels.length - 1) {
      this.switchModalTab(panels[active + 1].dataset.panel);
      this.updateModalNav();
      return;
    }

    if (typeof this.els.entryForm.requestSubmit === "function") {
      this.els.entryForm.requestSubmit();
    } else {
      this.els.entryForm.dispatchEvent(new Event("submit", { cancelable: true, bubbles: true }));
    }
  },

  bindModalFormEvents(ind) {
    if (ind.form === "vaga") {
      const iniciar = document.getElementById("vagaIniciar");
      const add = document.getElementById("vagaAdd");
      const nome = document.getElementById("vagaNome");
      bindUppercaseInput(nome);
      if (iniciar) {
        iniciar.addEventListener("click", () => {
          const now = new Date();
          const pad = (n) => String(n).padStart(2, "0");
          document.getElementById("vagaData").value = todayISO();
          document.getElementById("vagaHora").value = `${pad(now.getHours())}:${pad(now.getMinutes())}`;
        });
      }
      if (add) add.addEventListener("click", () => this.handleVacancyAdd());
      this.renderVacancyList();
    }

    if (ind.form === "custo") {
      const search = document.getElementById("custoSearch");
      if (search) {
        search.addEventListener("input", () => this.renderCustoResults(search.value));
        this.renderCustoResults("");
      }
    }
  },

  handleSubmit(e) {
    e.preventDefault();
    const ind = getIndicatorById(this.els.entryIndicator.value);
    if (!ind) return;

    if (ind.form === "absenteismo") return this.submitAbsenteismo();
    if (ind.form === "custo") return this.submitCusto();
    if (ind.form === "vaga") return this.closeModal();
  },

  /* ---------- Formulário: Absenteísmo ---------- */

  absenteismoForm() {
    return `
      <div class="modal-panel" data-panel="periodo">
        <div class="form-section">
          <div class="form-section-head">
            <span class="step-chip">1</span>
            <div>
              <strong>Período das ocorrências</strong>
              <p>Informe o intervalo de datas considerado.</p>
            </div>
          </div>
          <div class="form-grid">
            <div class="field">
              <label for="absInicio">Data início</label>
              <input type="date" id="absInicio" class="input" value="${firstDayOfMonthISO()}" required>
            </div>
            <div class="field">
              <label for="absFim">Data fim</label>
              <input type="date" id="absFim" class="input" value="${todayISO()}" required>
            </div>
          </div>
        </div>
      </div>
      <div class="modal-panel" data-panel="ocorrencia" hidden>
        <div class="form-section">
          <div class="form-section-head">
            <span class="step-chip">2</span>
            <div>
              <strong>Ocorrência</strong>
              <p>Qual o tipo e quantas ocorrências no período?</p>
            </div>
          </div>
          <div class="field">
            <label for="absTipo">Tipo de ocorrência</label>
            <select id="absTipo" class="select">
              <option value="falta">Falta</option>
              <option value="atraso">Atraso</option>
              <option value="afastamento">Afastamento</option>
            </select>
          </div>
          <div class="field">
            <label for="absQtd">Quantidade</label>
            <input type="number" min="1" step="1" id="absQtd" class="input" value="1" required>
          </div>
        </div>
      </div>`;
  },

  submitAbsenteismo() {
    const inicio = document.getElementById("absInicio").value;
    const fim = document.getElementById("absFim").value;
    const tipo = document.getElementById("absTipo").value;
    const qtd = Number(document.getElementById("absQtd").value);
    const estado = document.getElementById("entryEstado") ? document.getElementById("entryEstado").value : null;

    if (!inicio || !fim) return this.toast("Informe o período das ocorrências.");
    if (fim < inicio) return this.toast("A data fim deve ser posterior à data início.");
    if (!qtd || qtd < 1) return this.toast("Informe a quantidade de ocorrências.");

    Storage.addEntry("absenteismo", { date: inicio, value: qtd, state: estado, meta: { periodEnd: fim, type: tipo } });
    this.closeModal();
    this.renderAll();
    const estadoLabel = estado && estado !== "todos" ? ` · ${estado}` : "";
    this.toast(`Absenteísmo lançado — ${ABSENTEEISM_TYPES[tipo]}, ${qtd} ocorrência(s).${estadoLabel}`);
  },

  /* ---------- Formulário: Tempo médio de contratação (Vagas) ---------- */

  vagaForm() {
    return `
      <div class="modal-panel" data-panel="nova">
        <div class="form-section">
          <div class="form-section-head">
            <span class="step-chip">1</span>
            <div>
              <strong>Nova vaga</strong>
              <p>Cadastre a vaga e marque a abertura.</p>
            </div>
          </div>
          <div class="field">
            <label for="vagaNome">Nome da vaga</label>
            <input type="text" id="vagaNome" class="input" required placeholder="Ex.: Analista de RH">
          </div>
          <div class="form-grid">
            <div class="field">
              <label for="vagaData">Data de abertura</label>
              <input type="date" id="vagaData" class="input" required>
            </div>
            <div class="field">
              <label for="vagaHora">Hora</label>
              <input type="time" id="vagaHora" class="input" required>
            </div>
          </div>
          <div class="vaga-actions">
            <button type="button" class="btn btn-outline" id="vagaIniciar">Abrir Vaga</button>
            <button type="button" class="btn btn-primary" id="vagaAdd">+ Adicionar vaga</button>
          </div>
          <p class="field-hint">Ao adicionar, a vaga fica “em aberto” no histórico. Use “Fechar” quando for contratado.</p>
        </div>
      </div>
      <div class="modal-panel" data-panel="historico" hidden>
        <div class="form-section">
          <div class="form-section-head">
            <span class="step-chip">2</span>
            <div>
              <strong>Histórico de vagas</strong>
              <p>Acompanhe aberturas, fechamentos e edite ou exclua vagas.</p>
            </div>
          </div>
          <div class="vacancy-list" id="vacancyList"></div>
        </div>
      </div>`;
  },

  handleVacancyAdd() {
    const name = document.getElementById("vagaNome").value.trim();
    const date = document.getElementById("vagaData").value;
    const time = document.getElementById("vagaHora").value;
    if (!name || !date || !time) return this.toast("Preencha nome, data e hora da vaga.");

    const openAt = `${date}T${time}:00`;

    const estado = (document.getElementById("entryEstado") && document.getElementById("entryEstado").value) || this.currentState;

    if (this.editingVacancyId) {
      Employees.updateVacancy(this.editingVacancyId, { name, openAt });
      this.editingVacancyId = null;
      document.getElementById("vagaAdd").textContent = "+ Adicionar vaga";
      this.toast("Vaga atualizada.");
    } else {
      Employees.addVacancy({ name, openAt, estado });
      this.toast(`Vaga adicionada — aguardando fechamento.${estado && estado !== "todos" ? ` (${estado})` : ""}`);
    }

    document.getElementById("vagaNome").value = "";
    document.getElementById("vagaData").value = "";
    document.getElementById("vagaHora").value = "";
    this.renderVacancyList();
    this.switchModalTab("historico");
    this.renderAll();
  },

  renderVacancyList() {
    const el = document.getElementById("vacancyList");
    if (!el) return;
    const list = Employees.getVacancies(this.currentState);

    if (!list.length) {
      el.innerHTML = `
        <div class="empty-state">
          <p class="empty-title">Nenhuma vaga cadastrada</p>
          <p class="empty-text">Adicione uma vaga na aba “Nova vaga”.</p>
        </div>`;
      return;
    }

    el.innerHTML = list
      .map((v) => {
        const closed = !!v.closeAt;
        const badge = closed
          ? '<span class="badge badge-dark">Fechado</span>'
          : '<span class="badge badge-accent">Em aberto</span>';
        return `
          <div class="vacancy-item">
            <div class="vacancy-info">
              <strong>${escapeHtml(v.name)}</strong>
              <span>Abertura: ${escapeHtml(formatDateTime(v.openAt))}</span>
              ${closed ? `<span>Fechamento: ${escapeHtml(formatDateTime(v.closeAt))} · Tempo: ${Employees.formatVacancyTempo(v)}</span>` : ""}
            </div>
            <div class="vacancy-actions">
              ${badge}
              <button type="button" class="btn btn-sm btn-outline" data-v-edit="${v.id}">Editar</button>
              <button type="button" class="btn btn-sm btn-primary" data-v-close="${v.id}" ${closed ? "disabled" : ""}>Fechar</button>
              <button type="button" class="btn btn-sm btn-ghost" data-v-del="${v.id}">Excluir</button>
            </div>
          </div>`;
      })
      .join("");

    el.querySelectorAll("[data-v-edit]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const v = Storage.getVacancyById(btn.dataset.vEdit);
        if (!v) return;
        this.editingVacancyId = v.id;
        document.getElementById("vagaNome").value = v.name;
        document.getElementById("vagaData").value = v.openAt.slice(0, 10);
        document.getElementById("vagaHora").value = v.openAt.slice(11, 16);
        document.getElementById("vagaAdd").textContent = "Salvar alterações";
        this.switchModalTab("nova");
      });
    });

    el.querySelectorAll("[data-v-close]").forEach((btn) => {
      btn.addEventListener("click", () => {
        Employees.closeVacancy(btn.dataset.vClose);
        this.renderVacancyList();
        this.renderAll();
        this.toast("Vaga fechada — tempo de contratação registrado.");
      });
    });

    el.querySelectorAll("[data-v-del]").forEach((btn) => {
      btn.addEventListener("click", async () => {
        const vacancy = Storage.getVacancyById(btn.dataset.vDel);
        if (!vacancy) return;
        const ok = await Dialog.confirm({
          title: "Excluir vaga?",
          message: `A vaga "${vacancy.name}" será removida permanentemente.`,
          confirmText: "Excluir",
          danger: true
        });
        if (!ok) return;
        Employees.deleteVacancy(btn.dataset.vDel);
        this.renderVacancyList();
        this.renderAll();
        this.toast("Vaga excluída.");
      });
    });
  },

  /* ---------- Formulário: Custo de contratação ---------- */

  custoForm() {
    return `
      <div class="modal-panel" data-panel="colaborador">
        <div class="form-section">
          <div class="form-section-head">
            <span class="step-chip">1</span>
            <div>
              <strong>Colaborador</strong>
              <p>Busque e selecione quem foi contratado.</p>
            </div>
          </div>
          <div class="field">
            <label for="custoSearch">Buscar colaborador</label>
            <input type="search" id="custoSearch" class="input" placeholder="Nome, setor ou usuário...">
          </div>
          <div class="employee-picker" id="custoResults"></div>
        </div>
      </div>
      <div class="modal-panel" data-panel="custo" hidden>
        <div class="form-section">
          <div class="form-section-head">
            <span class="step-chip">2</span>
            <div>
              <strong>Custo de contratação</strong>
              <p>Informe o valor investido na contratação.</p>
            </div>
          </div>
          <div class="field">
            <label for="custoSelected">Colaborador selecionado</label>
            <input type="text" id="custoSelected" class="input" readonly placeholder="Nenhum selecionado">
          </div>
          <div class="field">
            <label for="custoValue">Custo de contratação (R$)</label>
            <input type="number" min="0" step="any" id="custoValue" class="input" required placeholder="0,00">
          </div>
          <p class="field-hint" id="custoExistingHint"></p>
        </div>
      </div>`;
  },

  renderCustoResults(query) {
    const el = document.getElementById("custoResults");
    if (!el) return;
    const employees = Employees.list();
    const q = query.trim().toLowerCase();
    const custoInd = getIndicatorById("custo_contratacao");

    if (!employees.length) {
      el.innerHTML = `<p class="picker-hint">Nenhum colaborador cadastrado. Cadastre na aba Equipe primeiro.</p>`;
      return;
    }

    const filtered = q
      ? employees.filter((e) => `${e.name} ${e.sector} ${e.user}`.toLowerCase().includes(q))
      : employees;

    if (!filtered.length) {
      el.innerHTML = `<p class="picker-hint">Nenhum colaborador encontrado para “${escapeHtml(query)}”.</p>`;
      return;
    }

    el.innerHTML = filtered
      .map((e) => {
        const existing = Storage.getLatestForMeta("custo_contratacao", "employeeId", e.id);
        const launched = existing ? " is-launched" : "";
        const cost = existing
          ? `Já lançado: ${formatValue(custoInd, existing.value)}`
          : `${e.sector} · ${TYPE_LABELS[e.type] || e.type}`;
        return `
        <button type="button" class="picker-item${this.custoSelectedEmployeeId === e.id ? " is-selected" : ""}${launched}" data-pick="${e.id}">
          <strong>${escapeHtml(e.name)}</strong>
          <span>${escapeHtml(cost)}</span>
        </button>`;
      })
      .join("");

    el.querySelectorAll("[data-pick]").forEach((btn) => {
      btn.addEventListener("click", () => {
        this.custoSelectedEmployeeId = btn.dataset.pick;
        const emp = Storage.getEmployeeById(this.custoSelectedEmployeeId);
        const existing = emp ? Storage.getLatestForMeta("custo_contratacao", "employeeId", emp.id) : null;

        document.getElementById("custoSelected").value = emp ? `${emp.name} · ${emp.sector}` : "";
        const valueInput = document.getElementById("custoValue");
        const hint = document.getElementById("custoExistingHint");
        if (existing) {
          valueInput.value = existing.value;
          hint.textContent = `Já existe um lançamento para ${emp.name}. Salvar substituirá o valor anterior.`;
        } else {
          valueInput.value = "";
          hint.textContent = "";
        }

        this.renderCustoResults(query);
        this.switchModalTab("custo");
      });
    });
  },

  submitCusto() {
    if (!this.custoSelectedEmployeeId) return this.toast("Selecione um colaborador na aba Colaborador.");
    const value = document.getElementById("custoValue").value;
    if (value === "" || isNaN(Number(value))) return this.toast("Informe o custo de contratação.");

    const emp = Storage.getEmployeeById(this.custoSelectedEmployeeId);
    const existing = Storage.getLatestForMeta("custo_contratacao", "employeeId", emp.id);
    const estado = document.getElementById("entryEstado") ? document.getElementById("entryEstado").value : (emp.estado || null);

    if (existing) {
      Storage.updateEntry("custo_contratacao", existing.id, { value: Number(value), date: todayISO() });
      this.closeModal();
      this.renderAll();
      this.toast(`Custo de contratação atualizado para ${emp.name}.`);
      return;
    }

    Storage.addEntry("custo_contratacao", {
      date: todayISO(),
      value,
      state: estado,
      meta: { employeeId: emp.id, employeeName: emp.name }
    });
    this.closeModal();
    this.renderAll();
    this.toast(`Custo de contratação lançado para ${emp.name}.`);
  },

  /* ---------- Filtro de período ---------- */

  getDateFilter() {
    let start = this.els.filterStart ? this.els.filterStart.value || null : null;
    let end = this.els.filterEnd ? this.els.filterEnd.value || null : null;
    if (start && end && start > end) {
      const tmp = start;
      start = end;
      end = tmp;
    }
    return { start, end };
  },

  clearDateFilter() {
    this.els.filterStart.value = firstDayOfMonthISO();
    this.els.filterEnd.value = lastDayOfMonthISO();
    this.renderAll();
  },

  filteredEntries(ind, filter) {
    const list = Storage.getEntriesFor(ind.id, this.currentState);
    if (!filter.start && !filter.end) return list;
    return list.filter((e) => {
      if (filter.start && e.date < filter.start) return false;
      if (filter.end && e.date > filter.end) return false;
      return true;
    });
  },

  /* Totais de absenteísmo por tipo a partir de uma lista de entradas */
  absTotalsFromEntries(entries) {
    const totals = { falta: 0, atraso: 0, afastamento: 0 };
    (entries || []).forEach((e) => {
      const type = e.meta && e.meta.type;
      if (type in totals) totals[type] += e.value || 0;
    });
    return totals;
  },

  /* Totais de absenteísmo por tipo dentro do período filtrado */
  absenteismoTypeTotals(filter) {
    const ind = getIndicatorById("absenteismo");
    if (!ind) return { falta: 0, atraso: 0, afastamento: 0 };
    return this.absTotalsFromEntries(this.filteredEntries(ind, filter));
  },

  /* Custo de contratação é exibido como MÉDIA no período filtrado */
  indicatorCurrentValue(ind, filter) {
    /* Indicadores computados vêm da aba Equipe e são filtrados por estado.
       Calculados ao vivo (não usam snapshots) para refletir os dados atuais. */
    if (ind.computed) {
      return Employees.computedSnapshot(ind.id, this.currentState);
    }
    const entries = this.filteredEntries(ind, filter);
    if (!entries.length) return null;
    /* Absenteísmo: média dos valores lançados no período */
    if (ind.id === "absenteismo") {
      const sum = entries.reduce((s, e) => s + e.value, 0);
      return sum / entries.length;
    }
    if (ind.id === "custo_contratacao") {
      const sum = entries.reduce((s, e) => s + e.value, 0);
      return sum / entries.length;
    }
    return entries[entries.length - 1].value;
  },

  /* ---------- KPIs ---------- */

  renderKpis() {
    if (!this.els.kpiGrid) return;
    const filter = this.getDateFilter();
    
    // Filtra indicadores, excluindo saidas
    const visibleIndicators = INDICATORS.filter(ind => ind.id !== "turnover_saidas");
    
    const html = visibleIndicators.map((ind, idx) => {
      const entries = this.filteredEntries(ind, filter);
      const allEntries = this.currentState !== "todos"
        ? Storage.getEntriesFor(ind.id, this.currentState)
        : Storage.getEntriesFor(ind.id);
      const current = this.indicatorCurrentValue(ind, filter);

      let prev = null;
      if (filter.start && allEntries.length) {
        const before = allEntries.filter((e) => e.date < filter.start);
        prev = before.length ? before[before.length - 1].value : null;
      } else if (!filter.start && entries.length > 1) {
        prev = entries[entries.length - 2].value;
      }

      let deltaHtml = '<span class="kpi-delta is-flat">sem dados</span>';
      if (current !== null && prev !== null) {
        const diff = Number(current) - Number(prev);
        if (diff > 0) {
          deltaHtml = `<span class="kpi-delta is-up">▲ ${formatRawValue(ind, diff)}</span>`;
        } else if (diff < 0) {
          deltaHtml = `<span class="kpi-delta is-down">▼ ${formatRawValue(ind, Math.abs(diff))}</span>`;
        } else {
          deltaHtml = '<span class="kpi-delta is-flat">—</span>';
        }
      }

      const selected = this.selectedIndicatorId === ind.id ? " is-selected" : "";
      const countText = entries.length === 1 ? "1 lançamento" : `${entries.length} lançamentos`;

      // Turnover KPI especial
      if (ind.id === "turnover_entradas") {
        const entradas = this.indicatorCurrentValue(getIndicatorById("turnover_entradas"), filter) || 0;
        const saidas = this.indicatorCurrentValue(getIndicatorById("turnover_saidas"), filter) || 0;
        const turnoverSelected = this.selectedIndicatorId === "turnover_total" ? " is-selected" : "";
        return `
        <article class="kpi-card is-turnover${turnoverSelected}" data-indicator="turnover_total" role="button" tabindex="0">
          <div class="kpi-top">
            <span class="kpi-name">Turnover</span>
          </div>
          <div class="kpi-value">${entradas + saidas}</div>
          <div style="height: 120px; margin-top: 8px;">
            <canvas id="turnoverKpiPie"></canvas>
          </div>
        </article>
      `;
      }
      
      // Turnover no período de experiência KPI especial
      if (ind.id === "turnover_experiencia") {
        const val = this.indicatorCurrentValue(ind, filter) || 0;
        const total = this.indicatorCurrentValue(getIndicatorById("headcount"), filter) || 1;
        // Gráfico donut simplificado para experiência: desligados vs restantes
        const expSelected = this.selectedIndicatorId === "turnover_experiencia" ? " is-selected" : "";
        return `
        <article class="kpi-card is-turnover${expSelected}" data-indicator="turnover_experiencia" role="button" tabindex="0">
          <div class="kpi-top">
            <span class="kpi-name">Turnover (Exp)</span>
          </div>
          <div class="kpi-value">${val}</div>
          <div style="height: 120px; margin-top: 8px;">
            <canvas id="experienciaKpiPie"></canvas>
          </div>
        </article>
      `;
      }

      if (ind.id === "turnover_saidas") return "";


      return `
        <article class="kpi-card${selected}" data-indicator="${ind.id}" role="button" tabindex="0" title="${escapeHtml(ind.desc)}">
          <div class="kpi-top">
            <span class="kpi-name">${escapeHtml(ind.name)}</span>
          </div>
          <div style="height: 40px; margin-top: 8px;">
            <canvas id="miniChart-${ind.id}"></canvas>
          </div>
          <div class="kpi-value">${current !== null ? formatValue(ind, current) : "—"}</div>
          <div class="kpi-meta">
            <span>${deltaHtml}</span>
            <span class="kpi-entries">${countText}</span>
          </div>
        </article>
      `;
    }).join("");

    (this._kpiCharts || []).forEach((c) => {
      if (c && typeof c.destroy === "function") c.destroy();
    });
    this._kpiCharts = [];

    this.els.kpiGrid.innerHTML = html;
    
    // Inicia os gráficos após renderizar
    requestAnimationFrame(() => {
        // Mini gráficos normais
        INDICATORS.forEach(ind => {
            const canvas = document.getElementById(`miniChart-${ind.id}`);
            if (canvas) {
                const chart = Charts.createMiniLineChart(canvas);
                Charts.updateMiniLineChart(chart, this.filteredEntries(ind, filter));
                this._kpiCharts.push(chart);
            }
        });
        
        // Gráfico de pizza do turnover no KPI
        const pieCanvas = document.getElementById("turnoverKpiPie");
        if (pieCanvas) {
            const entradas = this.indicatorCurrentValue(getIndicatorById("turnover_entradas"), filter) || 0;
            const saidas = this.indicatorCurrentValue(getIndicatorById("turnover_saidas"), filter) || 0;
            const chart = Charts.createPieChart(pieCanvas);
            Charts.updatePieChart(chart, [
                { label: "Entradas", value: entradas },
                { label: "Saídas", value: saidas }
            ]);
            this._kpiCharts.push(chart);
        }

        // Gráfico de pizza do turnover experiência no KPI (entradas vs saídas)
        const expPieCanvas = document.getElementById("experienciaKpiPie");
        if (expPieCanvas) {
            const saidasExp = this.indicatorCurrentValue(getIndicatorById("turnover_experiencia"), filter) || 0;
            const entradasExp = Employees.list(this.currentState)
              .filter((e) => e.type === "experiencia" && e.status === "ativo").length || 0;

            const chart = Charts.createPieChart(expPieCanvas);
            // Ajusta a legenda para horizontal
            chart.options.plugins.legend.position = "bottom";
            chart.options.plugins.legend.labels.boxWidth = 12;

            Charts.updatePieChart(chart, [
                { label: "Entradas", value: entradasExp },
                { label: "Saídas", value: saidasExp }
            ]);
            this._kpiCharts.push(chart);
        }
    });

    this.els.kpiGrid.querySelectorAll(".kpi-card").forEach((card) => {
      const select = () => {
        this.selectedIndicatorId = card.dataset.indicator;
        this.renderKpis();
        this.scrollToKpiChart(card.dataset.indicator);
      };
      card.addEventListener("click", select);
      card.addEventListener("keydown", (e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          select();
        }
      });
    });
  },

  /* ---------- Faixa de gráficos por indicador (evolução) ---------- */

  _kpiChartInstances: [],

  /* Mostra/oculta os números sobre os gráficos de evolução */
  initKpiValuesToggle() {
    try {
      this.showKpiValues = localStorage.getItem("gg-kpi-values") === "1";
    } catch (e) {}
    const btn = this.els.kpiChartsValuesBtn;
    if (!btn) return;
    btn.textContent = this.showKpiValues ? "Ocultar valores" : "Mostrar valores";
    btn.addEventListener("click", () => this.toggleKpiValues());
  },

  toggleKpiValues() {
    this.showKpiValues = !this.showKpiValues;
    safeSetItem("gg-kpi-values", this.showKpiValues ? "1" : "0");
    const btn = this.els.kpiChartsValuesBtn;
    if (btn) btn.textContent = this.showKpiValues ? "Ocultar valores" : "Mostrar valores";
    (this._kpiChartInstances || []).forEach((c) => {
      if (c) Charts.setShowValues(c, this.showKpiValues);
    });
  },

  renderKpiCharts() {
    const scroll = document.getElementById("kpiChartsScroll");
    if (!scroll) return;
    const filter = this.getDateFilter();
    const visible = INDICATORS.filter((ind) => ind.id !== "turnover_saidas");

    (this._kpiChartInstances || []).forEach((c) => {
      if (c && typeof c.destroy === "function") c.destroy();
    });
    this._kpiChartInstances = [];

    scroll.innerHTML = visible
      .map((ind) => {
        if (ind.id === "turnover_entradas") {
          return `
          <div class="card chart-card kpi-chart-card" data-indicator-card="turnover_entradas">
            <div class="card-header">
              <div>
                <h2 class="card-title">Turnover</h2>
                <span class="card-sub">Entradas vs Saídas</span>
              </div>
            </div>
            <div class="chart-wrap chart-wrap-pie">
              <canvas id="kpiChart-turnover_entradas" role="img" aria-label="Turnover — entradas vs saídas"></canvas>
            </div>
          </div>`;
        }
        if (ind.id === "turnover_experiencia") {
          return `
          <div class="card chart-card kpi-chart-card" data-indicator-card="turnover_experiencia">
            <div class="card-header">
              <div>
                <h2 class="card-title">${escapeHtml(ind.name)}</h2>
                <span class="card-sub">Entradas vs Saídas</span>
              </div>
            </div>
            <div class="chart-wrap chart-wrap-pie">
              <canvas id="kpiChart-turnover_experiencia" role="img" aria-label="Turnover experiência — entradas vs saídas"></canvas>
            </div>
          </div>`;
        }
        return `
          <div class="card chart-card kpi-chart-card" data-indicator-card="${ind.id}">
            <div class="card-header">
              <div>
                <h2 class="card-title">${escapeHtml(ind.name)}</h2>
                <span class="card-sub">Evolução no período</span>
              </div>
              <span class="badge badge-accent">${escapeHtml(ind.unit || "")}</span>
            </div>
            <div class="chart-wrap">
              <canvas id="kpiChart-${ind.id}" role="img" aria-label="Evolução de ${escapeHtml(ind.name)}"></canvas>
            </div>
          </div>`;
      })
      .join("");

    requestAnimationFrame(() => {
      visible.forEach((ind) => {
        if (typeof Charts === "undefined") return;
        if (ind.id === "turnover_entradas") {
          const canvas = document.getElementById("kpiChart-turnover_entradas");
          if (!canvas) return;
          const chart = Charts.createPieChart(canvas);
          const entradas = this.indicatorCurrentValue(getIndicatorById("turnover_entradas"), filter) || 0;
          const saidas = this.indicatorCurrentValue(getIndicatorById("turnover_saidas"), filter) || 0;
          Charts.updatePieChart(chart, [
            { label: "Entradas", value: entradas },
            { label: "Saídas", value: saidas }
          ]);
          if (this.showKpiValues) Charts.setShowValues(chart, true);
          this._kpiChartInstances.push(chart);
          return;
        }
        if (ind.id === "turnover_experiencia") {
          const canvas = document.getElementById("kpiChart-turnover_experiencia");
          if (!canvas) return;
          const chart = Charts.createPieChart(canvas);
          const saidas = this.indicatorCurrentValue(getIndicatorById("turnover_experiencia"), filter) || 0;
          const entradas = Employees.list(this.currentState)
            .filter((e) => e.type === "experiencia" && e.status === "ativo").length || 0;
          Charts.updatePieChart(chart, [
            { label: "Entradas", value: entradas },
            { label: "Saídas", value: saidas }
          ]);
          if (this.showKpiValues) Charts.setShowValues(chart, true);
          this._kpiChartInstances.push(chart);
          return;
        }
        const canvas = document.getElementById(`kpiChart-${ind.id}`);
        if (!canvas) return;
        const chart = Charts.createLineChart(canvas);
        Charts.updateLineChart(chart, ind, this.filteredEntries(ind, filter));
        if (this.showKpiValues) Charts.setShowValues(chart, true);
        this._kpiChartInstances.push(chart);
      });
    });
  },

  /* Rola a faixa de gráficos até o card do indicador, centraliza e
     destaca o card por um momento (com animação suave horizontal). */
  scrollToKpiChart(indicatorId) {
    const scroll = document.getElementById("kpiChartsScroll");
    if (!scroll) return;
    let targetId = indicatorId;
    if (targetId === "turnover_total") targetId = "turnover_entradas";
    const card = scroll.querySelector(`[data-indicator-card="${targetId}"]`);
    if (!card) return;

    scroll.scrollTo({
      left: card.offsetLeft - (scroll.clientWidth - card.offsetWidth) / 2,
      behavior: "smooth"
    });

    card.classList.remove("is-flash");
    void card.offsetWidth; // reinicia a animação
    card.classList.add("is-flash");
    clearTimeout(this._kpiFlashTimer);
    this._kpiFlashTimer = setTimeout(() => card.classList.remove("is-flash"), 1800);
  },

  /* ---------- Tabela de lançamentos ---------- */

  renderTable() {
    if (!this.els.entriesTableBody || !this.els.entriesTable) return;
    const query = this.els.tableSearch.value.trim().toLowerCase();
    const filter = this.getDateFilter();
    const all = Storage.getAllEntries();
    const rows = [];

    INDICATORS.forEach((ind) => {
      (all[ind.id] || []).forEach((e) => {
        if (filter.start && e.date < filter.start) return;
        if (filter.end && e.date > filter.end) return;
        if (this.currentState !== "todos" && !(e.meta && e.meta.estado === this.currentState)) return;
        rows.push({ entry: e, ind });
      });
    });
    rows.sort((a, b) => b.entry.date.localeCompare(a.entry.date));

    const filtered = query
      ? rows.filter((r) => r.ind.name.toLowerCase().includes(query))
      : rows;

    if (!filtered.length) {
      this.els.entriesTableBody.innerHTML = "";
      this.els.entriesTable.hidden = true;
      this.els.emptyState.hidden = false;
      this.els.emptyState.querySelector(".empty-title").textContent = query
        ? "Nenhum resultado encontrado"
        : "Nenhum lançamento ainda";
      return;
    }

    this.els.entriesTable.hidden = false;
    this.els.emptyState.hidden = true;
    const canEdit = typeof Auth === "undefined" || Auth.canEditData();

    this.els.entriesTableBody.innerHTML = filtered
      .map(({ entry, ind }) => {
        let valueCell = formatValue(ind, entry.value);
        if (ind.form === "custo" && entry.meta && entry.meta.employeeName) {
          valueCell = `${formatValue(ind, entry.value)} <span class="row-meta">· ${escapeHtml(entry.meta.employeeName)}</span>`;
        }
        if (ind.form === "absenteismo" && entry.meta) {
          const label = ABSENTEEISM_TYPES[entry.meta.type] || entry.meta.type;
          valueCell = `${formatValue(ind, entry.value)} <span class="row-meta">· ${label}</span>`;
        }
        return `
        <tr>
          <td>${escapeHtml(formatDate(entry.date))}</td>
          <td><span class="badge">${escapeHtml(ind.name)}</span></td>
          <td class="row-value">${valueCell}</td>
          ${canEdit ? `<td class="col-action">
            <button class="btn-icon" data-remove="${entry.id}" data-indicator="${ind.id}" aria-label="Excluir lançamento">&times;</button>
          </td>` : ""}
        </tr>`;
      })
      .join("");

    this.els.entriesTableBody.querySelectorAll("[data-remove]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const { indicator: indicatorId, remove: entryId } = btn.dataset;
        Storage.removeEntry(indicatorId, entryId);
        this.renderAll();
        this.toast("Lançamento excluído.");
      });
    });
  },

  /* ---------- Ações ---------- */

  async handleClearAll() {
    if (typeof Auth !== "undefined" && !Auth.canEditData()) {
      this.toast("Seu perfil tem acesso somente leitura.");
      return;
    }
    const ok = await Dialog.confirm({
      title: "Apagar todos os lançamentos?",
      message: "Todos os registros serão removidos. Essa ação não pode ser desfeita.",
      confirmText: "Apagar tudo",
      danger: true
    });
    if (!ok) return;
    Storage.clearEntries();
    Employees.syncAll();
    this.renderAll();
    this.toast("Todos os dados foram removidos.");
  },

  renderAll() {
    const filter = this.getDateFilter();
    this.renderKpis();
    this.renderKpiCharts();
    this.renderTable();

    // Panorama Principal (Barras)
    const panorama = INDICATORS.filter((ind) =>
      ind.id !== "turnover_entradas" && ind.id !== "turnover_saidas" && ind.id !== "custo_contratacao"
    )
      .map((ind) => {
        if (ind.id === "absenteismo") {
          const t = this.absenteismoTypeTotals(filter);
          return [
            { label: "Faltas", value: t.falta, tooltip: `Faltas: ${t.falta}` },
            { label: "Atrasos", value: t.atraso, tooltip: `Atrasos: ${t.atraso}` },
            { label: "Afastamentos", value: t.afastamento, tooltip: `Afastamentos: ${t.afastamento}` }
          ];
        }
        const value = this.indicatorCurrentValue(ind, filter);
        return [{
          label: ind.name,
          value,
          tooltip: value === null
            ? `${ind.name}: sem dados`
            : `${ind.name}: ${formatValue(ind, value)}`
        }];
      })
      .flat();
    if (typeof Charts !== "undefined" && Charts.updateBarChart) {
      Charts.updateBarChart(panorama);
    }
  },

  stateFieldHtml() {
    const current = this.currentState || "todos";
    const states = { RO: "Rondônia", AM: "Amazonas", PA: "Pará" };
    const options = ["todos", "RO", "AM", "PA"]
      .map((s) => `<option value="${s}"${current === s ? " selected" : ""}>${s === "todos" ? "Todos Estados" : `${s} — ${states[s]}`}</option>`)
      .join("");
    return `
      <div class="field field-estado">
        <div class="field-estado-head">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 9l1.5-5h15L21 9"/><path d="M3 9h18v3a3 3 0 0 1-3 3H6a3 3 0 0 1-3-3V9z"/><path d="M6 15v6h12v-6"/></svg>
          <span>Estado do lançamento</span>
        </div>
        <select id="entryEstado" class="select">${options}</select>
        <p class="field-hint">O lançamento será vinculado ao estado selecionado e usado nos filtros por estado.</p>
      </div>`;
  },

  /* ---------- Selects ---------- */

  populateIndicatorSelects() {
    const manualOptions = MANUAL_INDICATORS
      .map((ind) => `<option value="${ind.id}">${escapeHtml(ind.name)}</option>`)
      .join("");
    if (this.els.entryIndicator) this.els.entryIndicator.innerHTML = manualOptions;

    if (!this.selectedIndicatorId) {
      const best = MANUAL_INDICATORS[0];
      if (best) this.selectedIndicatorId = best.id;
    }
  },

  /* ---------- Toast ---------- */

  toast(message) {
    const el = this.els.toast;
    el.textContent = message;
    el.hidden = false;
    clearTimeout(this._toastTimer);
    this._toastTimer = setTimeout(() => {
      el.hidden = true;
    }, 2600);
  }
};