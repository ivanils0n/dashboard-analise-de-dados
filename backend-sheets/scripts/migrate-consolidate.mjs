#!/usr/bin/env node
// Migra dados das abas antigas (uma por entidade x estado, ex.: "vagas_ro")
// para as novas abas consolidadas (uma por entidade, ex.: "vagas"),
// preenchendo/gravando estado_sigla = RO/AM/PA em cada linha.
//
// Cobre só as entidades que continuam existindo (vagas, headcount, turnover,
// permanencia, filiais). Colaboradores/Departamentos foram removidos do
// sistema (não migre, apenas apague — ver scripts/migrate-restructure.mjs,
// que também cuida de separar a antiga "lancamentos" genérica em
// diarias/treinamentos/custo_folha/absenteismo).
//
// Uso:
//   node scripts/migrate-consolidate.mjs            # migra e mantém as abas antigas
//   node scripts/migrate-consolidate.mjs --delete-old  # migra e apaga as abas antigas no final
//
// Pré-requisito: rode primeiro `node scripts/seed-sheet.mjs` (ou publique de
// novo o Code.gs com a ação "deleteSheet") para garantir que as abas novas
// existam com o cabeçalho certo antes de migrar.
//
// Lê credenciais de .dev.vars (mesmo arquivo do wrangler dev), igual ao
// seed-sheet.mjs. Duplicação deliberada do schema (ver comentário lá).

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

// ---------- schema (espelha backend-sheets/src/db/tables.ts) ----------

const ESTADOS = ["ro", "am", "pa"];
const ENTITY_COLUMNS = {
  vagas: ["id", "nome", "aberta_em", "fechada_em", "salario", "tipo_contratacao", "filial_id", "estado_sigla"],
  headcount: [
    "id", "codigo", "colaborador", "funcao", "remuneracao", "data_admissao", "mes_referencia",
    "status", "demitido_mes", "filial_id", "estado_sigla"
  ],
  turnover: ["id", "filial_id", "mes_referencia", "admitidos", "demitidos", "ativos", "estado_sigla"],
  permanencia: ["id", "colaborador", "data_admissao", "data_demissao", "filial_id", "estado_sigla"],
  filiais: ["id", "id_filial", "cnpj", "nome", "abreviado", "gerente", "estado_sigla", "criado_em", "atualizado_em"]
};

// Índice da coluna estado_sigla em cada linha (todas as entidades têm).
const STATE_COL_INDEX = Object.fromEntries(
  Object.entries(ENTITY_COLUMNS).map(([entity, cols]) => [entity, cols.indexOf("estado_sigla")])
);

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

// ---------- main ----------

async function main() {
  console.log(`Migrando ${Object.keys(ENTITY_COLUMNS).length} entidade(s) de 3 abas para 1...\n`);

  const summary = [];

  for (const entity of Object.keys(ENTITY_COLUMNS)) {
    const numCols = ENTITY_COLUMNS[entity].length;
    const stateIdx = STATE_COL_INDEX[entity];
    let totalRows = 0;
    const rowsToAppend = [];

    for (const estado of ESTADOS) {
      const oldSheet = `${entity}_${estado}`;
      let rows;
      try {
        rows = await callAppsScript("read", { sheet: oldSheet });
      } catch (err) {
        console.log(`  ${oldSheet}: não encontrada ou vazia, pulando (${err.message}).`);
        continue;
      }
      const nonEmpty = (rows || []).filter((r) => r.length);
      if (!nonEmpty.length) {
        console.log(`  ${oldSheet}: 0 linha(s).`);
        continue;
      }
      // Garante estado_sigla = sigla certa mesmo se a célula já vier
      // preenchida (evita inconsistência) ou vazia (caso do lancamentos antigo).
      const tagged = nonEmpty.map((values) => {
        const row = values.slice(0, numCols);
        while (row.length < numCols) row.push("");
        if (stateIdx >= 0) row[stateIdx] = estado.toUpperCase();
        return row;
      });
      rowsToAppend.push(...tagged);
      totalRows += tagged.length;
      console.log(`  ${oldSheet}: ${tagged.length} linha(s).`);
    }

    if (rowsToAppend.length) {
      await callAppsScript("append", { sheet: entity, values: rowsToAppend });
    }
    console.log(`-> ${entity}: ${totalRows} linha(s) copiada(s) para a aba consolidada.\n`);
    summary.push({ entity, totalRows });
  }

  console.log("Resumo:");
  summary.forEach(({ entity, totalRows }) => console.log(`  ${entity}: ${totalRows}`));

  if (!DELETE_OLD) {
    console.log(
      "\nAbas antigas mantidas. Confira os dados na planilha e, quando tiver certeza,\n" +
        "rode de novo com --delete-old para apagá-las."
    );
    return;
  }

  console.log("\nApagando abas antigas...");
  for (const entity of Object.keys(ENTITY_COLUMNS)) {
    for (const estado of ESTADOS) {
      const oldSheet = `${entity}_${estado}`;
      const result = await callAppsScript("deleteSheet", { sheet: oldSheet });
      console.log(`  ${oldSheet}: ${result.deleted ? "apagada" : "já não existia"}.`);
    }
  }
  console.log("Pronto.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
