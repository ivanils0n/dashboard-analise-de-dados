/* Exportação via SheetJS (xlsx/csv). Sem importação por planilha: todo o
   lançamento de dados é feito à mão nos modais (ver LaunchModal.vue). */

let xlsxModule = null;
async function loadXLSX() {
  if (!xlsxModule) xlsxModule = await import("xlsx");
  return xlsxModule;
}
import { getEntriesFor, getOcorrencias, getBranches, getVacancies, getTurnovers, getPermanencias, getHeadcounts } from "./store";
import { todayISO, formatDate } from "./utils";

const FORMULA_LEAD = /^[=+\-@]/;

function sheetSafe(v) {
  if (typeof v === "string" && FORMULA_LEAD.test(v)) return "'" + v;
  return v;
}

function safeRows(rows) {
  return rows.map((row) => row.map(sheetSafe));
}

const VAGA_HEADER = [
  "Nome da vaga", "Data de abertura", "Data de fechamento", "Tipo de contratação",
  "Salário (R$)", "Estado", "Filial", "Recrutador", "Motivo da Contratação", "Status", "Tempo (dias)"
];

function vagasRows(list) {
  const rows = [VAGA_HEADER];
  (list || []).forEach((v) => {
    const days = v.openAt && v.closeAt ? (new Date(v.closeAt) - new Date(v.openAt)) / 86400000 : null;
    rows.push([
      v.name || "",
      v.openAt ? String(v.openAt).slice(0, 10) : "",
      v.closeAt ? String(v.closeAt).slice(0, 10) : "",
      v.tipoContratacao ? String(v.tipoContratacao).toUpperCase() : "",
      v.salario != null ? Number(v.salario) : null,
      v.estado || "",
      v.filial || "",
      v.recrutador || "",
      v.motivoContratacao || "",
      v.closeAt ? "Fechada" : "Aberta",
      days === null || isNaN(days) ? null : Number(days.toFixed(1))
    ]);
  });
  return rows;
}

const TURNOVER_HEADER = ["Filial", "Mês de referência", "Admitidos", "Demitidos", "Ativos", "Estado"];

function turnoverRows(list) {
  const rows = [TURNOVER_HEADER];
  (list || []).forEach((t) => {
    rows.push([
      t.filial || "",
      t.mesReferencia || "",
      Number(t.admitidos) || 0,
      Number(t.demitidos) || 0,
      Number(t.ativos) || 0,
      t.estado || ""
    ]);
  });
  return rows;
}

const PERMANENCIA_HEADER = ["Colaborador", "Data de admissão", "Data de demissão", "Filial", "Estado"];

function permanenciaRows(list) {
  const rows = [PERMANENCIA_HEADER];
  (list || []).forEach((p) => {
    rows.push([
      p.colaborador || "",
      p.dataAdmissao ? String(p.dataAdmissao).slice(0, 10) : "",
      p.dataDemissao ? String(p.dataDemissao).slice(0, 10) : "",
      p.filial || "",
      p.estado || ""
    ]);
  });
  return rows;
}

const HEADCOUNT_HEADER = ["Código", "Colaborador", "Empresa", "Filial", "Função", "Data de admissão", "Estado", "Gênero", "Data de desligamento", "Mês referente"];

function headcountRows(list) {
  const rows = [HEADCOUNT_HEADER];
  (list || []).forEach((h) => {
    rows.push([
      h.codigo || "",
      h.colaborador || "",
      h.empresa || "",
      h.filial || "",
      h.funcao || "",
      h.dataAdmissao ? String(h.dataAdmissao).slice(0, 10) : "",
      h.estado || "",
      h.genero ? (String(h.genero).toLowerCase() === "feminino" ? "Feminino" : "Masculino") : "",
      h.dataDesligamento ? String(h.dataDesligamento).slice(0, 10) : "",
      h.mesReferente ? String(h.mesReferente).slice(0, 7) : ""
    ]);
  });
  return rows;
}

const FILIAL_HEADER = ["CNPJ", "Nome Filial", "Filial Abreviado", "Gerente", "Estado"];

function filiaisRows(list) {
  const rows = [FILIAL_HEADER];
  (list || []).forEach((b) => {
    rows.push([b.cnpj, b.name, b.shortName, b.manager || "", b.estado || ""]);
  });
  return rows;
}

const DIARIA_HEADER = ["Data", "Colaborador", "Função", "Filial", "Motivo", "Valor", "Estado"];

function diariasRows(list) {
  const rows = [DIARIA_HEADER];
  (list || []).forEach((e) => {
    const m = e.meta || {};
    rows.push([
      e.date || "",
      m.employeeName || "",
      m.funcao || "",
      m.filial || "",
      m.motivo || "",
      Number(e.value) || 0,
      m.estado || ""
    ]);
  });
  return rows;
}

const TREINAMENTO_HEADER = ["Competência", "Colaborador", "Cargo", "Filial", "Gerente regional", "Tema", "Modalidade", "Carga horária (horas)", "Estado"];

function treinamentosRows(list) {
  const rows = [TREINAMENTO_HEADER];
  (list || []).forEach((e) => {
    const m = e.meta || {};
    rows.push([
      m.competencia || (e.date ? String(e.date).slice(0, 7) : ""),
      m.employeeName || "",
      m.cargo || "",
      m.filial || "",
      m.gerenteRegional || "",
      m.tema || "",
      m.modalidade || "",
      Number(e.value) || 0,
      m.estado || ""
    ]);
  });
  return rows;
}

const CUSTO_FOLHA_HEADER = ["Competência", "CNPJ", "Razão Social", "Percentual (%)", "Valor", "Estado"];

function custoFolhaRows(list) {
  const rows = [CUSTO_FOLHA_HEADER];
  (list || []).forEach((e) => {
    const m = e.meta || {};
    rows.push([
      m.competencia || (e.date ? String(e.date).slice(0, 7) : ""),
      m.cnpj || "",
      m.razaoSocial || "",
      m.percent != null ? Number(m.percent) : null,
      Number(e.value) || 0,
      m.estado || ""
    ]);
  });
  return rows;
}

const ABSENTEISMO_HEADER = [
  "Data",
  "Colaborador",
  "Função",
  "Filial",
  "Estado",
  "Motivo",
  "Advertência",
  "Acidente de trabalho",
  "Observação"
];

function absenteismoRows(list) {
  const rows = [ABSENTEISMO_HEADER];
  (list || [])
    .slice()
    .sort((a, b) => String(b.date).localeCompare(String(a.date)))
    .forEach((e) => {
      const m = e.meta || {};
      rows.push([
        e.date ? formatDate(e.date) : "",
        m.colaborador || "",
        m.setor || "",
        m.filial || "",
        m.estado || "",
        m.motivo && m.motivo !== "Presente" ? m.motivo : "",
        m.advertencia ? "Sim" : "",
        m.acidente ? "Sim" : "",
        m.observacao || ""
      ]);
    });
  return rows;
}

function allTables() {
  return [
    { name: "Vagas", rows: vagasRows(getVacancies()), cols: [28, 16, 18, 20, 14, 10, 14, 12, 14] },
    { name: "Turnover", rows: turnoverRows(getTurnovers()), cols: [20, 16, 12, 12, 10, 10] },
    { name: "Permanência", rows: permanenciaRows(getPermanencias()), cols: [28, 18, 18, 10] },
    { name: "Headcount", rows: headcountRows(getHeadcounts()), cols: [28, 14, 22, 16, 22, 16, 10, 12] },
    { name: "Filiais", rows: filiaisRows(getBranches()), cols: [14, 22, 30, 18, 22, 10] },
    { name: "Diárias", rows: diariasRows(getEntriesFor("custo_diaria")), cols: [12, 28, 20, 20, 26, 14, 10] },
    { name: "Treinamentos", rows: treinamentosRows(getEntriesFor("treinamento")), cols: [14, 28, 20, 20, 26, 14, 20, 10] },
    { name: "Custo de Folha", rows: custoFolhaRows(getEntriesFor("custo_total")), cols: [14, 22, 30, 14, 14, 10] },
    { name: "Absenteísmo", rows: absenteismoRows(getOcorrencias()), cols: [12, 30, 22, 14, 8, 18, 12, 18, 30] }
  ].filter((t) => t.rows.length > 1);
}

function colsToWch(cols) {
  return cols.map((wch) => ({ wch }));
}

export async function toXLSX() {
  const XLSX = await loadXLSX();
  const workbook = XLSX.utils.book_new();
  allTables().forEach(({ name, rows, cols }) => {
    const sheet = XLSX.utils.aoa_to_sheet(safeRows(rows));
    sheet["!cols"] = colsToWch(cols);
    XLSX.utils.book_append_sheet(workbook, sheet, name);
  });
  XLSX.writeFile(workbook, `gente-gestao-dados_${todayISO()}.xlsx`);
}

export async function toCSV() {
  const XLSX = await loadXLSX();
  const date = todayISO();
  allTables().forEach(({ name, rows, cols }) => {
    const workbook = XLSX.utils.book_new();
    const sheet = XLSX.utils.aoa_to_sheet(safeRows(rows));
    sheet["!cols"] = colsToWch(cols);
    XLSX.utils.book_append_sheet(workbook, sheet, name);
    const slug = name
      .toLowerCase()
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .replace(/[^a-z0-9]+/g, "-");
    XLSX.writeFile(workbook, `gente-gestao-${slug}_${date}.csv`, { bookType: "csv" });
  });
}

export async function exportVagas(list) {
  const XLSX = await loadXLSX();
  const workbook = XLSX.utils.book_new();
  const sheet = XLSX.utils.aoa_to_sheet(safeRows(vagasRows(list)));
  sheet["!cols"] = colsToWch([28, 16, 18, 20, 14, 10, 14, 12, 14]);
  XLSX.utils.book_append_sheet(workbook, sheet, "Vagas");
  XLSX.writeFile(workbook, `gente-gestao-vagas_${todayISO()}.xlsx`);
}

export async function exportTurnover(list, filename) {
  const XLSX = await loadXLSX();
  const workbook = XLSX.utils.book_new();
  const sheet = XLSX.utils.aoa_to_sheet(safeRows(turnoverRows(list)));
  sheet["!cols"] = colsToWch([20, 16, 12, 12, 10, 10]);
  XLSX.utils.book_append_sheet(workbook, sheet, "Turnover");
  XLSX.writeFile(workbook, `gente-gestao-${filename || "turnover"}_${todayISO()}.xlsx`);
}

export async function exportPermanencia(list) {
  const XLSX = await loadXLSX();
  const workbook = XLSX.utils.book_new();
  const sheet = XLSX.utils.aoa_to_sheet(safeRows(permanenciaRows(list)));
  sheet["!cols"] = colsToWch([28, 18, 18, 10]);
  XLSX.utils.book_append_sheet(workbook, sheet, "Permanência");
  XLSX.writeFile(workbook, `gente-gestao-permanencia_${todayISO()}.xlsx`);
}

export async function exportHeadcount(list) {
  const XLSX = await loadXLSX();
  const workbook = XLSX.utils.book_new();
  const sheet = XLSX.utils.aoa_to_sheet(safeRows(headcountRows(list)));
  sheet["!cols"] = colsToWch([12, 28, 14, 22, 16, 18, 10, 12]);
  XLSX.utils.book_append_sheet(workbook, sheet, "Headcount");
  XLSX.writeFile(workbook, `gente-gestao-headcount_${todayISO()}.xlsx`);
}

export async function exportOcorrencias(list, filename = "absenteismo") {
  const XLSX = await loadXLSX();
  const rows = [
    ["Data", "Colaborador", "Função", "Filial", "Estado", "Motivo", "Dias de ausência", "Advertência", "Acidente de trabalho", "Observação"]
  ];
  (list || []).forEach((o) => {
    rows.push([
      o.date ? formatDate(o.date) : "",
      o.colaborador || "",
      o.setor || "",
      o.filial || "",
      o.estado || "",
      o.motivo && o.motivo !== "Presente" ? o.motivo : "",
      Number(o.dias) || 0,
      o.advertencia ? "Sim" : "",
      o.acidente ? "Sim" : "",
      o.observacao || ""
    ]);
  });
  const workbook = XLSX.utils.book_new();
  const sheet = XLSX.utils.aoa_to_sheet(safeRows(rows));
  sheet["!cols"] = colsToWch([12, 30, 22, 14, 8, 16, 10, 12, 18, 30]);
  XLSX.utils.book_append_sheet(workbook, sheet, "Absenteísmo");
  XLSX.writeFile(workbook, `gente-gestao-${filename}_${todayISO()}.xlsx`);
}
