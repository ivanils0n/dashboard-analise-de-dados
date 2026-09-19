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
import { createId, nowLocalISO, todayISO, parseHoursBR, parseCurrencyBR, compareDateDesc } from "./utils";

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
    ["Colaborador", "Setor", "Cargo", "Usuário", "Entrada", "Status", "Tipo", "Registro", "Última atualização", "Custo de contratação (R$)", "Salário (R$)", "Vale-transporte (R$)", "Vale-alimentação (R$)", "INSS (R$)", "FGTS (R$)", "IRRF (R$)", "Premiação art. 62 (R$)", "Premiação loja (R$)", "Comissão (R$)", "Líder imediato", "Gerente regional", "Estado", "Filial"]
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
  sheetEmployees["!cols"] = [{ wch: 24 }, { wch: 20 }, { wch: 20 }, { wch: 16 }, { wch: 12 }, { wch: 12 }, { wch: 16 }, { wch: 20 }, { wch: 20 }, { wch: 22 }, { wch: 14 }, { wch: 18 }, { wch: 20 }, { wch: 12 }, { wch: 12 }, { wch: 12 }, { wch: 20 }, { wch: 16 }, { wch: 12 }, { wch: 18 }, { wch: 20 }, { wch: 8 }, { wch: 14 }];
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
    ["Colaborador", "Setor", "Cargo", "Usuário", "Entrada", "Status", "Tipo", "Registro", "Última atualização", "Custo de contratação (R$)", "Salário (R$)", "Vale-transporte (R$)", "Vale-alimentação (R$)", "INSS (R$)", "FGTS (R$)", "IRRF (R$)", "Premiação art. 62 (R$)", "Premiação loja (R$)", "Comissão (R$)", "Líder imediato", "Gerente regional", "Estado", "Filial"],
    ["Maria Silva", "RH", "Analista de RH", "3375", "2026-08-19", "Ativo", "Efetivado", "2026-08-19T09:00:00", "2026-08-19T09:00:00", 2500, 3500, 200, 400, 350, 280, 0, 150, 0, 300, "João Souza", "Carlos Lima", "RO", "PVH 1"]
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

/* `currentState` é o estado selecionado no dashboard: serve de padrão para as
   linhas da planilha que não informam a coluna "Estado". Sem ele, essas linhas
   entrariam sem estado e sumiriam dos filtros por região. */
export function importFile(file, onResult, currentState = null) {
  if (!file) return;
  readWorkbookFile(file)
    .then((wb) => {
      const summary = importWorkbook(wb, currentState);
      syncAll();
      onResult && onResult(summary);
    })
    .catch((err) => {
      console.error(err);
      onResult && onResult({ error: true });
    });
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
  "Colaborador", "Setor", "Cargo", "Usuário", "Entrada", "Status", "Tipo", "Registro", "Última atualização", "Custo de contratação (R$)", "Salário (R$)", "Vale-transporte (R$)", "Vale-alimentação (R$)", "INSS (R$)", "FGTS (R$)", "IRRF (R$)", "Premiação art. 62 (R$)", "Premiação loja (R$)", "Comissão (R$)", "Líder imediato", "Gerente regional", "Estado", "Filial"
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
  sheet["!cols"] = [{ wch: 24 }, { wch: 20 }, { wch: 20 }, { wch: 16 }, { wch: 12 }, { wch: 12 }, { wch: 16 }, { wch: 20 }, { wch: 20 }, { wch: 22 }, { wch: 14 }, { wch: 18 }, { wch: 20 }, { wch: 12 }, { wch: 12 }, { wch: 12 }, { wch: 20 }, { wch: 16 }, { wch: 12 }, { wch: 18 }, { wch: 20 }, { wch: 8 }, { wch: 14 }];
  XLSX.utils.book_append_sheet(workbook, sheet, "Equipe");
  XLSX.writeFile(workbook, `gente-gestao-template-equipe_${todayISO()}.xlsx`);
}

/* ---------- Planilha TREINAMENTO (importação no modal) ---------- */

export const TREINAMENTO_TEMPLATE_HEADER = [
  "Colaborador", "Tema do treinamento", "Carga horária (horas)", "Modalidade", "Cargo", "Filial", "Estado"
];

/* Lê a planilha de treinamentos e devolve linhas normalizadas.
   Campos devolvidos por linha:
     { name, tema, carga, modalidade, modalidadeLabel, cargo, filialText, estado }
   Cargo, Filial e Estado são colunas opcionais. */
export function parseTreinamentoSheet(sheet) {
  /* Lê os valores já formatados: células de horário (ex.: "01:30") chegam como
     texto, não como fração de dia do Excel. */
  const rows = sheetRows(sheet, { raw: false });
  const headerRow = rows[0] || [];
  const iName = headFind(headerRow, ["colaborador", "nome do colaborador"]);
  const iTema = headFind(headerRow, ["tema"]);
  const iCarga = headFind(headerRow, ["carga"]);
  const iModalidade = headFind(headerRow, ["modalidade"]);
  /* Opcionais: sem cruzamento com a Equipe, o cargo, a filial e o estado só
     entram no lançamento se vierem na própria planilha. */
  const iCargo = headFind(headerRow, ["cargo", "funcao"]);
  const iFilial = headFind(headerRow, ["filial", "loja", "empresa", "abreviado"]);
  const iEstado = headFind(headerRow, ["estado"]);
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
      modalidadeLabel,
      cargo: String(cellAt(row, iCargo)).trim(),
      filialText: String(cellAt(row, iFilial)).trim(),
      estado: String(cellAt(row, iEstado)).trim().toUpperCase()
    });
  }
  return out;
}

export function downloadTreinamentoTemplate() {
  const workbook = XLSX.utils.book_new();
  const sheet = XLSX.utils.aoa_to_sheet(
    safeRows([
      TREINAMENTO_TEMPLATE_HEADER,
      ["Maria Silva", "Excel Avançado", 8, "Presencial", "Analista", "PVH1", "RO"],
      ["João Souza", "Atendimento ao Cliente", 4, "Online", "Vendedor", "MAO2", "AM"]
    ])
  );
  sheet["!cols"] = [{ wch: 26 }, { wch: 30 }, { wch: 20 }, { wch: 16 }, { wch: 20 }, { wch: 14 }, { wch: 10 }];
  XLSX.utils.book_append_sheet(workbook, sheet, "Treinamento");
  XLSX.writeFile(workbook, `gente-gestao-template-treinamento_${todayISO()}.xlsx`);
}

/* ---------- Planilha DIÁRIA (Custo da diária geral) ---------- */

export const DIARIA_TEMPLATE_HEADER = ["Filial", "Colaborador", "Função", "Periodo", "Motivo", "Pagamento"];

/* Interpreta a coluna "Periodo" da planilha de diárias. A diária é lançada
   por MÊS de competência (sem início/fim) — aceita:
   - "dd/mm/aaaa" (uma data completa; o dia é ignorado, só mês/ano contam) ou
     o valor de data nativo do Excel (célula formatada como data)
   - "mm/aaaa" ou "m/aaaa" (mês/ano com 4 dígitos)
   - "mm/aa" ou "m/aa" (mês/ano com 2 dígitos — assume 20aa)
   Reaproveita `normalizeDate` para o caso de data completa: células de data
   do Excel chegam como número de série, e formatá-las como texto (raw:false)
   depende do locale do arquivo — por isso o valor cru é lido à parte. */
export function parseDiariaMes(raw) {
  if (raw === undefined || raw === null || String(raw).trim() === "") {
    return { ok: false, reason: "Período em branco" };
  }
  const pad = (n) => String(n).padStart(2, "0");

  const iso = normalizeDate(raw);
  if (iso) {
    const [ano, mes] = iso.split("-");
    return { ok: true, mes: `${ano}-${mes}` };
  }

  const text = String(raw).trim();

  let m = text.match(/^(\d{1,2})\/(\d{4})$/);
  if (m) {
    const mes = Number(m[1]);
    if (mes < 1 || mes > 12) return { ok: false, reason: "Mês inválido no período" };
    return { ok: true, mes: `${m[2]}-${pad(mes)}` };
  }

  m = text.match(/^(\d{1,2})\/(\d{2})$/);
  if (m) {
    const mes = Number(m[1]);
    if (mes < 1 || mes > 12) return { ok: false, reason: "Mês inválido no período" };
    const ano = 2000 + Number(m[2]);
    return { ok: true, mes: `${ano}-${pad(mes)}` };
  }

  return { ok: false, reason: "Formato de período não reconhecido (use dd/mm/aaaa, mm/aaaa, m/aa ou mm/aa)" };
}

/* Lê a planilha de diárias e devolve linhas normalizadas (sem gravar nada).
   Cada item: { rowNumber, filialText, filial, colaboradorText, funcaoText,
   periodoText, periodo, motivoText, pagamentoRaw, pagamento }.
   `filial` já vem resolvida (cadastro existente) — a região do lançamento é
   sempre a do estado da filial, nunca uma coluna da planilha. */
export function parseDiariaSheet(sheet) {
  const rows = sheetRows(sheet, { raw: false });
  /* Período é lido também no formato cru (raw:true): células de data reais
     chegam como número de série do Excel, evitando o texto formatado no
     locale errado (ver parseDiariaMes). */
  const rawRows = sheetRows(sheet);
  const headerRow = rows[0] || [];
  const iFilial = headFind(headerRow, ["filial"]);
  const iColaborador = headFind(headerRow, ["colaborador"]);
  const iFuncao = headFind(headerRow, ["funcao"]);
  const iPeriodo = headFind(headerRow, ["periodo"]);
  const iMotivo = headFind(headerRow, ["motivo"]);
  const iPagamento = headFind(headerRow, ["pagamento", "valor"]);
  if (iFilial < 0 || iPeriodo < 0 || iPagamento < 0) return [];

  const out = [];
  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    if (!row || !row.length || row.every((c) => String(c ?? "").trim() === "")) continue;

    const filialText = String(cellAt(row, iFilial)).trim();
    const colaboradorText = String(cellAt(row, iColaborador)).trim();
    const funcaoText = String(cellAt(row, iFuncao)).trim();
    const periodoText = String(cellAt(row, iPeriodo)).trim();
    const periodoRaw = cellAt(rawRows[i] || [], iPeriodo);
    const motivoText = String(cellAt(row, iMotivo)).trim();
    /* Mesmo cuidado do Período: célula numérica formatada como texto
       (raw:false) pode vir no locale errado (ex.: "1,234.56" em vez de
       "1.234,56") e estourar o valor ao converter — usa o número cru quando
       disponível. */
    const pagamentoFormatted = cellAt(row, iPagamento);
    const pagamentoRawValue = cellAt(rawRows[i] || [], iPagamento);
    const pagamentoRaw = pagamentoRawValue !== "" ? pagamentoRawValue : pagamentoFormatted;

    out.push({
      rowNumber: i + 1,
      filialText,
      filial: filialText ? findBranchByShortName(filialText) : null,
      colaboradorText,
      funcaoText,
      periodoText,
      periodo: parseDiariaMes(periodoRaw !== "" ? periodoRaw : periodoText),
      motivoText,
      pagamentoRaw,
      pagamento: moneyNum(pagamentoRaw)
    });
  }
  return out;
}

export function downloadDiariaTemplate() {
  const workbook = XLSX.utils.book_new();
  const sheet = XLSX.utils.aoa_to_sheet(
    safeRows([
      DIARIA_TEMPLATE_HEADER,
      ["PVH1", "Maria Silva", "Analista de RH", "06/2026", "Visita à loja", 150],
      ["MAO1", "João Souza", "Supervisor", "8/26", "Auditoria", 150]
    ])
  );
  sheet["!cols"] = [{ wch: 14 }, { wch: 26 }, { wch: 22 }, { wch: 14 }, { wch: 26 }, { wch: 14 }];
  XLSX.utils.book_append_sheet(workbook, sheet, "Diária");
  XLSX.writeFile(workbook, `gente-gestao-template-diaria_${todayISO()}.xlsx`);
}

/* ---------- Planilha VAGAS (Tempo médio de contratação) ---------- */

export const VAGA_TEMPLATE_HEADER = [
  "Nome da vaga",
  "Data de abertura",
  "Data de fechamento",
  "Tipo de contratação",
  "Salário (R$)",
  "Estado",
  "Filial"
];

/* Lê a planilha de vagas e devolve linhas normalizadas.
   Campos por linha:
     { name, openAt, closeAt, tipo, salario, estado, filialText } */
export function parseVagasSheet(sheet) {
  const rows = sheetRows(sheet);
  const headerRow = rows[0] || [];
  const iName = headFind(headerRow, ["nomedavaga", "vaga", "nome"]);
  const iOpen = headFind(headerRow, ["dataabertura", "abertura"]);
  const iClose = headFind(headerRow, ["datafechamento", "fechamento"]);
  const iTipo = headFind(headerRow, ["tipocontratacao", "contratacao", "tipo"]);
  const iSalario = headFind(headerRow, ["salario", "remuneracao"]);
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
      salario: moneyNum(cellAt(row, iSalario)),
      estado: STATES.includes(estadoRaw) ? estadoRaw : null,
      filialText: String(cellAt(row, iFilial)).trim()
    });
  }
  return out;
}

/* Exporta uma lista de vagas (já filtrada pela tela que chama) para xlsx,
   no mesmo layout do template de importação — com Status e Tempo (dias)
   adicionados ao final para conferência. */
export function exportVagas(list) {
  const workbook = XLSX.utils.book_new();
  const rows = [[...VAGA_TEMPLATE_HEADER, "Status", "Tempo (dias)"]];
  (list || []).forEach((v) => {
    const branch = v.filialId ? getBranchById(v.filialId) : null;
    const days = v.openAt && v.closeAt ? (new Date(v.closeAt) - new Date(v.openAt)) / 86400000 : null;
    rows.push([
      v.name || "",
      v.openAt ? String(v.openAt).slice(0, 10) : "",
      v.closeAt ? String(v.closeAt).slice(0, 10) : "",
      v.tipoContratacao ? String(v.tipoContratacao).toUpperCase() : "",
      v.salario != null ? Number(v.salario) : null,
      v.estado || "",
      branch ? branch.shortName || branch.name : "",
      v.closeAt ? "Fechada" : "Aberta",
      days === null || isNaN(days) ? null : Number(days.toFixed(1))
    ]);
  });
  const sheet = XLSX.utils.aoa_to_sheet(safeRows(rows));
  sheet["!cols"] = [{ wch: 28 }, { wch: 16 }, { wch: 18 }, { wch: 20 }, { wch: 14 }, { wch: 10 }, { wch: 14 }, { wch: 12 }, { wch: 14 }];
  XLSX.utils.book_append_sheet(workbook, sheet, "Vagas");
  XLSX.writeFile(workbook, `gente-gestao-vagas_${todayISO()}.xlsx`);
}

export function downloadVagasTemplate() {
  const workbook = XLSX.utils.book_new();
  const sheet = XLSX.utils.aoa_to_sheet(
    safeRows([
      VAGA_TEMPLATE_HEADER,
      ["ANALISTA DE RH", "2026-08-01", "2026-08-15", "CLT", 3500, "RO", "PVH1"],
      ["ASSISTENTE ADMINISTRATIVO", "2026-08-05", "", "PJ", 2200, "AM", "MAO1"]
    ])
  );
  sheet["!cols"] = [{ wch: 28 }, { wch: 16 }, { wch: 18 }, { wch: 20 }, { wch: 14 }, { wch: 10 }, { wch: 14 }];
  XLSX.utils.book_append_sheet(workbook, sheet, "Vagas");
  XLSX.writeFile(workbook, `gente-gestao-template-vagas_${todayISO()}.xlsx`);
}

/* ---------- Planilha TURNOVER (quantidade admitida/demitida por filial) ---------- */

export const TURNOVER_TEMPLATE_HEADER = ["Filial", "Mês de referência", "Admitidos", "Demitidos", "Ativos", "Estado"];

/* Lê a planilha de turnover e devolve linhas normalizadas.
   Campos por linha: { filialText, mesReferencia, admitidos, demitidos, ativos, estado } —
   não depende de colaboradores: é só a quantidade admitida/demitida/ativa na
   filial naquele mês (ver turnoverQuantitiesInRange em lib/employees.js).
   "Ativos" substitui o Headcount no cálculo do Turnover (%). */
export function parseTurnoverSheet(sheet) {
  const rows = sheetRows(sheet, { raw: false });
  /* Mês lido também no formato cru (raw:true): células de data reais chegam
     como número de série do Excel, evitando o texto formatado no locale
     errado (mesmo cuidado de parseDiariaSheet, ver parseDiariaMes). */
  const rawRows = sheetRows(sheet);
  const headerRow = rows[0] || [];
  const iFilial = headFind(headerRow, ["filial", "abreviado", "loja"]);
  const iMes = headFind(headerRow, ["mesdereferencia", "referencia", "mes", "periodo", "competencia"]);
  const iAdmitidos = headFind(headerRow, ["admitidos", "admissoes"]);
  const iDemitidos = headFind(headerRow, ["demitidos", "demissoes", "desligamentos"]);
  const iAtivos = headFind(headerRow, ["ativos", "headcount", "quadro"]);
  const iEstado = headFind(headerRow, ["estado"]);
  if (iMes < 0) return [];

  const out = [];
  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    if (!row || !row.length) continue;
    const mesText = String(cellAt(row, iMes)).trim();
    const mesRaw = cellAt(rawRows[i] || [], iMes);
    const mesInfo = parseDiariaMes(mesRaw !== "" ? mesRaw : mesText);
    if (!mesInfo.ok) continue;
    const estadoRaw = String(cellAt(row, iEstado)).trim().toUpperCase();

    out.push({
      filialText: String(cellAt(row, iFilial)).trim(),
      mesReferencia: mesInfo.mes,
      admitidos: Math.max(0, Math.round(Number(cellAt(row, iAdmitidos)) || 0)),
      demitidos: Math.max(0, Math.round(Number(cellAt(row, iDemitidos)) || 0)),
      ativos: Math.max(0, Math.round(Number(cellAt(row, iAtivos)) || 0)),
      estado: STATES.includes(estadoRaw) ? estadoRaw : null
    });
  }
  return out;
}

/* Exporta uma lista de lançamentos de turnover (já filtrada pela tela que
   chama) para xlsx, no mesmo layout do template de importação. */
export function exportTurnover(list, filename) {
  const workbook = XLSX.utils.book_new();
  const rows = [TURNOVER_TEMPLATE_HEADER];
  (list || []).forEach((t) => {
    const branch = t.filialId ? getBranchById(t.filialId) : null;
    rows.push([
      branch ? branch.shortName || branch.name : "",
      t.mesReferencia || "",
      Number(t.admitidos) || 0,
      Number(t.demitidos) || 0,
      Number(t.ativos) || 0,
      t.estado || ""
    ]);
  });
  const sheet = XLSX.utils.aoa_to_sheet(safeRows(rows));
  sheet["!cols"] = [{ wch: 14 }, { wch: 16 }, { wch: 12 }, { wch: 12 }, { wch: 10 }, { wch: 10 }];
  XLSX.utils.book_append_sheet(workbook, sheet, "Turnover");
  XLSX.writeFile(workbook, `gente-gestao-${filename || "turnover"}_${todayISO()}.xlsx`);
}

export function downloadTurnoverTemplate() {
  const workbook = XLSX.utils.book_new();
  const sheet = XLSX.utils.aoa_to_sheet(
    safeRows([
      TURNOVER_TEMPLATE_HEADER,
      ["PVH1", "08/2026", 5, 3, 120, "RO"],
      ["MAO1", "08/2026", 2, 4, 85, "AM"]
    ])
  );
  sheet["!cols"] = [{ wch: 14 }, { wch: 16 }, { wch: 12 }, { wch: 12 }, { wch: 10 }, { wch: 10 }];
  XLSX.utils.book_append_sheet(workbook, sheet, "Turnover");
  XLSX.writeFile(workbook, `gente-gestao-template-turnover_${todayISO()}.xlsx`);
}

/* ---------- Planilha TEMPO MÉDIO DE PERMANÊNCIA ---------- */

export const PERMANENCIA_TEMPLATE_HEADER = ["Colaborador", "Data de admissão", "Data de demissão", "Estado"];

/* Lê a planilha de permanência e devolve linhas normalizadas.
   Campos por linha: { colaboradorText, dataAdmissao, dataDemissao, estado } —
   registro independente do Turnover, usado só para o KPI Tempo médio de
   permanência (ver turnoverAvgTenureDays em lib/employees.js). */
export function parsePermanenciaSheet(sheet) {
  const rows = sheetRows(sheet);
  const headerRow = rows[0] || [];
  const iColaborador = headFind(headerRow, ["colaborador", "nome"]);
  const iAdmissao = headFind(headerRow, ["datadeadmissao", "admissao"]);
  const iDemissao = headFind(headerRow, ["datadedemissao", "demissao", "desligamento"]);
  const iEstado = headFind(headerRow, ["estado"]);
  if (iColaborador < 0) return [];

  const out = [];
  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    if (!row || !row.length) continue;
    const colaboradorText = String(cellAt(row, iColaborador)).trim();
    if (!colaboradorText) continue;
    const estadoRaw = String(cellAt(row, iEstado)).trim().toUpperCase();

    out.push({
      colaboradorText,
      dataAdmissao: parseDateText(cellAt(row, iAdmissao)),
      dataDemissao: parseDateText(cellAt(row, iDemissao)),
      estado: STATES.includes(estadoRaw) ? estadoRaw : null
    });
  }
  return out;
}

/* Exporta uma lista de registros de permanência (já filtrada pela tela que
   chama) para xlsx, no mesmo layout do template de importação. */
export function exportPermanencia(list) {
  const workbook = XLSX.utils.book_new();
  const rows = [PERMANENCIA_TEMPLATE_HEADER];
  (list || []).forEach((p) => {
    rows.push([
      p.colaborador || "",
      p.dataAdmissao ? String(p.dataAdmissao).slice(0, 10) : "",
      p.dataDemissao ? String(p.dataDemissao).slice(0, 10) : "",
      p.estado || ""
    ]);
  });
  const sheet = XLSX.utils.aoa_to_sheet(safeRows(rows));
  sheet["!cols"] = [{ wch: 28 }, { wch: 18 }, { wch: 18 }, { wch: 10 }];
  XLSX.utils.book_append_sheet(workbook, sheet, "Permanência");
  XLSX.writeFile(workbook, `gente-gestao-permanencia_${todayISO()}.xlsx`);
}

export function downloadPermanenciaTemplate() {
  const workbook = XLSX.utils.book_new();
  const sheet = XLSX.utils.aoa_to_sheet(
    safeRows([
      PERMANENCIA_TEMPLATE_HEADER,
      ["MARIA DA SILVA", "2026-03-10", "2026-08-15", "RO"],
      ["JOÃO SOUZA", "2026-01-05", "2026-08-20", "AM"]
    ])
  );
  sheet["!cols"] = [{ wch: 28 }, { wch: 18 }, { wch: 18 }, { wch: 10 }];
  XLSX.utils.book_append_sheet(workbook, sheet, "Permanência");
  XLSX.writeFile(workbook, `gente-gestao-template-permanencia_${todayISO()}.xlsx`);
}

/* ---------- Planilha HEADCOUNT ---------- */

export const HEADCOUNT_TEMPLATE_HEADER = [
  "Código",
  "Colaborador",
  "Empresa",
  "Função",
  "Remuneração",
  "Data de admissão",
  "Estado"
];

/* Lê a planilha de headcount e devolve linhas normalizadas.
   Campos por linha:
     { codigo, colaboradorText, empresaText, funcaoText, remuneracao, dataAdmissao, estado }
   Não há mais coluna de "mês de lançamento": o quadro traz sempre todos os
   colaboradores, e o filtro por mês do dashboard usa a Data de admissão como
   base (ver activeInMonth em lib/employees.js). */
export function parseHeadcountSheet(sheet) {
  const rows = sheetRows(sheet);
  const headerRow = rows[0] || [];
  const iCodigo = headFind(headerRow, ["codigo", "matricula"]);
  const iColaborador = headFind(headerRow, ["colaborador", "nome"]);
  const iEmpresa = headFind(headerRow, ["empresa", "filial", "abreviado", "loja"]);
  const iFuncao = headFind(headerRow, ["funcao", "cargo"]);
  const iRemuneracao = headFind(headerRow, ["remuneracao", "salario"]);
  const iAdmissao = headFind(headerRow, ["datadeadmissao", "admissao"]);
  const iEstado = headFind(headerRow, ["estado"]);
  if (iColaborador < 0) return [];

  const out = [];
  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    if (!row || !row.length) continue;
    const colaboradorText = String(cellAt(row, iColaborador)).trim();
    if (!colaboradorText) continue;
    const estadoRaw = String(cellAt(row, iEstado)).trim().toUpperCase();

    out.push({
      /* Linha na planilha (cabeçalho = 1) e texto original da data — usados
         para explicar por que uma linha foi ignorada. */
      linha: i + 1,
      dataAdmissaoTexto: String(cellAt(row, iAdmissao)).trim(),
      codigo: String(cellAt(row, iCodigo)).trim(),
      colaboradorText,
      /* A filial só é resolvida depois, já com o estado definitivo da linha
         (coluna Estado ou o estado padrão do lançamento) — evita cruzar com
         uma filial de outro estado que reaproveite o mesmo nome abreviado. */
      empresaText: String(cellAt(row, iEmpresa)).trim(),
      funcaoText: String(cellAt(row, iFuncao)).trim(),
      remuneracao: moneyNum(cellAt(row, iRemuneracao)),
      dataAdmissao: parseDateText(cellAt(row, iAdmissao)),
      estado: STATES.includes(estadoRaw) ? estadoRaw : null
    });
  }
  return out;
}

/* Exporta uma lista de registros de headcount (já filtrada pela tela que
   chama) para xlsx, no mesmo layout do template de importação. */
export function exportHeadcount(list) {
  const workbook = XLSX.utils.book_new();
  const rows = [HEADCOUNT_TEMPLATE_HEADER];
  (list || []).forEach((h) => {
    const branch = h.filialId ? getBranchById(h.filialId) : null;
    rows.push([
      h.codigo || "",
      h.colaborador || "",
      branch ? branch.shortName || branch.name : "",
      h.funcao || "",
      h.remuneracao != null ? Number(h.remuneracao) : null,
      h.dataAdmissao ? String(h.dataAdmissao).slice(0, 10) : "",
      h.estado || ""
    ]);
  });
  const sheet = XLSX.utils.aoa_to_sheet(safeRows(rows));
  sheet["!cols"] = [{ wch: 12 }, { wch: 28 }, { wch: 14 }, { wch: 22 }, { wch: 16 }, { wch: 18 }, { wch: 10 }];
  XLSX.utils.book_append_sheet(workbook, sheet, "Headcount");
  XLSX.writeFile(workbook, `gente-gestao-headcount_${todayISO()}.xlsx`);
}

export function downloadHeadcountTemplate() {
  const workbook = XLSX.utils.book_new();
  const sheet = XLSX.utils.aoa_to_sheet(
    safeRows([
      HEADCOUNT_TEMPLATE_HEADER,
      ["3375", "MARIA DA SILVA", "PVH1", "ANALISTA DE RH", 3500, "2024-03-10", "RO"],
      ["4210", "JOÃO SOUZA", "MAO1", "ASSISTENTE ADMINISTRATIVO", 2200, "2025-01-05", "AM"]
    ])
  );
  sheet["!cols"] = [{ wch: 12 }, { wch: 28 }, { wch: 14 }, { wch: 22 }, { wch: 16 }, { wch: 18 }, { wch: 10 }];
  XLSX.utils.book_append_sheet(workbook, sheet, "Headcount");
  XLSX.writeFile(workbook, `gente-gestao-template-headcount_${todayISO()}.xlsx`);
}

/* ---------- Planilha HEADCOUNT — Demitidos (altera o status, não cria
   registro novo) ---------- */

export const HEADCOUNT_DEMITIDOS_TEMPLATE_HEADER = ["Colaborador", "Data de admissão", "Data de desligamento"];

/* Lê a planilha de demitidos (todos os meses de uma vez) e devolve linhas
   normalizadas. Campos por linha: { codigo, colaboradorText, dataAdmissao,
   demitidoMes } — localiza pelo Nome quem já está lançado no headcount (ver
   findHeadcountMatches); quando o nome bate em mais de um registro, a tela
   pede para escolher qual é qual (ver onHeadcountDemitidosImportFile). O
   template não traz mais coluna de Código, mas uma planilha antiga que ainda
   tenha essa coluna continua funcionando (usada junto do Nome para achar o
   colaborador certo). Data de admissão é opcional: quando o colaborador é
   achado no headcount, a Data de admissão de lá tem prioridade sobre a da
   planilha; quando não é achado (lançado direto no Turnover), só a da
   planilha alimenta o KPI Tempo de permanência. Cada linha carrega o próprio
   mês de desligamento — não há mês único escolhido na tela. */
export function parseHeadcountDemitidosSheet(sheet) {
  const rows = sheetRows(sheet);
  const headerRow = rows[0] || [];
  const iCodigo = headFind(headerRow, ["codigo", "matricula"]);
  const iColaborador = headFind(headerRow, ["colaborador", "nome"]);
  const iAdmissao = headFind(headerRow, ["datadeadmissao", "admissao"]);
  const iDesligamento = headFind(headerRow, ["datadedesligamento", "desligamento", "demissao", "datadedemissao"]);
  if (iColaborador < 0) return [];

  const out = [];
  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    if (!row || !row.length) continue;
    const colaboradorText = String(cellAt(row, iColaborador)).trim();
    if (!colaboradorText) continue;
    const codigo = iCodigo >= 0 ? String(cellAt(row, iCodigo)).trim() : "";
    const dataAdmissao = parseDateText(cellAt(row, iAdmissao));
    const dataDesligamento = parseDateText(cellAt(row, iDesligamento));
    out.push({
      codigo,
      colaboradorText,
      dataAdmissao,
      dataDesligamento,
      demitidoMes: dataDesligamento ? dataDesligamento.slice(0, 7) : null
    });
  }
  return out;
}

export function downloadHeadcountDemitidosTemplate() {
  const workbook = XLSX.utils.book_new();
  const sheet = XLSX.utils.aoa_to_sheet(
    safeRows([
      HEADCOUNT_DEMITIDOS_TEMPLATE_HEADER,
      ["MARIA DA SILVA", "2026-03-10", "2026-06-30"],
      ["JOÃO SOUZA", "2026-01-05", "2026-08-15"]
    ])
  );
  sheet["!cols"] = [{ wch: 28 }, { wch: 18 }, { wch: 18 }];
  XLSX.utils.book_append_sheet(workbook, sheet, "Demitidos");
  XLSX.writeFile(workbook, `gente-gestao-template-headcount-demitidos_${todayISO()}.xlsx`);
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

/* Converte célula em número monetário (null quando vazia/inválida).
   Delega o texto ao parser pt-BR único (parseCurrencyBR), que resolve a
   ambiguidade entre ponto de milhar e ponto decimal — "1.500" vale 1500,
   não 1,5. */
function moneyNum(raw) {
  if (raw === undefined || raw === null || raw === "") return null;
  if (typeof raw === "number") return isNaN(raw) ? null : raw;
  const n = parseCurrencyBR(raw);
  return isNaN(n) ? null : n;
}

/* Converte célula em texto opcional (null quando vazia). */
function textOrNull(raw) {
  const s = String(raw ?? "").trim();
  return s || null;
}

/* Converte o número de série de data do Excel em Date.
   O serial representa uma data "de parede" (sem fuso); o instante gerado é a
   meia-noite UTC dela, então SEMPRE leia os componentes com os getters UTC —
   os getters locais devolvem o dia anterior em qualquer fuso a oeste de
   Greenwich (RO/AM/PA = UTC-4/-3). */
function excelSerialToDate(raw) {
  if (typeof raw !== "number" || !(raw > 20000 && raw < 100000)) return null;
  const d = new Date(Math.round((raw - 25569) * 86400000));
  return isNaN(d.getTime()) ? null : d;
}

const pad2 = (n) => String(n).padStart(2, "0");

function serialToISODate(d) {
  return `${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}-${pad2(d.getUTCDate())}`;
}

function normalizeDate(raw) {
  if (raw === undefined || raw === null || raw === "") return null;
  const s = String(raw).trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const br = s.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (br) return `${br[3]}-${br[2]}-${br[1]}`;
  const serial = excelSerialToDate(raw);
  return serial ? serialToISODate(serial) : null;
}

function normalizeDateTime(raw) {
  if (raw === undefined || raw === null || raw === "") return null;
  const s = String(raw).trim();
  const m = s.match(/^(\d{2})\/(\d{2})\/(\d{4})[ T](\d{2}):(\d{2})/);
  if (m) return `${m[3]}-${m[2]}-${m[1]}T${m[4]}:${m[5]}:00`;
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?$/.test(s)) {
    return s.length === 16 ? s + ":00" : s;
  }
  const serial = excelSerialToDate(raw);
  if (serial) {
    return `${serialToISODate(serial)}T${pad2(serial.getUTCHours())}:${pad2(serial.getUTCMinutes())}:00`;
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

