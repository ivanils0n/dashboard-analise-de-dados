#!/usr/bin/env node
// Cadastra no Cloudflare (segredos do Worker) o e-mail e a chave privada da conta
// de serviço do Google, lendo o arquivo JSON baixado do Google Cloud. A chave
// é enviada ao wrangler pela entrada padrão: não aparece na tela nem no histórico.
//
// Uso (na pasta API):
//   node scripts/set-google-secrets.mjs "C:\caminho\arquivo-da-conta-de-servico.json"
//
// Precisa estar logado no Cloudflare (npx wrangler login). Depois: npx wrangler deploy.

import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const file = process.argv[2];
if (!file) {
  console.error('Informe o caminho do arquivo JSON. Ex.: node scripts/set-google-secrets.mjs "C:\\pasta\\chave.json"');
  process.exit(1);
}

let key;
try {
  key = JSON.parse(readFileSync(file, "utf8"));
} catch (err) {
  console.error("Não consegui ler o arquivo JSON:", err.message);
  process.exit(1);
}
if (key.type !== "service_account" || !key.client_email || !key.private_key) {
  console.error("O arquivo não parece ser a chave de uma conta de serviço do Google.");
  process.exit(1);
}

const apiDir = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");

function putSecret(name, value) {
  const res = spawnSync("npx", ["wrangler", "secret", "put", name], {
    cwd: apiDir,
    input: value,
    encoding: "utf8",
    shell: true // no Windows o npx é um .cmd
  });
  process.stdout.write(res.stdout || "");
  process.stderr.write(res.stderr || "");
  if (res.status !== 0) {
    console.error(`Falhou ao cadastrar ${name}.`);
    process.exit(res.status || 1);
  }
}

putSecret("GOOGLE_CLIENT_EMAIL", key.client_email);
putSecret("GOOGLE_PRIVATE_KEY", key.private_key);
console.log("\nSegredos cadastrados. Agora rode: npx wrangler deploy");
