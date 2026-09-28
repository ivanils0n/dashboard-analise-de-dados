#!/usr/bin/env node
// Migra a antiga tabela genérica "lancamentos" (indicador_id + meta json) para
// as tabelas dedicadas novas (diarias, treinamentos, custo_folha,
// absenteismo, meses_incompletos), e remove Colaboradores/Departamentos
// (substituídos pela importação mensal em Headcount).
//
// Uso:
//   node scripts/migrate-restructure.mjs               # migra, mantém tudo antigo
//   node scripts/migrate-restructure.mjs --delete-old   # migra e apaga as abas antigas no final
//
// Pré-requisito: rode `node scripts/seed-sheet.mjs` antes, pra garantir que
// diarias/treinamentos/custo_folha/absenteismo/meses_incompletos já existem com o cabeçalho certo.
//
// Lê "lancamentos" (consolidada) OU "lancamentos_ro/am/pa" (se a consolidação
// de abas por estado ainda não rodou nessa planilha) — tenta as duas formas.
// "custo_contratacao" (agora calculado ao vivo a partir de vagas) e
// "salario_colaborador" (removido) são descontinuados: não são migrados.
//
// Lê credenciais de .dev.vars, igual aos outros scripts. Duplicação
// deliberada do schema (ver comentário em seed-sheet.mjs).

import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DELETE_OLD = process.argv.includes("--delete-old");

function loadDevVars() {
  const file = path.join(__dirname, "..", ".dev.vars");
  if (!existsSync(file)) return;
  const content = readFileSync(file, "utf8");
  for (const line of content.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq < 0) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (!(key in process.env)) process.env[key] = value;
  }
}

loadDevVars();

const { APPS_SCRIPT_URL, APPS_SCRIPT_SECRET } = process.env;
if (!APPS_SCRIPT_URL || !APPS_SCRIPT_SECRET) {
  console.error(
    "Faltam variáveis: APPS_SCRIPT_URL, APPS_SCRIPT_SECRET.\n" +
      "Copie .dev.vars.example para .dev.vars e preencha (ver README.md), ou exporte-as no shell."
  );
  process.exit(1);
}

// ---------- schema das tabelas novas (espelha db/tables.ts) ----------

const NEW_COLUMNS = {
  diarias: [
    "id", "nome_colaborador", "funcao", "departamento", "filial", "lider_imediato",
    "gerente_regional", "regional", "motivo", "competencia", "sem_periodo", "valor",
    "estado_sigla"
  ],
  treinamentos: [
    "id", "nome_colaborador", "cargo", "filial", "tema", "modalidade",
    "competencia", "horas", "estado_sigla"
  ],
  custo_folha: ["id", "filial_cnpj", "razao_social", "percent", "competencia", "valor", "estado_sigla"],
  absenteismo: ["id", "competencia", "valor", "estado_sigla"],
  meses_incompletos: ["id", "competencia", "estado_sigla"]
};

// indicador_id (lancamentos antigo) -> { sheet, build(row, meta) }
// `row` = { id, data, valor, criado_em } já desserializado da linha antiga.
const INDICATOR_MAP = {
  custo_diaria: {
    sheet: "diarias",
    build: (row, meta) => ({
      id: row.id,
      nome_colaborador: meta.employeeName || "",
      funcao: meta.funcao || "",
      departamento: meta.departamento || "",
      filial: meta.filial || "",
      lider_imediato: meta.liderImediato || "",
      gerente_regional: meta.gerenteRegional || "",
      regional: meta.regional || "",
      motivo: meta.motivo || "",
      competencia: row.data,
      sem_periodo: Boolean(meta.semPeriodo),
      valor: Number(row.valor) || 0
    })
  },
  treinamento: {
    sheet: "treinamentos",
    build: (row, meta) => ({
      id: row.id,
      nome_colaborador: meta.employeeName || "",
      cargo: meta.cargo || "",
      // Sem coluna de sigla: se a planilha antiga tinha meta.shortName mas não
      // um texto de filial, usa a sigla como texto de filial mesmo.
      filial: meta.filial || meta.shortName || "",
      tema: meta.tema || "",
      modalidade: meta.modalidade || "",
      competencia: row.data,
      // "valor" já é a carga horária confiável (meta.cargaHoraria era cópia redundante).
      horas: Number(row.valor) || 0
    })
  },
  custo_total: {
    sheet: "custo_folha",
    build: (row, meta) => ({
      id: row.id,
      filial_cnpj: meta.cnpj || "",
      razao_social: meta.razaoSocial || meta.filial || "",
      percent: meta.percent != null && meta.percent !== "" ? Number(meta.percent) : "",
      competencia: row.data,
      valor: Number(row.valor) || 0
    })
  },
  absenteismo: {
    sheet: "absenteismo",
    build: (row, meta) => ({
      id: row.id,
      competencia: row.data,
      valor: Number(row.valor) || 0
    })
  },
  mes_incompleto: {
    sheet: "meses_incompletos",
    build: (row) => ({
      id: row.id,
      competencia: row.data
    })
  }
  // custo_contratacao e salario_colaborador: descontinuados, não migrados.
};

const ESTADOS = ["ro", "am", "pa"];

// ---------- cliente do Apps Script ----------

async function callAppsScript(action, params = {}) {
  const res = await fetch(APPS_SCRIPT_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ secret: APPS_SCRIPT_SECRET, action, ...params })
  });
  if (!res.ok) throw new Error(`Apps Script HTTP ${res.status} na ação "${action}": ${await res.text()}`);
  const payload = await res.json();
  if (!payload.success) throw new Error(`Apps Script recusou "${action}": ${payload.error}`);
  return payload.data;
}

function parseMeta(raw) {
  if (raw === "" || raw === null || raw === undefined) return {};
  if (typeof raw !== "string") return raw;
  try {
    return JSON.parse(raw) || {};
  } catch {
    return {};
  }
}

// Lê "lancamentos" (consolidada: id, indicador_id, data, valor, meta,
// estado_sigla, criado_em) e/ou "lancamentos_ro/am/pa" (legada: sem
// estado_sigla, estado vem do sufixo da aba). Devolve [{ estado, indicador_id, row: {id,data,valor,criado_em}, meta }].
async function readAllLancamentos() {
  const out = [];

  try {
    const rows = (await callAppsScript("read", { sheet: "lancamentos" })) || [];
    for (const values of rows) {
      if (!values.length) continue;
      const [id, indicador_id, data, valor, metaRaw, estado_sigla, criado_em] = values;
      if (!id) continue;
      out.push({
        estado: String(estado_sigla || "").toUpperCase(),
        indicador_id,
        row: { id, data, valor, criado_em },
        meta: parseMeta(metaRaw)
      });
    }
    console.log(`  lancamentos: ${rows.filter((r) => r.length).length} linha(s).`);
  } catch (err) {
    console.log(`  lancamentos: não encontrada (${err.message}).`);
  }

  for (const estado of ESTADOS) {
    const sheetName = `lancamentos_${estado}`;
    try {
      const rows = (await callAppsScript("read", { sheet: sheetName })) || [];
      const nonEmpty = rows.filter((r) => r.length);
      for (const values of nonEmpty) {
        const [id, indicador_id, data, valor, metaRaw, criado_em] = values;
        if (!id) continue;
        out.push({
          estado: estado.toUpperCase(),
          indicador_id,
          row: { id, data, valor, criado_em },
          meta: parseMeta(metaRaw)
        });
      }
      if (nonEmpty.length) console.log(`  ${sheetName}: ${nonEmpty.length} linha(s).`);
    } catch {
      // Aba não existe (planilha já consolidada) — ignora.
    }
  }

  return out;
}

// ---------- main ----------

async function main() {
  console.log("Lendo lançamentos antigos...");
  const entries = await readAllLancamentos();
  console.log(`Total lido: ${entries.length} lançamento(s).\n`);

  const toAppend = { diarias: [], treinamentos: [], custo_folha: [], absenteismo: [] };
  const skipped = {};

  for (const entry of entries) {
    const mapping = INDICATOR_MAP[entry.indicador_id];
    if (!mapping) {
      skipped[entry.indicador_id] = (skipped[entry.indicador_id] || 0) + 1;
      continue;
    }
    const built = mapping.build(entry.row, entry.meta);
    built.estado_sigla = entry.estado;
    const header = NEW_COLUMNS[mapping.sheet];
    toAppend[mapping.sheet].push(header.map((col) => (built[col] !== undefined ? built[col] : "")));
  }

  for (const sheet of Object.keys(toAppend)) {
    const values = toAppend[sheet];
    if (!values.length) {
      console.log(`${sheet}: 0 linha(s) para migrar.`);
      continue;
    }
    await callAppsScript("append", { sheet, values });
    console.log(`${sheet}: ${values.length} linha(s) migrada(s).`);
  }

  const skippedTotal = Object.values(skipped).reduce((a, b) => a + b, 0);
  if (skippedTotal) {
    console.log(`\nIgnorados (indicadores descontinuados): ${skippedTotal}`);
    Object.entries(skipped).forEach(([id, count]) => console.log(`  ${id || "(vazio)"}: ${count}`));
  }

  if (!DELETE_OLD) {
    console.log(
      "\nAbas antigas mantidas. Confira os dados em diarias/treinamentos/custo_folha/absenteismo/meses_incompletos\n" +
        "e, quando tiver certeza, rode de novo com --delete-old para apagar lancamentos/colaboradores/departamentos."
    );
    return;
  }

  console.log("\nApagando abas antigas (lancamentos, colaboradores, departamentos)...");
  const oldSheets = ["lancamentos", "colaboradores", "departamentos"];
  for (const base of oldSheets) {
    for (const name of [base, ...ESTADOS.map((e) => `${base}_${e}`)]) {
      const result = await callAppsScript("deleteSheet", { sheet: name });
      console.log(`  ${name}: ${result.deleted ? "apagada" : "já não existia"}.`);
    }
  }
  console.log("Pronto.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
