/**
 * Ponte entre o Worker (backend-sheets) e esta planilha.
 *
 * Como publicar:
 * 1. Abra a planilha → Extensões → Apps Script.
 * 2. Cole este arquivo no lugar do Code.gs padrão.
 * 3. Projeto → Propriedades do projeto → Propriedades do script → adicione
 *    SHARED_SECRET com uma string aleatória longa (é o segredo que o Worker
 *    envia em toda chamada; sem ele, ninguém com a URL consegue ler/gravar).
 * 4. Implantar → Nova implantação → tipo "App da Web".
 *    - Executar como: Eu (sua conta, dona da planilha).
 *    - Quem pode acessar: Qualquer pessoa.
 * 5. Autorize o acesso quando pedido e copie a URL gerada (termina em /exec)
 *    — é o valor de APPS_SCRIPT_URL no backend-sheets/.dev.vars.
 *
 * Pra atualizar este código numa implantação já existente (sem trocar a
 * URL): cole o arquivo novo por cima do antigo no editor e vá em
 * Implantar → Gerenciar implantações → ícone de lápis → Nova versão →
 * Implantar. "Nova implantação" (passo 4) só é usado na primeira vez.
 *
 * Toda chamada é um POST com corpo JSON { secret, action, ...params }.
 * Resposta sempre HTTP 200 (limitação do Apps Script) com
 * { success: true, data } ou { success: false, error }.
 */

// Sobe junto em toda resposta — dá pra confirmar pela própria API se a
// implantação no ar já é esta versão do arquivo, sem precisar abrir o editor
// do Apps Script. Troque essa string sempre que reimplantar.
var CODE_VERSION = "2026-09-24-read-many-1";

// Ações que gravam na planilha — cada uma roda sob o lock (ver doPost). "read"
// fica de fora de propósito: travar leituras também derrubaria a velocidade
// de carregamento do dashboard sem necessidade (elas não corrompem nada).
var WRITE_ACTIONS = { setup: true, append: true, update: true, delete: true, deleteSheet: true };

// Nenhuma requisição pode passar de 1 min rodando aqui dentro — acima disso,
// vira erro em vez de continuar (e travar o lock pros outros por mais tempo).
// Verificado no início e a cada iteração dos laços abaixo (setup/update/
// delete), os únicos pontos onde o tempo se acumula; os demais são uma
// chamada só à API do Sheets, que não dá pra interromper no meio.
var REQUEST_TIMEOUT_MS = 60 * 1000;

function checkTimeout_(startedAt) {
  if (Date.now() - startedAt > REQUEST_TIMEOUT_MS) {
    var err = new Error("Tempo limite de 1 minuto excedido nesta requisição.");
    err.retriable = true; // sinal de sobrecarga passageira, não erro de negócio.
    throw err;
  }
}

function doPost(e) {
  var startedAt = Date.now();
  var body;
  try {
    body = JSON.parse(e.postData.contents);
  } catch (err) {
    return respond({ success: false, error: "JSON inválido." });
  }

  var expected = PropertiesService.getScriptProperties().getProperty("SHARED_SECRET");
  if (!expected || body.secret !== expected) {
    return respond({ success: false, error: "Não autorizado." });
  }

  // Duas gravações na mesma aba ao mesmo tempo (ex.: marcar "mês incompleto"
  // nos 3 estados de uma vez, cada um numa requisição separada) podiam se
  // sobrescrever silenciosamente: appendRows calculava a mesma "próxima linha
  // livre" pras duas chamadas, e a segunda pisava na primeira. O lock serializa
  // as gravações — só uma por vez mexe na planilha — sem travar leituras.
  var lock = null;
  if (WRITE_ACTIONS[body.action]) {
    lock = LockService.getScriptLock();
    if (!lock.tryLock(30000)) {
      // retriable: true — o Worker (sheets.ts) tenta de novo sozinho, com
      // backoff, em vez de já devolver erro pro usuário.
      return respond({ success: false, retriable: true, error: "Muitas gravações simultâneas na planilha, tente novamente." });
    }
  }

  try {
    checkTimeout_(startedAt); // tempo já gasto até aqui (fila do lock incluída) conta.
    var data;
    switch (body.action) {
      case "setup":
        data = setupSheets(body.sheets, startedAt);
        break;
      case "read":
        data = readRows(body.sheet);
        break;
      case "readMany":
        data = readMany_(body.sheets);
        break;
      case "append":
        data = appendRows(body.sheet, body.values);
        break;
      case "update":
        data = updateRows(body.sheet, body.updates, startedAt);
        break;
      case "delete":
        data = deleteRows(body.sheet, body.ids, startedAt);
        break;
      case "deleteSheet":
        data = deleteSheet(body.sheet);
        break;
      default:
        return respond({ success: false, error: 'Ação desconhecida: "' + body.action + '".' });
    }
    return respond({ success: true, data: data });
  } catch (err) {
    return respond({ success: false, retriable: !!err.retriable, error: String(err) });
  } finally {
    if (lock) lock.releaseLock();
  }
}

function spreadsheet_() {
  return SpreadsheetApp.getActiveSpreadsheet();
}

function sheet_(name) {
  var sheet = spreadsheet_().getSheetByName(name);
  if (!sheet) throw new Error('Aba "' + name + '" não existe. Rode a ação "setup" primeiro.');
  return sheet;
}

// Cria as abas que faltarem e (re)grava a linha de cabeçalho de cada uma.
// Formata o corpo (linha 2 em diante) como texto simples — evita que o
// Sheets reinterprete datas/números/ids longos ao digitar ou colar dados.
function setupSheets(sheets, startedAt) {
  var ss = spreadsheet_();
  (sheets || []).forEach(function (def) {
    checkTimeout_(startedAt);
    var sheet = ss.getSheetByName(def.title);
    if (!sheet) sheet = ss.insertSheet(def.title);
    var numCols = def.header.length;
    sheet.getRange(1, 1, 1, numCols).setValues([def.header]);
    sheet.getRange(2, 1, Math.max(sheet.getMaxRows() - 1, 1), numCols).setNumberFormat("@");
  });
  return { total: (sheets || []).length };
}

// Todas as linhas de dados (sem o cabeçalho), como matriz bruta de valores.
function readRows(sheetName) {
  var sheet = sheet_(sheetName);
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return [];
  var lastCol = sheet.getLastColumn();
  return sheet.getRange(2, 1, lastRow - 1, lastCol).getValues();
}

// Várias abas numa execução só: abre a planilha uma vez e devolve
// { nomeDaAba: linhas | null }. Aba inexistente vira null (o Worker trata como
// erro só daquela tabela). Evita pagar a partida do script e a abertura da
// planilha uma vez por aba, que era o grosso da demora no carregamento.
function readMany_(names) {
  var ss = spreadsheet_();
  var out = {};
  (names || []).forEach(function (name) {
    var sheet = ss.getSheetByName(name);
    if (!sheet) {
      out[name] = null;
      return;
    }
    var lastRow = sheet.getLastRow();
    out[name] = lastRow < 2 ? [] : sheet.getRange(2, 1, lastRow - 1, sheet.getLastColumn()).getValues();
  });
  return out;
}

function appendRows(sheetName, values) {
  if (!values || !values.length) return { appended: 0 };
  var sheet = sheet_(sheetName);
  var startRow = sheet.getLastRow() + 1;
  var numCols = values[0].length;
  sheet.getRange(startRow, 1, values.length, numCols).setValues(values);
  return { appended: values.length };
}

// Mapa id -> linha, lido agora (sob o lock) em vez de confiar num número de
// linha calculado pelo Worker antes desta chamada — que podia já estar
// desatualizado por outra gravação concorrente. A coluna do id é sempre a
// A (célula A1 = cabeçalho "id"), nunca outra — checado abaixo antes de ler,
// pra nunca casar update/delete com a coluna errada se alguém reordenar as
// colunas na mão direto na planilha.
function idRowMap_(sheet) {
  var header = sheet.getRange(1, 1).getValue();
  if (String(header).trim().toLowerCase() !== "id") {
    throw new Error(
      'A coluna A da aba "' + sheet.getName() + '" deveria ser "id" (achei "' + header + '"). ' +
      "Não dá pra saber com segurança qual linha atualizar/apagar — corrija a planilha (ou rode \"setup\" de novo) antes de tentar de novo."
    );
  }
  var lastRow = sheet.getLastRow();
  var map = {};
  if (lastRow < 2) return map;
  var ids = sheet.getRange(2, 1, lastRow - 1, 1).getValues(); // coluna A inteira, abaixo do cabeçalho
  for (var i = 0; i < ids.length; i++) {
    var id = ids[i][0];
    if (id !== "" && id !== null) map[id] = i + 2; // +2: 1-based e pula o cabeçalho
  }
  return map;
}

// updates: [{ id, values }] — a linha é resolvida agora, pelo id, não recebida pronta.
function updateRows(sheetName, updates, startedAt) {
  var sheet = sheet_(sheetName);
  var map = idRowMap_(sheet);
  var applied = 0;
  (updates || []).forEach(function (update) {
    checkTimeout_(startedAt);
    var rowNumber = map[update.id];
    if (!rowNumber) return; // linha já não existe mais (apagada por outra gravação) — ignora
    sheet.getRange(rowNumber, 1, 1, update.values.length).setValues([update.values]);
    applied++;
  });
  return { updated: applied };
}

// ids: [id, ...] — mesma resolução por id da updateRows, acima.
function deleteRows(sheetName, ids, startedAt) {
  var sheet = sheet_(sheetName);
  var map = idRowMap_(sheet);
  var rowNumbers = (ids || []).map(function (id) { return map[id]; }).filter(Boolean);
  // Ordem decrescente: apagar de baixo para cima evita que uma exclusão
  // desloque o número das linhas seguintes ainda por apagar no mesmo lote.
  var sorted = rowNumbers.slice().sort(function (a, b) {
    return b - a;
  });
  sorted.forEach(function (rowNumber) {
    checkTimeout_(startedAt);
    sheet.deleteRow(rowNumber);
  });
  return { deleted: sorted.length };
}

// Usada só na migração/limpeza (ver scripts/migrate-consolidate.mjs): apaga
// uma aba inteira depois que os dados dela já foram copiados para a aba nova
// consolidada. Não reclama se a aba já não existir (idempotente).
function deleteSheet(sheetName) {
  var ss = spreadsheet_();
  var sheet = ss.getSheetByName(sheetName);
  if (!sheet) return { deleted: false };
  ss.deleteSheet(sheet);
  return { deleted: true };
}

function respond(payload) {
  payload.codeVersion = CODE_VERSION;
  return ContentService.createTextOutput(JSON.stringify(payload)).setMimeType(
    ContentService.MimeType.JSON
  );
}
