/* =========================================================
   Cliente Supabase + sincronização
   ---------------------------------------------------------
   O Supabase é a única fonte de verdade:
   - hydrate(): baixa TODAS as tabelas a cada abertura e
     substitui a memória (sem cache local intermediário)
   - escritas entram numa fila com debounce e vão em lote
     (1 requisição por tabela) direto para o banco
   ========================================================= */

import { createClient } from "@supabase/supabase-js";
import { STATES, DEFAULT_STATE } from "./config";
import { DataCache } from "./cache";
import { bindRemote, mergeFromRemote, replaceFromCache, resetData, upsertInList, useData } from "./store";

const FLUSH_DELAY_MS = 1200; // agrupa escritas por até 1,2 s antes de enviar

/* Credenciais injetadas pelo Vite (envPrefix expõe SUPABASE_* em
   import.meta.env — ver vite.config.js) */
const ENV = {
  SUPABASE_URL: import.meta.env.SUPABASE_URL || "",
  SUPABASE_ANON_KEY: import.meta.env.SUPABASE_ANON_KEY || ""
};

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

/* ---------- Cliente ---------- */

let _client;

function createSupabaseClient() {
  const url = ENV.SUPABASE_URL;
  const key = ENV.SUPABASE_ANON_KEY;
  if (!url || !key || /SEU-PROJETO|sua-anon-key/i.test(url + key)) {
    console.info("[Supabase] Credenciais ausentes — usando apenas memória local.");
    return null;
  }
  try {
    return createClient(url, key);
  } catch (err) {
    console.error("[Supabase] Falha ao criar o client:", err);
    return null;
  }
}

export function supabaseClient() {
  if (_client === undefined) _client = createSupabaseClient();
  return _client;
}

/* ---------- Mapeamento JS -> tabela ---------- */

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
    usuario: String(emp.user ?? ""),
    estado_sigla: emp.estado ?? null,
    entrada_em: emp.hiredAt ? String(emp.hiredAt).split("T")[0] : null,
    status: emp.status || "ativo",
    tipo: emp.type || "efetivado",
    conta_turnover: !!emp.countsTurnover,
    department_id: emp.departmentId || null,
    filial_id: emp.filialId || null,
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

/* ---------- Fila de escrita (batching com debounce) ---------- */

const _queue = {};
const _clearQueue = {};
let _flushTimer = null;

function _enqueue(table, id, op) {
  if (!_queue[table]) _queue[table] = new Map();
  _queue[table].set(id, op);
  _schedule();
}

function _enqueueClear(table) {
  _clearQueue[table] = true;
  if (_queue[table]) _queue[table].clear();
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
  const client = supabaseClient();
  if (!client) return;
  const jobs = [];

  Object.keys(_clearQueue).forEach((table) => {
    if (_clearQueue[table]) {
      _clearQueue[table] = false;
      jobs.push(client.from(table).delete().neq("id", "__none__"));
    }
  });

  Object.keys(_queue).forEach((table) => {
    const map = _queue[table];
    if (!map || !map.size) return;
    const upserts = [];
    const deleteIds = [];
    map.forEach((op) => {
      if (op.type === "upsert") upserts.push(op.row);
      else deleteIds.push(op.id);
    });
    map.clear();
    if (upserts.length) jobs.push(client.from(table).upsert(upserts));
    if (deleteIds.length) jobs.push(client.from(table).delete().in("id", deleteIds));
  });

  if (!jobs.length) return;

  const results = await Promise.all(
    jobs.map((job) =>
      Promise.resolve(job)
        .then(({ error }) => ({ error }))
        .catch((err) => ({ error: err }))
    )
  );
  results.forEach(({ error }) => {
    if (error) console.error("[Supabase]", error.message || error);
  });
}

/* ---------- Adaptador de escrita registrado no store ---------- */

export function registerRemote() {
  const client = supabaseClient();
  if (!client) {
    bindRemote(null);
    return;
  }
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
    entriesCleared() {
      ["ro", "am", "pa"].forEach((s) => _enqueueClear(`lancamentos_${s}`));
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

/* ---------- Mapeamento tabela -> JS ---------- */

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
    user: row.usuario != null ? String(row.usuario) : "",
    estado: row.estado_sigla || impliedState || null,
    hiredAt: row.entrada_em ? row.entrada_em + "T00:00:00" : null,
    status: row.status || "ativo",
    type: row.tipo || "efetivado",
    countsTurnover: !!row.conta_turnover,
    departmentId: row.department_id || null,
    filialId: row.filial_id || null,
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

/* ---------- Carga (Supabase -> memória) ---------- */

const _loadedStates = {};

export function loadedStates() {
  return _loadedStates;
}

export async function hydrate(state) {
  const client = supabaseClient();
  if (!client) return false;
  state = state || DEFAULT_STATE;
  const states = state === "todos" ? STATES.slice() : [state];

  let loadedAny = false;
  for (const s of states) {
    if (_loadedStates[s]) continue;
    loadedAny = true;
    const suffix = s.toLowerCase();
    const fetchTable = async (name, cols) => {
      try {
        return await client.from(name).select(cols);
      } catch (err) {
        console.error(`[Supabase] Erro ao consultar ${name}:`, err);
        return null;
      }
    };
    const [lan, vac, col, fil, dep] = await Promise.all([
      fetchTable(`lancamentos_${suffix}`, "id, indicador_id, data, valor, meta"),
      fetchTable(`vagas_${suffix}`, "*"),
      fetchTable(`colaboradores_${suffix}`, "*"),
      fetchTable(`filiais_${suffix}`, "*"),
      fetchTable(`departamentos_${suffix}`, "*")
    ]);
    [lan, vac, col, fil, dep].forEach((res) => {
      if (res && res.error) console.error("[Supabase]", res.error.message);
    });

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
  console.info(`[Supabase] Dados carregados: ${states.join(", ")}.`);
  return true;
}

/* ---------- Delta Sync (localStorage por item + payload do banco) ---------- */

async function deltaVersao() {
  const client = supabaseClient();
  if (!client) return 0;
  try {
    const { data, error } = await client.rpc("gg_delta_versao");
    if (error) {
      console.warn("[Supabase] gg_delta_versao indisponível:", error.message);
      return 0;
    }
    const v = Array.isArray(data) ? data[0] : data;
    return Number(v) || 0;
  } catch (err) {
    console.warn("[Supabase] Falha ao obter versão do delta:", err);
    return 0;
  }
}

async function fetchDelta(versao) {
  const client = supabaseClient();
  if (!client) return null;
  try {
    const { data, error } = await client.rpc("gg_delta_sync", {
      p_versao: Number(versao) || 0
    });
    if (error) {
      console.warn("[Supabase] gg_delta_sync indisponível:", error.message);
      return null;
    }
    if (!data || !data.length) {
      return { versaoAtual: Number(versao) || 0, changes: [] };
    }
    return {
      versaoAtual: Number(data[0].versao_atual) || 0,
      changes: data.map((r) => ({
        tabela: r.tabela,
        registro_id: r.registro_id,
        operacao: r.operacao,
        dados: r.dados
      }))
    };
  } catch (err) {
    console.warn("[Supabase] Falha no delta sync:", err);
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
    data.entries[ind].sort((a, b) => a.date.localeCompare(b.date));
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

  Object.keys(data.entries).forEach((k) => data.entries[k].sort((a, b) => a.date.localeCompare(b.date)));
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
   1) reconstrói a memória a partir do localStorage (renderização rápida);
   2) se não houver cache -> download completo + semeadura item a item;
   3) se houver cache -> pede apenas os itens alterados/deletados desde a
      última versão e aplica via setItem/removeItem. */
export async function hydrateWithDelta(state) {
  const client = supabaseClient();
  if (!client) return false;

  DataCache.removeLegacy();

  const hasLocal = loadLocalIntoMemory();
  if (hasLocal) {
    console.info("[Supabase] Cache local restaurado do localStorage.");
  }

  if (!hasLocal) {
    console.info("[Supabase] Primeiro acesso — baixando dados completos.");
    Object.keys(_loadedStates).forEach((k) => delete _loadedStates[k]);
    return await hydrate(state);
  }

  const versao = DataCache.getVersion();
  const delta = await fetchDelta(versao);
  if (!delta) {
    console.info("[Supabase] Delta indisponível — baixando dados completos (fallback).");
    DataCache.resetAll();
    Object.keys(_loadedStates).forEach((k) => delete _loadedStates[k]);
    resetData();
    return await hydrate(state);
  }

  if (delta.versaoAtual <= versao || !delta.changes.length) {
    console.info(`[Supabase] Sem alterações (versão ${versao}) — usando cache local.`);
    return true;
  }

  console.info(`[Supabase] Delta sync: ${delta.changes.length} alteração(ões) desde a versão ${versao}.`);
  applyDelta(delta.changes);
  DataCache.setVersion(delta.versaoAtual);
  return true;
}

/* Boot: chamado pelo main.js antes da montagem do app. */
export async function bootstrapSupabase() {
  registerRemote();
  if (!supabaseClient()) return;
  await hydrateWithDelta(DEFAULT_STATE);
}

/* "Recarregar Dados": limpa todo o localStorage preservando estritamente a
   sessão (gg-auth e tokens sb-*-auth-token), zera a memória e busca os dados
   atualizados diretamente do banco. */
export async function reloadData() {
  const keep = new Set();
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i);
    if (k && (k === "gg-auth" || (k.indexOf("sb-") === 0 && k.indexOf("-auth-token") !== -1))) {
      keep.add(k);
    }
  }
  const saved = {};
  keep.forEach((k) => (saved[k] = localStorage.getItem(k)));
  try {
    localStorage.clear();
  } catch (e) {}
  keep.forEach((k) => {
    try {
      localStorage.setItem(k, saved[k]);
    } catch (e) {}
  });

  resetData();
  Object.keys(_loadedStates).forEach((k) => delete _loadedStates[k]);

  if (supabaseClient()) {
    await hydrate(DEFAULT_STATE);
  }
}

/* Garante que escritas pendentes não se percam ao sair da página */
if (typeof window !== "undefined") {
  window.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") flush();
  });
  window.addEventListener("pagehide", () => flush());
}
