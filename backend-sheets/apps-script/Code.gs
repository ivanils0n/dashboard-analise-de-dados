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
 * Toda chamada é um POST com corpo JSON { secret, action, ...params }.
 * Resposta sempre HTTP 200 (limitação do Apps Script) com
 * { success: true, data } ou { success: false, error }.
 */

function doPost(e) {
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

  try {
    var data;
    switch (body.action) {
      case "setup":
        data = setupSheets(body.sheets);
        break;
      case "read":
        data = readRows(body.sheet);
        break;
      case "append":
        data = appendRows(body.sheet, body.values);
        break;
      case "update":
        data = updateRows(body.sheet, body.updates);
        break;
      case "delete":
        data = deleteRows(body.sheet, body.rows);
        break;
      default:
        return respond({ success: false, error: 'Ação desconhecida: "' + body.action + '".' });
    }
    return respond({ success: true, data: data });
  } catch (err) {
    return respond({ success: false, error: String(err) });
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
function setupSheets(sheets) {
  var ss = spreadsheet_();
  (sheets || []).forEach(function (def) {
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

function appendRows(sheetName, values) {
  if (!values || !values.length) return { appended: 0 };
  var sheet = sheet_(sheetName);
  var startRow = sheet.getLastRow() + 1;
  var numCols = values[0].length;
  sheet.getRange(startRow, 1, values.length, numCols).setValues(values);
  return { appended: values.length };
}

// updates: [{ rowNumber, values }] — rowNumber já 1-based contando o cabeçalho.
function updateRows(sheetName, updates) {
  var sheet = sheet_(sheetName);
  (updates || []).forEach(function (update) {
    sheet.getRange(update.rowNumber, 1, 1, update.values.length).setValues([update.values]);
  });
  return { updated: (updates || []).length };
}

function deleteRows(sheetName, rows) {
  var sheet = sheet_(sheetName);
  // Ordem decrescente: apagar de baixo para cima evita que uma exclusão
  // desloque o número das linhas seguintes ainda por apagar no mesmo lote.
  var sorted = (rows || []).slice().sort(function (a, b) {
    return b - a;
  });
  sorted.forEach(function (rowNumber) {
    sheet.deleteRow(rowNumber);
  });
  return { deleted: sorted.length };
}

function respond(payload) {
  return ContentService.createTextOutput(JSON.stringify(payload)).setMimeType(
    ContentService.MimeType.JSON
  );
}
