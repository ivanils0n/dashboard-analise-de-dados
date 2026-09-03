/* Exportação/importação via SheetJS (xlsx/csv/template). */

import * as XLSX from "xlsx";
import {
  getAllEntries,
  getEntriesFor,
  getEmployees,
  getBranches,
  getDepartments,
  getLatestForMeta,
  upsertEmployee,
  upsertBranch,
  upsertDepartment,
  addEntry
} from "./store";
import { INDICATORS, STATES, STATUS_LABELS, TYPE_LABELS } from "./config";
import { activeStates, syncAll } from "./employees";
import { createId, nowLocalISO, todayISO } from "./utils";

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

function buildEntryRows() {
  const rows = [["Data", "Indicador", "Valor", "Unidade", "Estado"]];
  const all = getAllEntries();
  const flat = [];
  INDICATORS.forEach((ind) => {
    (all[ind.id] || []).forEach((e) => flat.push({ ind, ...e }));
  });
  flat.sort((a, b) => b.date.localeCompare(a.date));
  flat.forEach((row) => {
    rows.push([row.date, row.ind.name, Number(row.value), row.ind.unit, (row.meta && row.meta.estado) || ""]);
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
  sheetEntries["!cols"] = [{ wch: 12 }, { wch: 32 }, { wch: 14 }, { wch: 12 }, { wch: 10 }];
  XLSX.utils.book_append_sheet(workbook, sheetEntries, "Lançamentos");

  // ---- Planilha 3: Equipe ----
  const employeeRows = [
    ["Colaborador", "Setor", "Usuário", "Entrada", "Status", "Tipo", "Conta no turnover", "Registro", "Última atualização", "Custo de contratação (R$)", "Salário (R$)", "Estado"]
  ];
  getEmployees().forEach((e) => {
    const cost = getLatestForMeta("custo_contratacao", "employeeId", e.id);
    employeeRows.push([
      e.name,
      e.sector,
      e.user,
      e.hiredAt ? String(e.hiredAt).split("T")[0] : null,
      STATUS_LABELS[e.status] || e.status,
      TYPE_LABELS[e.type] || e.type,
      e.countsTurnover ? "Sim" : "Não",
      e.createdAt,
      e.updatedAt,
      cost ? Number(cost.value) : null,
      e.salario != null ? Number(e.salario) : null,
      e.estado || ""
    ]);
  });
  const sheetEmployees = XLSX.utils.aoa_to_sheet(safeRows(employeeRows));
  sheetEmployees["!cols"] = [{ wch: 24 }, { wch: 20 }, { wch: 16 }, { wch: 12 }, { wch: 12 }, { wch: 16 }, { wch: 18 }, { wch: 20 }, { wch: 20 }, { wch: 22 }, { wch: 14 }, { wch: 8 }];
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
  sheet["!cols"] = [{ wch: 12 }, { wch: 32 }, { wch: 14 }, { wch: 12 }, { wch: 10 }];
  XLSX.utils.book_append_sheet(workbook, sheet, "Lançamentos");
  XLSX.writeFile(workbook, `gente-gestao-dados_${todayISO()}.csv`, { bookType: "csv" });
}

export function downloadTemplate() {
  const workbook = XLSX.utils.book_new();

  const entriesSheet = XLSX.utils.aoa_to_sheet([
    ["Data", "Indicador", "Valor", "Unidade", "Estado"],
    ["2026-08-19", "Headcount", 120, "colaboradores", "RO"],
    ["2026-08-19", "Absenteísmo", 3, "ocorrências", "RO"]
  ]);
  XLSX.utils.book_append_sheet(workbook, entriesSheet, "Lançamentos");

  const teamSheet = XLSX.utils.aoa_to_sheet([
    ["Colaborador", "Setor", "Usuário", "Entrada", "Status", "Tipo", "Conta no turnover", "Registro", "Última atualização", "Custo de contratação (R$)", "Salário (R$)", "Estado"],
    ["Maria Silva", "RH", "3375", "2026-08-19", "Ativo", "Efetivado", "Não", "2026-08-19T09:00:00", "2026-08-19T09:00:00", 2500, 3500, "RO"]
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

      const existing = getEntriesFor(ind.id);
      const duplicate = existing.some(
        (e) => e.date === date && Number(e.value) === value && (e.meta ? e.meta.estado : null) === estado
      );
      if (duplicate) { summary.duplicates++; continue; }

      addEntry(ind.id, { date, value, state: estado });
      summary.imported++;
    }
  }

  const teamSheet = wb.Sheets["Equipe"];
  if (teamSheet) {
    const rows = XLSX.utils.sheet_to_json(teamSheet, { header: 1 });
    const headerRow = rows[0] || [];
    const findCol = colIndex(headerRow);
    const iName = findCol("colaborador");
    const iSector = findCol("setor");
    const iUser = findCol("usuário", "usuario");
    const iHired = findCol("entrada");
    const iStatus = findCol("status");
    const iType = findCol("tipo");
    const iTurnover = findCol("conta no turnover");
    const iCreated = findCol("registro");
    const iUpdated = findCol("última atualização", "ultima atualizacao");
    const iCost = headerRow.findIndex((h) => String(h ?? "").toLowerCase().startsWith("custo"));
    const iSalary = headerRow.findIndex((h) => String(h ?? "").toLowerCase().startsWith("sal"));
    const iEstado = findCol("estado");

    for (let i = 1; i < rows.length; i++) {
      const row = rows[i];
      if (!row || !row.length) continue;
      const name = String(cellAt(row, iName)).trim();
      const sector = String(cellAt(row, iSector)).trim();
      const user = String(cellAt(row, iUser)).trim();
      if (!name || !user) { summary.invalid++; continue; }

      const estadoRaw = String(cellAt(row, iEstado)).trim().toUpperCase();
      const estado = STATES.includes(estadoRaw) ? estadoRaw : (currentState && currentState !== "todos" ? currentState : null);

      const duplicateEmp = getEmployees().some(
        (e) => e.user.toLowerCase() === user.toLowerCase() && (e.estado || null) === estado
      );
      if (duplicateEmp) { summary.duplicateEmployees++; continue; }

      const hiredAt = normalizeDate(cellAt(row, iHired));
      const status = normalizeStatus(cellAt(row, iStatus));
      const type = normalizeType(cellAt(row, iType));
      const countsTurnover = normalizeBool(cellAt(row, iTurnover));
      const createdAt = normalizeDateTime(cellAt(row, iCreated)) || nowLocalISO();
      const updatedAt = normalizeDateTime(cellAt(row, iUpdated)) || createdAt;
      const salaryRaw = cellAt(row, iSalary);
      const salario = salaryRaw !== "" && !isNaN(Number(salaryRaw)) ? Number(salaryRaw) : null;

      const employee = {
        id: createId(),
        name,
        sector,
        user,
        estado,
        salario,
        hiredAt: hiredAt ? hiredAt + "T00:00:00" : null,
        status,
        type,
        countsTurnover,
        createdAt,
        updatedAt,
        firedAt: status === "desligado" ? updatedAt : null
      };
      upsertEmployee(employee);
      summary.importedEmployees++;

      const costRaw = cellAt(row, iCost);
      if (costRaw !== "" && !isNaN(Number(costRaw))) {
        addEntry("custo_contratacao", {
          date: todayISO(),
          value: Number(costRaw),
          state: estado,
          meta: { employeeId: employee.id, employeeName: employee.name }
        });
      }
    }
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
