/* Exportação via SheetJS (xlsx/csv). Sem importação por planilha: todo o
   lançamento de dados é feito à mão nos modais (ver LaunchModal.vue). */

import * as XLSX from "xlsx";
import { getEntriesFor, getBranches, getVacancies, getTurnovers, getPermanencias, getHeadcounts } from "./store";
import { todayISO } from "./utils";

/* Previne "formula injection": texto iniciado com = + - @ vira texto puro
   (prefixo ') para nunca executar fórmula em planilha. */
const FORMULA_LEAD = /^[=+\-@]/;

function sheetSafe(v) {
  if (typeof v === "string" && FORMULA_LEAD.test(v)) return "'" + v;
  return v;
}

function safeRows(rows) {
  return rows.map((row) => row.map(sheetSafe));
}

/* ---------- Linhas de cada tabela (reaproveitadas pelo export por tela e
   pelo "Baixar em XLSX/CSV" do menu, que baixa todas de uma vez). ---------- */

const VAGA_HEADER = [
  "Nome da vaga", "Data de abertura", "Data de fechamento", "Tipo de contratação",
  "Salário (R$)", "Estado", "Filial", "Recrutador", "Status", "Tempo (dias)"
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

const HEADCOUNT_HEADER = ["Colaborador", "Empresa", "Função", "Remuneração", "Data de admissão", "Estado", "Status"];

function headcountRows(list) {
  const rows = [HEADCOUNT_HEADER];
  (list || []).forEach((h) => {
    rows.push([
      h.colaborador || "",
      h.filial || "",
      h.funcao || "",
      h.remuneracao != null ? Number(h.remuneracao) : null,
      h.dataAdmissao ? String(h.dataAdmissao).slice(0, 10) : "",
      h.estado || "",
      h.status === "demitido" ? "Demitido" : "Ativo"
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

const DIARIA_HEADER = ["Data", "Colaborador", "Função", "Filial", "Motivo", "Valor", "Estado", "Sem período"];

function diariasRows(list) {
  const rows = [DIARIA_HEADER];
  (list || []).forEach((e) => {
    const m = e.meta || {};
    rows.push([
      m.semPeriodo ? "" : e.date || "",
      m.employeeName || "",
      m.funcao || "",
      m.filial || "",
      m.motivo || "",
      Number(e.value) || 0,
      m.estado || "",
      m.semPeriodo ? "Sim" : "Não"
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

const ABSENTEISMO_HEADER = ["Competência", "Valor", "Estado"];

function absenteismoRows(list) {
  const rows = [ABSENTEISMO_HEADER];
  (list || []).forEach((e) => {
    const m = e.meta || {};
    rows.push([m.competencia || (e.date ? String(e.date).slice(0, 7) : ""), Number(e.value) || 0, m.estado || ""]);
  });
  return rows;
}

/* Todas as tabelas atualmente carregadas no navegador (a fonte é sempre o
   store — os mesmos dados já em tela, sem nova requisição). */
function allTables() {
  return [
    { name: "Vagas", rows: vagasRows(getVacancies()), cols: [28, 16, 18, 20, 14, 10, 14, 12, 14] },
    { name: "Turnover", rows: turnoverRows(getTurnovers()), cols: [20, 16, 12, 12, 10, 10] },
    { name: "Permanência", rows: permanenciaRows(getPermanencias()), cols: [28, 18, 18, 10] },
    { name: "Headcount", rows: headcountRows(getHeadcounts()), cols: [28, 14, 22, 16, 18, 10, 12] },
    { name: "Filiais", rows: filiaisRows(getBranches()), cols: [14, 22, 30, 18, 22, 10] },
    { name: "Diárias", rows: diariasRows(getEntriesFor("custo_diaria")), cols: [12, 28, 20, 20, 26, 14, 10, 12] },
    { name: "Treinamentos", rows: treinamentosRows(getEntriesFor("treinamento")), cols: [14, 28, 20, 20, 26, 14, 20, 10] },
    { name: "Custo de Folha", rows: custoFolhaRows(getEntriesFor("custo_total")), cols: [14, 22, 30, 14, 14, 10] },
    { name: "Absenteísmo", rows: absenteismoRows(getEntriesFor("absenteismo")), cols: [14, 14, 10] }
  ].filter((t) => t.rows.length > 1); // pula tabelas sem nenhum registro lançado
}

function colsToWch(cols) {
  return cols.map((wch) => ({ wch }));
}

/* "Baixar em XLSX": um único arquivo, uma aba por tabela carregada. */
export function toXLSX() {
  const workbook = XLSX.utils.book_new();
  allTables().forEach(({ name, rows, cols }) => {
    const sheet = XLSX.utils.aoa_to_sheet(safeRows(rows));
    sheet["!cols"] = colsToWch(cols);
    XLSX.utils.book_append_sheet(workbook, sheet, name);
  });
  XLSX.writeFile(workbook, `gente-gestao-dados_${todayISO()}.xlsx`);
}

/* "Baixar em CSV": CSV não suporta múltiplas abas num único arquivo, então
   baixa um .csv por tabela carregada (um download por tabela). */
export function toCSV() {
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

/* ---------- Exportações por tela (botão "Exportar" de cada modal) ---------- */

export function exportVagas(list) {
  const workbook = XLSX.utils.book_new();
  const sheet = XLSX.utils.aoa_to_sheet(safeRows(vagasRows(list)));
  sheet["!cols"] = colsToWch([28, 16, 18, 20, 14, 10, 14, 12, 14]);
  XLSX.utils.book_append_sheet(workbook, sheet, "Vagas");
  XLSX.writeFile(workbook, `gente-gestao-vagas_${todayISO()}.xlsx`);
}

export function exportTurnover(list, filename) {
  const workbook = XLSX.utils.book_new();
  const sheet = XLSX.utils.aoa_to_sheet(safeRows(turnoverRows(list)));
  sheet["!cols"] = colsToWch([20, 16, 12, 12, 10, 10]);
  XLSX.utils.book_append_sheet(workbook, sheet, "Turnover");
  XLSX.writeFile(workbook, `gente-gestao-${filename || "turnover"}_${todayISO()}.xlsx`);
}

export function exportPermanencia(list) {
  const workbook = XLSX.utils.book_new();
  const sheet = XLSX.utils.aoa_to_sheet(safeRows(permanenciaRows(list)));
  sheet["!cols"] = colsToWch([28, 18, 18, 10]);
  XLSX.utils.book_append_sheet(workbook, sheet, "Permanência");
  XLSX.writeFile(workbook, `gente-gestao-permanencia_${todayISO()}.xlsx`);
}

export function exportHeadcount(list) {
  const workbook = XLSX.utils.book_new();
  const sheet = XLSX.utils.aoa_to_sheet(safeRows(headcountRows(list)));
  sheet["!cols"] = colsToWch([12, 28, 14, 22, 16, 18, 10, 12]);
  XLSX.utils.book_append_sheet(workbook, sheet, "Headcount");
  XLSX.writeFile(workbook, `gente-gestao-headcount_${todayISO()}.xlsx`);
}
