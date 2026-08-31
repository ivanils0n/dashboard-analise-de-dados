/* =========================================================
   Cliente Supabase + sincronização
   ---------------------------------------------------------
   O Supabase é a única fonte de verdade:
   - hydrate(): baixa TODAS as tabelas a cada abertura e
     substitui a memória (sem cache local intermediário)
   - escritas entram numa fila com debounce e vão em lote
     (1 requisição por tabela) direto para o banco

   ========================================================= */

/* global supabase */

const FLUSH_DELAY_MS = 1200; // agrupa escritas por até 1,2 s antes de enviar

/* Corrige timestamps "hora local" para o Postgres sem duplicar fuso.
   Valores que já vêm do banco com fuso (Z ou ±HH:MM) são preservados —
   antes, um "+00:00" vindo do Postgres recebia "-04:00" na frente,
   gerando "2026-08-31T13:18:22+00:00-04:00" (sintaxe inválida). */
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

/* Cliente Supabase único no contexto do navegador.
   auth.js e supabase-client.js compartilham a mesma instância (mesmo
   storageKey), evitando o aviso "Multiple GoTrueClient instances" e
   garantindo que o token ativo seja reutilizado ao recarregar a página. */
function sharedSupabaseClient() {
  if (window.__ggSupabaseClient !== undefined) return window.__ggSupabaseClient;
  const env = window.ENV;
  /* env.build.js é um módulo diferido: pode não ter rodado ainda. Nesse caso
     não grava cache de null para não travar o client quando as credenciais
     estiverem disponíveis logo em seguida. */
  if (!env) return null;

  const url = env.SUPABASE_URL;
  const key = env.SUPABASE_ANON_KEY;

  if (!url || !key || /SEU-PROJETO|sua-anon-key/i.test(url + key)) {
    console.info("[Supabase] Credenciais ausentes — usando apenas memória local.");
    window.__ggSupabaseClient = null;
    return null;
  }
  try {
    window.__ggSupabaseClient = supabase.createClient(url, key);
  } catch (err) {
    console.error("[Supabase] Falha ao criar o client:", err);
    window.__ggSupabaseClient = null;
  }
  return window.__ggSupabaseClient;
}

const SupabaseDB = {
  client: null,

  init() {
    if (this.client) return this.client;
    this.client = sharedSupabaseClient();
    return this.client;
  },

  get enabled() {
    return !!this.client;
  },

  /* ---------- Mapeamento JS -> tabela ---------- */

  /* Define a tabela de destino por estado (ex.: colaboradores_ro).
     Todos os registros pertencem a um estado; sem estado, usa RO. */
  _stateTable(base, state) {
    const map = { RO: `${base}_ro`, AM: `${base}_am`, PA: `${base}_pa` };
    return map[state] || `${base}_ro`;
  },

  entryToRow(indicatorId, entry) {
    return {
      id: entry.id,
      indicador_id: indicatorId,
      data: entry.date,
      valor: Number(entry.value),
      meta: entry.meta ?? null
    };
  },

  employeeToRow(emp) {
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
  },

  vacancyToRow(vacancy) {
    return {
      id: vacancy.id,
      nome: vacancy.name ?? "",
      aberta_em: envTimestamp(vacancy.openAt),
      fechada_em: envTimestamp(vacancy.closeAt),
      estado_sigla: vacancy.estado || null
    };
  },

  branchToRow(branch) {
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
  },

  departmentToRow(department) {
    return {
      id: department.id,
      nome: department.name ?? "",
      sigla: department.shortName ?? null,
      estado_sigla: department.estado ?? null,
      criado_em: envTimestamp(department.createdAt) || new Date().toISOString(),
      atualizado_em: envTimestamp(department.updatedAt)
    };
  },

  /* ---------- Fila de escrita (batching com debounce) ---------- */

  _queue: {},
  _clearQueue: {},
  _flushTimer: null,

  _enqueue(table, id, op) {
    if (!this._queue[table]) this._queue[table] = new Map();
    this._queue[table].set(id, op);
    this._schedule();
  },

  _enqueueClear(table) {
    this._clearQueue[table] = true;
    if (this._queue[table]) this._queue[table].clear();
    this._schedule();
  },

  _schedule() {
    if (this._flushTimer) return;
    this._flushTimer = setTimeout(() => {
      this._flushTimer = null;
      this.flush();
    }, FLUSH_DELAY_MS);
  },

  /* Envia tudo que está na fila — chamada também ao sair da página */
  async flush() {
    if (!this.enabled) return;
    const jobs = [];

    Object.keys(this._clearQueue).forEach((table) => {
      if (this._clearQueue[table]) {
        this._clearQueue[table] = false;
        jobs.push(this.client.from(table).delete().neq("id", "__none__"));
      }
    });

    Object.keys(this._queue).forEach((table) => {
      const map = this._queue[table];
      if (!map || !map.size) return;
      const upserts = [];
      const deleteIds = [];
      map.forEach((op) => {
        if (op.type === "upsert") upserts.push(op.row);
        else deleteIds.push(op.id);
      });
      map.clear();
      if (upserts.length) jobs.push(this.client.from(table).upsert(upserts));
      if (deleteIds.length) jobs.push(this.client.from(table).delete().in("id", deleteIds));
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
  },

  /* ---------- Operações de escrita (chamadas por Storage) ----------
     Não disparam requisição imediata: entram na fila e vão em lote. */

  insertEntry(indicatorId, entry) {
    const estado = entry.meta ? entry.meta.estado : null;
    const table = this._stateTable("lancamentos", estado);
    this._enqueue(table, entry.id, {
      type: "upsert",
      row: this.entryToRow(indicatorId, entry)
    });
  },

  updateEntryRow(indicatorId, entry) {
    // Upsert cobre criação e atualização (mesma PK)
    const estado = entry.meta ? entry.meta.estado : null;
    const table = this._stateTable("lancamentos", estado);
    this._enqueue(table, entry.id, {
      type: "upsert",
      row: this.entryToRow(indicatorId, entry)
    });
  },

  deleteEntryIds(ids, estado) {
    const table = this._stateTable("lancamentos", estado);
    ids.forEach((id) => this._enqueue(table, id, { type: "delete", id }));
  },

  clearAllLancamentos() {
    ["ro", "am", "pa"].forEach((s) => this._enqueueClear(`lancamentos_${s}`));
  },

  upsertEmployee(employee) {
    const table = this._stateTable("colaboradores", employee.estado);
    this._enqueue(table, employee.id, {
      type: "upsert",
      row: this.employeeToRow(employee)
    });
  },

  deleteEmployee(id, estado) {
    const table = this._stateTable("colaboradores", estado);
    this._enqueue(table, id, { type: "delete", id });
  },

  upsertVacancy(vacancy) {
    const table = this._stateTable("vagas", vacancy.estado);
    this._enqueue(table, vacancy.id, {
      type: "upsert",
      row: this.vacancyToRow(vacancy)
    });
  },

  deleteVacancy(id, estado) {
    const table = this._stateTable("vagas", estado);
    this._enqueue(table, id, { type: "delete", id });
  },

  upsertBranch(branch) {
    const table = this._stateTable("filiais", branch.estado);
    this._enqueue(table, branch.id, {
      type: "upsert",
      row: this.branchToRow(branch)
    });
  },

  deleteBranch(id, estado) {
    const table = this._stateTable("filiais", estado);
    this._enqueue(table, id, { type: "delete", id });
  },

  upsertDepartment(department) {
    const table = this._stateTable("departamentos", department.estado);
    this._enqueue(table, department.id, {
      type: "upsert",
      row: this.departmentToRow(department)
    });
  },

  deleteDepartment(id, estado) {
    const table = this._stateTable("departamentos", estado);
    this._enqueue(table, id, { type: "delete", id });
  },

  clearTable(table) {
    this._enqueueClear(table);
  },

  /* ---------- Mapeamento tabela -> JS ---------- */

  _mapRemoteEntries(rows) {
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
  },

  /* Mappers de um único registro — usados tanto na carga completa quanto
     no delta sync (cada alteração chega como uma linha do banco). */
  _mapRemoteEmployee(row, impliedState) {
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
  },

  _mapRemoteVacancy(row, impliedState) {
    return {
      id: row.id,
      name: row.nome ?? "",
      openAt: row.aberta_em,
      closeAt: row.fechada_em,
      estado: row.estado_sigla || impliedState || null
    };
  },

  _mapRemoteBranch(row, impliedState) {
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
  },

  _mapRemoteDepartment(row, impliedState) {
    return {
      id: row.id,
      name: row.nome ?? "",
      shortName: row.sigla ?? "",
      estado: row.estado_sigla || impliedState || null,
      createdAt: row.criado_em,
      updatedAt: row.atualizado_em
    };
  },

  _mapRemoteEmployees(rows, impliedState) {
    return rows.map((row) => this._mapRemoteEmployee(row, impliedState));
  },

  _mapRemoteVacancies(rows, impliedState) {
    return rows.map((row) => this._mapRemoteVacancy(row, impliedState));
  },

  _mapRemoteBranches(rows, impliedState) {
    return rows.map((row) => this._mapRemoteBranch(row, impliedState));
  },

  _mapRemoteDepartments(rows, impliedState) {
    return rows.map((row) => this._mapRemoteDepartment(row, impliedState));
  },

  /* ---------- Carga (Supabase -> memória) ----------
     Otimização: carrega apenas as tabelas do(s) estado(s) pedido(s).
     O estado padrão é DEFAULT_STATE (RO) no boot; outros estados são
     carregados sob demanda ao trocar o filtro (mesclados à memória). */

  async hydrate(state) {
    if (!this.enabled) return false;
    state = state || (typeof DEFAULT_STATE !== "undefined" ? DEFAULT_STATE : "RO");
    const states = state === "todos" ? STATES.slice() : [state];

    let ok = true;
    let loadedAny = false;
    for (const s of states) {
      if (this._loadedStates[s]) continue;
      loadedAny = true;
      const suffix = s.toLowerCase();
      const fetchTable = async (name, cols) => {
        try {
          return await this.client.from(name).select(cols);
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

      /* Semeia o localStorage item a item (cada registro na própria chave). */
      rowsLan.forEach((r) => DataCache.setItem(`lancamentos_${suffix}`, r.id, r));
      rowsVac.forEach((r) => DataCache.setItem(`vagas_${suffix}`, r.id, r));
      rowsCol.forEach((r) => DataCache.setItem(`colaboradores_${suffix}`, r.id, r));
      rowsFil.forEach((r) => DataCache.setItem(`filiais_${suffix}`, r.id, r));
      rowsDep.forEach((r) => DataCache.setItem(`departamentos_${suffix}`, r.id, r));

      Storage.mergeFromRemote({
        entries: this._mapRemoteEntries(rowsLan),
        vacancies: this._mapRemoteVacancies(rowsVac, s),
        employees: this._mapRemoteEmployees(rowsCol, s),
        branches: this._mapRemoteBranches(rowsFil, s),
        departments: this._mapRemoteDepartments(rowsDep, s)
      });
      this._loadedStates[s] = true;
    }

    /* Registra a versão atual do changelog para os próximos deltas
       (somente quando algum estado foi realmente baixado). */
    if (loadedAny) {
      const v = await this._deltaVersao();
      if (v) DataCache.setVersion(v);
    }
    console.info(`[Supabase] Dados carregados: ${states.join(", ")}.`);
    return ok;
  },

  _loadedStates: {},

  /* ---------- Delta Sync (localStorage por item + payload do banco) ---------- */

  /* Versão atual do changelog no banco (máximo id de registro_alteracoes). */
  async _deltaVersao() {
    if (!this.enabled) return 0;
    try {
      const { data, error } = await this.client.rpc("gg_delta_versao");
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
  },

  /* Busca no banco apenas os itens alterados/deletados desde a versão.
     Retorna null quando o mecanismo não está disponível (fallback). */
  async _fetchDelta(versao) {
    if (!this.enabled) return null;
    try {
      const { data, error } = await this.client.rpc("gg_delta_sync", {
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
  },

  /* Aplica o payload do banco item a item no localStorage e na memória:
     - delete  -> localStorage.removeItem(id) e remove da memória
     - upsert  -> localStorage.setItem(id, dados) e insere/atualiza na memória */
  _applyDelta(changes) {
    (changes || []).forEach((c) => {
      if (!c || !c.tabela) return;
      const estado = c.tabela.slice(-2).toUpperCase();
      if (c.operacao === "delete") {
        DataCache.removeItem(c.tabela, c.registro_id);
        this._removeFromMemory(c.tabela, c.registro_id, estado);
      } else if (c.operacao === "upsert" && c.dados) {
        DataCache.setItem(c.tabela, c.registro_id, c.dados);
        this._upsertInMemory(c.tabela, c.dados, estado);
      }
      this._loadedStates[estado] = true;
    });
  },

  _removeFromMemory(tabela, id, estado) {
    const data = Storage.load();
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
  },

  _upsertInMemory(tabela, row, estado) {
    const data = Storage.load();
    const upsertInList = (list, item) => {
      const idx = list.findIndex((x) => x.id === item.id);
      if (idx >= 0) list[idx] = item;
      else list.push(item);
    };

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
      upsertInList(data.employees, this._mapRemoteEmployee(row, estado));
    } else if (tabela.indexOf("vagas_") === 0) {
      upsertInList(data.vacancies, this._mapRemoteVacancy(row, estado));
    } else if (tabela.indexOf("filiais_") === 0) {
      upsertInList(data.branches, this._mapRemoteBranch(row, estado));
    } else if (tabela.indexOf("departamentos_") === 0) {
      upsertInList(data.departments, this._mapRemoteDepartment(row, estado));
    }
  },

  /* Reconstrói a memória a partir dos registros do localStorage (item a item). */
  _loadLocalIntoMemory() {
    const keys = DataCache.keys();
    if (!keys.length) return false;

    const data = { entries: {}, employees: [], vacancies: [], branches: [], departments: [] };
    const tablesSeen = {};

    keys.forEach((key) => {
      const item = DataCache.readItem(key);
      if (!item || !item.id) return;
      const rest = key.slice(DataCache.PREFIX.length);
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
        data.employees.push(this._mapRemoteEmployee(item, estado));
      } else if (tabela.indexOf("vagas_") === 0) {
        data.vacancies.push(this._mapRemoteVacancy(item, estado));
      } else if (tabela.indexOf("filiais_") === 0) {
        data.branches.push(this._mapRemoteBranch(item, estado));
      } else if (tabela.indexOf("departamentos_") === 0) {
        data.departments.push(this._mapRemoteDepartment(item, estado));
      }
    });

    Object.keys(data.entries).forEach((k) =>
      data.entries[k].sort((a, b) => a.date.localeCompare(b.date))
    );
    Storage.replaceFromCache(data);

    this._loadedStates = {};
    STATES.forEach((s) => {
      const suffix = s.toLowerCase();
      if (tablesSeen["lancamentos_" + suffix] || tablesSeen["colaboradores_" + suffix]) {
        this._loadedStates[s] = true;
      }
    });
    return true;
  },

  /* Boot com Delta Sync:
     1) reconstrói a memória a partir do localStorage (renderização rápida);
     2) se não houver cache -> download completo + semeadura item a item;
     3) se houver cache -> pede apenas os itens alterados/deletados desde a
        última versão e aplica via setItem/removeItem. Nenhum clear() nem
        recarga da lista inteira quando apenas um item mudou. */
  async hydrateWithDelta(state) {
    if (!this.enabled) return false;

    DataCache.removeLegacy();

    const hasLocal = this._loadLocalIntoMemory();
    if (hasLocal) {
      console.info("[Supabase] Cache local restaurado do localStorage.");
    }

    /* 1) Primeiro acesso (sem cache local): download completo + seed. */
    if (!hasLocal) {
      console.info("[Supabase] Primeiro acesso — baixando dados completos.");
      this._loadedStates = {};
      return await this.hydrate(state);
    }

    /* 2) Reload: delta sync leve. */
    const versao = DataCache.getVersion();
    const delta = await this._fetchDelta(versao);
    if (!delta) {
      /* Mecanismo de delta indisponível (SQL não aplicado): fallback seguro,
         download completo e reseed do cache por item. */
      console.info("[Supabase] Delta indisponível — baixando dados completos (fallback).");
      DataCache.resetAll();
      this._loadedStates = {};
      Storage.reset();
      return await this.hydrate(state);
    }

    if (delta.versaoAtual <= versao || !delta.changes.length) {
      console.info(`[Supabase] Sem alterações (versão ${versao}) — usando cache local.`);
      return true;
    }

    console.info(
      `[Supabase] Delta sync: ${delta.changes.length} alteração(ões) desde a versão ${versao}.`
    );
    this._applyDelta(delta.changes);
    DataCache.setVersion(delta.versaoAtual);
    return true;
  }
};

/* Boot: chamado pelo app.js antes da primeira renderização.
   Usa Delta Sync: reconstrói a memória do localStorage e aplica
   apenas os itens alterados/deletados desde a última versão. */
async function bootstrapSupabase() {
  await loadEnv();
  SupabaseDB.init();
  if (!SupabaseDB.enabled) return;
  await SupabaseDB.hydrateWithDelta(DEFAULT_STATE);
}

/* Garante que escritas pendentes não se percam ao sair da página */
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "hidden" && SupabaseDB.enabled) SupabaseDB.flush();
});
window.addEventListener("pagehide", () => {
  if (SupabaseDB.enabled) SupabaseDB.flush();
});
