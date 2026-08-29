/* =========================================================
   Interface — KPIs, tabela, páginas, modal dinâmico e toast
   ========================================================= */

const ui = {
  selectedIndicatorId: null,
  editingVacancyId: null,
  custoSelectedEmployeeId: null,
  currentState: typeof DEFAULT_STATE !== "undefined" ? DEFAULT_STATE : "RO",

  els: {},

  cacheElements() {
    this.els = {
      pageDashboard: document.getElementById("page-dashboard"),
      pageEquipe: document.getElementById("page-equipe"),
      pageFiliais: document.getElementById("page-filiais"),
      sidebar: document.getElementById("sidebar"),
      sidebarToggle: document.getElementById("sidebarToggle"),
      kpiGrid: document.getElementById("kpiGrid"),
      chartIndicatorSelect: document.getElementById("chartIndicatorSelect"),
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
      modalTabs: document.getElementById("modalTabs"),
      modalFormBody: document.getElementById("modalFormBody"),
      modalSubmit: document.getElementById("modalSubmit"),
      entryForm: document.getElementById("entryForm"),
      entryIndicator: document.getElementById("entryIndicator"),
      exportDropdownBtn: document.getElementById("exportDropdownBtn"),
      exportMenu: document.getElementById("exportMenu"),
      importDropdownBtn: document.getElementById("importDropdownBtn"),
      importMenu: document.getElementById("importMenu"),
      importFile: document.getElementById("importFile"),
      importFileTrigger: document.getElementById("importFileTrigger"),
      toast: document.getElementById("toast"),
      totalChip: document.getElementById("totalChip"),
      presentationBtn: document.getElementById("presentationBtn"),
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
    this.els.sidebarToggle.addEventListener("click", () => this.toggleSidebar());
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

  /* Vincula os dropdowns de exportar/importar de uma página.
     Espera elementos com os ids: {prefixo}ExportBtn, {prefixo}ExportMenu,
     {prefixo}ImportBtn, {prefixo}ImportMenu, {prefixo}ImportFileTrigger e
     {prefixo}ImportFile. */
  bindExportImport(prefix) {
    const exportBtn = document.getElementById(prefix + "ExportBtn");
    const exportMenu = document.getElementById(prefix + "ExportMenu");
    const importBtn = document.getElementById(prefix + "ImportBtn");
    const importMenu = document.getElementById(prefix + "ImportMenu");
    const importTrigger = document.getElementById(prefix + "ImportFileTrigger");
    const importFile = document.getElementById(prefix + "ImportFile");
    if (!exportBtn || !exportMenu || !importBtn || !importMenu) return;

    const closeAll = () => {
      exportMenu.hidden = true;
      importMenu.hidden = true;
      exportBtn.setAttribute("aria-expanded", "false");
      importBtn.setAttribute("aria-expanded", "false");
    };

    exportBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      const wasOpen = !exportMenu.hidden;
      closeAll();
      exportMenu.hidden = wasOpen;
      exportBtn.setAttribute("aria-expanded", String(!exportMenu.hidden));
    });

    importBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      const wasOpen = !importMenu.hidden;
      closeAll();
      importMenu.hidden = wasOpen;
      importBtn.setAttribute("aria-expanded", String(!importMenu.hidden));
    });

    exportMenu.querySelectorAll("[data-export]").forEach((item) => {
      item.addEventListener("click", () => {
        closeAll();
        if (item.dataset.export === "xlsx") Export.toXLSX();
        else if (item.dataset.export === "template") Export.template();
        else Export.toCSV();
      });
    });

    if (importTrigger && importFile) {
      importTrigger.addEventListener("click", () => {
        closeAll();
        importFile.click();
      });
      importFile.addEventListener("change", () => {
        const file = importFile.files && importFile.files[0];
        if (file) Export.importFile(file);
        importFile.value = "";
      });
    }

    document.addEventListener("click", closeAll);
  },

  init() {
    this.cacheElements();
    this.initSidebar();
    this.initTheme();
    this.initFiltersDrawer();
    this.els.filterStart.value = firstDayOfMonthISO();
    this.els.filterEnd.value = lastDayOfMonthISO();
    this.populateIndicatorSelects();
    this.bindEvents();
  },

  /* ---------- Filtros (painel lateral) ---------- */

  getActivePage() {
    if (this.els.pageDashboard && !this.els.pageDashboard.hidden) return "dashboard";
    if (this.els.pageEquipe && !this.els.pageEquipe.hidden) return "equipe";
    if (this.els.pageFiliais && !this.els.pageFiliais.hidden) return "filiais";
    return "dashboard";
  },

  /* Abre o painel de filtros com os valores atuais de cada página */
  openFiltersDrawer() {
    const page = this.getActivePage();

    const estadoSel = document.getElementById("drawerEstado");
    const startInput = document.getElementById("drawerStart");
    const endInput = document.getElementById("drawerEnd");
    const statusField = document.getElementById("drawerStatusField");
    const statusSel = document.getElementById("drawerStatus");
    const searchInput = document.getElementById("drawerSearch");

    estadoSel.value = this.currentState || "todos";

    // Período: apenas dashboard e equipe
    const periodField = document.getElementById("drawerPeriodField");
    periodField.hidden = page === "filiais";

    // Status: apenas equipe
    statusField.hidden = page !== "equipe";

    if (page === "dashboard") {
      startInput.value = this.els.filterStart.value;
      endInput.value = this.els.filterEnd.value;
      searchInput.value = this.els.tableSearch.value;
    } else if (page === "equipe") {
      startInput.value = Equipe.els.filterStart.value;
      endInput.value = Equipe.els.filterEnd.value;
      statusSel.value = Equipe.els.statusFilter.value;
      searchInput.value = Equipe.els.search.value;
    } else {
      searchInput.value = Filiais.els.search.value;
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
    const search = document.getElementById("drawerSearch").value;

    if (estado !== this.currentState) {
      this.currentState = estado;
      await this.ensureStateLoaded(estado);
    }

    if (page === "dashboard") {
      this.els.filterStart.value = document.getElementById("drawerStart").value;
      this.els.filterEnd.value = document.getElementById("drawerEnd").value;
      this.els.tableSearch.value = search;
      this.renderAll();
    } else if (page === "equipe") {
      Equipe.els.filterStart.value = document.getElementById("drawerStart").value;
      Equipe.els.filterEnd.value = document.getElementById("drawerEnd").value;
      Equipe.els.statusFilter.value = document.getElementById("drawerStatus").value;
      Equipe.els.search.value = search;
      Equipe.renderTable();
    } else {
      Filiais.els.search.value = search;
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
    searchInput.value = "";

    // Aplica imediatamente
    this.applyFiltersDrawer();
  },

  initFiltersDrawer() {
    document.querySelectorAll(".js-filters-btn").forEach((btn) => {
      btn.addEventListener("click", () => this.openFiltersDrawer());
    });
    this.els.filterDrawerClose.addEventListener("click", () => this.closeFiltersDrawer());
    this.els.filterDrawerOverlay.addEventListener("click", (e) => {
      if (e.target === this.els.filterDrawerOverlay) this.closeFiltersDrawer();
    });
    this.els.filterDrawerApply.addEventListener("click", () => this.applyFiltersDrawer());
    this.els.filterDrawerClear.addEventListener("click", () => this.clearFiltersDrawer());
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
    try { localStorage.setItem("gg-theme", dark ? "light" : "dark"); } catch (e) {}
    if (typeof Charts !== "undefined" && Charts.applyTheme) {
      Charts.applyTheme();
    }
    this.renderAll();
  },

  bindEvents() {
    // Páginas (topbar)
    document.querySelectorAll(".tab-btn").forEach((btn) => {
      btn.addEventListener("click", () => this.switchPage(btn.dataset.page));
    });

    // Modal
    this.els.openModalBtn.addEventListener("click", () => this.openModal());
    this.els.modalClose.addEventListener("click", () => this.closeModal());
    this.els.modalCancel.addEventListener("click", () => this.closeModal());
    this.els.modalOverlay.addEventListener("click", (e) => {
      if (e.target === this.els.modalOverlay) this.closeModal();
    });
    this.els.entryIndicator.addEventListener("change", () => this.buildModalForm());
    this.els.entryForm.addEventListener("submit", (e) => this.handleSubmit(e));
    this.els.modalFormBody.addEventListener("keydown", (e) => this.handleModalEnter(e));

    // Tabela / filtro / dropdowns
    this.els.tableSearch.addEventListener("input", () => this.renderTable());
    this.els.clearAllBtn.addEventListener("click", () => this.handleClearAll());
    this.els.filterStart.addEventListener("change", () => this.renderAll());
    this.els.filterEnd.addEventListener("change", () => this.renderAll());
    this.els.filterClear.addEventListener("click", () => this.clearDateFilter());

    // Dropdown de exportação
    this.els.exportDropdownBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      this.setDropdown("export");
    });
    this.els.exportMenu.querySelectorAll("[data-export]").forEach((item) => {
      item.addEventListener("click", () => {
        this.closeDropdowns();
        if (item.dataset.export === "xlsx") Export.toXLSX();
        else if (item.dataset.export === "csv") Export.toCSV();
        else Export.template();
      });
    });

    // Dropdown de importação
    this.els.importDropdownBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      this.setDropdown("import");
    });
    this.els.importFileTrigger.addEventListener("click", () => {
      this.closeDropdowns();
      this.els.importFile.click();
    });
    this.els.importFile.addEventListener("change", () => {
      const file = this.els.importFile.files && this.els.importFile.files[0];
      if (file) Export.importFile(file);
      this.els.importFile.value = "";
    });
    document.addEventListener("click", () => this.closeDropdowns());

    // Apresentação
    this.els.presentationBtn.addEventListener("click", () => this.openPresentation());
    this.els.presentationClose.addEventListener("click", () => this.closePresentation());
    this.els.presentationOverlay.addEventListener("click", (e) => {
      if (e.target === this.els.presentationOverlay) this.closePresentation();
    });
    this.els.presentationFilterStart.addEventListener("change", () => this.updatePresentationCharts());
    this.els.presentationFilterEnd.addEventListener("change", () => this.updatePresentationCharts());
    this.els.presentationFilterClear.addEventListener("click", () => this.clearPresentationFilter());
    this.els.presentationPrev.addEventListener("click", () => this.navigatePresentationIndicator(-1));
    this.els.presentationNext.addEventListener("click", () => this.navigatePresentationIndicator(1));
    this.els.presentationShowValues.addEventListener("change", () => {
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
        if (!this.els.filterDrawerOverlay.hidden) {
          this.closeFiltersDrawer();
          return;
        }
        if (!this.els.presentationOverlay.hidden) this.closePresentation();
        else this.closeModal();
      }
    });

    // Redesenhar gráficos da apresentação quando a janela mudar de tamanho
    // (inclui entrada/saída do modo tela cheia — F11)
    window.addEventListener("resize", () => this.resizePresentationCharts());
    document.addEventListener("fullscreenchange", () => this.resizePresentationCharts());
  },

  setDropdown(name) {
    if (name === "export") {
      this.els.exportMenu.hidden = !this.els.exportMenu.hidden;
      this.els.importMenu.hidden = true;
    } else {
      this.els.importMenu.hidden = !this.els.importMenu.hidden;
      this.els.exportMenu.hidden = true;
    }
    this.els.exportDropdownBtn.setAttribute("aria-expanded", String(!this.els.exportMenu.hidden));
    this.els.importDropdownBtn.setAttribute("aria-expanded", String(!this.els.importMenu.hidden));
  },

  closeDropdowns() {
    this.els.exportMenu.hidden = true;
    this.els.importMenu.hidden = true;
    this.els.exportDropdownBtn.setAttribute("aria-expanded", "false");
    this.els.importDropdownBtn.setAttribute("aria-expanded", "false");
  },

  /* ---------- Páginas ---------- */

  switchPage(page) {
    document.querySelectorAll(".tab-btn").forEach((b) => {
      b.classList.toggle("is-active", b.dataset.page === page);
    });
    this.els.pageDashboard.hidden = page !== "dashboard";
    this.els.pageEquipe.hidden = page !== "equipe";
    this.els.pageFiliais.hidden = page !== "filiais";
    if (page === "dashboard") this.renderAll();
    if (page === "equipe" && typeof Equipe !== "undefined") Equipe.renderTable();
    if (page === "filiais" && typeof Filiais !== "undefined") Filiais.renderTable();
    window.scrollTo({ top: 0, behavior: "smooth" });
  },

  /* ---------- Modal ---------- */

  openModal(preSelectedId) {
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
    if (this.els.presentationOverlay.hidden) return;
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
          `<button type="button" class="modal-tab${i === 0 ? " is-active" : ""}" data-tab="${t.id}">${t.label}</button>`
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
    this.els.modalFormBody.innerHTML = this.stateFieldHtml() + html;
    this.els.modalSubmit.textContent = submitLabel;
    this.editingVacancyId = null;
    this.custoSelectedEmployeeId = null;

    this.bindModalTabs();
    this.bindModalFormEvents(ind);
  },

  bindModalTabs() {
    this.els.modalTabs.querySelectorAll(".modal-tab").forEach((btn) => {
      btn.addEventListener("click", () => {
        this.els.modalTabs.querySelectorAll(".modal-tab").forEach((b) => b.classList.remove("is-active"));
        btn.classList.add("is-active");
        this.els.modalFormBody.querySelectorAll(".modal-panel").forEach((p) => {
          p.hidden = p.dataset.panel !== btn.dataset.tab;
        });
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
        <p class="field-hint">Período das ocorrências lançadas.</p>
      </div>
      <div class="modal-panel" data-panel="ocorrencia" hidden>
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
        <p class="field-hint">Total de ocorrências no período.</p>
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
      <div class="modal-panel" data-panel="historico" hidden>
        <div class="vacancy-list" id="vacancyList"></div>
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
        <div class="field">
          <label for="custoSearch">Buscar colaborador</label>
          <input type="search" id="custoSearch" class="input" placeholder="Nome, setor ou usuário...">
        </div>
        <div class="employee-picker" id="custoResults"></div>
        <p class="field-hint">Selecione um colaborador cadastrado na aba Equipe.</p>
      </div>
      <div class="modal-panel" data-panel="custo" hidden>
        <div class="field">
          <label for="custoSelected">Colaborador selecionado</label>
          <input type="text" id="custoSelected" class="input" readonly placeholder="Nenhum selecionado">
        </div>
        <div class="field">
          <label for="custoValue">Custo de contratação (R$)</label>
          <input type="number" min="0" step="any" id="custoValue" class="input" required placeholder="0,00">
        </div>
        <p class="field-hint" id="custoExistingHint"></p>
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
    let start = this.els.filterStart.value || null;
    let end = this.els.filterEnd.value || null;
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
    /* Absenteísmo: média entre faltas, atrasos e afastamentos do período */
    if (ind.id === "absenteismo") {
      const totals = this.absenteismoTypeTotals(filter);
      return (totals.falta + totals.atraso + totals.afastamento) / 3;
    }
    if (ind.id === "custo_contratacao") {
      const sum = entries.reduce((s, e) => s + e.value, 0);
      return sum / entries.length;
    }
    return entries[entries.length - 1].value;
  },

  /* ---------- KPIs ---------- */

  renderKpis() {
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
        return `
        <article class="kpi-card is-turnover" data-indicator="turnover_total" role="button" tabindex="0">
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
        return `
        <article class="kpi-card is-turnover" data-indicator="turnover_experiencia" role="button" tabindex="0">
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

        // Gráfico de pizza do turnover experiência no KPI
        const expPieCanvas = document.getElementById("experienciaKpiPie");
        if (expPieCanvas) {
            const desligadosExp = this.indicatorCurrentValue(getIndicatorById("turnover_experiencia"), filter) || 0;
            const ativosExp = Employees.list().filter(e => e.type === 'experiencia' && e.status === 'ativo').length || 0;
            
            const chart = Charts.createPieChart(expPieCanvas);
            // Ajusta a legenda para horizontal
            chart.options.plugins.legend.position = "bottom";
            chart.options.plugins.legend.labels.boxWidth = 12;
            
            Charts.updatePieChart(chart, [
                { label: "Desligados", value: desligadosExp },
                { label: "Ativos", value: ativosExp }
            ]);
            this._kpiCharts.push(chart);
        }
    });

    this.els.kpiGrid.querySelectorAll(".kpi-card").forEach((card) => {
      const select = () => {
        this.selectedIndicatorId = card.dataset.indicator;
        this.renderKpis();
        this.updateLineChartForSelection();
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

  /* Gráfico principal do card "Evolução do indicador" (REMOVIDO):
     barras por tipo para Absenteísmo; linha para os demais. */
  renderMainChart() {
    return;
    const filter = this.getDateFilter();
    const selected = getIndicatorById(this.els.chartIndicatorSelect.value) || INDICATORS[0];
    const canvas = document.getElementById("lineChart");
    // ... rest of original code ...
  },

  updateLineChartForSelection() {
    if (!this.els.chartIndicatorSelect) return;
    const indicatorId = this.selectedIndicatorId || this.els.chartIndicatorSelect.value;
    this.els.chartIndicatorSelect.value = indicatorId;
    // this.renderMainChart();
  },

  /* ---------- Tabela de lançamentos ---------- */

  renderTable() {
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
          <td class="col-action">
            <button class="btn-icon" data-remove="${entry.id}" data-indicator="${ind.id}" aria-label="Excluir lançamento">&times;</button>
          </td>
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
    this.renderTable();
    this.updateTotalChip();

    // this.renderMainChart();

    // 1. Turnover: Pizza (Entradas vs Saídas)
    const entradas = this.indicatorCurrentValue(getIndicatorById("turnover_entradas"), filter) || 0;
    const saidas = this.indicatorCurrentValue(getIndicatorById("turnover_saidas"), filter) || 0;
    Charts.updateTurnoverPie([
      { label: "Entradas", value: entradas },
      { label: "Saídas", value: saidas }
    ]);

    // 2. Panorama Principal (Barras e novos gráficos)
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
    Charts.updateBarChart(panorama);
  },

  updateTotalChip() {
    const filter = this.getDateFilter();
    let total = 0;
    INDICATORS.forEach((ind) => {
      total += this.filteredEntries(ind, filter).length;
    });
    const label = filter.start || filter.end
      ? `${total} lançamento(s) no período`
      : total === 1 ? "1 lançamento" : `${total} lançamentos`;
    if (this.els.totalChip) this.els.totalChip.textContent = label;
  },

  stateFieldHtml() {
    const current = this.currentState || "todos";
    const states = { RO: "Rondônia", AM: "Amazonas", PA: "Pará" };
    const options = ["todos", "RO", "AM", "PA"]
      .map((s) => `<option value="${s}"${current === s ? " selected" : ""}>${s === "todos" ? "Todos Estados" : `${s} — ${states[s]}`}</option>`)
      .join("");
    return `
      <div class="field field-estado">
        <label for="entryEstado">Estado do lançamento</label>
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

    // Turnover Entradas/Saídas ficam no gráfico de pizza — fora da evolução
    const allOptions = INDICATORS
      .filter((ind) => ind.id !== "turnover_entradas" && ind.id !== "turnover_saidas")
      .map((ind) => `<option value="${ind.id}">${escapeHtml(ind.name)}</option>`)
      .join("");
    if (this.els.chartIndicatorSelect) this.els.chartIndicatorSelect.innerHTML = allOptions;

    const chartableIndicators = INDICATORS.filter(
      (ind) => ind.id !== "turnover_entradas" && ind.id !== "turnover_saidas"
    );

    if (chartableIndicators.length > 0 && this.els.chartIndicatorSelect) {
      let best = chartableIndicators[0];
      let bestCount = -1;
      chartableIndicators.forEach((ind) => {
        const count = Storage.getEntriesFor(ind.id).length;
        if (count > bestCount) {
          bestCount = count;
          best = ind;
        }
      });
      this.els.chartIndicatorSelect.value = best.id;
      this.selectedIndicatorId = best.id;
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