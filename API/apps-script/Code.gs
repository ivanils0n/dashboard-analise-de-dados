/**
 * Ponte entre o Worker (API) e esta planilha.
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
 *    — é o valor de APPS_SCRIPT_URL no API/.dev.vars.
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

var CODE_VERSION = "2026-10-01-sem-deletesheet-1";

var WRITE_ACTIONS = { setup: true, append: true, update: true, delete: true };

var REQUEST_TIMEOUT_MS = 60 * 1000;

function checkTimeout_(startedAt) {
  if (Date.now() - startedAt > REQUEST_TIMEOUT_MS) {
    var err = new Error("Tempo limite de 1 minuto excedido nesta requisição.");
    err.retriable = true;
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

  var lock = null;
  if (WRITE_ACTIONS[body.action]) {
    lock = LockService.getScriptLock();
    if (!lock.tryLock(30000)) {
      return respond({ success: false, retriable: true, error: "Muitas gravações simultâneas na planilha, tente novamente." });
    }
  }

  try {
    checkTimeout_(startedAt);
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

function readRows(sheetName) {
  var sheet = sheet_(sheetName);
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return [];
  var lastCol = sheet.getLastColumn();
  return sheet.getRange(2, 1, lastRow - 1, lastCol).getValues();
}

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

var CF_ACCOUNT_ID = "669a630ce000a6a3c41a1ccef1001d7b";
var CF_KV_NAMESPACE_ID = "3cbe9ba669b7447fb9bf8cdf04f38617";

var CACHE_SHEETS = [
  "vagas", "headcount", "rescisoes", "filiais",
  "diarias", "treinamentos", "custo_folha", "absenteismo", "ferias", "beneficios", "regionais", "usuarios"
];

var KV_MAX_VALUE_CHARS = 15 * 1024 * 1024;

var KV_MAX_REQUEST_CHARS = 40 * 1024 * 1024;

var CACHE_TRIGGER_HANDLER = "atualizarCacheAgendado";

function atualizarCacheAgendado() {
  pushCache_(false);
}

function atualizarCacheAgora() {
  var result = pushCache_(true);
  Logger.log(JSON.stringify(result));
}

function instalarGatilhoDoCache() {
  ScriptApp.getProjectTriggers().forEach(function (trigger) {
    if (trigger.getHandlerFunction() === CACHE_TRIGGER_HANDLER) ScriptApp.deleteTrigger(trigger);
  });
  ScriptApp.newTrigger(CACHE_TRIGGER_HANDLER).timeBased().everyMinutes(10).create();
  atualizarCacheAgora();
}

function pushCache_(force) {
  var token = PropertiesService.getScriptProperties().getProperty("CF_API_TOKEN");
  if (!token) throw new Error("Configure CF_API_TOKEN nas Propriedades do script (ver instruções acima).");

  var lock = LockService.getDocumentLock();
  if (!lock.tryLock(1000)) return { skipped: "outra atualização em andamento" };
  try {
    var props = PropertiesService.getScriptProperties();
    var startedAt = Date.now();
    var data = readMany_(CACHE_SHEETS);
    var writes = [];
    var hashes = {};
    var changed = [];

    CACHE_SHEETS.forEach(function (name) {
      var rows = data[name];
      if (rows === null) return;
      var rowsJson = JSON.stringify(rows);
      var hash = hex_(Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_1, rowsJson, Utilities.Charset.UTF_8));
      var hashKey = "CACHE_HASH_" + name;
      if (!force && props.getProperty(hashKey) === hash) return;

      hashes[hashKey] = hash;
      changed.push(name);
      if (rowsJson.length <= KV_MAX_VALUE_CHARS) {
        writes.push({ key: "s:" + name, value: '{"t":' + startedAt + ',"rows":' + rowsJson + "}" });
        return;
      }
      var chunks = chunkRows_(rows, KV_MAX_VALUE_CHARS);
      chunks.forEach(function (chunk, i) {
        writes.push({ key: "s:" + name + ":" + i, value: '{"t":' + startedAt + ',"rows":' + JSON.stringify(chunk) + "}" });
      });
      writes.push({ key: "s:" + name, value: '{"t":' + startedAt + ',"parts":' + chunks.length + "}" });
    });

    if (writes.length) kvBulkPut_(token, writes);
    if (changed.length) props.setProperties(hashes);
    return { changed: changed, writes: writes.length, ms: Date.now() - startedAt };
  } finally {
    lock.releaseLock();
  }
}

function chunkRows_(rows, maxChars) {
  var chunks = [];
  var current = [];
  var size = 2;
  rows.forEach(function (row) {
    var rowSize = JSON.stringify(row).length + 1;
    if (current.length && size + rowSize > maxChars) {
      chunks.push(current);
      current = [];
      size = 2;
    }
    current.push(row);
    size += rowSize;
  });
  chunks.push(current);
  return chunks;
}

function kvBulkPut_(token, writes) {
  var url =
    "https://api.cloudflare.com/client/v4/accounts/" + CF_ACCOUNT_ID +
    "/storage/kv/namespaces/" + CF_KV_NAMESPACE_ID + "/bulk";
  var batch = [];
  var size = 2;
  var send = function () {
    if (!batch.length) return;
    var res = UrlFetchApp.fetch(url, {
      method: "put",
      contentType: "application/json",
      headers: { Authorization: "Bearer " + token },
      payload: JSON.stringify(batch),
      muteHttpExceptions: true
    });
    var body = res.getContentText();
    var json = null;
    try {
      json = JSON.parse(body);
    } catch (err) {}
    if (res.getResponseCode() !== 200 || !json || !json.success) {
      throw new Error("Cloudflare recusou a gravação no cache (HTTP " + res.getResponseCode() + "): " + body.slice(0, 500));
    }
    batch = [];
    size = 2;
  };
  writes.forEach(function (write) {
    var writeSize = write.key.length + write.value.length + 30;
    if (batch.length && size + writeSize > KV_MAX_REQUEST_CHARS) send();
    batch.push(write);
    size += writeSize;
  });
  send();
}

function hex_(bytes) {
  return bytes
    .map(function (b) {
      return ("0" + (b & 0xff).toString(16)).slice(-2);
    })
    .join("");
}

function writeValues_(range, values) {
  var pattern = /^[=+\-@\t\r]/;
  for (var r = 0; r < values.length; r++) {
    for (var c = 0; c < values[r].length; c++) {
      var v = values[r][c];
      if (typeof v === "string" && pattern.test(v)) {
        range.getCell(r + 1, c + 1).setNumberFormat("@");
      }
    }
  }
  range.setValues(values);
}

function appendRows(sheetName, values) {
  if (!values || !values.length) return { appended: 0 };
  var sheet = sheet_(sheetName);
  var startRow = sheet.getLastRow() + 1;
  var numCols = values[0].length;
  writeValues_(sheet.getRange(startRow, 1, values.length, numCols), values);
  return { appended: values.length };
}

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
  var ids = sheet.getRange(2, 1, lastRow - 1, 1).getValues();
  for (var i = 0; i < ids.length; i++) {
    var id = ids[i][0];
    if (id !== "" && id !== null) map[id] = i + 2;
  }
  return map;
}

function updateRows(sheetName, updates, startedAt) {
  var sheet = sheet_(sheetName);
  var map = idRowMap_(sheet);
  var applied = 0;
  (updates || []).forEach(function (update) {
    checkTimeout_(startedAt);
    var rowNumber = map[update.id];
    if (!rowNumber) return;
    writeValues_(sheet.getRange(rowNumber, 1, 1, update.values.length), [update.values]);
    applied++;
  });
  return { updated: applied };
}

function deleteRows(sheetName, ids, startedAt) {
  var sheet = sheet_(sheetName);
  var map = idRowMap_(sheet);
  var rowNumbers = (ids || []).map(function (id) { return map[id]; }).filter(Boolean);
  var sorted = rowNumbers.slice().sort(function (a, b) {
    return b - a;
  });
  sorted.forEach(function (rowNumber) {
    checkTimeout_(startedAt);
    sheet.deleteRow(rowNumber);
  });
  return { deleted: sorted.length };
}

function respond(payload) {
  payload.codeVersion = CODE_VERSION;
  return ContentService.createTextOutput(JSON.stringify(payload)).setMimeType(
    ContentService.MimeType.JSON
  );
}
