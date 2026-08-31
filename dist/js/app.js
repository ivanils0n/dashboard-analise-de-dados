/* =========================================================
   Inicialização da aplicação
   ========================================================= */

document.addEventListener("DOMContentLoaded", async () => {
  await bootstrapSupabase();

  Dialog.init();
  ui.init();
  Equipe.init();
  Filiais.init();
  Departamentos.init();
  Charts.init();
  Employees.syncAll();
  ui.renderAll();
  Equipe.renderTable();
  Filiais.renderTable();
  Departamentos.renderTable();
});