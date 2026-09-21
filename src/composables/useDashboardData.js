import { computed, ref, watch } from "vue";
import { INDICATORS, getIndicatorById, STATES } from "@/lib/config";
import { getEntriesFor, getAllEntries, getBranches } from "@/lib/store";
import {
  computedSnapshot,
  listVacancies,
  listPermanenciaRecords,
  averageHiringDays,
  turnoverAvgTenureDays,
  headcountCountInRange,
  turnoverRateStats,
  retentionRate
} from "@/lib/employees";
import {
  formatValue,
  formatDate,
  formatCurrency,
  aggregateByDay,
  aggregateByMonth,
  formatMonthLabel,
  normalizeText,
  compareDateDesc,
  daysBetween,
  todayISO,
  singleMonthOfRange,
  addMonthsYm,
  firstDayOfYm,
  lastDayOfYm
} from "@/lib/utils";
import { aggregateEntries, diariaDivisor, employeeNameKey } from "@/lib/metrics";
import { useFilters } from "@/composables/useFilters";
import { faturamento } from "@/composables/useFaturamento";
import { ensureLancamentosSince } from "@/lib/db";

/* Lançamento especial "Salário dos Colaboradores": não vira KPI/gráfico,
   mas aparece em "Lançamentos recentes" com formatação de moeda. */
const SALARY_IND = {
  id: "salario_colaborador",
  name: "Salário dos Colaboradores",
  type: "currency",
  decimals: 2,
  form: "salario"
};

/* Centraliza o cálculo dos dados exibidos no dashboard a partir do
   filtro de período (reactive { start, end }) e do estado selecionado.
   Todos os totais são calculados diretamente sobre os lançamentos.
   `options.diariaShowSemPeriodo` (ref) controla o filtro "Mostrar sem
   período" do KPI de Custo da diária geral. */
export function useDashboardData(filter, options = {}) {
  const { state } = useFilters();
  const diariaShowSemPeriodo = options.diariaShowSemPeriodo || ref(false);

  /* Estado forçado temporariamente por kpiValueByEstado, para reaproveitar
     exatamente as regras de cada KPI calculando um estado por vez. Só vale
     durante a chamada (síncrona), nunca fica ligado. */
  let stateOverride = null;

  function currentState() {
    /* Lê `revision` além de `current`: garante recomputação a cada troca de
       estado mesmo que o valor se repita (ex.: RO -> todos -> RO). */
    void state.revision;
    const current = state.current;
    return stateOverride || current;
  }

  /* A carga inicial de lançamentos traz só uma janela recente (ver
     LANCAMENTOS_WINDOW_MONTHS em lib/db.js); quando o filtro de período do
     dashboard pede uma data anterior ao que já está carregado, busca sob
     demanda o período que falta. */
  watch(
    () => [filter.start, currentState()],
    ([start, s]) => {
      if (start) ensureLancamentosSince(s, start);
    },
    { immediate: true }
  );

  /* Tempo médio de contratação: média das vagas ABERTAS dentro do período
     filtrado (data de abertura no intervalo) — a mesma regra do gráfico de
     barras do indicador. A lista completa de vagas do estado já está em
     memória (carregada em lib/db), então o cálculo é local e instantâneo:
     antes cada troca de filtro fazia uma chamada extra à API e travava a
     tela inteira com a sobreposição de carregamento. */
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

  /* Mês civil anterior a um período { start, end } que seja um mês fechado
     (null nos demais casos). */
  function monthBefore(range) {
    const ym = range && range.start ? singleMonthOfRange(range.start, range.end) : null;
    if (!ym) return null;
    const prevYm = addMonthsYm(ym, -1);
    return { start: firstDayOfYm(prevYm), end: lastDayOfYm(prevYm) };
  }

  /* Custo médio por colaborador = custo de folha de salário ÷ Headcount, no estado e período
     (mês) filtrados. O custo é a soma dos lançamentos de "Custo de folha de
     salário" (custo_total) do período; o Headcount é o quadro reconstruído no
     mês (headcountCountInRange). Sem custo lançado ou sem colaboradores o
     ticket não existe (null → "—"), em vez de virar 0. `uf` permite calcular
     um estado específico (gráfico/mapa por estado). */
  function ticketMedioParts(uf, range) {
    const start = (range && range.start) || null;
    const end = (range && range.end) || null;
    const folha = getEntriesFor("custo_total", uf).filter(
      (e) =>
        !(e.meta && e.meta.semPeriodo) &&
        !(start && e.date < start) &&
        !(end && e.date > end)
    );
    return {
      folhaCount: folha.length,
      folha: folha.reduce((sum, e) => sum + (Number(e.value) || 0), 0),
      headcount: headcountCountInRange(uf, range)
    };
  }

  function ticketMedioFor(uf, range) {
    const { folhaCount, folha, headcount } = ticketMedioParts(uf, range);
    if (!folhaCount || !headcount) return null;
    return folha / headcount;
  }

  /* Valor dos indicadores "computed" para QUALQUER período — regra única usada
     tanto para o valor atual quanto para o mês anterior da seta ▲/▼. Antes a
     seta desses indicadores comparava com lançamentos-snapshot antigos (bases
     e períodos diferentes do valor atual), então podia apontar o sentido
     errado. */
  function computedValue(ind, range) {
    const st = currentState();
    switch (ind.id) {
      case "tempo_contratacao":
        return hiringAvgFor(range);
      case "headcount":
        return headcountCountInRange(st, range);
      /* Turnover é uma taxa (%), não a contagem bruta de desligamentos — ver
         turnoverRateStats em lib/employees.js. */
      case "turnover":
        return turnoverRateStats(st, range).turnoverPct;
      case "tempo_permanencia":
        return turnoverAvgTenureDays(st, range);
      case "retencao":
        return retentionRate(st, range, monthBefore(range)).retencaoPct;
      case "ticket_medio":
        return ticketMedioFor(st, range);
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

  /* Custo de contratação passou a refletir só o salário das vagas (lançamento
     automático de syncVacancyCost, meta.source "vaga") — lançamentos manuais
     feitos pela aba "Custo" do Lançamento (por colaborador) continuam sendo
     gravados e aparecem na tabela de Lançamentos, mas não entram mais na
     média do KPI. Só contam as vagas FECHADAS (a data do lançamento passa a ser
     a do fechamento): vaga aberta ainda não tem custo de contratação definido,
     tanto no KPI quanto no gráfico.

     O cálculo parte das próprias VAGAS (fonte real), não dos lançamentos de
     custo que syncVacancyCost grava: esses podem ficar duplicados, com valor/
     data desatualizados ou órfãos, e distorciam a média. Cada vaga fechada com
     salário informado (> 0) vira um "lançamento" — valor = salário atual e data
     = dia do fechamento — e a média é a soma dos salários ÷ quantidade de vagas. */
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

  /* Lançamentos "sem período" (ver diariaDailySeries) usam uma data-sentinela
     bem no passado só para satisfazer o banco — nunca representam um período
     real e por isso NUNCA entram nas listas/agregados normais, mesmo sem
     filtro de data ativo (sentinela sempre "antes" de qualquer início de
     período). Só entram quando explicitamente pedidos (toggle "Mostrar sem
     período" do KPI, tratado à parte em `kpis`). */
  function filteredEntries(ind) {
    const withPeriod = scopeEntries(
      ind,
      stateEntries(ind.id, currentState()).filter((e) => !(e.meta && e.meta.semPeriodo))
    );
    return filterByRange(withPeriod);
  }

  /* Série diária das diárias: soma o valor pago por dia (vários lançamentos
     podem ocorrer na mesma data). Lançamentos importados sem período (ver
     importação por planilha) ficam de fora por padrão — não têm uma data
     real, então não respeitam o filtro de período — e só entram quando
     `includeSemPeriodo` é true (filtro ao lado do KPI). */
  function diariaDailySeries(includeSemPeriodo = false) {
    const ind = getIndicatorById("custo_diaria");
    if (!ind) return [];
    const all = stateEntries(ind.id, currentState());
    const comPeriodo = all.filter((e) => !(e.meta && e.meta.semPeriodo));
    let list = filterByRange(comPeriodo);
    if (includeSemPeriodo) {
      list = list.concat(all.filter((e) => e.meta && e.meta.semPeriodo));
    }
    return aggregateByDay(list);
  }

  /* Lançamentos de diária sem competência definida (estado/filtro atual, sem
     considerar o filtro de data). Única fonte para a contagem exibida no KPI
     e para a soma adicionada quando "Mostrar sem período" está ativo — usada
     tanto por `indicatorCurrentValue` (KPI e Panorama) quanto pelo card. */
  function diariaSemPeriodoEntries() {
    const ind = getIndicatorById("custo_diaria");
    if (!ind) return [];
    return stateEntries(ind.id, currentState()).filter((e) => e.meta && e.meta.semPeriodo);
  }

  function diariaSemPeriodoCount() {
    return diariaSemPeriodoEntries().length;
  }

  /* Valor de um indicador para uma lista de lançamentos (regra única de
     agregação, centralizada em lib/metrics.js). */
  function aggregateList(ind, list) {
    return aggregateEntries(ind, list);
  }

  /* Headcount por estado (uma barra por estado) para o card de barras.
     Headcount é lançamento manual mensal (um registro por colaborador,
     como Turnover) — conta os registros do mês filtrado em cada estado. */
  function headcountBarByState() {
    const range = filter.start ? { start: filter.start, end: filter.end } : null;
    return STATES.map((s) => {
      const value = headcountCountInRange(s, range) || 0;
      return { label: s, value, tooltipValue: String(value) };
    }).sort((a, b) => b.value - a.value);
  }

  /* Custo médio por colaborador por estado (uma fatia por estado) para a pizza
     do KPI — mesma regra do card (ticketMedioFor), no período filtrado.
     Estados sem custo de folha ou sem colaboradores ficam de fora. */
  function ticketMedioBarByState() {
    const range = filter.start ? { start: filter.start, end: filter.end } : null;
    return STATES.map((s) => ({ label: s, value: ticketMedioFor(s, range) }))
      .filter((r) => r.value !== null)
      .map((r) => ({ ...r, tooltipValue: formatCurrency(r.value) }))
      .sort((a, b) => b.value - a.value);
  }

  /* Centro da pizza do Custo médio por colaborador: a média geral dos três
     estados (folha total ÷ headcount total), independente do filtro de estado —
     a pizza sempre compara os estados. */
  function ticketMedioPieCenter() {
    const range = filter.start ? { start: filter.start, end: filter.end } : null;
    const value = ticketMedioFor("todos", range);
    return value === null ? null : { value: formatCurrency(value), caption: "Média geral" };
  }

  /* % do faturamento = Custo médio por colaborador ÷ Faturamento médio por
     colaborador × 100, no estado e período filtrados. O faturamento (especulativo,
     informado no cabeçalho do gráfico) é dividido pelo mesmo Headcount do custo
     médio para virar "faturamento médio por colaborador". null quando não há
     faturamento informado — o KPI só aparece se houver. Se faltar dado no
     mês/estado filtrados (folha ou colaboradores), os valores que dependem dele
     vêm null e `motivo` diz o que falta (em vez de o KPI sumir sem explicação). */
  function ticketMedioFaturamento() {
    const total = faturamento.value;
    if (!total) return null;
    const range = filter.start ? { start: filter.start, end: filter.end } : null;
    const { folhaCount, folha, headcount } = ticketMedioParts(currentState(), range);
    const custo = folhaCount && headcount ? folha / headcount : null;
    const faturamentoMedio = headcount ? total / headcount : null;
    const pct = custo !== null && faturamentoMedio ? (custo / faturamentoMedio) * 100 : null;
    let motivo = "";
    if (!headcount) motivo = "Sem colaboradores (Headcount) neste mês/estado.";
    else if (!folhaCount) motivo = "Sem custo de folha de salário lançado neste mês/estado.";
    return { custo, faturamento: total, faturamentoMedio, headcount, pct, motivo };
  }

  /* Vagas abertas no período filtrado (data de abertura dentro do range) para
     o gráfico de barras do Painel e da Visão geral (Tempo médio de
     contratação): uma barra por vaga, com os dias decorridos até o
     fechamento — ou até hoje, se ainda estiver aberta. */
  function vacanciesBarByOpen(statusFilter) {
    let vacs = listVacancies(currentState()).filter((v) => v.openAt);
    if (statusFilter === "abertas") vacs = vacs.filter((v) => !v.closeAt);
    else if (statusFilter === "fechadas") vacs = vacs.filter((v) => v.closeAt);
    const inRange = filterByRange(vacs.map((v) => ({ ...v, date: String(v.openAt).slice(0, 10) })));
    return inRange
      .map((v) => ({ v, days: daysBetween(v.openAt, v.closeAt || todayISO()) }))
      /* Mesma regra da média (averageHiringDays): data ilegível ou invertida
         não vira barra de 0/negativo. */
      .filter(({ days }) => days !== null && Number.isFinite(days) && days >= 0)
      .map(({ v, days }) => {
        return {
          label: v.name || "Vaga",
          value: Number(days.toFixed(1)),
          tooltipValue: `${days.toFixed(1)} dias${v.closeAt ? "" : " (em aberto)"}`,
          /* Identifica a vaga por trás da barra (nomes podem se repetir) —
             usado ao clicar na barra para abrir o detalhe da vaga certa. */
          vacancyId: v.id
        };
      })
      .sort((a, b) => b.value - a.value);
  }

  /* Rótulo (filial) que agrupa um treinamento: usa o shortName gravado no
     lançamento; para lançamentos antigos, tenta localizar a filial pelo texto
     do cadastro. */
  function treinamentoFilialLabel(meta) {
    const m = meta || {};
    if (m.shortName) return String(m.shortName).toUpperCase();
    const text = String(m.filial || "").toUpperCase();
    if (!text) return "Sem filial";
    const branches = getBranches();
    const match =
      branches.find((b) => b.shortName && text.includes(String(b.shortName).toUpperCase())) ||
      branches.find((b) => b.name && text.includes(String(b.name).toUpperCase()));
    return match ? String(match.shortName || match.name).toUpperCase() : text;
  }

  /* Agregação para o gráfico de barras do Treinamento: soma a carga horária
     por filial (loja) no período filtrado. */
  function treinamentoBarByFilial() {
    const ind = getIndicatorById("treinamento");
    if (!ind) return [];
    const entries = filteredEntries(ind);
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

  /* Lançamentos de treinamento de uma filial (usados ao clicar na barra). */
  function treinamentoFilialEntries(label) {
    const ind = getIndicatorById("treinamento");
    if (!ind) return [];
    const entries = filteredEntries(ind);
    return entries.filter((e) => treinamentoFilialLabel(e.meta) === label);
  }

  /* Agregação para o gráfico de barras dos Custos Totais: soma os custos
     lançados por filial (razão social) no período filtrado. */
  function custosBarByFilial() {
    const ind = getIndicatorById("custo_total");
    if (!ind) return [];
    const byFilial = new Map();
    filteredEntries(ind).forEach((e) => {
      const meta = e.meta || {};
      const filial = meta.filial || meta.razaoSocial || "Sem filial";
      byFilial.set(filial, (byFilial.get(filial) || 0) + (Number(e.value) || 0));
    });
    return [...byFilial.entries()]
      .map(([label, value]) => ({
        label,
        value,
        tooltipValue: formatCurrency(value)
      }))
      .sort((a, b) => b.value - a.value);
  }

  /* Dados do gráfico de linha do Custo médio de contratação: o salário de cada
     vaga (um lançamento por vaga, ver syncVacancyCost em employees.js) vira um
     ponto, em ordem cronológica, rotulado com a função (o nome da vaga é o
     próprio nome da função, ex.: "ANALISTA DE RH"). `vacancyId` abre o detalhe
     da vaga ao clicar; lançamentos sem vaga vinculada não têm clique. */
  function custoContratacaoBarByFuncao() {
    const ind = getIndicatorById("custo_contratacao");
    if (!ind) return [];
    return filteredEntries(ind)
      .map((e) => {
        const meta = e.meta || {};
        const value = Number(e.value) || 0;
        return {
          label: meta.vacancyName || meta.funcao || "Sem função",
          value,
          tooltipValue: `${formatCurrency(value)} — ${formatDate(e.date)}`,
          vacancyId: meta.vacancyId || null,
          date: String(e.date || "")
        };
      })
      .filter((r) => r.value > 0)
      .sort((a, b) => a.date.localeCompare(b.date));
  }

  /* Custo médio de contratação por estado, para o mapa da Visão geral: com o
     filtro em "todos" traz RO, AM e PA; com um estado escolhido, só ele. Mesma
     regra do gráfico (vagas fechadas com salário, dentro do período filtrado). */
  function custoContratacaoPorEstado() {
    const target = currentState();
    const ufs = !target || target === "todos" ? STATES : [target];
    return ufs.map((uf) => {
      const list = filterByRange(costVacancyEntries(uf));
      const total = list.reduce((sum, e) => sum + e.value, 0);
      return {
        uf,
        count: list.length,
        total,
        avg: list.length ? total / list.length : null
      };
    });
  }

  /* Agregação para o gráfico de barras do Custo médio da diária geral: soma
     o valor pago por colaborador no período filtrado. Inclui os lançamentos
     sem competência definida quando "Mostrar sem período" está ativo, igual
     ao KPI (ver indicatorCurrentValue). */
  function diariaBarEntries() {
    const ind = getIndicatorById("custo_diaria");
    if (!ind) return [];
    let list = filteredEntries(ind);
    if (diariaShowSemPeriodo.value) {
      const sem = diariaSemPeriodoEntries();
      if (sem.length) list = list.concat(sem);
    }
    return list;
  }

  function diariaColaboradorName(entry) {
    return (entry.meta && entry.meta.employeeName) || "Sem colaborador";
  }

  /* Diárias de um colaborador (a barra clicada), as mesmas que compõem o valor
     da barra — usadas no modal de detalhe. */
  function custoDiariaEntriesByColaborador(label) {
    const key = employeeNameKey(label);
    return diariaBarEntries().filter((e) => employeeNameKey(diariaColaboradorName(e)) === key);
  }

  /* Resumo do gráfico de barras da diária (Painel): total pago, colaboradores
     distintos e média — sobre a mesma lista das barras (`diariaBarEntries`) e
     com a mesma regra do KPI (total ÷ colaboradores, ver aggregateEntries), então
     os três números sempre batem com o gráfico e com o card. */
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
    /* Nomes iguais (sem acento/caixa/espaços) viram um só colaborador; o
       rótulo é a primeira grafia encontrada. */
    const byColaborador = new Map();
    diariaBarEntries().forEach((e) => {
      const nome = diariaColaboradorName(e);
      const key = employeeNameKey(nome);
      if (!byColaborador.has(key)) byColaborador.set(key, { label: nome, value: 0 });
      byColaborador.get(key).value += Number(e.value) || 0;
    });
    return [...byColaborador.values()]
      .map(({ label, value }) => ({
        label,
        value,
        tooltipValue: formatCurrency(value)
      }))
      .sort((a, b) => b.value - a.value);
  }

  /* Fonte única do "valor atual" de um indicador: usada tanto pelos KPIs
     quanto pelo Panorama atual — ambos precisam mostrar exatamente o mesmo
     número. Para "Custo da diária geral" (média), inclui os lançamentos sem
     competência definida na agregação quando "Mostrar sem período" está
     ativo (e só então), recalculando a média sobre a lista combinada. */
  function indicatorCurrentValue(ind) {
    if (ind.computed) {
      /* Todos os "computed" seguem o filtro de período (mês) ativo — ver
         computedValue. Headcount reconstrói "como estava" no mês filtrado
         usando a Data de admissão de cada colaborador (activeInMonth em
         lib/employees.js); Tempo médio de contratação usa as vagas abertas no
         período. */
      const range = filter.start ? { start: filter.start, end: filter.end } : null;
      return computedValue(ind, range);
    }
    let list = filteredEntries(ind);
    if (ind.id === "custo_diaria" && diariaShowSemPeriodo.value) {
      const sem = diariaSemPeriodoEntries();
      if (sem.length) list = list.concat(sem);
    }
    return aggregateList(ind, list);
  }

  /* Mês civil anterior ao mês selecionado no filtro — usado tanto pela seta
     de variação (▲/▼) dos cards (comparar mês com o mês anterior) quanto pelo
     cálculo do Turnover (%), que precisa do headcount/admissões do mês
     anterior inteiro. O filtro do dashboard é sempre um mês fechado agora,
     então isso NUNCA pode ser "duração igual em dias": meses têm tamanhos
     diferentes (28–31 dias) — um filtro de março (31 dias) subtraindo 31 dias
     não cai no 1º de fevereiro, cai em janeiro; um filtro de fevereiro (28)
     só pega os últimos 28 dias de janeiro, perdendo os 3 primeiros. */
  function previousMonthRange() {
    return monthBefore(filter.start ? { start: filter.start, end: filter.end } : null);
  }

  /* Valor de um KPI em cada estado (para o mapa do Painel): com o filtro em
     "todos" traz RO, AM e PA; com um estado escolhido, só ele. Usa as mesmas
     regras do card do KPI (indicatorCurrentValue), trocando o estado por vez.
     Sem KPI selecionado, o Painel mostra Custo de folha de salário. */
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
        /* Custo médio da diária geral: o mapa mostra o valor TOTAL pago no
           estado (soma das diárias do período), não a média do card. */
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

  /* ---------- KPIs ---------- */

  const kpis = computed(() => {
    return INDICATORS.map((ind) => {
      const entries = filteredEntries(ind);
      const allEntries = scopeEntries(ind, stateEntries(ind.id, currentState()));
      let current = indicatorCurrentValue(ind);
      let prev = null;
      const prevMonthRangeForDelta = filter.start ? previousMonthRange() : null;
      if (ind.computed) {
        /* Mesmo cálculo do valor atual, aplicado ao mês anterior. */
        prev = prevMonthRangeForDelta ? computedValue(ind, prevMonthRangeForDelta) : null;
      } else if (prevMonthRangeForDelta && allEntries.length) {
        /* Mês civil anterior, imediatamente antes do mês filtrado — não
           "tudo desde sempre" (comparar set/2026 contra anos de histórico
           acumulado quase sempre dava seta de queda, mesmo num mês normal).
           Exclui semPeriodo: a data-sentinela é sempre "antes" de qualquer
           início de período, então sem este filtro toda diária sem período
           entraria no "anterior" e distorceria a seta. */
        const range = prevMonthRangeForDelta;
        const before = allEntries.filter(
          (e) =>
            e.date >= range.start &&
            e.date <= range.end &&
            !(e.meta && e.meta.semPeriodo)
        );
        prev = before.length ? aggregateList(ind, before) : null;
      } else if (!filter.start && entries.length > 1) {
        /* Sem início de período: o "anterior" é a agregação de tudo menos o
           último lançamento (respeitando soma/média/último do indicador). */
        prev = aggregateList(ind, entries.slice(0, -1));
      }

      let delta = null;
      if (current !== null && prev !== null) {
        const diff = Number(current) - Number(prev);
        delta = { diff, up: diff > 0, down: diff < 0 };
      }

      /* "Mostrar sem período" (filtro ao lado do KPI): a soma em si já está em
         `current` (ver indicatorCurrentValue) — aqui só ajusta a contagem de
         lançamentos exibida no card. */
      const extraCount = ind.id === "custo_diaria" && diariaShowSemPeriodo.value
        ? diariaSemPeriodoEntries().length
        : 0;

      /* Indicadores "computed" (headcount, turnover, retenção, tempo de
         permanência/contratação) não têm lançamentos manuais: `entries` é o
         histórico de snapshots diários recalculados automaticamente (um por
         dia em que o dashboard foi aberto), não algo que o usuário lançou.
         Rotular isso como "N lançamentos" é enganoso — o card não exibe
         contagem nenhuma para esses indicadores. */
      const totalCount = entries.length + extraCount;
      const countText = ind.computed
        ? ""
        : totalCount === 1
          ? "1 lançamento"
          : `${totalCount} lançamentos`;

      /* Card especial do Turnover: sem número total isolado — a pizza mostra
         a taxa de Entrada (admissões/headcount médio) e a de Saída
         (desligamentos/headcount médio), cada fatia já em %, fundindo os
         antigos KPIs "Turnover de Entrada" e "Turnover de Saída" num único
         gráfico em vez de dois cards separados. */
      if (ind.id === "turnover") {
        const range = filter.start ? { start: filter.start, end: filter.end } : null;
        const stats = turnoverRateStats(currentState(), range);
        return {
          id: "turnover",
          kind: "pie",
          name: "Turnover",
          countText,
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

      /* Tempo médio de contratação: quantidade de vagas abertas/fechadas. */
      if (ind.id === "tempo_contratacao") {
        const vacs = listVacancies(currentState());
        base.vagasAbertas = vacs.filter((v) => !v.closeAt).length;
        base.vagasFechadas = vacs.filter((v) => v.closeAt).length;
      }

      return base;
    });
  });

  const selectedId = ref(null);

  const selectedKpiId = computed(() => selectedId.value);

  function selectKpi(id) {
    selectedId.value = id;
  }

  /* ---------- Faixa de gráficos por indicador ----------
     "Custos Totais", "Treinamento", "Tempo médio de contratação" e "Tempo
     médio de permanência" saem desta faixa e ganham gráfico próprio abaixo
     do Panorama (o KPI/card continua selecionável). */
  const kpiChartCards = computed(() => {
    const visible = INDICATORS.filter(
      (ind) =>
        ind.id !== "custo_total" &&
        ind.id !== "treinamento" &&
        ind.id !== "tempo_contratacao" &&
        ind.id !== "tempo_permanencia"
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
          sub: "Custo de folha ÷ Headcount, por estado no período filtrado",
          unit: ind.unit,
          valueFormat: "currency"
        };
      }
      if (ind.id === "custo_contratacao") {
        return {
          id: "custo_contratacao",
          kind: "bar",
          title: ind.name,
          sub: "Salário por vaga fechada, no período filtrado",
          unit: ind.unit,
          valueFormat: "currency",
          variant: "line"
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

  /* Uma barra por colaborador desligado (registros do modal de Tempo médio
     de permanência), no período filtrado pela Data de demissão — nome do
     colaborador no rótulo e dias entre admissão e demissão como valor.
     Cada barra carrega o id do registro (permanenciaId), usado ao clicar
     para abrir o detalhe certo. */
  function turnoverTenureBarByEmployee() {
    const list = listPermanenciaRecords(currentState())
      .filter((p) => p.dataAdmissao && p.dataDemissao)
      .map((p) => ({
        date: String(p.dataDemissao).slice(0, 10),
        label: p.colaborador || "—",
        value: daysBetween(p.dataAdmissao, p.dataDemissao),
        permanenciaId: p.id
      }))
      /* Mesma regra da média (turnoverAvgTenureDays): datas inválidas ou
         invertidas ficam de fora. */
      .filter((p) => p.value !== null && Number.isFinite(p.value) && p.value >= 0);
    return filterByRange(list)
      .map((p) => ({
        label: p.label,
        value: p.value,
        tooltipValue: `${p.value.toFixed(1)} dias`,
        permanenciaId: p.permanenciaId
      }))
      .sort((a, b) => b.value - a.value);
  }

  /* Detalhamento da Retenção no período filtrado — mesmos números usados
     pelo KPI (ver indicatorCurrentValue), só que aqui expostos individual-
     mente (headcount inicial/final e novas contratações) para a tabela do
     gráfico, em vez de só a taxa final. Headcount inicial/final vêm de
     `headcountCountInRange` (quadro reconstruído pela Data de admissão, ver
     activeInMonth em employees.js) no fim do mês anterior e no fim do mês
     filtrado, respectivamente; novas contratações somam o "Admitidos"
     lançado no Turnover dentro do mês filtrado. */
  function retentionBreakdown() {
    const range = filter.start ? { start: filter.start, end: filter.end } : null;
    const stats = retentionRate(currentState(), range, previousMonthRange());
    /* Sem nenhum dos três números o cálculo não tem sentido (vira "—") — a
       tabela avisa qual deles falta lançar em vez de só mostrar zero. */
    const missing = [];
    if (!stats.headcountInicial) missing.push("Headcount inicial");
    if (!stats.headcountFinal) missing.push("Headcount final");
    if (!stats.novasContratacoes) missing.push("Novas contratações");
    return { ...stats, missing };
  }

  /* ---------- Panorama (barras) ---------- */

  const panorama = computed(() => {
    return INDICATORS.filter(
      (ind) =>
        ind.id !== "turnover" &&
        ind.id !== "custo_contratacao" &&
        ind.id !== "custo_total" &&
        ind.id !== "retencao" &&
        ind.id !== "treinamento" &&
        ind.id !== "ticket_medio"
    )
      .map((ind) => {
        const value = indicatorCurrentValue(ind);
        /* Os rótulos dos KPIs de Tempo médio de contratação e Tempo médio de
           permanência já mostram o valor arredondado (ver decimals no
           config); sem isto a barra do Panorama desenhava o número cru
           (ex.: "16.333333333333332") em vez do mesmo valor do KPI. */
        const displayValue =
          (ind.id === "tempo_contratacao" || ind.id === "tempo_permanencia") && value !== null
            ? Number(value.toFixed(ind.decimals ?? 1))
            : value;
        return [
          {
            label: ind.name,
            value: displayValue,
            tooltipValue: value === null ? "sem dados" : formatValue(ind, value),
            /* Antes só "custo_total" ganhava este formato — "custo_diaria"
               (mesmo tipo "currency") caía no rótulo padrão e desenhava o
               número cru (ex.: "25048.370000000003") em vez de moeda. */
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

  /* ---------- Tabela de lançamentos ---------- */

  function tableRows(query) {
    const q = normalizeText(query).trim();
    const all = getAllEntries();
    const rows = [];
    const stateTarget = String(currentState() || "").trim().toUpperCase();
    const matchesState = (e) =>
      stateTarget === "TODOS" ||
      String((e.meta && e.meta.estado) || "").trim().toUpperCase() === stateTarget;
    /* Diárias importadas sem período não têm uma data real (usam uma
       sentinela só para satisfazer o banco) — sempre aparecem aqui, sem
       respeitar o filtro de data do topo. */
    const inDateRange = (e) => {
      if (e.meta && e.meta.semPeriodo) return true;
      if (filter.start && e.date < filter.start) return false;
      if (filter.end && e.date > filter.end) return false;
      return true;
    };
    /* A busca é aplicada ANTES da ordenação: ordenar só o que sobrou é bem
       mais barato do que ordenar tudo e descartar depois. */
    const nameMatches = new Map();
    const matchesQuery = (e, ind) => {
      if (!q) return true;
      if (!nameMatches.has(ind.id)) nameMatches.set(ind.id, normalizeText(ind.name).includes(q));
      if (nameMatches.get(ind.id)) return true;
      const meta = e.meta;
      if (!meta || typeof meta !== "object") return false;
      return Object.values(meta).some((v) => typeof v === "string" && normalizeText(v).includes(q));
    };
    const collect = (list, ind) => {
      (list || []).forEach((e) => {
        if (!inDateRange(e)) return;
        if (!matchesState(e)) return;
        if (!matchesQuery(e, ind)) return;
        rows.push({ entry: e, ind });
      });
    };
    INDICATORS.forEach((ind) => collect(all[ind.id], ind));
    collect(all[SALARY_IND.id], SALARY_IND);

    // Ordenação cronológica decrescente: o lançamento mais recente no topo.
    // Desempate por id (criações mais novas primeiro) para o mesmo dia.
    rows.sort(
      (a, b) =>
        compareDateDesc(a.entry.date, b.entry.date) ||
        String(b.entry.id || "").localeCompare(String(a.entry.id || ""))
    );
    return rows;
  }

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
    if (ind.form === "custo" && entry.meta && entry.meta.employeeName) {
      return `${formatValue(ind, entry.value)} · ${entry.meta.employeeName}`;
    }
    if (ind.id === "custo_contratacao" && entry.meta && entry.meta.vacancyName) {
      return `${formatValue(ind, entry.value)} · ${entry.meta.vacancyName}`;
    }
    if (ind.form === "custo_total" && entry.meta && entry.meta.razaoSocial) {
      return `${formatValue(ind, entry.value)} · ${entry.meta.razaoSocial}`;
    }
    if (ind.form === "salario" && entry.meta && entry.meta.employeeName) {
      return `${formatValue(ind, entry.value)} · ${entry.meta.employeeName}`;
    }
    return formatValue(ind, entry.value);
  }

  /* ---------- Painel: gráfico central por KPI selecionado ---------- */
  const COCKPIT_AVG_TYPES = ["percent", "days", "months"];
  const NO_PERIODO_MONTH = "0001-01";

  /* Monta os dados do gráfico grande do Painel a partir do KPI selecionado
     (ou o gráfico padrão — Custo de folha de salário — quando nenhum está
     selecionado; Panorama atual foi desativado). Mesma regra de agregação
     usada nos cards de "Evolução por indicador" (ver KpiChartCard.vue),
     centralizada aqui para reaproveitar no Painel. */
  function cockpitChartFor(kpiId, hiringStatus) {
    if (!kpiId) {
      /* Panorama atual (desativado):
      return {
        id: null,
        kind: "bar",
        title: "Panorama atual",
        sub: "Último valor por indicador",
        data: panorama.value,
        valueFormat: ""
      };
      */
      return {
        id: null,
        kind: "bar",
        title: "Custo de folha de salário",
        sub: "Soma dos custos por filial no período filtrado",
        data: custosBarByFilial(),
        valueFormat: "currency",
        faturamento: ticketMedioFaturamento(),
        faturamentoEnabled: true
      };
    }

    if (kpiId === "turnover") {
      /* `summary`: quantidades de admissões e demissões (e ativos) do período e
         estado filtrados, exibidas ao lado da pizza no Painel. */
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
          saidaPct: stats.turnoverSaidaPct
        },
        valueFormat: ""
      };
    }
    if (kpiId === "headcount") {
      return {
        id: "headcount",
        kind: "bar",
        title: "Headcount",
        sub: "Por estado",
        data: headcountBarByState(),
        valueFormat: ""
      };
    }
    if (kpiId === "ticket_medio") {
      return {
        id: "ticket_medio",
        kind: "pie",
        title: "Custo médio por colaborador",
        sub: "Custo de folha ÷ Headcount, por estado no período filtrado",
        data: ticketMedioBarByState(),
        center: ticketMedioPieCenter(),
        valueFormat: "currency"
      };
    }
    if (kpiId === "custo_total") {
      return {
        id: "custo_total",
        kind: "bar",
        title: "Custo de folha de salário",
        sub: "Soma dos custos por filial no período filtrado",
        data: custosBarByFilial(),
        valueFormat: "currency",
        faturamento: ticketMedioFaturamento(),
        faturamentoEnabled: true
      };
    }
    if (kpiId === "treinamento") {
      return {
        id: "treinamento",
        kind: "bar",
        title: "Treinamento",
        sub: "Carga horária por filial no período filtrado",
        data: treinamentoBarByFilial(),
        valueFormat: "hours"
      };
    }
    if (kpiId === "tempo_contratacao") {
      return {
        id: "tempo_contratacao",
        kind: "bar",
        title: "Tempo médio de contratação",
        sub: "Vagas abertas no período — dias até o fechamento (ou até hoje, se em aberto)",
        data: vacanciesBarByOpen(hiringStatus),
        valueFormat: ""
      };
    }
    if (kpiId === "tempo_permanencia") {
      return {
        id: "tempo_permanencia",
        kind: "bar",
        title: "Tempo médio de permanência",
        sub: "Dias entre admissão e desligamento, por colaborador",
        data: turnoverTenureBarByEmployee(),
        valueFormat: ""
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
        kind: "bar",
        title: "Custo médio de contratação",
        sub: "Salário por vaga fechada, no período filtrado",
        data: custoContratacaoBarByFuncao(),
        valueFormat: "currency",
        variant: "line"
      };
    }
    if (kpiId === "custo_diaria") {
      return {
        id: "custo_diaria",
        kind: "bar",
        title: "Custo médio da diária geral",
        sub: "Valor total por colaborador, no período filtrado",
        data: custoDiariaBarByColaborador(),
        valueFormat: "currency",
        summary: custoDiariaSummary()
      };
    }

    const ind = getIndicatorById(kpiId);
    if (!ind) {
      return { id: kpiId, kind: "bar", title: "", sub: "", data: [], valueFormat: "" };
    }

    let entries;
    if (ind.id === "custo_diaria") entries = diariaDailySeries(diariaShowSemPeriodo.value);
    else entries = filteredEntries(ind);

    const method = COCKPIT_AVG_TYPES.includes(ind.type) ? "avg" : "sum";
    const monthly = aggregateByMonth(entries, method);
    const rows = [];
    let semPeriodo = null;
    monthly.forEach((m) => {
      const row = { label: formatMonthLabel(m.date), value: m.value, tooltipValue: formatValue(ind, m.value) };
      if (m.date === NO_PERIODO_MONTH) semPeriodo = { ...row, label: "Sem período" };
      else rows.push(row);
    });
    if (semPeriodo) rows.push(semPeriodo);

    const valueFormat = ind.type === "currency" ? "currency" : ind.type === "hours" ? "hours" : "";
    return { id: ind.id, kind: "bar", title: ind.name, sub: "Evolução no período", data: rows, valueFormat };
  }

  return {
    filteredEntries,
    diariaDailySeries,
    diariaSemPeriodoCount,
    treinamentoBarByFilial,
    treinamentoFilialEntries,
    headcountBarByState,
    ticketMedioBarByState,
    ticketMedioPieCenter,
    ticketMedioFaturamento,
    custosBarByFilial,
    custoContratacaoBarByFuncao,
    custoContratacaoPorEstado,
    kpiValueByEstado,
    custoDiariaBarByColaborador,
    custoDiariaEntriesByColaborador,
    indicatorCurrentValue,
    kpis,
    selectedKpiId,
    selectKpi,
    kpiChartCards,
    chartPieData,
    turnoverTenureBarByEmployee,
    retentionBreakdown,
    vacanciesBarByOpen,
    cockpitChartFor,
    panorama,
    tableRows,
    formatEntryValue,
    formatDate
  };
}
