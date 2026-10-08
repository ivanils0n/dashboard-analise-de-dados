import { computed, ref } from "vue";
import { INDICATORS, getIndicatorById, STATES, STATE_COLORS } from "@/lib/config";
import { getEntriesFor, getBranches, getOcorrencias, getBeneficios } from "@/lib/store";
import { TIPOS, isOcorrenciaAusencia, competenciaYm } from "@/lib/absenteismo";
import {
  computedSnapshot,
  listVacancies,
  permanenciaDesligados,
  averageHiringDays,
  turnoverAvgTenureDays,
  headcountCountInRange,
  headcountGenderCountInRange,
  headcountGenderCountByRegional,
  headcountMovements,
  headcountFilialOptions,
  headcountEmpresaOptions,
  headcountFuncaoOptions,
  listRescisoes,
  rescisaoAmount,
  rescisaoFilterOptions,
  rescisoesTotal,
  rescisoesByFuncao,
  rescisoesByRegional,
  rescisaoRegionalLabel,
  rescisoesByEstado,
  rescisaoFuncaoLabel,
  turnoverRateStats,
  retentionRate,
  retentionDivergences,
  findBranchByShortName,
  normalizeBranchKey
} from "@/lib/employees";
import { regionalLabel } from "@/lib/regionais";
import { regionalDaFilial } from "@/lib/db";
import { diasDeAusencia } from "@/lib/absenteismoAnalise";
import { ACCENT, PIE_SECONDARY } from "@/lib/charts";
import {
  formatValue,
  formatDate,
  formatCurrency,
  aggregateByDay,
  aggregateByMonth,
  formatMonthLabel,
  daysBetween,
  todayISO,
  singleMonthOfRange,
  upperText,
  filialDisplay,
  addMonthsYm,
  firstDayOfYm,
  lastDayOfYm
} from "@/lib/utils";
import { aggregateEntries, diariaDivisor, employeeNameKey, uniqueEmployeeCount } from "@/lib/metrics";
import { useFilters } from "@/composables/useFilters";
import { faturamento } from "@/composables/useFaturamento";

export function useDashboardData(filter) {
  const { state } = useFilters();

  let stateOverride = null;

  function currentState() {
    void state.revision;
    const current = state.current;
    return stateOverride || current;
  }

  function hiringAvgFor(range) {
    const start = (range && range.start) || null;
    const end = (range && range.end) || null;
    const inRange = listVacancies(currentState()).filter((v) => {
      if (!v.openAt) return false;
      const day = String(v.openAt).slice(0, 10);
      return !(start && day < start) && !(end && day > end);
    });
    return averageHiringDays(inRange);
  }

  function monthBefore(range) {
    const ym = range && range.start ? singleMonthOfRange(range.start, range.end) : null;
    if (!ym) return null;
    const prevYm = addMonthsYm(ym, -1);
    return { start: firstDayOfYm(prevYm), end: lastDayOfYm(prevYm) };
  }

  function ticketMedioParts(uf, range) {
    const start = (range && range.start) || null;
    const end = (range && range.end) || null;
    const folha = getEntriesFor("custo_total", uf).filter(
      (e) => !(start && e.date < start) && !(end && e.date > end)
    );
    return {
      folhaCount: folha.length,
      folha: custoTotalNoPeriodo(range, uf),
      headcount: headcountCountInRange(uf, range)
    };
  }

  function ticketMedioFor(uf, range) {
    const { folha, headcount } = ticketMedioParts(uf, range);
    if (!folha || !headcount) return null;
    return folha / headcount;
  }

  function absenteismoOcorrencias(st, range, filiais = []) {
    const uf = String(st || "").trim().toUpperCase();
    const all = !uf || uf === "TODOS";
    const filialKeys = (filiais || []).map((f) => String(f).trim().toUpperCase());
    const fromYm = range && range.start ? String(range.start).slice(0, 7) : null;
    const toYm = range && range.end ? String(range.end).slice(0, 7) : null;
    return getOcorrencias().filter(
      (o) =>
        isOcorrenciaAusencia(o.meta) &&
        (!filialKeys.length || filialKeys.includes(filialDisplay(o.meta.filial, o.meta.estado).toUpperCase())) &&
        !(fromYm && competenciaYm(o.meta, o.date) < fromYm) &&
        !(toYm && competenciaYm(o.meta, o.date) > toYm) &&
        (all || String(o.meta.estado || "").trim().toUpperCase() === uf)
    );
  }

  function absenteismoBarByMotivo(filiais = []) {
    const range = filter.start ? { start: filter.start, end: filter.end } : null;
    const list = absenteismoOcorrencias(currentState(), range, filiais);
    return TIPOS.map((t) => {
      const value = list.filter((o) => t.has(o.meta)).length;
      return {
        label: t.plural,
        value,
        color: t.hex,
        tooltipValue: `${value} ${value === 1 ? "ocorrência" : "ocorrências"}`
      };
    });
  }

  function absenteismoBarByRegional(filiais = []) {
    const range = filter.start ? { start: filter.start, end: filter.end } : null;
    const groups = new Map();
    absenteismoOcorrencias(currentState(), range, filiais).forEach((o) => {
      const label = regionalLabel(regionalDaFilial(o.meta.filial, o.meta.estado));
      groups.set(label, (groups.get(label) || 0) + 1);
    });
    return [...groups.entries()]
      .map(([label, value]) => ({
        label,
        value,
        tooltipValue: `${value} ${value === 1 ? "ocorrência" : "ocorrências"}`
      }))
      .sort((a, b) => b.value - a.value);
  }

  function absenteismoRowsBy(view, label, filiais = []) {
    const range = filter.start ? { start: filter.start, end: filter.end } : null;
    const tipo = view === "motivo" ? TIPOS.find((t) => t.plural === label) : null;
    return absenteismoOcorrencias(currentState(), range, filiais)
      .filter((o) =>
        view === "regional"
          ? regionalLabel(regionalDaFilial(o.meta.filial, o.meta.estado)) === label
          : tipo
            ? tipo.has(o.meta)
            : true
      )
      .map((o) => ({
        id: o.id,
        date: o.date,
        colaborador: o.meta.colaborador,
        setor: o.meta.setor || "",
        filial: filialDisplay(o.meta.filial, o.meta.estado).toUpperCase() || "Sem filial",
        estado: String(o.meta.estado || "").toUpperCase() || "—",
        motivo: o.meta.motivo,
        advertencia: !!o.meta.advertencia,
        acidente: !!o.meta.acidente,
        observacao: o.meta.observacao || "",
        tipoAcidente: o.meta.acidente ? o.meta.tipoAcidente || null : null,
        aberturaCat: !!(o.meta.acidente && o.meta.aberturaCat),
        cid: o.meta.motivo === "Atestado" && o.meta.cid ? String(o.meta.cid).trim().toUpperCase() : null,
        diasAtestado: o.meta.motivo === "Atestado" && Number(o.meta.diasAtestado) > 0 ? Number(o.meta.diasAtestado) : null,
        dias: diasDeAusencia({ motivo: o.meta.motivo, acidente: !!o.meta.acidente })
      }));
  }

  function absenteismoFiliais() {
    const range = filter.start ? { start: filter.start, end: filter.end } : null;
    const set = new Set();
    absenteismoOcorrencias(currentState(), range).forEach((o) => {
      const f = filialDisplay(o.meta.filial, o.meta.estado).toUpperCase();
      if (f) set.add(f);
    });
    return [...set].sort((a, b) => a.localeCompare(b, "pt-BR"));
  }

  function computedValue(ind, range) {
    const st = currentState();
    switch (ind.id) {
      case "absenteismo":
        return absenteismoOcorrencias(st, range).length;
      case "tempo_contratacao":
        return hiringAvgFor(range);
      case "headcount":
        return headcountCountInRange(st, range);
      case "turnover":
        return turnoverRateStats(st, range).turnoverPct;
      case "tempo_permanencia":
        return turnoverAvgTenureDays(st, range);
      case "retencao":
        return retentionRate(st, range, monthBefore(range)).retencaoPct;
      case "ticket_medio":
        return ticketMedioFor(st, range);
      case "horas_regional":
        return treinamentoRegionaisCount(st, range);
      case "rescisoes":
        return listRescisoes(st, range).length ? rescisoesTotal(st, range, "total") : null;
      default:
        return computedSnapshot(ind.id, st);
    }
  }

  /* Lançamentos de um indicador no estado escolhido (já ordenados por data),
     calculados uma vez por mudança nos dados. Antes cada KPI recopiava e
     reordenava a lista 3 vezes por recálculo (kpis, filteredEntries e
     indicatorCurrentValue). Quem recebe a lista NÃO deve alterá-la. */
  const stateEntriesCache = new Map();
  function stateEntries(indicatorId, targetState) {
    const key = `${indicatorId}|${targetState}`;
    let cached = stateEntriesCache.get(key);
    if (!cached) {
      cached = computed(() => getEntriesFor(indicatorId, targetState));
      stateEntriesCache.set(key, cached);
    }
    return cached.value;
  }

  function filterByRange(list) {
    const start = filter.start;
    const end = filter.end;
    if (!start && !end) return list;
    return list.filter((e) => {
      if (start && e.date < start) return false;
      if (end && e.date > end) return false;
      return true;
    });
  }

  function costVacancyEntries(st = currentState()) {
    return listVacancies(st)
      .filter((v) => v.closeAt && Number(v.salario) > 0)
      .map((v) => ({
        id: v.id,
        date: String(v.closeAt).slice(0, 10),
        value: Number(v.salario),
        meta: {
          vacancyId: v.id,
          vacancyName: v.name,
          filial: v.filial || "",
          source: "vaga",
          ...(v.estado ? { estado: v.estado } : {})
        }
      }))
      .sort((a, b) => a.date.localeCompare(b.date));
  }

  function scopeEntries(ind, list) {
    if (ind.id === "custo_contratacao") return costVacancyEntries();
    return list;
  }

  function filteredEntries(ind) {
    const withPeriod = scopeEntries(ind, stateEntries(ind.id, currentState()));
    return filterByRange(withPeriod);
  }

  function diariaDailySeries() {
    const ind = getIndicatorById("custo_diaria");
    if (!ind) return [];
    const all = stateEntries(ind.id, currentState());
    return aggregateByDay(filterByRange(all));
  }

  function aggregateList(ind, list) {
    return aggregateEntries(ind, list);
  }

  function headcountBarByState(filiais = [], empresas = [], funcoes = []) {
    const range = filter.start ? { start: filter.start, end: filter.end } : null;
    const st = currentState();
    let states = st && st !== "todos" ? [st] : STATES;
    if (filiais.length) states = states.filter((s) => headcountFilialOptions(s).some((f) => filiais.includes(f)));
    if (empresas.length) states = states.filter((s) => headcountEmpresaOptions(s).some((e) => empresas.includes(e)));
    if (funcoes.length) states = states.filter((s) => headcountFuncaoOptions(s).some((f) => funcoes.includes(f)));
    return states.map((s) => {
      const g = headcountGenderCountInRange(s, range, filiais, empresas, funcoes);
      return {
        label: s,
        value: g.total,
        series: [
          { label: "Masculino", value: g.masculino },
          { label: "Feminino", value: g.feminino },
          { label: "Total", value: g.total }
        ]
      };
    }).sort((a, b) => b.value - a.value);
  }

  function headcountBarByRegional(filiais = [], empresas = [], funcoes = []) {
    const range = filter.start ? { start: filter.start, end: filter.end } : null;
    const st = currentState();
    const states = st && st !== "todos" ? [st] : STATES;
    const total = new Map();
    states.forEach((s) => {
      headcountGenderCountByRegional(s, range, filiais, empresas, funcoes).forEach((g, label) => {
        const acc = total.get(label) || { masculino: 0, feminino: 0, total: 0 };
        acc.masculino += g.masculino;
        acc.feminino += g.feminino;
        acc.total += g.total;
        total.set(label, acc);
      });
    });
    return [...total.entries()]
      .map(([label, g]) => ({
        label,
        value: g.total,
        series: [
          { label: "Masculino", value: g.masculino },
          { label: "Feminino", value: g.feminino },
          { label: "Total", value: g.total }
        ]
      }))
      .sort((a, b) => b.value - a.value);
  }

  function ticketMedioBarByState() {
    const range = filter.start ? { start: filter.start, end: filter.end } : null;
    return STATES.map((s) => ({ label: s, value: ticketMedioFor(s, range) }))
      .filter((r) => r.value !== null)
      .map((r) => ({ ...r, color: STATE_COLORS[r.label], tooltipValue: formatCurrency(r.value) }))
      .sort((a, b) => b.value - a.value);
  }

  function ticketMedioPieCenter() {
    const range = filter.start ? { start: filter.start, end: filter.end } : null;
    const value = ticketMedioFor("todos", range);
    return value === null ? null : { value: formatCurrency(value), caption: "Média geral" };
  }

  function ticketMedioFaturamento() {
    const total = faturamento.value;
    if (!total) return null;
    const range = filter.start ? { start: filter.start, end: filter.end } : null;
    const { folha, headcount } = ticketMedioParts(currentState(), range);
    const custo = folha && headcount ? folha / headcount : null;
    const faturamentoMedio = headcount ? total / headcount : null;
    const pct = custo !== null && faturamentoMedio ? (custo / faturamentoMedio) * 100 : null;
    let motivo = "";
    if (!headcount) motivo = "Sem colaboradores (Headcount) neste mês/estado.";
    else if (!folha) motivo = "Sem Custo de Pessoal lançado neste mês/estado.";
    return { custo, faturamento: total, faturamentoMedio, headcount, pct, motivo };
  }

  function vacanciesBarByOpen(statusFilter, recrutadorFilter) {
    let vacs = listVacancies(currentState()).filter((v) => v.openAt);
    if (statusFilter === "abertas") vacs = vacs.filter((v) => !v.closeAt);
    else if (statusFilter === "fechadas") vacs = vacs.filter((v) => v.closeAt);
    if (recrutadorFilter) vacs = vacs.filter((v) => v.recrutador === recrutadorFilter);
    const inRange = filterByRange(vacs.map((v) => ({ ...v, date: String(v.openAt).slice(0, 10) })));
    return inRange
      .map((v) => ({ v, days: daysBetween(v.openAt, v.closeAt || todayISO()) }))
      .filter(({ days }) => days !== null && Number.isFinite(days) && days >= 0)
      .map(({ v, days }) => {
        return {
          label: upperText(v.name || "Vaga"),
          value: Number(days.toFixed(1)),
          tooltipValue: `${days.toFixed(1)} dias${v.closeAt ? "" : " (em aberto)"}`,
          vacancyId: v.id
        };
      })
      .sort((a, b) => b.value - a.value);
  }

  function headcountFiliais(empresas = []) {
    return headcountFilialOptions(currentState(), empresas);
  }

  function headcountEmpresas() {
    return headcountEmpresaOptions(currentState());
  }

  function headcountFuncoes() {
    return headcountFuncaoOptions(currentState());
  }

  function vagasRecrutadores() {
    const vacs = listVacancies(currentState()).filter((v) => v.openAt);
    const inRange = filterByRange(vacs.map((v) => ({ ...v, date: String(v.openAt).slice(0, 10) })));
    const set = new Set();
    inRange.forEach((v) => {
      if (v.recrutador) set.add(v.recrutador);
    });
    return [...set].sort((a, b) => a.localeCompare(b, "pt-BR"));
  }

  let filialLabelCache = null;

  function treinamentoFilialLabel(meta) {
    if (!filialLabelCache) {
      filialLabelCache = new Map();
      queueMicrotask(() => {
        filialLabelCache = null;
      });
    }
    const cacheKey = `${(meta && meta.estado) || ""}\u0000${(meta && meta.filial) || ""}`;
    let label = filialLabelCache.get(cacheKey);
    if (label === undefined) {
      label = resolveTreinamentoFilialLabel(meta);
      filialLabelCache.set(cacheKey, label);
    }
    return label;
  }

  function resolveTreinamentoFilialLabel(meta) {
    const text = String((meta && meta.filial) || "").toUpperCase().trim();
    if (!text) return "Sem filial";
    const key = normalizeBranchKey(text);
    const branches = getBranches();
    const match =
      findBranchByShortName(text, meta && meta.estado) ||
      branches.find((b) => normalizeBranchKey(b.shortName) === key) ||
      branches.find((b) => normalizeBranchKey(b.name) === key) ||
      branches.find((b) => b.shortName && text.includes(String(b.shortName).toUpperCase())) ||
      branches.find((b) => b.name && text.includes(String(b.name).toUpperCase()));
    return filialDisplay(match ? String(match.shortName || match.name).toUpperCase() : text, meta && meta.estado);
  }

  function treinamentoBarByFilial(gerenteRegional) {
    const ind = getIndicatorById("treinamento");
    if (!ind) return [];
    let entries = filteredEntries(ind);
    if (gerenteRegional) {
      entries = entries.filter((e) => (e.meta && e.meta.gerenteRegional) === gerenteRegional);
    }
    const byFilial = new Map();
    entries.forEach((e) => {
      const filial = treinamentoFilialLabel(e.meta);
      byFilial.set(filial, (byFilial.get(filial) || 0) + (Number(e.value) || 0));
    });
    return [...byFilial.entries()]
      .map(([label, value]) => ({
        label,
        value,
        tooltipValue: formatValue(ind, value)
      }))
      .sort((a, b) => b.value - a.value);
  }

  function treinamentoRegionaisCount(st, range) {
    const start = range && range.start;
    const end = range && range.end;
    const set = new Set();
    stateEntries("treinamento", st).forEach((e) => {
      if ((start && e.date < start) || (end && e.date > end)) return;
      const gr = upperText((e.meta && e.meta.gerenteRegional) || "");
      if (gr) set.add(gr);
    });
    return set.size;
  }

  function horasPorRegional() {
    const ind = getIndicatorById("treinamento");
    if (!ind) return [];
    const byRegional = new Map();
    filteredEntries(ind).forEach((e) => {
      const gr = regionalLabel(e.meta && e.meta.gerenteRegional);
      byRegional.set(gr, (byRegional.get(gr) || 0) + (Number(e.value) || 0));
    });
    return [...byRegional.entries()]
      .map(([label, value]) => ({ label, value, tooltipValue: formatValue(ind, value) }))
      .sort((a, b) => b.value - a.value);
  }

  function treinamentoGerentesRegionais() {
    const ind = getIndicatorById("treinamento");
    if (!ind) return [];
    const set = new Set();
    filteredEntries(ind).forEach((e) => {
      const gr = e.meta && e.meta.gerenteRegional;
      if (gr) set.add(gr);
    });
    return [...set].sort((a, b) => a.localeCompare(b, "pt-BR"));
  }

  function treinamentoFilialEntries(label, gerenteRegional) {
    const ind = getIndicatorById("treinamento");
    if (!ind) return [];
    let entries = filteredEntries(ind);
    if (gerenteRegional) {
      entries = entries.filter((e) => (e.meta && e.meta.gerenteRegional) === gerenteRegional);
    }
    return entries.filter((e) => treinamentoFilialLabel(e.meta) === label);
  }

  function treinamentoRegionalEntries(label) {
    const ind = getIndicatorById("treinamento");
    if (!ind) return [];
    return filteredEntries(ind).filter(
      (e) => regionalLabel(e.meta && e.meta.gerenteRegional) === label
    );
  }

  function custoEntries() {
    const ind = getIndicatorById("custo_total");
    return ind ? filteredEntries(ind) : [];
  }

  function custoPessoalEntriesByEmpresa(label) {
    return custoEntries().filter((e) => (upperText((e.meta && e.meta.empresa) || "Sem empresa")) === label);
  }

  function custosBarByRegional() {
    const range = filter.start ? { start: filter.start, end: filter.end } : null;
    const groups = new Map();
    const get = (label) => {
      if (!groups.has(label)) groups.set(label, { folha: 0, ferias: 0, rescisoes: 0, filiais: new Set() });
      return groups.get(label);
    };
    custoEntries().forEach((e) => {
      const g = get(entryRegional(e));
      g.folha += Number(e.value) || 0;
      g.filiais.add(employeeNameKey(feriasFilial(e)));
    });
    feriasEntries().forEach((e) => {
      const g = get(entryRegional(e));
      g.ferias += Number(e.value) || 0;
      g.filiais.add(employeeNameKey(feriasFilial(e)));
    });
    listRescisoes(currentState(), range).forEach((r) => {
      get(rescisaoRegionalLabel(r)).rescisoes += rescisaoAmount(r, "total");
    });
    return [...groups.entries()]
      .map(([label, g]) => {
        const value = g.folha + g.ferias + g.rescisoes;
        return {
          label,
          value,
          tooltipValue: `${formatCurrency(value)} · Folha ${formatCurrency(g.folha)} · Férias ${formatCurrency(g.ferias)} · Rescisões ${formatCurrency(g.rescisoes)}`
        };
      })
      .sort((x, y) => y.value - x.value);
  }

  function custoRegionalDetalhe(label) {
    const range = filter.start ? { start: filter.start, end: filter.end } : null;
    return {
      folha: custoEntries().filter((e) => entryRegional(e) === label),
      ferias: feriasEntries().filter((e) => entryRegional(e) === label),
      rescisoes: listRescisoes(currentState(), range).filter((r) => rescisaoRegionalLabel(r) === label)
    };
  }

  function custoComponentesNoPeriodo(range, st = currentState()) {
    const start = (range && range.start) || null;
    const end = (range && range.end) || null;
    const emPeriodo = (list) => list.filter((e) => !(start && e.date < start) && !(end && e.date > end));
    const sum = (list) => list.reduce((acc, e) => acc + (Number(e.value) || 0), 0);
    return {
      folha: sum(emPeriodo(getEntriesFor("custo_total", st))),
      ferias: sum(emPeriodo(getEntriesFor("ferias", st))),
      rescisoes: rescisoesTotal(st, range, "total"),
      beneficios: sum(emPeriodo(getBeneficios(st)))
    };
  }

  function custoTotalNoPeriodo(range, st = currentState()) {
    const c = custoComponentesNoPeriodo(range, st);
    return c.folha + c.ferias + c.beneficios + c.rescisoes;
  }

  function custoConsolidado() {
    const range = filter.start ? { start: filter.start, end: filter.end } : null;
    const sum = (list) => list.reduce((acc, e) => acc + (Number(e.value) || 0), 0);
    const itens = [
      { label: "Folha", value: sum(custoEntries()), color: "#0284c7" },
      { label: "Férias", value: sum(feriasEntries()), color: "#f59e0b" },
      { label: "Rescisões", value: rescisoesTotal(currentState(), range, "total"), color: "#dc2626" },
      { label: "Benefícios", value: sum(beneficiosEntries()), color: "#16a34a" }
    ];
    const total = itens.reduce((acc, i) => acc + i.value, 0);
    return {
      itens: itens.map((i) => ({ ...i, tooltipValue: formatCurrency(i.value) })),
      total
    };
  }

  function custoFaltantes() {
    return custoConsolidado().itens.filter((i) => !(i.value > 0)).map((i) => i.label);
  }

  function beneficiosEntries(label) {
    const list = filterByRange(getBeneficios(currentState()));
    return label ? list.filter((e) => e.meta.beneficio === label) : list;
  }

  function beneficiosPie() {
    const groups = new Map();
    beneficiosEntries().forEach((e) => {
      groups.set(e.meta.beneficio, (groups.get(e.meta.beneficio) || 0) + (Number(e.value) || 0));
    });
    return [...groups.entries()]
      .map(([label, value]) => ({ label, value, tooltipValue: formatCurrency(value) }))
      .sort((a, b) => b.value - a.value);
  }

  function consolidadoEntries(label) {
    if (label === "Folha") return custoEntries();
    if (label === "Benefícios") return beneficiosEntries();
    if (label === "Férias") return feriasEntries();
    const range = filter.start ? { start: filter.start, end: filter.end } : null;
    return listRescisoes(currentState(), range);
  }

  function custosBarByEmpresa() {
    const byEmpresa = new Map();
    custoEntries().forEach((e) => {
      const meta = e.meta || {};
      const empresa = upperText(meta.empresa || "Sem empresa");
      byEmpresa.set(empresa, (byEmpresa.get(empresa) || 0) + (Number(e.value) || 0));
    });
    return [...byEmpresa.entries()]
      .map(([label, value]) => ({
        label,
        value,
        tooltipValue: formatCurrency(value)
      }))
      .sort((a, b) => b.value - a.value);
  }

  const PIE_MAX_FILIAIS = 8;
  function custoContratacaoMedioPorFilial() {
    const byFilial = new Map();
    filterByRange(costVacancyEntries()).forEach((e) => {
      const raw = (e.meta && e.meta.filial) || "__sem_filial__";
      const label = raw === "__sem_filial__" ? raw : filialDisplay(raw, e.meta && e.meta.estado);
      const acc = byFilial.get(label) || { count: 0, sum: 0, key: raw };
      acc.count += 1;
      acc.sum += e.value;
      byFilial.set(label, acc);
    });
    const rows = [...byFilial.entries()]
      .map(([label, acc]) => ({
        key: acc.key,
        label: label === "__sem_filial__" ? "SEM FILIAL" : label,
        value: acc.sum / acc.count,
        count: acc.count,
        sum: acc.sum
      }))
      .sort((a, b) => b.value - a.value);
    if (rows.length <= PIE_MAX_FILIAIS) return rows;
    const rest = rows.slice(PIE_MAX_FILIAIS);
    const count = rest.reduce((s, r) => s + r.count, 0);
    const sum = rest.reduce((s, r) => s + r.sum, 0);
    return [...rows.slice(0, PIE_MAX_FILIAIS), { key: "__outras__", label: "OUTRAS", value: sum / count, count, sum, items: rest }];
  }

  function custoAdmissaoMensal(admissoes) {
    const list = filterByRange(costVacancyEntries());
    if (!list.length) return null;
    const avg = list.reduce((sum, e) => sum + (Number(e.value) || 0), 0) / list.length;
    return avg * (Number(admissoes) || 0);
  }

  function custoContratacaoPieCenter() {
    const list = filterByRange(costVacancyEntries());
    if (!list.length) return null;
    const avg = list.reduce((s, e) => s + e.value, 0) / list.length;
    return { value: formatCurrency(avg), caption: "Média geral" };
  }

  function diariaBarEntries() {
    const ind = getIndicatorById("custo_diaria");
    if (!ind) return [];
    return filteredEntries(ind);
  }

  function diariaColaboradorName(entry) {
    return upperText((entry.meta && entry.meta.employeeName) || "Sem colaborador");
  }

  function diariaGroup(entry, view) {
    if (view === "filial") {
      const label = upperText(treinamentoFilialLabel(entry.meta));
      return { key: label, label };
    }
    if (view === "regional") {
      const label = regionalLabel(entry.meta && entry.meta.regional);
      return { key: label, label };
    }
    const label = diariaColaboradorName(entry);
    return { key: employeeNameKey(label), label };
  }

  function custoDiariaEntriesBy(view, label) {
    const key = view === "filial" || view === "regional" ? label : employeeNameKey(label);
    return diariaBarEntries().filter((e) => diariaGroup(e, view).key === key);
  }

  function custoDiariaEntriesByColaborador(label) {
    return custoDiariaEntriesBy("colaborador", label);
  }

  function custoDiariaSummary() {
    const ind = getIndicatorById("custo_diaria");
    const list = diariaBarEntries();
    return {
      total: list.reduce((sum, e) => sum + (Number(e.value) || 0), 0),
      colaboradores: diariaDivisor(list),
      media: ind ? aggregateList(ind, list) : null
    };
  }

  function custoDiariaBarByColaborador() {
    return custoDiariaBarBy("colaborador");
  }

  function custoDiariaBarBy(view) {
    const groups = new Map();
    diariaBarEntries().forEach((e) => {
      const { key, label } = diariaGroup(e, view);
      if (!groups.has(key)) groups.set(key, { label, value: 0 });
      groups.get(key).value += Number(e.value) || 0;
    });
    return [...groups.values()]
      .map(({ label, value }) => ({
        label,
        value,
        tooltipValue: formatCurrency(value)
      }))
      .sort((a, b) => b.value - a.value);
  }

  function feriasEntries() {
    const ind = getIndicatorById("ferias");
    return ind ? filteredEntries(ind) : [];
  }

  function entryRegional(entry) {
    return regionalLabel(entry.meta && entry.meta.regional);
  }

  function feriasFilial(entry) {
    return upperText(filialDisplay(entry.meta && entry.meta.filial, entry.meta && entry.meta.estado)) || "SEM FILIAL";
  }

  function feriasGroup(entry, view) {
    if (view === "regional") {
      const label = entryRegional(entry);
      return { key: label, label };
    }
    if (view === "filial") {
      const label = feriasFilial(entry);
      return { key: employeeNameKey(label), label };
    }
    const meta = entry.meta || {};
    const label = upperText(meta.employeeName || "Sem colaborador");
    return { key: `${meta.codigo || ""}|${employeeNameKey(label)}`, label, codigo: meta.codigo || "" };
  }

  function feriasGroups(view, entries = feriasEntries()) {
    const groups = new Map();
    entries.forEach((e) => {
      const { key, label, codigo } = feriasGroup(e, view);
      if (!groups.has(key)) groups.set(key, { label, codigo, value: 0, entries: [] });
      const g = groups.get(key);
      g.value += Number(e.value) || 0;
      g.entries.push(e);
    });
    const list = [...groups.values()];
    const repetidos = new Map();
    list.forEach((g) => repetidos.set(g.label, (repetidos.get(g.label) || 0) + 1));
    list.forEach((g) => {
      if (repetidos.get(g.label) > 1 && g.codigo) g.label = `${g.label} · cód. ${g.codigo}`;
    });
    return list;
  }

  function feriasEntriesBy(view, label) {
    const group = feriasGroups(view).find((g) => g.label === label);
    return group ? group.entries : [];
  }

  function feriasBarBy(view) {
    const list = feriasEntries();
    const rows = feriasGroups(view, list)
      .map((g) => {
        const pessoas = uniqueEmployeeCount(g.entries);
        return {
          label: g.label,
          value: g.value,
          tooltipValue: view !== "colaborador" ? `${formatCurrency(g.value)} · ${pessoas} ${pessoas === 1 ? "colaborador" : "colaboradores"}` : formatCurrency(g.value)
        };
      })
      .sort((a, b) => b.value - a.value);
    return {
      rows,
      summary: {
        total: list.reduce((sum, e) => sum + (Number(e.value) || 0), 0),
        colaboradores: uniqueEmployeeCount(list),
        filiais: new Set(list.map((e) => employeeNameKey(feriasFilial(e)))).size,
        regionais: new Set(list.map(entryRegional)).size
      }
    };
  }

  function indicatorCurrentValue(ind) {
    if (ind.computed) {
      const range = filter.start ? { start: filter.start, end: filter.end } : null;
      return computedValue(ind, range);
    }
    return aggregateList(ind, filteredEntries(ind));
  }

  function indicatorValueForMonth(ind, ym) {
    const range = { start: firstDayOfYm(ym), end: lastDayOfYm(ym) };
    if (ind.computed) return computedValue(ind, range);
    if (ind.id === "custo_total") {
      const total = custoTotalNoPeriodo(range, currentState());
      return total > 0 ? total : null;
    }
    const inMonth = scopeEntries(ind, stateEntries(ind.id, currentState())).filter(
      (e) => e.date >= range.start && e.date <= range.end
    );
    return inMonth.length ? aggregateList(ind, inMonth) : null;
  }

  function comparacaoMeses(count, estado = "") {
    if (!estado) return comparacaoMesesBase(count);
    stateOverride = estado;
    try {
      return comparacaoMesesBase(count);
    } finally {
      stateOverride = null;
    }
  }

  function custoDetalhesPorMes(todos) {
    const porMes = todos.map((ym) =>
      custoComponentesNoPeriodo({ start: firstDayOfYm(ym), end: lastDayOfYm(ym) }, currentState())
    );
    return [
      { key: "folha", label: "Folha" },
      { key: "ferias", label: "Férias" },
      { key: "rescisoes", label: "Rescisões" },
      { key: "beneficios", label: "Benefícios" }
    ].map(({ key, label }) => {
      const vals = porMes.map((c) => (c[key] > 0 ? c[key] : null));
      return { label, higherIsBetter: false, anterior: vals[0], values: vals.slice(1) };
    });
  }

  function comparacaoMesesBase(count) {
    const base = String(filter.end || filter.start || todayISO()).slice(0, 7);
    const todos = Array.from({ length: count + 2 }, (_, i) => addMonthsYm(base, i - count - 1));
    const months = todos.slice(1);
    const rows = INDICATORS.filter((ind) => ind.id !== "horas_regional").map((ind) => ({
      id: ind.id,
      name: ind.name,
      type: ind.type,
      decimals: ind.decimals,
      higherIsBetter: ind.higherIsBetter !== false,
      ...(() => {
        const vals = todos.map((ym) => {
          const v = indicatorValueForMonth(ind, ym);
          return v === null || v === undefined || Number.isNaN(Number(v)) ? null : Number(v);
        });
        return { anterior: vals[0], values: vals.slice(1) };
      })(),
      ...(ind.id === "custo_total" ? { detalhes: custoDetalhesPorMes(todos) } : {})
    }));
    return { months, rows };
  }

  function previousMonthRange() {
    return monthBefore(filter.start ? { start: filter.start, end: filter.end } : null);
  }

  function kpiValueByEstado(kpiId) {
    const ind = getIndicatorById(kpiId || "custo_total");
    if (!ind) return [];
    const target = currentState();
    const ufs = !target || target === "todos" ? STATES : [target];
    const range = filter.start ? { start: filter.start, end: filter.end } : null;
    const fmt = { type: ind.type, decimals: ind.decimals ?? 1 };
    return ufs.map((uf) => {
      stateOverride = uf;
      try {
        if (ind.id === "custo_diaria") {
          const list = diariaBarEntries();
          const total = list.reduce((sum, e) => sum + (Number(e.value) || 0), 0);
          const colaboradores = diariaDivisor(list);
          return {
            uf,
            text: formatValue({ type: "currency", decimals: 2 }, total),
            sub: `${colaboradores} ${colaboradores === 1 ? "colaborador" : "colaboradores"}`,
            filled: total > 0
          };
        }
        if (ind.id === "custo_total") {
          const total = custoTotalNoPeriodo(range, uf);
          return { uf, text: formatValue(fmt, total), sub: "", filled: total > 0 };
        }
        const value = indicatorCurrentValue(ind);
        const hasValue = value !== null && value !== undefined && !Number.isNaN(Number(value));
        let sub = "";
        let filled = hasValue && Number(value) !== 0;
        if (ind.id === "turnover") {
          const stats = turnoverRateStats(uf, range);
          const pct = { type: "percent", decimals: 1 };
          sub = `Entrada ${formatValue(pct, stats.turnoverEntradaPct)} · Saída ${formatValue(pct, stats.turnoverSaidaPct)}`;
        } else if (!ind.computed) {
          const n = filteredEntries(ind).length;
          sub = `${n} ${n === 1 ? "lançamento" : "lançamentos"}`;
          filled = n > 0 && hasValue;
        }
        return { uf, text: hasValue ? formatValue(fmt, value) : "—", sub, filled };
      } finally {
        stateOverride = null;
      }
    });
  }

  const kpis = computed(() => {
    return INDICATORS.filter((ind) => ind.id !== "horas_regional" && ind.id !== "custo_contratacao").map((ind) => {
      const entries = filteredEntries(ind);
      const allEntries = scopeEntries(ind, stateEntries(ind.id, currentState()));
      let current = indicatorCurrentValue(ind);
      let prev = null;
      const prevMonthRangeForDelta = filter.start ? previousMonthRange() : null;
      if (ind.computed) {
        prev = prevMonthRangeForDelta ? computedValue(ind, prevMonthRangeForDelta) : null;
      } else if (prevMonthRangeForDelta && allEntries.length) {
        const range = prevMonthRangeForDelta;
        const before = allEntries.filter((e) => e.date >= range.start && e.date <= range.end);
        prev = before.length ? aggregateList(ind, before) : null;
      } else if (!filter.start && entries.length > 1) {
        prev = aggregateList(ind, entries.slice(0, -1));
      }

      if (ind.id === "custo_total") {
        current = custoTotalNoPeriodo(filter.start ? { start: filter.start, end: filter.end } : null);
        prev = prevMonthRangeForDelta ? custoTotalNoPeriodo(prevMonthRangeForDelta) : null;
      }

      let delta = null;
      if (current !== null && prev !== null) {
        const diff = Number(current) - Number(prev);
        delta = { diff, up: diff > 0, down: diff < 0 };
      }

      const totalCount = entries.length;
      const countText = ind.id === "custo_total"
        ? "Folha + Férias + Rescisões + Benefícios"
        : ind.computed
        ? ""
        : totalCount === 1
          ? "1 lançamento"
          : `${totalCount} lançamentos`;

      if (ind.id === "turnover") {
        const range = filter.start ? { start: filter.start, end: filter.end } : null;
        const stats = turnoverRateStats(currentState(), range);
        return {
          id: "turnover",
          kind: "pie",
          name: "Turnover",
          countText,
          totalPct: stats.turnoverPct,
          pieData: [
            { label: "Entrada", value: stats.turnoverEntradaPct },
            { label: "Saída", value: stats.turnoverSaidaPct }
          ]
        };
      }

      const base = {
        id: ind.id,
        kind: "normal",
        name: ind.name,
        desc: ind.desc,
        type: ind.type,
        decimals: ind.decimals,
        higherIsBetter: ind.higherIsBetter !== false,
        current,
        prev,
        delta,
        countText,
        entries
      };

      if (ind.id === "tempo_contratacao") {
        const vacs = listVacancies(currentState()).filter((v) => {
          if (!v.openAt) return false;
          const day = String(v.openAt).slice(0, 10);
          return !(filter.start && day < filter.start) && !(filter.end && day > filter.end);
        });
        base.vagasAbertas = vacs.filter((v) => !v.closeAt).length;
        base.vagasFechadas = vacs.filter((v) => v.closeAt).length;
        const custoInd = getIndicatorById("custo_contratacao");
        const custo = custoInd ? indicatorCurrentValue(custoInd) : null;
        base.name = "Contratação";
        base.desc = "Tempo médio de contratação (dias entre abertura e fechamento da vaga) e custo médio de contratação (média dos salários das vagas fechadas)";
        base.secondary = {
          label: "Custo médio",
          text: custo === null || custo === undefined ? "—" : formatValue(custoInd, custo)
        };
      }

      return base;
    });
  });

  const selectedId = ref("headcount");

  const selectedKpiId = computed(() => selectedId.value);

  function selectKpi(id) {
    selectedId.value = id;
  }

  const kpiChartCards = computed(() => {
    const visible = INDICATORS.filter(
      (ind) =>
        ind.id !== "custo_total" &&
        ind.id !== "treinamento" &&
        ind.id !== "tempo_contratacao" &&
        ind.id !== "tempo_permanencia" &&
        ind.id !== "horas_regional" &&
        ind.id !== "rescisoes"
    );
    return visible.map((ind) => {
      if (ind.id === "turnover") {
        return {
          id: "turnover",
          kind: "pie",
          title: "Turnover",
          sub: "Entrada vs Saída",
          unit: ""
        };
      }
      if (ind.id === "retencao") {
        return {
          id: "retencao",
          kind: "table",
          title: ind.name,
          sub: "No período filtrado",
          unit: ind.unit
        };
      }
      if (ind.id === "headcount") {
        return {
          id: "headcount",
          kind: "bar",
          title: "Headcount",
          sub: "Por estado",
          unit: "colaboradores",
          valueFormat: "",
          showTrend: false
        };
      }
      if (ind.id === "ticket_medio") {
        return {
          id: "ticket_medio",
          kind: "pie",
          title: ind.name,
          sub: "Custo de Pessoal ÷ Headcount, por estado no período filtrado",
          unit: ind.unit,
          valueFormat: "currency"
        };
      }
      if (ind.id === "custo_contratacao") {
        return {
          id: "custo_contratacao",
          kind: "pie",
          title: ind.name,
          sub: "Custo médio (média dos salários) por filial, no período filtrado",
          unit: ind.unit,
          valueFormat: "currency"
        };
      }
      if (ind.id === "absenteismo") {
        return {
          id: "absenteismo",
          kind: "bar",
          title: "Saúde e Segurança",
          sub: "Total de cada ocorrência no período filtrado",
          unit: ind.unit,
          valueFormat: "",
          showTrend: false
        };
      }
      if (ind.id === "custo_diaria") {
        return {
          id: "custo_diaria",
          kind: "bar",
          title: ind.name,
          sub: "Valor total por colaborador, no período filtrado",
          unit: ind.unit,
          valueFormat: "currency",
          horizontal: true,
          showTrend: false
        };
      }
      return { id: ind.id, kind: "line", title: ind.name, sub: "Evolução no período", unit: ind.unit };
    });
  });

  function chartPieData() {
    const range = filter.start ? { start: filter.start, end: filter.end } : null;
    const stats = turnoverRateStats(currentState(), range);
    return [
      { label: "Entrada", value: stats.turnoverEntradaPct },
      { label: "Saída", value: stats.turnoverSaidaPct }
    ];
  }

  function permanenciaDesligadosLista() {
    const range = filter.start ? { start: filter.start, end: filter.end } : null;
    return sortPermanencia(permanenciaDesligados(currentState(), range));
  }

  function turnoverTenureBarByEmployee() {
    const range = filter.start ? { start: filter.start, end: filter.end } : null;
    return permanenciaDesligados(currentState(), range)
      .map((p) => ({
        label: upperText(p.colaborador || "—"),
        value: p.dias,
        tooltipValue: `${p.dias.toFixed(1)} dias`,
        permanenciaDetail: p
      }))
      .sort((a, b) => b.value - a.value);
  }

  function sortPermanencia(list) {
    return list.sort((a, b) =>
      b.dataDemissao.localeCompare(a.dataDemissao) || String(a.colaborador).localeCompare(String(b.colaborador), "pt-BR")
    );
  }

  const PERMANENCIA_GROUP_LABEL = {
    regional: (p) => regionalLabel(p.regional),
    filial: (p) => upperText(filialDisplay(p.filial, p.estado)) || "SEM FILIAL"
  };

  function permanenciaEntriesBy(view, label) {
    const range = filter.start ? { start: filter.start, end: filter.end } : null;
    const labelOf = PERMANENCIA_GROUP_LABEL[view];
    return sortPermanencia(permanenciaDesligados(currentState(), range).filter((p) => labelOf(p) === label));
  }

  function turnoverTenureBarBy(view) {
    const range = filter.start ? { start: filter.start, end: filter.end } : null;
    const labelOf = PERMANENCIA_GROUP_LABEL[view];
    const groups = new Map();
    permanenciaDesligados(currentState(), range).forEach((p) => {
      const label = labelOf(p);
      const g = groups.get(label) || { dias: 0, count: 0 };
      g.dias += p.dias;
      g.count += 1;
      groups.set(label, g);
    });
    return [...groups.entries()]
      .map(([label, { dias, count }]) => ({
        label,
        value: Math.round((dias / count) * 10) / 10,
        tooltipValue: `${(dias / count).toFixed(1)} dias · ${count} ${count === 1 ? "desligado" : "desligados"}`
      }))
      .sort((a, b) => b.value - a.value);
  }

  function turnoverStatsByRegional() {
    const range = filter.start ? { start: filter.start, end: filter.end } : null;
    const st = currentState();
    const states = st && st !== "todos" ? [st] : STATES;
    const byRegional = new Map();
    const bucket = (label) => {
      if (!byRegional.has(label)) byRegional.set(label, { admissoes: 0, demissoes: 0, ativos: 0 });
      return byRegional.get(label);
    };
    states.forEach((s) => {
      headcountGenderCountByRegional(s, range).forEach((g, label) => {
        bucket(label).ativos += g.total;
      });
    });
    const mov = headcountMovements(st, range);
    mov.admissoes.forEach((h) => {
      bucket(regionalLabel(h.regional)).admissoes += 1;
    });
    mov.demissoes.forEach((h) => {
      bucket(regionalLabel(h.regional)).demissoes += 1;
    });
    return byRegional;
  }

  function turnoverBarByRegional() {
    return [...turnoverStatsByRegional().entries()]
      .filter(([, s]) => s.ativos > 0)
      .map(([label, s]) => {
        const entrada = (s.admissoes / s.ativos) * 100;
        const saida = (s.demissoes / s.ativos) * 100;
        return {
          label,
          value: entrada + saida,
          series: [
            { label: "Entrada", value: entrada, color: ACCENT },
            { label: "Saída", value: saida, color: PIE_SECONDARY }
          ]
        };
      })
      .sort((a, b) => b.value - a.value);
  }

  function rescisoesBarByFuncao(mode = "total", filters) {
    const range = filter.start ? { start: filter.start, end: filter.end } : null;
    return rescisoesByFuncao(currentState(), range, mode, filters).map((r) => ({
      label: r.label,
      value: r.value,
      tooltipValue: `${formatCurrency(r.value)} · ${r.count} ${r.count === 1 ? "rescisão" : "rescisões"}`
    }));
  }

  function rescisoesBarByRegional(mode = "total", filters) {
    const range = filter.start ? { start: filter.start, end: filter.end } : null;
    return rescisoesByRegional(currentState(), range, mode, filters).map((r) => ({
      label: r.label,
      value: r.value,
      tooltipValue: `${formatCurrency(r.value)} · ${r.count} ${r.count === 1 ? "rescisão" : "rescisões"}`
    }));
  }

  function rescisoesEntriesByRegional(label, filters) {
    const range = filter.start ? { start: filter.start, end: filter.end } : null;
    return listRescisoes(currentState(), range, filters).filter((r) => rescisaoRegionalLabel(r) === label);
  }

  function rescisoesPieByEstado(mode = "total", filters) {
    const range = filter.start ? { start: filter.start, end: filter.end } : null;
    return rescisoesByEstado(currentState(), range, mode, filters).map((r) => ({
      label: r.label,
      value: r.value
    }));
  }

  function rescisoesFilterOptions() {
    const range = filter.start ? { start: filter.start, end: filter.end } : null;
    return rescisaoFilterOptions(currentState(), range);
  }

  function rescisoesEntriesByEstado(label, filters) {
    const range = filter.start ? { start: filter.start, end: filter.end } : null;
    return listRescisoes(currentState(), range, filters).filter(
      (r) => (String(r.estado || "").trim().toUpperCase() || "SEM ESTADO") === label
    );
  }

  function rescisoesEntriesByFuncao(label, filters) {
    const range = filter.start ? { start: filter.start, end: filter.end } : null;
    return listRescisoes(currentState(), range, filters).filter((r) => rescisaoFuncaoLabel(r) === label);
  }

  function retentionBreakdown() {
    const range = filter.start ? { start: filter.start, end: filter.end } : null;
    const prevRange = previousMonthRange();
    const stats = retentionRate(currentState(), range, prevRange);
    const missing = [];
    if (!stats.headcountInicial) missing.push("Headcount inicial");
    if (!stats.headcountFinal) missing.push("Headcount final");
    if (!stats.novasContratacoes) missing.push("Novas contratações");
    const divergencias = retentionDivergences(currentState(), range, prevRange);
    const headcountEsperado = stats.headcountInicial + stats.novasContratacoes - stats.demissoes;
    return { ...stats, missing, divergencias, headcountEsperado };
  }

  function retentionBarByRegional() {
    const range = filter.start ? { start: filter.start, end: filter.end } : null;
    const prevRange = previousMonthRange();
    if (!range || !prevRange) return [];
    const st = currentState();
    const states = st && st !== "todos" ? [st] : STATES;
    const byRegional = new Map();
    const bucket = (label) => {
      if (!byRegional.has(label)) byRegional.set(label, { inicial: 0, final: 0, novas: 0 });
      return byRegional.get(label);
    };
    states.forEach((s) => {
      headcountGenderCountByRegional(s, range).forEach((g, label) => {
        bucket(label).final += g.total;
      });
      headcountGenderCountByRegional(s, prevRange).forEach((g, label) => {
        bucket(label).inicial += g.total;
      });
    });
    headcountMovements(st, range).admissoes.forEach((h) => {
      bucket(regionalLabel(h.regional)).novas += 1;
    });
    return [...byRegional.entries()]
      .filter(([, g]) => g.inicial > 0)
      .map(([label, g]) => {
        const pct = ((g.final - g.novas) / g.inicial) * 100;
        return {
          label,
          value: pct,
          tooltipValue: `${pct.toFixed(1).replace(".", ",")}% · inicial ${g.inicial} · final ${g.final} · novas ${g.novas}`
        };
      })
      .sort((a, b) => b.value - a.value);
  }

  const panorama = computed(() => {
    return INDICATORS.filter(
      (ind) =>
        ind.id !== "turnover" &&
        ind.id !== "custo_contratacao" &&
        ind.id !== "custo_total" &&
        ind.id !== "retencao" &&
        ind.id !== "treinamento" &&
        ind.id !== "ticket_medio" &&
        ind.id !== "horas_regional"
    )
      .map((ind) => {
        const value = indicatorCurrentValue(ind);
        const displayValue =
          (ind.id === "tempo_contratacao" || ind.id === "tempo_permanencia") && value !== null
            ? Number(value.toFixed(ind.decimals ?? 1))
            : value;
        return [
          {
            label: ind.name,
            value: displayValue,
            tooltipValue: value === null ? "sem dados" : formatValue(ind, value),
            format: ind.type === "currency" ? "currency" : null
          }
        ];
      })
      .flat()
      .sort((a, b) => {
        if (a.value === null) return 1;
        if (b.value === null) return -1;
        return b.value - a.value;
      });
  });

  function formatEntryValue(ind, entry) {
    if (ind.form === "treinamento" && entry.meta) {
      const parts = [entry.meta.employeeName || "", entry.meta.tema || ""].filter(Boolean);
      return `${formatValue(ind, entry.value)} · ${parts.join(" — ")}`;
    }
    if (ind.form === "diaria" && entry.meta && entry.meta.employeeName) {
      const parts = [entry.meta.employeeName];
      if (entry.meta.motivo) parts.push(entry.meta.motivo);
      return `${formatValue(ind, entry.value)} · ${parts.join(" — ")}`;
    }
    if (ind.id === "custo_total" && entry.meta && (entry.meta.empresa || entry.meta.employeeName)) {
      return `${formatValue(ind, entry.value)} · ${[entry.meta.employeeName, entry.meta.empresa].filter(Boolean).join(" — ")}`;
    }
    return formatValue(ind, entry.value);
  }

  const COCKPIT_AVG_TYPES = ["percent", "days", "months"];

  const DIARIA_VIEW_LABELS = { colaborador: "colaborador", filial: "filial", regional: "regional" };

  function feriasChartFor(view) {
    return cockpitChartFor("ferias", "todas", "", "", [], [], "bar", "total", {}, "funcao", [], [], "colaborador", view);
  }

  function custoChartFor(view) {
    return cockpitChartFor(null, "todas", "", "", [], [], "bar", "total", {}, "funcao", [], [], "colaborador", "colaborador", view);
  }

  function cockpitChartFor(kpiId, hiringStatus, treinamentoGerente, hiringRecrutador, headcountFilial, headcountEmpresa, headcountView, rescisaoMode, rescisaoFilters, rescisaoView, headcountFuncao = [], absenteismoFilial = [], diariaView = "colaborador", feriasView = "colaborador", custoView = "empresa", permanenciaView = "colaborador", turnoverView = "geral", retencaoView = "geral", absenteismoView = "motivo") {
    const custoPorRegional = custoView === "regional";
    const custoSub = custoPorRegional ? "Folha + Férias + Rescisões por regional, no período filtrado" : "Valor total por empresa, no período filtrado";
    const custoData = () => (custoPorRegional ? custosBarByRegional() : custosBarByEmpresa());
    if ((!kpiId || kpiId === "custo_total") && custoView === "beneficios") {
      const rows = beneficiosPie();
      const total = rows.reduce((acc, r) => acc + r.value, 0);
      const lancamentos = beneficiosEntries().length;
      return {
        id: kpiId,
        kind: "pie",
        title: "Custo de Pessoal",
        sub: "Total a pagar por benefício no período filtrado",
        data: rows,
        beneficiosView: true,
        tiles: [
          { label: "Total", value: formatCurrency(total), accent: true },
          { label: "Benefícios", value: String(rows.length) },
          { label: "Lançamentos", value: String(lancamentos) }
        ],
        center: { value: formatCurrency(total), caption: "Total" },
        valueFormat: "currency"
      };
    }
    if ((!kpiId || kpiId === "custo_total") && custoView === "consolidado") {
      const { itens, total } = custoConsolidado();
      return {
        id: kpiId,
        kind: "pie",
        title: "Custo de Pessoal",
        sub: "Folha, Férias, Rescisões e Benefícios no período filtrado",
        data: itens,
        consolidado: itens,
        center: { value: formatCurrency(total), caption: "Total" },
        valueFormat: "currency"
      };
    }
    if (!kpiId) {
      return {
        id: null,
        kind: "bar",
        title: "Custo de Pessoal",
        sub: custoSub,
        data: custoData(),
        valueFormat: "currency",
        faturamento: ticketMedioFaturamento(),
        faturamentoEnabled: true
      };
    }

    if (kpiId === "turnover") {
      if (turnoverView === "regional") {
        return {
          id: "turnover",
          kind: "bar",
          title: "Turnover",
          sub: "Entrada vs Saída por regional (% do headcount ativo)",
          data: turnoverBarByRegional(),
          valueFormat: "percent"
        };
      }
      const range = filter.start ? { start: filter.start, end: filter.end } : null;
      const stats = turnoverRateStats(currentState(), range);
      return {
        id: "turnover",
        kind: "pie",
        title: "Turnover",
        sub: "Entrada vs Saída",
        data: chartPieData(),
        summary: {
          admissoes: stats.admissoes,
          demissoes: stats.desligamentos,
          ativos: stats.headcountAtual,
          totalPct: stats.turnoverPct,
          entradaPct: stats.turnoverEntradaPct,
          saidaPct: stats.turnoverSaidaPct,
          custoAdmissaoMensal: custoAdmissaoMensal(stats.admissoes)
        },
        valueFormat: ""
      };
    }
    if (kpiId === "headcount" && headcountView === "pie") {
      const rows = headcountBarByState(headcountFilial, headcountEmpresa, headcountFuncao);
      const sum = (i) => rows.reduce((acc, r) => acc + (r.series[i].value || 0), 0);
      return {
        id: "headcount",
        kind: "pie",
        title: "Headcount",
        sub: "Masculino x Feminino",
        data: [
          { label: "Masculino", value: sum(0), color: "#0284c7" },
          { label: "Feminino", value: sum(1), color: "#db2777" }
        ],
        center: { value: String(sum(2)), caption: "Colaboradores" },
        valueFormat: "count"
      };
    }
    if (kpiId === "headcount") {
      return {
        id: "headcount",
        kind: "bar",
        title: "Headcount",
        sub: headcountView === "regional" ? "Por regional" : "Por estado",
        data:
          headcountView === "regional"
            ? headcountBarByRegional(headcountFilial, headcountEmpresa, headcountFuncao)
            : headcountBarByState(headcountFilial, headcountEmpresa, headcountFuncao),
        valueFormat: ""
      };
    }
    if (kpiId === "ticket_medio") {
      return {
        id: "ticket_medio",
        kind: "pie",
        title: "Custo médio por colaborador",
        sub: "Custo de Pessoal ÷ Headcount, por estado no período filtrado",
        data: ticketMedioBarByState(),
        center: ticketMedioPieCenter(),
        valueFormat: "currency"
      };
    }
    if (kpiId === "custo_total") {
      return {
        id: "custo_total",
        kind: "bar",
        title: "Custo de Pessoal",
        sub: custoSub,
        data: custoData(),
        valueFormat: "currency",
        faturamento: ticketMedioFaturamento(),
        faturamentoEnabled: true
      };
    }
    if (kpiId === "horas_regional") {
      return {
        id: "horas_regional",
        kind: "bar",
        title: "Treinamento",
        sub: "Carga horária por gerente regional no período filtrado",
        data: horasPorRegional(),
        valueFormat: "hours"
      };
    }
    if (kpiId === "treinamento") {
      return {
        id: "treinamento",
        kind: "bar",
        title: "Treinamento",
        sub: "Carga horária por filial no período filtrado",
        data: treinamentoBarByFilial(treinamentoGerente),
        valueFormat: "hours"
      };
    }
    if (kpiId === "tempo_contratacao") {
      return {
        id: "tempo_contratacao",
        kind: "bar",
        title: "Tempo médio de contratação",
        sub: "Vagas abertas no período — dias até o fechamento (ou até hoje, se em aberto)",
        data: vacanciesBarByOpen(hiringStatus, hiringRecrutador),
        valueFormat: ""
      };
    }
    if (kpiId === "tempo_permanencia") {
      return {
        id: "tempo_permanencia",
        kind: "bar",
        title: "Tempo médio de permanência",
        sub:
          permanenciaView === "colaborador"
            ? "Dias entre admissão e desligamento, por colaborador"
            : `Média de dias entre admissão e desligamento, por ${permanenciaView}`,
        data: permanenciaView === "colaborador" ? turnoverTenureBarByEmployee() : turnoverTenureBarBy(permanenciaView),
        valueFormat: ""
      };
    }
    if (kpiId === "rescisoes") {
      const liquido = rescisaoMode === "liquido";
      const porEstado = rescisaoView === "estado";
      const by = porEstado ? "estado" : rescisaoView === "regional" ? "regional" : "função";
      return {
        id: "rescisoes",
        kind: porEstado ? "pie" : "bar",
        title: "Rescisões",
        sub: liquido
          ? `Valor líquido (só a rescisão) por ${by} no período filtrado`
          : `Rescisão + GRRF/consig + 40% por ${by} no período filtrado`,
        data: porEstado
          ? rescisoesPieByEstado(rescisaoMode, rescisaoFilters)
          : rescisaoView === "regional"
            ? rescisoesBarByRegional(rescisaoMode, rescisaoFilters)
            : rescisoesBarByFuncao(rescisaoMode, rescisaoFilters),
        valueFormat: "currency"
      };
    }
    if (kpiId === "retencao" && retencaoView === "regional") {
      return {
        id: "retencao",
        kind: "bar",
        title: "Retenção",
        sub: "Taxa de retenção por regional: (Headcount final − novas contratações) ÷ Headcount inicial",
        data: retentionBarByRegional(),
        valueFormat: "percent"
      };
    }
    if (kpiId === "retencao") {
      return {
        id: "retencao",
        kind: "table",
        title: "Retenção",
        sub: "No período filtrado",
        data: retentionBreakdown(),
        valueFormat: ""
      };
    }
    if (kpiId === "custo_contratacao") {
      return {
        id: "custo_contratacao",
        kind: "pie",
        title: "Custo médio de contratação",
        sub: "Custo médio (média dos salários) por filial, no período filtrado",
        data: custoContratacaoMedioPorFilial(),
        center: custoContratacaoPieCenter(),
        valueFormat: "currency"
      };
    }
    if (kpiId === "absenteismo" && absenteismoView === "regional") {
      return {
        id: "absenteismo",
        kind: "bar",
        title: "Saúde e Segurança",
        sub: "Ocorrências por regional no período filtrado",
        data: absenteismoBarByRegional(absenteismoFilial),
        valueFormat: "",
        showTrend: false
      };
    }
    if (kpiId === "absenteismo") {
      const rows = absenteismoBarByMotivo(absenteismoFilial);
      const range = filter.start ? { start: filter.start, end: filter.end } : null;
      const total = absenteismoOcorrencias(currentState(), range, absenteismoFilial).length;
      return {
        id: "absenteismo",
        kind: "pie",
        title: "Saúde e Segurança",
        sub: "Total de cada ocorrência no período filtrado",
        data: rows.filter((r) => r.value > 0).map((r) => ({ label: r.label, value: r.value, color: r.color })),
        center: { value: String(total), caption: total === 1 ? "Ocorrência" : "Ocorrências" },
        valueFormat: "count"
      };
    }
    if (kpiId === "ferias") {
      const { rows, summary } = feriasBarBy(feriasView);
      return {
        id: "ferias",
        kind: "bar",
        title: "Férias",
        sub: `Valor total de férias por ${feriasView === "filial" ? "filial" : feriasView === "regional" ? "regional" : "colaborador"}, no mês filtrado`,
        data: rows,
        valueFormat: "currency",
        summary
      };
    }
    if (kpiId === "custo_diaria") {
      return {
        id: "custo_diaria",
        kind: "bar",
        title: "Custo médio da diária geral",
        sub: `Valor total por ${DIARIA_VIEW_LABELS[diariaView] || DIARIA_VIEW_LABELS.colaborador}, no período filtrado`,
        data: custoDiariaBarBy(diariaView),
        valueFormat: "currency",
        summary: custoDiariaSummary()
      };
    }

    const ind = getIndicatorById(kpiId);
    if (!ind) {
      return { id: kpiId, kind: "bar", title: "", sub: "", data: [], valueFormat: "" };
    }

    const entries = ind.id === "custo_diaria" ? diariaDailySeries() : filteredEntries(ind);

    const method = COCKPIT_AVG_TYPES.includes(ind.type) ? "avg" : "sum";
    const monthly = aggregateByMonth(entries, method);
    const rows = monthly.map((m) => ({
      label: formatMonthLabel(m.date),
      value: m.value,
      tooltipValue: formatValue(ind, m.value)
    }));

    const valueFormat = ind.type === "currency" ? "currency" : ind.type === "hours" ? "hours" : "";
    return { id: ind.id, kind: "bar", title: ind.name, sub: "Evolução no período", data: rows, valueFormat };
  }

  return {
    absenteismoBarByMotivo,
    absenteismoRowsBy,
    absenteismoFiliais,
    filteredEntries,
    diariaDailySeries,
    treinamentoBarByFilial,
    treinamentoGerentesRegionais,
    treinamentoFilialEntries,
    treinamentoRegionalEntries,
    vagasRecrutadores,
    headcountFiliais,
    headcountEmpresas,
    headcountFuncoes,
    headcountBarByState,
    ticketMedioBarByState,
    ticketMedioPieCenter,
    ticketMedioFaturamento,
    custoPessoalEntriesByEmpresa,
    consolidadoEntries,
    custoFaltantes,
    custoRegionalDetalhe,
    beneficiosEntries,
    custoContratacaoMedioPorFilial,
    custoContratacaoPieCenter,
    kpiValueByEstado,
    custoDiariaBarByColaborador,
    custoDiariaEntriesByColaborador,
    custoDiariaEntriesBy,
    feriasEntriesBy,
    comparacaoMeses,
    kpis,
    selectedKpiId,
    selectKpi,
    kpiChartCards,
    chartPieData,
    turnoverTenureBarByEmployee,
    permanenciaDesligadosLista,
    permanenciaEntriesBy,
    rescisoesBarByFuncao,
    rescisoesPieByEstado,
    rescisoesEntriesByFuncao,
    rescisoesBarByRegional,
    rescisoesEntriesByRegional,
    rescisoesEntriesByEstado,
    rescisoesFilterOptions,
    retentionBreakdown,
    vacanciesBarByOpen,
    cockpitChartFor,
    custoChartFor,
    feriasChartFor,
    panorama,
    formatEntryValue,
    formatDate
  };
}
