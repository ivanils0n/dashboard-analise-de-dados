/* =========================================================
   Domínio da Equipe e indicadores calculados
   ---------------------------------------------------------
   A partir dos colaboradores e das vagas, recalcula e grava
   snapshots (por dia) dos indicadores computados:
   headcount, turnover, tempo de permanência,
   turnover no período de experiência e retenção.
   Também administra as vagas do Tempo médio de contratação.
   ========================================================= */

const STATUS_LABELS = { ativo: "Ativo", afastado: "Afastado", desligado: "Desligado" };
const TYPE_LABELS = { efetivado: "Efetivado", experiencia: "Em experiência" };
const ABSENTEEISM_TYPES = {
  falta: "Falta",
  atraso: "Atraso",
  afastamento: "Afastamento"
};

const Employees = {
  list(state) {
    const all = Storage.getEmployees();
    if (state && state !== "todos") {
      return all.filter((e) => (e.estado || null) === state);
    }
    return all;
  },

  save(employeeData) {
    const existing = employeeData.id ? Storage.getEmployeeById(employeeData.id) : null;
    const now = nowLocalISO();

    if (existing) {
      const updated = { ...existing, ...employeeData, updatedAt: now };
      if (employeeData.status === "desligado") {
        updated.firedAt = employeeData.firedAt || existing.firedAt || now;
      } else {
        updated.firedAt = null;
      }
      Storage.upsertEmployee(updated);
      return updated;
    }

    const created = {
      id: createId(),
      name: employeeData.name,
      sector: employeeData.sector,
      user: employeeData.user,
      estado: employeeData.estado || null,
      hiredAt: employeeData.hiredAt || null,
      status: employeeData.status,
      type: employeeData.type,
      countsTurnover: !!employeeData.countsTurnover,
      createdAt: now,
      updatedAt: now,
      firedAt: employeeData.firedAt || null
    };
    Storage.upsertEmployee(created);
    return created;
  },

  remove(id) {
    Storage.deleteEmployee(id);
    this.syncAll();
  },

  /* ---------- Cálculos ---------- */

  headcount(state) {
    return this.list(state).filter((e) => e.status === "ativo").length;
  },

  turnoverEntradas(state) {
    return this.list(state).filter((e) => e.type === "efetivado" && e.countsTurnover && e.status === "ativo").length;
  },

  turnoverSaidas(state) {
    return this.list(state).filter((e) => e.type === "efetivado" && e.countsTurnover && e.status === "desligado").length;
  },

  retentionPct(state) {
    const list = this.list(state);
    if (!list.length) return null;
    const kept = list.filter((e) => e.status === "ativo").length;
    return (kept / list.length) * 100;
  },

  permanenceAvgDays(state) {
    const desligados = this.list(state).filter((e) => e.status === "desligado" && e.firedAt);
    if (!desligados.length) return null;
    const total = desligados.reduce((sum, e) => {
      const days = daysBetween(e.hiredAt || e.createdAt, e.firedAt) || 0;
      return sum + Math.max(1, Math.ceil(days));
    }, 0);
    return total / desligados.length;
  },

  probationTurnoverCount(state) {
    /* Desligamentos no período de experiência (colaboradores do tipo "experiencia") */
    return this.list(state).filter((e) => e.type === "experiencia" && e.status === "desligado").length;
  },

  /* Valor atual de um indicador computado, já filtrado por estado */
  computedSnapshot(indId, state) {
    switch (indId) {
      case "headcount":
        return this.headcount(state);
      case "turnover_entradas":
        return this.turnoverEntradas(state);
      case "turnover_saidas":
        return this.turnoverSaidas(state);
      case "retencao":
        return this.retentionPct(state);
      case "tempo_permanencia":
        return this.permanenceAvgDays(state);
      case "turnover_experiencia":
        return this.probationTurnoverCount(state);
      default:
        return null;
    }
  },

  /* ---------- Snapshots dos indicadores computados ---------- */

  syncAll() {
    const today = todayISO();
    const computedIds = COMPUTED_INDICATORS.map((i) => i.id);
    const states = this.activeStates();

    states.forEach((state) => {
      const list = this.list(state);
      if (!list.length) {
        computedIds.forEach((id) => Storage.removeEntryForDate(id, today, state));
        return;
      }
      Storage.upsertEntryForDate("headcount", today, this.headcount(state), null, state);
      Storage.upsertEntryForDate("turnover_entradas", today, this.turnoverEntradas(state), null, state);
      Storage.upsertEntryForDate("turnover_saidas", today, this.turnoverSaidas(state), null, state);
      const retention = this.retentionPct(state);
      if (retention !== null) {
        Storage.upsertEntryForDate("retencao", today, Number(retention.toFixed(1)), null, state);
      }
      const permanence = this.permanenceAvgDays(state);
      if (permanence !== null) {
        Storage.upsertEntryForDate("tempo_permanencia", today, Number(permanence.toFixed(1)), null, state);
      }
      Storage.upsertEntryForDate("turnover_experiencia", today, this.probationTurnoverCount(state), null, state);
    });
  },

  /* Estados cujos dados já estão em memória (otimização de carga). */
  activeStates() {
    if (typeof SupabaseDB !== "undefined" && SupabaseDB.enabled && SupabaseDB._loadedStates) {
      const loaded = STATES.filter((s) => SupabaseDB._loadedStates[s]);
      if (loaded.length) return loaded;
    }
    return STATES.slice();
  },

  /* ---------- Vagas (Tempo médio de contratação) ---------- */

  getVacancies(state) {
    let list = Storage.getVacancies();
    if (state && state !== "todos") {
      list = list.filter((v) => (v.estado || null) === state);
    }
    return list.slice().sort((a, b) => b.openAt.localeCompare(a.openAt));
  },

  addVacancy({ name, openAt, estado }) {
    const vacancy = { id: createId(), name, openAt, closeAt: null, estado: estado || null };
    Storage.upsertVacancy(vacancy);
    this.syncVacancyIndicator(vacancy.estado);
    return vacancy;
  },

  updateVacancy(id, { name, openAt }) {
    const vacancy = Storage.getVacancyById(id);
    if (!vacancy) return null;
    const updated = { ...vacancy, name, openAt };
    Storage.upsertVacancy(updated);
    this.syncVacancyIndicator(updated.estado);
    return updated;
  },

  closeVacancy(id) {
    const vacancy = Storage.getVacancyById(id);
    if (!vacancy || vacancy.closeAt) return null;
    const updated = { ...vacancy, closeAt: nowLocalISO() };
    Storage.upsertVacancy(updated);
    this.syncVacancyIndicator(updated.estado);
    return updated;
  },

  deleteVacancy(id) {
    const vacancy = Storage.getVacancyById(id);
    const estado = vacancy ? vacancy.estado : null;
    Storage.deleteVacancy(id);
    this.syncVacancyIndicator(estado);
  },

  syncVacancyIndicator(state) {
    const closed = this.getVacancies(state).filter((v) => v.closeAt);
    const today = todayISO();
    if (!closed.length) {
      Storage.removeEntryForDate("tempo_contratacao", today, state);
      return;
    }
    const total = closed.reduce((sum, v) => sum + (daysBetween(v.openAt, v.closeAt) || 0), 0);
    const avg = total / closed.length;
    Storage.upsertEntryForDate("tempo_contratacao", today, Number(avg.toFixed(1)), null, state);
  },

  formatVacancyTempo(vacancy) {
    if (!vacancy.closeAt) return "—";
    const days = daysBetween(vacancy.openAt, vacancy.closeAt);
    if (days === null) return "—";
    return days.toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 }) + " dias";
  }
};