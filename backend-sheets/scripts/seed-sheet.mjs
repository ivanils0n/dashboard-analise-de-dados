#!/usr/bin/env node
// Script de setup, roda uma vez localmente (node scripts/seed-sheet.mjs).
// Chama o Apps Script (apps-script/Code.gs) já publicado para criar as abas
// da planilha (uma por entidade, + "usuarios") com o cabeçalho certo e, se
// ainda não houver nenhum, um usuário admin inicial.
//
// Desde a consolidação das abas por estado (ver README/CHANGELOG), cada
// entidade tem uma única aba com a coluna estado_sigla distinguindo RO/AM/PA
// — não mais uma aba por entidade x estado. Para migrar dados de uma
// planilha antiga (com abas "vagas_ro" etc.), rode scripts/migrate-consolidate.mjs
// antes ou depois deste setup. Colaboradores/Departamentos e a antiga aba
// genérica "lancamentos" não existem mais — rode scripts/migrate-restructure.mjs
// para migrar os dados dela para diarias/treinamentos/custo_folha/absenteismo/meses_incompletos.
//
// Lê as credenciais de .dev.vars (mesmo arquivo usado pelo `wrangler dev`)
// ou das variáveis de ambiente já exportadas no shell.
//
// Atenção: os nomes de coluna abaixo espelham db/tables.ts. Se o schema lá
// mudar, atualize aqui também (é uma duplicação deliberada — o script roda
// fora do runtime do Worker e não importa TypeScript diretamente).

import { readFileSync, existsSync } from "node:fs";
import { webcrypto } from "node:crypto";
import { fileURLToPath } from "node:url";
import path from "node:path";
import readline from "node:readline/promises";

const crypto = webcrypto;
const __dirname = path.dirname(fileURLToPath(import.meta.url));

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

const ENTITY_COLUMNS = {
  vagas: ["id", "nome", "aberta_em", "fechada_em", "salario", "tipo_contratacao", "filial", "estado_sigla", "recrutador"],
  headcount: [
    "id", "codigo", "colaborador", "funcao", "remuneracao", "data_admissao",
    "genero", "data_desligamento", "mes_referente", "filial", "estado_sigla"
  ],
  turnover: ["id", "filial", "mes_referencia", "admitidos", "demitidos", "ativos", "estado_sigla"],
  permanencia: ["id", "colaborador", "data_admissao", "data_demissao", "filial", "estado_sigla"],
  rescisoes: [
    "id", "empresa", "estado", "colaborador", "filial", "funcao", "admissao", "gerente_imediato",
    "regional", "motivo", "justificativa_apurada", "ponderacoes", "ult_dia_aviso", "valor_rescisao", "grrf_consig", "multa_40", "mes_referencia"
  ],
  filiais: ["id", "cnpj", "nome", "abreviado", "gerente", "estado_sigla"],
  // Substituem a antiga "lancamentos" genérica (ver migrate-restructure.mjs
  // para migrar dados de uma planilha antiga). Colaboradores/Departamentos
  // saíram do sistema — Headcount passou a ser a fonte de colaborador/mês.
  diarias: [
    "id", "nome_colaborador", "funcao", "departamento", "filial", "lider_imediato",
    "gerente_regional", "regional", "motivo", "competencia", "sem_periodo", "valor",
    "estado_sigla"
  ],
  treinamentos: [
    "id", "nome_colaborador", "cargo", "filial", "gerente_regional", "tema", "modalidade",
    "competencia", "horas", "estado_sigla"
  ],
  custo_folha: ["id", "filial_cnpj", "razao_social", "percent", "competencia", "valor", "estado_sigla"],
  absenteismo: ["id", "competencia", "valor", "estado_sigla"],
  // Marcação de "mês incompleto" (ver src/lib/monthStatus.js no frontend).
  meses_incompletos: ["id", "competencia", "estado_sigla"]
};
const USERS_COLUMNS = ["id", "usuario", "nome", "perfil", "ativo", "senha_hash", "criado_em"];

const targetSheets = [{ title: "usuarios", header: USERS_COLUMNS }];
for (const entity of Object.keys(ENTITY_COLUMNS)) {
  targetSheets.push({ title: entity, header: ENTITY_COLUMNS[entity] });
}

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

// ---------- hash de senha (mesmo formato de src/utils/password.ts) ----------

async function hashPassword(password) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(password), "PBKDF2", false, [
    "deriveBits"
  ]);
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", salt, iterations: 100000, hash: "SHA-256" },
    key,
    256
  );
  return `pbkdf2$sha256$100000$${Buffer.from(salt).toString("base64")}$${Buffer.from(bits).toString("base64")}`;
}

function randomPassword() {
  return Buffer.from(crypto.getRandomValues(new Uint8Array(9))).toString("base64url");
}

// ---------- main ----------

async function main() {
  console.log(`Criando/atualizando ${targetSheets.length} aba(s)...`);
  await callAppsScript("setup", { sheets: targetSheets });
  console.log("Abas e cabeçalhos prontos.");

  const usersRows = await callAppsScript("read", { sheet: "usuarios" });
  const hasUsers = (usersRows ?? []).some((row) => row.length);

  if (hasUsers) {
    console.log("Aba 'usuarios' já tem dados — nenhum admin criado.");
  } else {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    const usuario = (await rl.question("Login do admin inicial [admin]: ")).trim() || "admin";
    const nome = (await rl.question("Nome do admin inicial [Administrador]: ")).trim() || "Administrador";
    let senha = (await rl.question("Senha do admin inicial (Enter para gerar uma aleatória): ")).trim();
    rl.close();

    const gerada = !senha;
    if (gerada) senha = randomPassword();

    const row = [
      crypto.randomUUID(),
      usuario,
      nome,
      "admin",
      true,
      await hashPassword(senha),
      new Date().toISOString()
    ];
    await callAppsScript("append", { sheet: "usuarios", values: [row] });

    console.log(`Usuário admin criado: ${usuario}`);
    if (gerada) console.log(`Senha gerada (anote agora, não será mostrada de novo): ${senha}`);
  }

  console.log("Pronto.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
