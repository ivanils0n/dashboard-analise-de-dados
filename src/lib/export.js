/* Exportação/importação via SheetJS (xlsx/csv/template). */

import * as XLSX from "xlsx";
import {
  getAllEntries,
  getEntriesFor,
  getEmployees,
  getBranches,
  getBranchById,
  getDepartments,
  getLatestForMeta,
  upsertEmployee,
  upsertBranch,
  upsertDepartment,
  addEntry
} from "./store";
import { INDICATORS, STATES, STATUS_LABELS, TYPE_LABELS } from "./config";
import { activeStates, syncAll, findBranchByShortName } from "./employees";
import { createId, nowLocalISO, todayISO, parseHoursBR, compareDateDesc } from "./utils";

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

/* Localiza colunas pelo cabeçalho (vários nomes aceitos). */
const colIndex = (headerRow) => (...names) => {
  const targets = names.map((n) => n.toLowerCase());
  return headerRow.findIndex((h) => targets.includes(String(h ?? "").trim().toLowerCase()));
};

/* Localiza colunas por trecho do nome (ignora acentos e caracteres especiais).
   Aceita tokens a incluir e tokens a excluir (evita falsos positivos). */
const normHeader = (s) =>
  String(s ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]/g, "");

const headFind = (headerRow, tokens, exclude = []) => {
  const inc = tokens.map(normHeader);
  const exc = exclude.map(normHeader);
  return headerRow.findIndex((h) => {
    const n = normHeader(h);
    if (exc.some((x) => x && n.includes(x))) return false;
    return inc.some((x) => x && n.includes(x));
  });
};

function buildEntryRows() {
  const rows = [["Data", "Indicador", "Valor", "Unidade", "Estado", "Meta"]];
  const all = getAllEntries();
  const flat = [];
  INDICATORS.forEach((ind) => {
    (all[ind.id] || []).forEach((e) => flat.push({ ind, ...e }));
  });
  flat.sort((a, b) => compareDateDesc(a.date, b.date));
  flat.forEach((row) => {
    rows.push([
      row.date,
      row.ind.name,
      Number(row.value),
      row.ind.unit,
      (row.meta && row.meta.estado) || "",
      row.meta ? JSON.stringify(row.meta) : ""
    ]);
  });
  return rows;
}

export function toXLSX() {
  const workbook = XLSX.utils.book_new();

  // ---- Planilha 1: Indicadores (por estado) ----
  const indicatorStates = activeStates();
  const indicatorRows = [
    ["Indicador", "Estado", "Último valor", "Unidade", "Total de lançamentos", "Última atualização"]
  ];
  INDICATORS.forEach((ind) => {
    indicatorStates.forEach((state) => {
      const list = getEntriesFor(ind.id, state);
      const latest = list.length ? list[list.length - 1] : null;
      indicatorRows.push([
        ind.name,
        state,
        latest ? Number(latest.value) : null,
        ind.unit,
        list.length,
        latest ? latest.date : null
      ]);
    });
  });
  const sheetIndicators = XLSX.utils.aoa_to_sheet(safeRows(indicatorRows));
  sheetIndicators["!cols"] = [{ wch: 32 }, { wch: 8 }, { wch: 14 }, { wch: 14 }, { wch: 20 }, { wch: 14 }];
  XLSX.utils.book_append_sheet(workbook, sheetIndicators, "Indicadores");

  // ---- Planilha 2: Lançamentos ----
  const sheetEntries = XLSX.utils.aoa_to_sheet(safeRows(buildEntryRows()));
  sheetEntries["!cols"] = [{ wch: 12 }, { wch: 32 }, { wch: 14 }, { wch: 12 }, { wch: 10 }, { wch: 60 }];
  XLSX.utils.book_append_sheet(workbook, sheetEntries, "Lançamentos");

  // ---- Planilha 3: Equipe ----
  const employeeRows = [
    ["Colaborador", "Setor", "Cargo", "Usuário", "Entrada", "Status", "Tipo", "Conta no turnover", "Registro", "Última atualização", "Custo de contratação (R$)", "Salário (R$)", "Vale-transporte (R$)", "Vale-alimentação (R$)", "INSS (R$)", "FGTS (R$)", "IRRF (R$)", "Premiação art. 62 (R$)", "Premiação loja (R$)", "Comissão (R$)", "Líder imediato", "Gerente regional", "Estado", "Filial"]
  ];
  getEmployees().forEach((e) => {
    const cost = getLatestForMeta("custo_contratacao", "employeeId", e.id);
    const branch = e.filialId ? getBranchById(e.filialId) : null;
    employeeRows.push([
      e.name,
      e.sector,
      e.cargo || "",
      e.user,
      e.hiredAt ? String(e.hiredAt).split("T")[0] : null,
      STATUS_LABELS[e.status] || e.status,
      TYPE_LABELS[e.type] || e.type,
      e.countsTurnover ? "Sim" : "Não",
      e.createdAt,
      e.updatedAt,
      cost ? Number(cost.value) : null,
      e.salario != null ? Number(e.salario) : null,
      e.valeTransporte != null ? Number(e.valeTransporte) : null,
      e.valeAlimentacao != null ? Number(e.valeAlimentacao) : null,
      e.inss != null ? Number(e.inss) : null,
      e.fgts != null ? Number(e.fgts) : null,
      e.irrf != null ? Number(e.irrf) : null,
      e.premioArt62 != null ? Number(e.premioArt62) : null,
      e.premioLoja != null ? Number(e.premioLoja) : null,
      e.comissao != null ? Number(e.comissao) : null,
      e.liderImediato || "",
      e.gerenteRegional || "",
      e.estado || "",
      branch ? branch.shortName : ""
    ]);
  });
  const sheetEmployees = XLSX.utils.aoa_to_sheet(safeRows(employeeRows));
  sheetEmployees["!cols"] = [{ wch: 24 }, { wch: 20 }, { wch: 20 }, { wch: 16 }, { wch: 12 }, { wch: 12 }, { wch: 16 }, { wch: 18 }, { wch: 20 }, { wch: 20 }, { wch: 22 }, { wch: 14 }, { wch: 18 }, { wch: 20 }, { wch: 12 }, { wch: 12 }, { wch: 12 }, { wch: 20 }, { wch: 16 }, { wch: 12 }, { wch: 18 }, { wch: 20 }, { wch: 8 }, { wch: 14 }];
  XLSX.utils.book_append_sheet(workbook, sheetEmployees, "Equipe");

  // ---- Planilha 4: Filiais ----
  const branchRows = [["Id Filial", "CNPJ", "Nome Filial", "Filial Abreviado", "Gerente", "Estado"]];
  getBranches().forEach((b) => {
    branchRows.push([b.branchId, b.cnpj, b.name, b.shortName, b.manager || "", b.estado || ""]);
  });
  const sheetBranches = XLSX.utils.aoa_to_sheet(safeRows(branchRows));
  sheetBranches["!cols"] = [{ wch: 14 }, { wch: 22 }, { wch: 30 }, { wch: 18 }, { wch: 22 }, { wch: 10 }];
  XLSX.utils.book_append_sheet(workbook, sheetBranches, "Filiais");

  // ---- Planilha 5: Departamentos ----
  const departmentRows = [["Departamento", "Sigla", "Estado"]];
  getDepartments().forEach((d) => {
    departmentRows.push([d.name, d.shortName || "", d.estado || ""]);
  });
  const sheetDepartments = XLSX.utils.aoa_to_sheet(safeRows(departmentRows));
  sheetDepartments["!cols"] = [{ wch: 32 }, { wch: 12 }, { wch: 10 }];
  XLSX.utils.book_append_sheet(workbook, sheetDepartments, "Departamentos");

  XLSX.writeFile(workbook, `gente-gestao-dados_${todayISO()}.xlsx`);
}

export function toCSV() {
  const workbook = XLSX.utils.book_new();
  const sheet = XLSX.utils.aoa_to_sheet(safeRows(buildEntryRows()));
  sheet["!cols"] = [{ wch: 12 }, { wch: 32 }, { wch: 14 }, { wch: 12 }, { wch: 10 }, { wch: 60 }];
  XLSX.utils.book_append_sheet(workbook, sheet, "Lançamentos");
  XLSX.writeFile(workbook, `gente-gestao-dados_${todayISO()}.csv`, { bookType: "csv" });
}

export function downloadTemplate() {
  const workbook = XLSX.utils.book_new();

  const entriesSheet = XLSX.utils.aoa_to_sheet([
    ["Data", "Indicador", "Valor", "Unidade", "Estado", "Meta"],
    ["2026-08-19", "Headcount", 120, "colaboradores", "RO", ""],
    ["2026-08-19", "Absenteísmo", 3, "ocorrências", "RO", ""]
  ]);
  XLSX.utils.book_append_sheet(workbook, entriesSheet, "Lançamentos");

  const teamSheet = XLSX.utils.aoa_to_sheet([
    ["Colaborador", "Setor", "Cargo", "Usuário", "Entrada", "Status", "Tipo", "Conta no turnover", "Registro", "Última atualização", "Custo de contratação (R$)", "Salário (R$)", "Vale-transporte (R$)", "Vale-alimentação (R$)", "INSS (R$)", "FGTS (R$)", "IRRF (R$)", "Premiação art. 62 (R$)", "Premiação loja (R$)", "Comissão (R$)", "Líder imediato", "Gerente regional", "Estado", "Filial"],
    ["Maria Silva", "RH", "Analista de RH", "3375", "2026-08-19", "Ativo", "Efetivado", "Não", "2026-08-19T09:00:00", "2026-08-19T09:00:00", 2500, 3500, 200, 400, 350, 280, 0, 150, 0, 300, "João Souza", "Carlos Lima", "RO", "PVH 1"]
  ]);
  XLSX.utils.book_append_sheet(workbook, teamSheet, "Equipe");

  const filiaisSheet = XLSX.utils.aoa_to_sheet([
    ["Id Filial", "CNPJ", "Nome Filial", "Filial Abreviado", "Gerente", "Estado"],
    ["FIL-001", "00.000.000/0000-00", "Filial Porto Velho", "PVH", "João Silva", "RO"],
    ["FIL-002", "11.111.111/1111-11", "Filial Manaus", "MAO", "", "AM"]
  ]);
  filiaisSheet["!cols"] = [{ wch: 14 }, { wch: 22 }, { wch: 30 }, { wch: 18 }, { wch: 22 }, { wch: 10 }];
  XLSX.utils.book_append_sheet(workbook, filiaisSheet, "Filiais");

  const departamentosSheet = XLSX.utils.aoa_to_sheet([
    ["Departamento", "Sigla", "Estado"],
    ["RECURSOS HUMANOS", "RH", "RO"],
    ["TECNOLOGIA DA INFORMAÇÃO", "TI", "AM"],
    ["OPERAÇÕES", "OPS", "PA"]
  ]);
  departamentosSheet["!cols"] = [{ wch: 32 }, { wch: 12 }, { wch: 10 }];
  XLSX.utils.book_append_sheet(workbook, departamentosSheet, "Departamentos");

  XLSX.writeFile(workbook, `gente-gestao-template_${todayISO()}.xlsx`);
}

export function importFile(file, onResult) {
  if (!file) return;
  const reader = new FileReader();
  reader.onload = (e) => {
    try {
      const wb = XLSX.read(new Uint8Array(e.target.result), { type: "array" });
      const summary = importWorkbook(wb);
      syncAll();
      onResult && onResult(summary);
    } catch (err) {
      console.error(err);
      onResult && onResult({ error: true });
    }
  };
  reader.readAsArrayBuffer(file);
}

/* Lê um arquivo (.xlsx/.xls/.csv) e devolve a workbook (promise). */
export function readWorkbookFile(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        resolve(XLSX.read(new Uint8Array(e.target.result), { type: "array" }));
      } catch (err) {
        reject(err);
      }
    };
    reader.onerror = reject;
    reader.readAsArrayBuffer(file);
  });
}

/* Converte a primeira linha de uma planilha em array de arrays.
   `raw: false` devolve o texto formatado da célula — necessário para ler
   horários como "01:30" em vez do número serial do Excel (0,0625). */
function sheetRows(sheet, { raw = true } = {}) {
  if (!sheet) return [];
  return XLSX.utils.sheet_to_json(sheet, { header: 1, raw });
}

function parseDateText(raw) {
  const d = normalizeDate(raw);
  return d ? d + "T00:00:00" : null;
}

/* ---------- Planilha EQUIPE ---------- */

export const EQUIPE_TEMPLATE_HEADER = [
  "Colaborador", "Setor", "Cargo", "Usuário", "Entrada", "Status", "Tipo", "Conta no turnover", "Registro", "Última atualização", "Custo de contratação (R$)", "Salário (R$)", "Vale-transporte (R$)", "Vale-alimentação (R$)", "INSS (R$)", "FGTS (R$)", "IRRF (R$)", "Premiação art. 62 (R$)", "Premiação loja (R$)", "Comissão (R$)", "Líder imediato", "Gerente regional", "Estado", "Filial"
];

/* Lê a planilha "Equipe" e devolve candidatos a colaborador (sem gravar).
   Cada item expõe { valid, name, sector, user, estado, employee, costValue }.
   O `defaultEstado` é usado quando a linha não informa o estado. */
export function parseEmployeeSheet(sheet, defaultEstado = null) {
  const rows = sheetRows(sheet);
  const headerRow = rows[0] || [];
  const findCol = colIndex(headerRow);
  const iName = findCol("colaborador");
  const iSector = findCol("setor");
  const iCargo = findCol("cargo");
  const iUser = findCol("usuário", "usuario");
  const iHired = findCol("entrada");
  const iStatus = findCol("status");
  const iType = findCol("tipo");
  const iTurnover = findCol("conta no turnover");
  const iCreated = findCol("registro");
  const iUpdated = findCol("última atualização", "ultima atualizacao");
  const iCost = headerRow.findIndex((h) => String(h ?? "").toLowerCase().startsWith("custo"));
  const iSalary = headerRow.findIndex((h) => String(h ?? "").toLowerCase().startsWith("sal"));
  const iValeT = headFind(headerRow, ["valetransporte", "vale transporte", "vt"]);
  /* "va" sozinho casaria com "Vale-transporte"; só aceita "VA" exato. */
  let iValeA = headFind(headerRow, ["valealimentacao", "vale alimentacao"]);
  if (iValeA < 0) iValeA = findCol("va");
  const iInss = headFind(headerRow, ["inss"]);
  const iFgts = headFind(headerRow, ["fgts"]);
  const iIrrf = headFind(headerRow, ["irrf"]);
  const iPremioArt = headFind(headerRow, ["art62", "artigo62"]);
  const iPremioLoja = headFind(headerRow, ["loja"]);
  const iComissao = headFind(headerRow, ["comiss"]);
  const iLider = headFind(headerRow, ["lider"]);
  const iGerente = headFind(headerRow, ["gerente"]);
  const iEstado = findCol("estado");
  /* "Filial" (nome abreviado). Evita casar com "Premiação loja (R$)" ou
     "Nome Filial" da aba Filiais. */
  const iFilial = headFind(
    headerRow,
    ["filial", "abreviado", "sigla", "loja"],
    ["premio", "premiacao"]
  );

  const items = [];
  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    if (!row || !row.length) continue;
    const upperTrim = (v) => String(v ?? "").trim().toUpperCase();
    const name = upperTrim(cellAt(row, iName));
    const sector = upperTrim(cellAt(row, iSector));
    const user = upperTrim(cellAt(row, iUser));
    const estadoRaw = String(cellAt(row, iEstado)).trim().toUpperCase();
    const estado = STATES.includes(estadoRaw)
      ? estadoRaw
      : defaultEstado && defaultEstado !== "todos"
        ? defaultEstado
        : null;

    const filialText = String(cellAt(row, iFilial)).trim();
    const filial = filialText ? findBranchByShortName(filialText) : null;

    const valid = !!(name && user && estado);
    const createdAt = normalizeDateTime(cellAt(row, iCreated)) || nowLocalISO();
    const updatedAt = normalizeDateTime(cellAt(row, iUpdated)) || createdAt;
    const hiredAt = parseDateText(cellAt(row, iHired));
    const status = normalizeStatus(cellAt(row, iStatus));
    const type = normalizeType(cellAt(row, iType));
    const countsTurnover = normalizeBool(cellAt(row, iTurnover));
    const costValue = moneyNum(cellAt(row, iCost));

    const employee = valid
      ? {
          id: createId(),
          name,
          sector,
          cargo: textOrNull(upperTrim(cellAt(row, iCargo))),
          user,
          estado,
          filialId: filial ? filial.id : null,
          salario: moneyNum(cellAt(row, iSalary)),
          valeTransporte: moneyNum(cellAt(row, iValeT)),
          valeAlimentacao: moneyNum(cellAt(row, iValeA)),
          inss: moneyNum(cellAt(row, iInss)),
          fgts: moneyNum(cellAt(row, iFgts)),
          irrf: moneyNum(cellAt(row, iIrrf)),
          premioArt62: moneyNum(cellAt(row, iPremioArt)),
          premioLoja: moneyNum(cellAt(row, iPremioLoja)),
          comissao: moneyNum(cellAt(row, iComissao)),
          liderImediato: textOrNull(upperTrim(cellAt(row, iLider))),
          gerenteRegional: textOrNull(upperTrim(cellAt(row, iGerente))),
          hiredAt,
          status,
          type,
          countsTurnover,
          createdAt,
          updatedAt,
          firedAt: status === "desligado" ? updatedAt : null
        }
      : null;

    items.push({ valid, name, sector, user, estado, filialText, filialId: filial ? filial.id : null, employee, costValue });
  }
  return items;
}

export function downloadEquipeTemplate() {
  const workbook = XLSX.utils.book_new();
  const sheet = XLSX.utils.aoa_to_sheet(safeRows([EQUIPE_TEMPLATE_HEADER]));
  sheet["!cols"] = [{ wch: 24 }, { wch: 20 }, { wch: 20 }, { wch: 16 }, { wch: 12 }, { wch: 12 }, { wch: 16 }, { wch: 18 }, { wch: 20 }, { wch: 20 }, { wch: 22 }, { wch: 14 }, { wch: 18 }, { wch: 20 }, { wch: 12 }, { wch: 12 }, { wch: 12 }, { wch: 20 }, { wch: 16 }, { wch: 12 }, { wch: 18 }, { wch: 20 }, { wch: 8 }, { wch: 14 }];
  XLSX.utils.book_append_sheet(workbook, sheet, "Equipe");
  XLSX.writeFile(workbook, `gente-gestao-template-equipe_${todayISO()}.xlsx`);
}

/* ---------- Planilha TREINAMENTO (importação no modal) ---------- */

export const TREINAMENTO_TEMPLATE_HEADER = [
  "Colaborador", "Tema do treinamento", "Carga horária (horas)", "Modalidade"
];

/* Lê a planilha de treinamentos e devolve linhas normalizadas.
   Campos devolvidos por linha:
     { name, tema, carga, modalidade, modalidadeLabel } */
export function parseTreinamentoSheet(sheet) {
  /* Lê os valores já formatados: células de horário (ex.: "01:30") chegam como
     texto, não como fração de dia do Excel. */
  const rows = sheetRows(sheet, { raw: false });
  const headerRow = rows[0] || [];
  const iName = headFind(headerRow, ["colaborador", "nome do colaborador"]);
  const iTema = headFind(headerRow, ["tema"]);
  const iCarga = headFind(headerRow, ["carga"]);
  const iModalidade = headFind(headerRow, ["modalidade"]);
  const found = iName >= 0;
  if (!found) return [];

  const out = [];
  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    if (!row || !row.length) continue;
    const name = String(cellAt(row, iName)).trim();
    if (!name) continue;

    const modalidadeRaw = String(cellAt(row, iModalidade)).trim().toLowerCase();
    const modalidade = modalidadeRaw.includes("online") ? "online" : "presencial";
    const modalidadeLabel = modalidade === "online" ? "Online" : "Presencial";

    const carga = parseHoursBR(cellAt(row, iCarga));

    out.push({
      name,
      tema: String(cellAt(row, iTema)).trim(),
      carga,
      modalidade,
      modalidadeLabel
    });
  }
  return out;
}

export function downloadTreinamentoTemplate() {
  const workbook = XLSX.utils.book_new();
  const sheet = XLSX.utils.aoa_to_sheet(
    safeRows([
      TREINAMENTO_TEMPLATE_HEADER,
      ["Maria Silva", "Excel Avançado", 8, "Presencial"],
      ["João Souza", "Atendimento ao Cliente", 4, "Online"]
    ])
  );
  sheet["!cols"] = [{ wch: 26 }, { wch: 30 }, { wch: 20 }, { wch: 16 }];
  XLSX.utils.book_append_sheet(workbook, sheet, "Treinamento");
  XLSX.writeFile(workbook, `gente-gestao-template-treinamento_${todayISO()}.xlsx`);
}

/* ---------- Planilha VAGAS (Tempo médio de contratação) ---------- */

export const VAGA_TEMPLATE_HEADER = [
  "Nome da vaga",
  "Data de abertura",
  "Data de fechamento",
  "Tipo de contratação",
  "Estado",
  "Filial"
];

/* Lê a planilha de vagas e devolve linhas normalizadas.
   Campos por linha:
     { name, openAt, closeAt, tipo, estado, filialText } */
export function parseVagasSheet(sheet) {
  const rows = sheetRows(sheet);
  const headerRow = rows[0] || [];
  const iName = headFind(headerRow, ["nomedavaga", "vaga", "nome"]);
  const iOpen = headFind(headerRow, ["dataabertura", "abertura"]);
  const iClose = headFind(headerRow, ["datafechamento", "fechamento"]);
  const iTipo = headFind(headerRow, ["tipocontratacao", "contratacao", "tipo"]);
  const iEstado = headFind(headerRow, ["estado"]);
  const iFilial = headFind(headerRow, ["filial", "abreviado", "loja"]);
  if (iName < 0) return [];

  const out = [];
  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    if (!row || !row.length) continue;
    const name = String(cellAt(row, iName)).trim();
    if (!name) continue;

    const tipoRaw = String(cellAt(row, iTipo)).trim().toLowerCase();
    const tipo = tipoRaw.includes("pj") ? "pj" : tipoRaw.includes("clt") ? "clt" : null;
    const estadoRaw = String(cellAt(row, iEstado)).trim().toUpperCase();

    out.push({
      name,
      openAt: parseDateText(cellAt(row, iOpen)),
      closeAt: parseDateText(cellAt(row, iClose)),
      tipo,
      estado: STATES.includes(estadoRaw) ? estadoRaw : null,
      filialText: String(cellAt(row, iFilial)).trim()
    });
  }
  return out;
}

export function downloadVagasTemplate() {
  const workbook = XLSX.utils.book_new();
  const sheet = XLSX.utils.aoa_to_sheet(
    safeRows([
      VAGA_TEMPLATE_HEADER,
      ["ANALISTA DE RH", "2026-08-01", "2026-08-15", "CLT", "RO", "PVH1"],
      ["ASSISTENTE ADMINISTRATIVO", "2026-08-05", "", "PJ", "AM", "MAO1"]
    ])
  );
  sheet["!cols"] = [{ wch: 28 }, { wch: 16 }, { wch: 18 }, { wch: 20 }, { wch: 10 }, { wch: 14 }];
  XLSX.utils.book_append_sheet(workbook, sheet, "Vagas");
  XLSX.writeFile(workbook, `gente-gestao-template-vagas_${todayISO()}.xlsx`);
}

export function importWorkbook(wb, currentState) {
  const summary = {
    imported: 0, duplicates: 0, invalid: 0,
    importedEmployees: 0, duplicateEmployees: 0,
    importedBranches: 0, duplicateBranches: 0,
    importedDepartments: 0, duplicateDepartments: 0
  };

  const entriesSheet = wb.Sheets["Lançamentos"];
  if (entriesSheet) {
    const rows = XLSX.utils.sheet_to_json(entriesSheet, { header: 1 });
    const headerRow = rows[0] || [];
    const findCol = colIndex(headerRow);
    const iData = findCol("data");
    const iInd = findCol("indicador");
    const iVal = findCol("valor");
    const iEstado = findCol("estado");
    const iMeta = findCol("meta");

    for (let i = 1; i < rows.length; i++) {
      const row = rows[i];
      if (!row || !row.length) { summary.invalid++; continue; }
      const dateRaw = String(cellAt(row, iData)).trim();
      const nameRaw = String(cellAt(row, iInd)).trim();
      const valueRaw = cellAt(row, iVal);
      const estadoRaw = String(cellAt(row, iEstado)).trim().toUpperCase();
      const date = normalizeDate(dateRaw);
      const ind = INDICATORS.find((x) => x.name.toLowerCase() === nameRaw.toLowerCase());
      const value = valueRaw === "" || valueRaw === undefined || valueRaw === null ? NaN : Number(valueRaw);
      if (!date || !ind || isNaN(value)) { summary.invalid++; continue; }

      const estado = STATES.includes(estadoRaw) ? estadoRaw : (currentState && currentState !== "todos" ? currentState : null);

      /* Meta (JSON) preserva colaborador, tema, filial, percentual etc. */
      let meta = null;
      const metaRaw = cellAt(row, iMeta);
      if (metaRaw !== "" && metaRaw !== undefined && metaRaw !== null) {
        try {
          const parsed = JSON.parse(String(metaRaw));
          if (parsed && typeof parsed === "object") meta = parsed;
        } catch (err) {
          /* meta inválido é ignorado (mantém compatibilidade) */
        }
      }

      const existing = getEntriesFor(ind.id);
      const duplicate = existing.some(
        (e) => e.date === date && Number(e.value) === value && (e.meta ? e.meta.estado : null) === estado
      );
      if (duplicate) { summary.duplicates++; continue; }

      addEntry(ind.id, { date, value, state: estado, meta });
      summary.imported++;
    }
  }

  const teamSheet = wb.Sheets["Equipe"];
  if (teamSheet) {
    const candidates = parseEmployeeSheet(teamSheet, currentState && currentState !== "todos" ? currentState : null);
    candidates.forEach((item) => {
      if (!item.valid) {
        summary.invalid++;
        return;
      }
      const user = item.user.toLowerCase();
      const duplicateEmp = getEmployees().some(
        (e) => e.user.toLowerCase() === user && (e.estado || null) === item.estado
      );
      if (duplicateEmp) { summary.duplicateEmployees++; return; }

      upsertEmployee(item.employee);
      summary.importedEmployees++;

      if (item.costValue !== null && item.costValue !== undefined) {
        addEntry("custo_contratacao", {
          date: todayISO(),
          value: item.costValue,
          state: item.estado,
          meta: { employeeId: item.employee.id, employeeName: item.employee.name }
        });
      }
    });
  }

  const filiaisSheet = wb.Sheets["Filiais"];
  if (filiaisSheet) {
    const rows = XLSX.utils.sheet_to_json(filiaisSheet, { header: 1 });
    const headerRow = rows[0] || [];
    const findCol = colIndex(headerRow);
    const iBranchId = findCol("id filial");
    const iCnpj = findCol("cnpj");
    const iName = findCol("nome filial", "nome");
    const iShort = findCol("filial abreviado", "abreviado");
    const iManager = findCol("gerente");
    const iEstado = findCol("estado");

    for (let i = 1; i < rows.length; i++) {
      const row = rows[i];
      if (!row || !row.length) continue;
      const branchId = String(cellAt(row, iBranchId)).trim();
      const cnpj = String(cellAt(row, iCnpj)).trim();
      const name = String(cellAt(row, iName)).trim();
      const shortName = String(cellAt(row, iShort)).trim();
      const manager = String(cellAt(row, iManager)).trim() || null;
      const estado = String(cellAt(row, iEstado)).trim().toUpperCase();
      if (!branchId || !cnpj || !name || !shortName || !STATES.includes(estado)) {
        summary.invalid++;
        continue;
      }

      const existing = getBranches().find(
        (b) => b.branchId.toLowerCase() === branchId.toLowerCase() && b.estado === estado
      );
      if (existing) { summary.duplicateBranches++; continue; }

      const now = nowLocalISO();
      upsertBranch({
        id: createId(),
        branchId,
        cnpj,
        name,
        shortName,
        manager,
        estado,
        createdAt: now,
        updatedAt: now
      });
      summary.importedBranches++;
    }
  }

  const departamentosSheet = wb.Sheets["Departamentos"];
  if (departamentosSheet) {
    const rows = XLSX.utils.sheet_to_json(departamentosSheet, { header: 1 });
    const headerRow = rows[0] || [];
    const findCol = colIndex(headerRow);
    const iName = findCol("departamento", "nome do departamento");
    const iShort = findCol("sigla");
    const iEstado = findCol("estado");

    for (let i = 1; i < rows.length; i++) {
      const row = rows[i];
      if (!row || !row.length) continue;
      const name = String(cellAt(row, iName)).trim();
      const shortName = String(cellAt(row, iShort)).trim();
      const estado = String(cellAt(row, iEstado)).trim().toUpperCase();
      if (!name || !STATES.includes(estado)) {
        summary.invalid++;
        continue;
      }

      const existing = getDepartments().find(
        (d) => d.name.toUpperCase() === name.toUpperCase() && d.estado === estado
      );
      if (existing) { summary.duplicateDepartments++; continue; }

      const now = nowLocalISO();
      upsertDepartment({
        id: createId(),
        name,
        shortName: shortName || null,
        estado,
        createdAt: now,
        updatedAt: now
      });
      summary.importedDepartments++;
    }
  }

  return summary;
}

// ---- Normalizadores de importação ----

function cellAt(row, index) {
  if (index === undefined || index === null || index < 0 || index >= row.length) return "";
  const value = row[index];
  return value === undefined || value === null ? "" : value;
}

/* Converte célula em número monetário (null quando vazia/inválida). */
function moneyNum(raw) {
  if (raw === undefined || raw === null || raw === "") return null;
  if (typeof raw === "number") return isNaN(raw) ? null : raw;
  let s = String(raw).trim().replace(/[R$\s]/g, "");
  if (!s) return null;
  if (s.indexOf(",") !== -1) {
    s = s.replace(/\./g, "").replace(",", ".");
  }
  const n = Number(s);
  return isNaN(n) ? null : n;
}

/* Converte célula em texto opcional (null quando vazia). */
function textOrNull(raw) {
  const s = String(raw ?? "").trim();
  return s || null;
}

function normalizeDate(raw) {
  if (raw === undefined || raw === null || raw === "") return null;
  const s = String(raw).trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const br = s.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (br) return `${br[3]}-${br[2]}-${br[1]}`;
  if (typeof raw === "number" && raw > 20000 && raw < 100000) {
    const d = new Date(Math.round((raw - 25569) * 86400000));
    if (!isNaN(d.getTime())) {
      const pad = (n) => String(n).padStart(2, "0");
      return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
    }
  }
  return null;
}

function normalizeDateTime(raw) {
  if (raw === undefined || raw === null || raw === "") return null;
  const s = String(raw).trim();
  const m = s.match(/^(\d{2})\/(\d{2})\/(\d{4})[ T](\d{2}):(\d{2})/);
  if (m) return `${m[3]}-${m[2]}-${m[1]}T${m[4]}:${m[5]}:00`;
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?$/.test(s)) {
    return s.length === 16 ? s + ":00" : s;
  }
  if (typeof raw === "number" && raw > 20000 && raw < 100000) {
    const d = new Date(Math.round((raw - 25569) * 86400000));
    if (!isNaN(d.getTime())) {
      const pad = (n) => String(n).padStart(2, "0");
      return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}:00`;
    }
  }
  return null;
}

function normalizeStatus(raw) {
  const s = String(raw || "").trim().toLowerCase();
  if (s === "desligado") return "desligado";
  if (s === "afastado") return "afastado";
  return "ativo";
}

function normalizeType(raw) {
  const s = String(raw || "").trim().toLowerCase();
  if (s === "efetivado") return "efetivado";
  return "experiencia";
}

function normalizeBool(raw) {
  const s = String(raw || "").trim().toLowerCase();
  return s === "sim" || s === "true" || s === "1" || s === "s";
}
