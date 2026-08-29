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

function envTimestamp(localIso) {
  if (!localIso) return null;
  if (!/T/.test(localIso)) return localIso; // data simples (YYYY-MM-DD)
  const date = new Date(localIso);
  if (isNaN(date.getTime())) return localIso;

  const offset = -date.getTimezoneOffset();
  const sign = offset >= 0 ? "+" : "-";
  const abs = Math.abs(offset);
  const pad = (n) => String(n).padStart(2, "0");
  return `${localIso}${sign}${pad(Math.floor(abs / 60))}:${pad(abs % 60)}`;
}

const SupabaseDB = {
  client: null,

  init() {
    if (this.client) return this.client;
    const url = window.ENV && window.ENV.SUPABASE_URL;
    const key = window.ENV && window.ENV.SUPABASE_ANON_KEY;

    if (!url || !key || /SEU-PROJETO|sua-anon-key/i.test(url + key)) {
      console.info("[Supabase] Credenciais ausentes — usando apenas memória local.");
      return null;
    }
    try {
      this.client = supabase.createClient(url, key);
    } catch (err) {
      console.error("[Supabase] Falha ao criar o client:", err);
      this.client = null;
    }
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

  _mapRemoteEmployees(rows, impliedState) {
    return rows.map((row) => ({
      id: row.id,
      name: row.nome ?? "",
      sector: row.setor ?? "",
      user: row.usuario != null ? String(row.usuario) : "",
      estado: row.estado_sigla || impliedState || null,
      hiredAt: row.entrada_em ? row.entrada_em + "T00:00:00" : null,
      status: row.status || "ativo",
      type: row.tipo || "efetivado",
      countsTurnover: !!row.conta_turnover,
      createdAt: row.criado_em,
      updatedAt: row.atualizado_em,
      firedAt: row.desligado_em
    }));
  },

  _mapRemoteVacancies(rows, impliedState) {
    return rows.map((row) => ({
      id: row.id,
      name: row.nome ?? "",
      openAt: row.aberta_em,
      closeAt: row.fechada_em,
      estado: row.estado_sigla || impliedState || null
    }));
  },

  _mapRemoteBranches(rows, impliedState) {
    return rows.map((row) => ({
      id: row.id,
      branchId: row.id_filial ?? "",
      cnpj: row.cnpj ?? "",
      name: row.nome ?? "",
      shortName: row.abreviado ?? "",
      manager: row.gerente || null,
      estado: row.estado_sigla || impliedState || null,
      createdAt: row.criado_em,
      updatedAt: row.atualizado_em
    }));
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
    for (const s of states) {
      if (this._loadedStates[s]) continue;
      const suffix = s.toLowerCase();
      const fetchTable = async (name, cols) => {
        try {
          return await this.client.from(name).select(cols);
        } catch (err) {
          console.error(`[Supabase] Erro ao consultar ${name}:`, err);
          return null;
        }
      };
      const [lan, vac, col, fil] = await Promise.all([
        fetchTable(`lancamentos_${suffix}`, "id, indicador_id, data, valor, meta"),
        fetchTable(`vagas_${suffix}`, "*"),
        fetchTable(`colaboradores_${suffix}`, "*"),
        fetchTable(`filiais_${suffix}`, "*")
      ]);
      [lan, vac, col, fil].forEach((res) => {
        if (res && res.error) console.error("[Supabase]", res.error.message);
      });

      const rowsOf = (res) => (res && !res.error && res.data ? res.data : []);
      Storage.mergeFromRemote({
        entries: this._mapRemoteEntries(rowsOf(lan)),
        vacancies: this._mapRemoteVacancies(rowsOf(vac), s),
        employees: this._mapRemoteEmployees(rowsOf(col), s),
        branches: this._mapRemoteBranches(rowsOf(fil), s)
      });
      this._loadedStates[s] = true;
    }

    console.info(`[Supabase] Dados carregados: ${states.join(", ")}.`);
    return ok;
  },

  _loadedStates: {},
  loadedStates() {
    return STATES.filter((s) => this._loadedStates[s]);
  }
};

/* Boot: chamado pelo app.js antes da primeira renderização */
async function bootstrapSupabase() {
  await loadEnv();
  SupabaseDB.init();
  if (!SupabaseDB.enabled) return;
  await SupabaseDB.hydrate(DEFAULT_STATE);
}

/* Garante que escritas pendentes não se percam ao sair da página */
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "hidden" && SupabaseDB.enabled) SupabaseDB.flush();
});
window.addEventListener("pagehide", () => {
  if (SupabaseDB.enabled) SupabaseDB.flush();
});
