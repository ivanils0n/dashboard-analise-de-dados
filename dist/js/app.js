/* =========================================================
   Inicialização da aplicação
   ========================================================= */

document.addEventListener("DOMContentLoaded", async () => {
  await bootstrapSupabase();

  Dialog.init();
  ui.init();
  Equipe.init();
  Filiais.init();
  Charts.init();
  Employees.syncAll();
  ui.renderAll();
  Equipe.renderTable();
  Filiais.renderTable();

  if (ui.els.chartIndicatorSelect) {
    ui.els.chartIndicatorSelect.addEventListener("change", () => {
      ui.selectedIndicatorId = ui.els.chartIndicatorSelect.value;
      ui.renderKpis();
      ui.updateLineChartForSelection();
    });
  }

  ui.updateLineChartForSelection();
});