/* Camada de dados: cache por item (sessionStorage) + delta sync via API
   (Cloudflare Worker → CockroachDB), escritas em fila com debounce, sessão/
   purga via resetLocalState. */
import { STATES, DEFAULT_STATE } from "./config";
import { apiFetch } from "./api";
import { DataCache } from "./cache";
import { bindRemote, mergeFromRemote, replaceFromCache, resetData, upsertInList, useData } from "./store";
import { sessionStore, compareDateAsc } from "./utils";

const FLUSH_DELAY_MS = 1200; // agrupa escritas por até 1,2 s antes de enviar

/* Corrige timestamps "hora local" para o Postgres sem duplicar fuso.
   Valores que já vêm do banco com fuso (Z ou ±HH:MM) são preservados. */
function envTimestamp(localIso) {
  if (!localIso) return null;
  if (!/T/.test(localIso)) return localIso; // data simples (YYYY-MM-DD)
  if (/[zZ]$/.test(localIso) || /[+-]\d{2}:\d{2}$/.test(localIso)) return localIso;
  const date = new Date(localIso);
  if (isNaN(date.getTime())) return localIso;

  const offset = -date.getTimezoneOffset();
  const sign = offset >= 0 ? "+" : "-";
  const abs = Math.abs(offset);
  const pad = (n) => String(n).padStart(2, "0");
  return `${localIso}${sign}${pad(Math.floor(abs / 60))}:${pad(abs % 60)}`;
}

function stateTable(base, state) {
  const map = { RO: `${base}_ro`, AM: `${base}_am`, PA: `${base}_pa` };
  return map[state] || `${base}_ro`;
}

function entryToRow(indicatorId, entry) {
  return {
    id: entry.id,
    indicador_id: indicatorId,
    data: entry.date,
    valor: Number(entry.value),
    meta: entry.meta ?? null
  };
}

function employeeToRow(emp) {
  return {
    id: emp.id,
    nome: emp.name ?? "",
    setor: emp.sector ?? "",
    cargo: emp.cargo != null ? String(emp.cargo) : null,
    usuario: String(emp.user ?? ""),
    estado_sigla: emp.estado ?? null,
    salario: emp.salario != null ? Number(emp.salario) : null,
    entrada_em: emp.hiredAt ? String(emp.hiredAt).split("T")[0] : null,
    status: emp.status || "ativo",
    tipo: emp.type || "efetivado",
    conta_turnover: !!emp.countsTurnover,
    department_id: emp.departmentId || null,
    filial_id: emp.filialId || null,
    lider_imediato: emp.liderImediato != null ? String(emp.liderImediato) : null,
    gerente_regional: emp.gerenteRegional != null ? String(emp.gerenteRegional) : null,
    vale_transporte: emp.valeTransporte != null ? Number(emp.valeTransporte) : null,
    vale_alimentacao: emp.valeAlimentacao != null ? Number(emp.valeAlimentacao) : null,
    inss: emp.inss != null ? Number(emp.inss) : null,
    fgts: emp.fgts != null ? Number(emp.fgts) : null,
    irrf: emp.irrf != null ? Number(emp.irrf) : null,
    premio_art_62: emp.premioArt62 != null ? Number(emp.premioArt62) : null,
    premio_loja: emp.premioLoja != null ? Number(emp.premioLoja) : null,
    comissao: emp.comissao != null ? Number(emp.comissao) : null,
    criado_em: envTimestamp(emp.createdAt) || new Date().toISOString(),
    atualizado_em: envTimestamp(emp.updatedAt),
    desligado_em: envTimestamp(emp.firedAt)
  };
}

function vacancyToRow(vacancy) {
  return {
    id: vacancy.id,
    nome: vacancy.name ?? "",
    aberta_em: envTimestamp(vacancy.openAt),
    fechada_em: envTimestamp(vacancy.closeAt),
    tipo_contratacao: vacancy.tipoContratacao || null,
    filial_id: vacancy.filialId || null,
    estado_sigla: vacancy.estado || null
  };
}

function branchToRow(branch) {
  return {
    id: branch.id,
    id_filial: branch.branchId ?? "",
    cnpj: branch.cnpj ?? "",
    nome: branch.name ?? "",
    abreviado: branch.shortName ?? "",
    gerente: branch.manager || null,
    estado_sigla: branch.estado ?? null,
    criado_em: envTimestamp(branch.createdAt) || new Date().toISOString(),
    atualizado_em: envTimestamp(branch.updatedAt)
  };
}

function departmentToRow(department) {
  return {
    id: department.id,
    nome: department.name ?? "",
    sigla: department.shortName ?? null,
    estado_sigla: department.estado ?? null,
    criado_em: envTimestamp(department.createdAt) || new Date().toISOString(),
    atualizado_em: envTimestamp(department.updatedAt)
  };
}

const _queue = {};
let _flushTimer = null;

function _enqueue(table, id, op) {
  if (!_queue[table]) _queue[table] = new Map();
  _queue[table].set(id, op);
  _schedule();
}

function _schedule() {
  if (_flushTimer) return;
  _flushTimer = setTimeout(() => {
    _flushTimer = null;
    flush();
  }, FLUSH_DELAY_MS);
}

export async function flush() {
  const jobs = [];

  Object.keys(_queue).forEach((table) => {
    const map = _queue[table];
    if (!map || !map.size) return;
    const upserts = [];
    const deletes = [];
    map.forEach((op) => {
      if (op.type === "upsert") upserts.push(op.row);
      else deletes.push(op.id);
    });
    map.clear();
    if (upserts.length || deletes.length) {
      jobs.push({
        table,
        promise: apiFetch(`/api/data/${table}`, { method: "POST", body: { upserts, deletes } })
      });
    }
  });

  if (!jobs.length) return;

  const results = await Promise.all(
    jobs.map((job) =>
      Promise.resolve(job.promise)
        .then(() => ({ table: job.table, error: null }))
        .catch((err) => ({ table: job.table, error: err }))
    )
  );
  results.forEach(({ table, error }) => {
    if (!error) return;
    const status = error.status || error.code;
    console.error(`[API] ${table}`, status ? `(${status}) ` : "", error.message || error);
  });
}

export function registerRemote() {
  bindRemote({
    entryAdded(indicatorId, entry) {
      const estado = entry.meta ? entry.meta.estado : null;
      _enqueue(stateTable("lancamentos", estado), entry.id, { type: "upsert", row: entryToRow(indicatorId, entry) });
    },
    entryUpdated(indicatorId, entry) {
      const estado = entry.meta ? entry.meta.estado : null;
      _enqueue(stateTable("lancamentos", estado), entry.id, { type: "upsert", row: entryToRow(indicatorId, entry) });
    },
    entriesRemoved(ids, estado) {
      const table = stateTable("lancamentos", estado);
      ids.forEach((id) => _enqueue(table, id, { type: "delete", id }));
    },
    employeeSaved(employee) {
      _enqueue(stateTable("colaboradores", employee.estado), employee.id, { type: "upsert", row: employeeToRow(employee) });
    },
    employeeRemoved(id, estado) {
      _enqueue(stateTable("colaboradores", estado), id, { type: "delete", id });
    },
    vacancySaved(vacancy) {
      _enqueue(stateTable("vagas", vacancy.estado), vacancy.id, { type: "upsert", row: vacancyToRow(vacancy) });
    },
    vacancyRemoved(id, estado) {
      _enqueue(stateTable("vagas", estado), id, { type: "delete", id });
    },
    branchSaved(branch) {
      _enqueue(stateTable("filiais", branch.estado), branch.id, { type: "upsert", row: branchToRow(branch) });
    },
    branchRemoved(id, estado) {
      _enqueue(stateTable("filiais", estado), id, { type: "delete", id });
    },
    departmentSaved(department) {
      _enqueue(stateTable("departamentos", department.estado), department.id, { type: "upsert", row: departmentToRow(department) });
    },
    departmentRemoved(id, estado) {
      _enqueue(stateTable("departamentos", estado), id, { type: "delete", id });
    }
  });
}

function mapRemoteEntries(rows) {
  const mapped = {};
  rows.forEach((row) => {
    if (!mapped[row.indicador_id]) mapped[row.indicador_id] = [];
    mapped[row.indicador_id].push({
      id: row.id,
      date: row.data,
      value: Number(row.valor),
      meta: row.meta || null
    });
  });
  return mapped;
}

function mapRemoteEmployee(row, impliedState) {
  return {
    id: row.id,
    name: row.nome ?? "",
    sector: row.setor ?? "",
    cargo: row.cargo != null ? String(row.cargo) : null,
    user: row.usuario != null ? String(row.usuario) : "",
    estado: row.estado_sigla || impliedState || null,
    salario: row.salario != null ? Number(row.salario) : null,
    hiredAt: row.entrada_em ? String(row.entrada_em).split("T")[0] + "T00:00:00" : null,
    status: row.status || "ativo",
    type: row.tipo || "efetivado",
    countsTurnover: !!row.conta_turnover,
    departmentId: row.department_id || null,
    filialId: row.filial_id || null,
    liderImediato: row.lider_imediato != null ? String(row.lider_imediato) : null,
    gerenteRegional: row.gerente_regional != null ? String(row.gerente_regional) : null,
    valeTransporte: row.vale_transporte != null ? Number(row.vale_transporte) : null,
    valeAlimentacao: row.vale_alimentacao != null ? Number(row.vale_alimentacao) : null,
    inss: row.inss != null ? Number(row.inss) : null,
    fgts: row.fgts != null ? Number(row.fgts) : null,
    irrf: row.irrf != null ? Number(row.irrf) : null,
    premioArt62: row.premio_art_62 != null ? Number(row.premio_art_62) : null,
    premioLoja: row.premio_loja != null ? Number(row.premio_loja) : null,
    comissao: row.comissao != null ? Number(row.comissao) : null,
    createdAt: row.criado_em,
    updatedAt: row.atualizado_em,
    firedAt: row.desligado_em
  };
}

function mapRemoteVacancy(row, impliedState) {
  return {
    id: row.id,
    name: row.nome ?? "",
    openAt: row.aberta_em,
    closeAt: row.fechada_em,
    tipoContratacao: row.tipo_contratacao || null,
    filialId: row.filial_id || null,
    estado: row.estado_sigla || impliedState || null
  };
}

function mapRemoteBranch(row, impliedState) {
  return {
    id: row.id,
    branchId: row.id_filial ?? "",
    cnpj: row.cnpj ?? "",
    name: row.nome ?? "",
    shortName: row.abreviado ?? "",
    manager: row.gerente || null,
    estado: row.estado_sigla || impliedState || null,
    createdAt: row.criado_em,
    updatedAt: row.atualizado_em
  };
}

function mapRemoteDepartment(row, impliedState) {
  return {
    id: row.id,
    name: row.nome ?? "",
    shortName: row.sigla ?? "",
    estado: row.estado_sigla || impliedState || null,
    createdAt: row.criado_em,
    updatedAt: row.atualizado_em
  };
}

const _loadedStates = {};

export function loadedStates() {
  return _loadedStates;
}

export async function hydrate(state) {
  state = state || DEFAULT_STATE;
  const states = state === "todos" ? STATES.slice() : [state];

  let loadedAny = false;
  for (const s of states) {
    if (_loadedStates[s]) continue;
    loadedAny = true;
    const suffix = s.toLowerCase();
    const fetchTable = async (name) => {
      try {
        return await apiFetch(`/api/data/${name}`);
      } catch (err) {
        console.error(`[API] Erro ao consultar ${name}:`, err);
        return { error: err };
      }
    };
    const [lan, vac, col, fil, dep] = await Promise.all([
      fetchTable(`lancamentos_${suffix}`),
      fetchTable(`vagas_${suffix}`),
      fetchTable(`colaboradores_${suffix}`),
      fetchTable(`filiais_${suffix}`),
      fetchTable(`departamentos_${suffix}`)
    ]);
    const errored = [lan, vac, col, fil, dep].filter((res) => res && res.error);
    if (errored.length) {
      // Não marca o estado como carregado quando a consulta falha (ex.: sem
      // sessão autenticada ainda). Assim o estado é baixado novamente no
      // próximo acesso — evita telas vazias por estado "marcado" sem dados.
      errored.forEach((res) => console.error("[API]", res.error.message));
      return false;
    }

    const rowsOf = (res) => (res && !res.error && res.data ? res.data : []);
    const rowsLan = rowsOf(lan);
    const rowsVac = rowsOf(vac);
    const rowsCol = rowsOf(col);
    const rowsFil = rowsOf(fil);
    const rowsDep = rowsOf(dep);

    rowsLan.forEach((r) => DataCache.setItem(`lancamentos_${suffix}`, r.id, r));
    rowsVac.forEach((r) => DataCache.setItem(`vagas_${suffix}`, r.id, r));
    rowsCol.forEach((r) => DataCache.setItem(`colaboradores_${suffix}`, r.id, r));
    rowsFil.forEach((r) => DataCache.setItem(`filiais_${suffix}`, r.id, r));
    rowsDep.forEach((r) => DataCache.setItem(`departamentos_${suffix}`, r.id, r));

    mergeFromRemote({
      entries: mapRemoteEntries(rowsLan),
      vacancies: rowsVac.map((r) => mapRemoteVacancy(r, s)),
      employees: rowsCol.map((r) => mapRemoteEmployee(r, s)),
      branches: rowsFil.map((r) => mapRemoteBranch(r, s)),
      departments: rowsDep.map((r) => mapRemoteDepartment(r, s))
    });
    _loadedStates[s] = true;
  }

  if (loadedAny) {
    const v = await deltaVersao();
    if (v) DataCache.setVersion(v);
  }
  console.info(`[API] Dados carregados: ${states.join(", ")}.`);
  return true;
}

const STATE_TABLES = ["lancamentos_", "vagas_", "colaboradores_", "filiais_", "departamentos_"];

function stateCachedKeys(suffix) {
  const out = [];
  DataCache.keys().forEach((key) => {
    const tabela = key.slice("ggd:".length).split(":")[0] || "";
    if (STATE_TABLES.some((p) => tabela.indexOf(p + suffix) === 0)) out.push(key);
  });
  return out;
}

/* Reconstrói em memória (merge, sem apagar o resto) o estado a partir das
   chaves do sessionStorage. Reusa os mesmos mapeamentos do download. */
function mergeStateFromCache(suffix, state) {
  const payload = { entries: {}, employees: [], vacancies: [], branches: [], departments: [] };
  stateCachedKeys(suffix).forEach((key) => {
    const item = DataCache.readItem(key);
    if (!item || !item.id) return;
    const tabela = key.slice("ggd:".length).split(":")[0] || "";
    if (tabela.indexOf("lancamentos_") === 0) {
      const ind = item.indicador_id || "headcount";
      if (!payload.entries[ind]) payload.entries[ind] = [];
      payload.entries[ind].push({
        id: item.id,
        date: item.data,
        value: Number(item.valor),
        meta: item.meta || null
      });
    } else if (tabela.indexOf("colaboradores_") === 0) {
      payload.employees.push(mapRemoteEmployee(item, state));
    } else if (tabela.indexOf("vagas_") === 0) {
      payload.vacancies.push(mapRemoteVacancy(item, state));
    } else if (tabela.indexOf("filiais_") === 0) {
      payload.branches.push(mapRemoteBranch(item, state));
    } else if (tabela.indexOf("departamentos_") === 0) {
      payload.departments.push(mapRemoteDepartment(item, state));
    }
  });
  Object.keys(payload.entries).forEach((k) => payload.entries[k].sort((a, b) => compareDateAsc(a.date, b.date)));
  mergeFromRemote(payload);
}

/* Carrega estado(s) priorizando o cache local + delta sync (egress mínimo):
   1. se o estado já está em memória, nada é baixado;
   2. se há itens dele no cache local, reconstrói a memória e aplica apenas o
      delta desde a última versão;
   3. senão, faz o download completo do estado (que é então guardado no cache). */
export async function hydrateState(next) {
  // Limpa (uma vez) resíduos de PII de versões antigas gravados em localStorage.
  DataCache.removeLegacy();
  const states = next === "todos" ? STATES.slice() : [next];
  const pending = states.filter((s) => !_loadedStates[s]);
  if (!pending.length) return true;

  const versao = DataCache.getVersion();
  let usedCache = false;
  if (versao > 0) {
    const allCached = pending.every((s) => stateCachedKeys(s.toLowerCase()).length > 0);
    if (allCached) {
      pending.forEach((s) => {
        mergeStateFromCache(s.toLowerCase(), s);
        _loadedStates[s] = true;
      });
      usedCache = true;
    }
  }

  if (usedCache) {
    const delta = await fetchDelta(versao);
    if (delta) {
      if (delta.changes && delta.changes.length) {
        // Snapshot dos estados realmente carregados: o applyDelta marca como
        // carregado todo estado citado no delta, o que marcaria indevidamente
        // estados que ainda não tiveram o conjunto completo de dados em memória.
        const loadedBefore = new Set(Object.keys(_loadedStates));
        applyDelta(delta.changes);
        Object.keys(_loadedStates).forEach((k) => delete _loadedStates[k]);
        pending.forEach((s) => (_loadedStates[s] = true));
        loadedBefore.forEach((s) => {
          if (!_loadedStates[s]) _loadedStates[s] = true;
        });
        DataCache.setVersion(delta.versaoAtual);
      }
      console.info(`[API] Estados restaurados do cache local: ${pending.join(", ")}.`);
      return true;
    }
    // Delta indisponível: recarrega por completo para não exibir dados velhos.
    pending.forEach((s) => delete _loadedStates[s]);
  }

  return hydrate(pending.length === 1 ? pending[0] : "todos");
}

async function deltaVersao() {
  try {
    const data = await apiFetch("/api/delta/version");
    return Number(data && data.data && data.data.versao) || 0;
  } catch (err) {
    console.warn("[API] Versão do delta indisponível:", err.message);
    return 0;
  }
}

async function fetchDelta(versao) {
  try {
    const data = await apiFetch(`/api/delta/sync?versao=${Number(versao) || 0}`);
    const payload = data && data.data ? data.data : {};
    return {
      versaoAtual: Number(payload.versaoAtual) || Number(versao) || 0,
      changes: Array.isArray(payload.changes) ? payload.changes : []
    };
  } catch (err) {
    console.warn("[API] Falha no delta sync:", err);
    return null;
  }
}

function _removeFromMemory(tabela, id) {
  const data = useData();
  if (tabela.indexOf("lancamentos_") === 0) {
    Object.keys(data.entries).forEach((ind) => {
      data.entries[ind] = data.entries[ind].filter((e) => e.id !== id);
    });
  } else if (tabela.indexOf("colaboradores_") === 0) {
    data.employees = data.employees.filter((e) => e.id !== id);
  } else if (tabela.indexOf("vagas_") === 0) {
    data.vacancies = data.vacancies.filter((v) => v.id !== id);
  } else if (tabela.indexOf("filiais_") === 0) {
    data.branches = data.branches.filter((b) => b.id !== id);
  } else if (tabela.indexOf("departamentos_") === 0) {
    data.departments = data.departments.filter((d) => d.id !== id);
  }
}

function _upsertInMemory(tabela, row, estado) {
  const data = useData();
  if (tabela.indexOf("lancamentos_") === 0) {
    const ind = row.indicador_id || "headcount";
    if (!data.entries[ind]) data.entries[ind] = [];
    upsertInList(data.entries[ind], {
      id: row.id,
      date: row.data,
      value: Number(row.valor),
      meta: row.meta || null
    });
    data.entries[ind].sort((a, b) => compareDateAsc(a.date, b.date));
  } else if (tabela.indexOf("colaboradores_") === 0) {
    upsertInList(data.employees, mapRemoteEmployee(row, estado));
  } else if (tabela.indexOf("vagas_") === 0) {
    upsertInList(data.vacancies, mapRemoteVacancy(row, estado));
  } else if (tabela.indexOf("filiais_") === 0) {
    upsertInList(data.branches, mapRemoteBranch(row, estado));
  } else if (tabela.indexOf("departamentos_") === 0) {
    upsertInList(data.departments, mapRemoteDepartment(row, estado));
  }
}

function applyDelta(changes) {
  (changes || []).forEach((c) => {
    if (!c || !c.tabela) return;
    const estado = c.tabela.slice(-2).toUpperCase();
    if (c.operacao === "delete") {
      DataCache.removeItem(c.tabela, c.registro_id);
      _removeFromMemory(c.tabela, c.registro_id);
    } else if (c.operacao === "upsert" && c.dados) {
      DataCache.setItem(c.tabela, c.registro_id, c.dados);
      _upsertInMemory(c.tabela, c.dados, estado);
    }
    _loadedStates[estado] = true;
  });
}

function loadLocalIntoMemory() {
  const keys = DataCache.keys();
  if (!keys.length) return false;

  const data = { entries: {}, employees: [], vacancies: [], branches: [], departments: [] };
  const tablesSeen = {};

  keys.forEach((key) => {
    const item = DataCache.readItem(key);
    if (!item || !item.id) return;
    const rest = key.slice("ggd:".length);
    const sep = rest.indexOf(":");
    if (sep < 0) return;
    const tabela = rest.slice(0, sep);
    tablesSeen[tabela] = true;
    const estado = tabela.slice(-2).toUpperCase();

    if (tabela.indexOf("lancamentos_") === 0) {
      const ind = item.indicador_id || "headcount";
      if (!data.entries[ind]) data.entries[ind] = [];
      data.entries[ind].push({
        id: item.id,
        date: item.data,
        value: Number(item.valor),
        meta: item.meta || null
      });
    } else if (tabela.indexOf("colaboradores_") === 0) {
      data.employees.push(mapRemoteEmployee(item, estado));
    } else if (tabela.indexOf("vagas_") === 0) {
      data.vacancies.push(mapRemoteVacancy(item, estado));
    } else if (tabela.indexOf("filiais_") === 0) {
      data.branches.push(mapRemoteBranch(item, estado));
    } else if (tabela.indexOf("departamentos_") === 0) {
      data.departments.push(mapRemoteDepartment(item, estado));
    }
  });

  Object.keys(data.entries).forEach((k) => data.entries[k].sort((a, b) => compareDateAsc(a.date, b.date)));
  replaceFromCache(data);

  Object.keys(_loadedStates).forEach((k) => delete _loadedStates[k]);
  STATES.forEach((s) => {
    const suffix = s.toLowerCase();
    if (tablesSeen["lancamentos_" + suffix] || tablesSeen["colaboradores_" + suffix]) {
      _loadedStates[s] = true;
    }
  });
  return true;
}

/* Boot com Delta Sync:
   1) reconstrói a memória a partir do sessionStorage (renderização rápida);
   2) se não houver cache -> download completo + semeadura item a item;
   3) se houver cache -> pede apenas os itens alterados/deletados desde a
      última versão e aplica via setItem/removeItem. */
export async function hydrateWithDelta(state) {
  DataCache.removeLegacy();

  const hasLocal = loadLocalIntoMemory();
  if (hasLocal) {
    console.info("[API] Cache local restaurado do sessionStorage.");
  }

  if (!hasLocal) {
    console.info("[API] Primeiro acesso — baixando dados completos.");
    Object.keys(_loadedStates).forEach((k) => delete _loadedStates[k]);
    return await hydrate(state);
  }

  const versao = DataCache.getVersion();
  const delta = await fetchDelta(versao);
  if (!delta) {
    console.info("[API] Delta indisponível — baixando dados completos (fallback).");
    DataCache.resetAll();
    Object.keys(_loadedStates).forEach((k) => delete _loadedStates[k]);
    resetData();
    return await hydrate(state);
  }

  if (delta.versaoAtual <= versao || !delta.changes.length) {
    console.info(`[API] Sem alterações (versão ${versao}) — usando cache local.`);
    return true;
  }

  console.info(`[API] Delta sync: ${delta.changes.length} alteração(ões) desde a versão ${versao}.`);
  applyDelta(delta.changes);
  DataCache.setVersion(delta.versaoAtual);
  return true;
}

/* Boot: chamado pelo main.js antes da montagem do app. Só hidrata quando já
   há sessão autenticada (sem ela a API responde 401). */
export async function bootstrapData(authed) {
  registerRemote();
  if (!authed) {
    console.info("[API] Sem sessão ativa — dados serão carregados após o login.");
    return;
  }
  await hydrateWithDelta(DEFAULT_STATE);
}

/* Descarta escritas locais ainda pendentes (fila com debounce). Usado no
   logout/expiração: sem isso, edições do usuário anterior poderiam ser
   enviadas ao banco com a sessão do próximo usuário. */
export function discardPendingWrites() {
  if (_flushTimer) {
    clearTimeout(_flushTimer);
    _flushTimer = null;
  }
  Object.keys(_queue).forEach((k) => _queue[k].clear());
}

/* Purga completa de dados sensíveis ao encerrar a sessão:
   fila de escrita + memória reativa + cache em sessionStorage. */
export function resetLocalState() {
  discardPendingWrites();
  resetData();
  Object.keys(_loadedStates).forEach((k) => delete _loadedStates[k]);
  DataCache.resetAll();
}

/* "Recarregar Dados": limpa cache e memória, remove resíduos antigos do
   localStorage e busca os dados atualizados direto do banco. A sessão
   (gg-auth) vive em sessionStorage e é preservada (as chaves ggd:* são as
   únicas apagadas). */
export async function reloadData() {
  DataCache.removeLegacy();
  DataCache.resetAll();
  resetData();
  Object.keys(_loadedStates).forEach((k) => delete _loadedStates[k]);
  await hydrate(DEFAULT_STATE);
}

/* Garante que escritas pendentes não se percam ao sair da página */
if (typeof window !== "undefined") {
  window.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") flush();
  });
  window.addEventListener("pagehide", () => flush());
}
