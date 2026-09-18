import { computed, ref, watch } from "vue";
import { INDICATORS, getIndicatorById, STATES } from "@/lib/config";
import { getEntriesFor, getAllEntries, getBranches } from "@/lib/store";
import {
  computedSnapshot,
  listVacancies,
  listHeadcountRecords,
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
import { aggregateEntries } from "@/lib/metrics";
import { useFilters } from "@/composables/useFilters";
import { ensureLancamentosSince, fetchVagasInRange } from "@/lib/db";
import { beginLoading, endLoading } from "@/composables/useLoading";

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

  function currentState() {
    /* Lê `revision` além de `current`: garante recomputação a cada troca de
       estado mesmo que o valor se repita (ex.: RO -> todos -> RO). */
    void state.revision;
    return state.current;
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

  /* Tempo médio de contratação: ao contrário dos demais indicadores
     "computed", não reaproveita a lista de vagas já carregada em memória —
     busca direto da API só as vagas abertas dentro do período filtrado
     (fetchVagasInRange), para não depender do download completo de vagas do
     estado. `hiringAvgToken` descarta respostas de buscas antigas que
     cheguem fora de ordem (troca rápida de filtro/estado). */
  const hiringAvg = ref(null);
  let hiringAvgToken = 0;
  watch(
    () => [filter.start, filter.end, currentState()],
    async ([start, end, s]) => {
      const token = ++hiringAvgToken;
      beginLoading();
      try {
        const rows = await fetchVagasInRange(s, start || null, end || null);
        if (token === hiringAvgToken) hiringAvg.value = averageHiringDays(rows);
      } catch (err) {
        console.warn("[Dashboard] Falha ao buscar vagas do período:", err);
        if (token === hiringAvgToken) hiringAvg.value = null;
      } finally {
        endLoading();
      }
    },
    { immediate: true }
  );

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
     média do KPI. */
  function scopeEntries(ind, list) {
    if (ind.id === "custo_contratacao") {
      return list.filter((e) => e.meta && e.meta.source === "vaga");
    }
    return list;
  }

  /* Lançamentos "sem período" (ver diariaDailySeries) usam uma data-sentinela
     bem no passado só para satisfazer o banco — nunca representam um período
     real e por isso NUNCA entram nas listas/agregados normais, mesmo sem
     filtro de data ativo (sentinela sempre "antes" de qualquer início de
     período). Só entram quando explicitamente pedidos (toggle "Mostrar sem
     período" do KPI, tratado à parte em `kpis`).
     `state`, quando informado, troca o estado usado no lugar do estado
     global do filtro — usado pelo filtro de estado independente do gráfico
     de Treinamento (ver treinamentoBarByFilial/treinamentoFilialEntries). */
  function filteredEntries(ind, state) {
    const withPeriod = scopeEntries(
      ind,
      getEntriesFor(ind.id, state || currentState()).filter((e) => !(e.meta && e.meta.semPeriodo))
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
    const all = getEntriesFor(ind.id, currentState());
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
    return getEntriesFor(ind.id, currentState()).filter((e) => e.meta && e.meta.semPeriodo);
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

  /* Vagas abertas no período filtrado (data de abertura dentro do range) para
     o gráfico de barras do Cockpit e da Visão geral (Tempo médio de
     contratação): uma barra por vaga, com os dias decorridos até o
     fechamento — ou até hoje, se ainda estiver aberta. `stateOverride`
     (opcional) troca o estado usado — vem do filtro de estado próprio do
     gráfico, independente do filtro de estado da aba (mesmo padrão do
     gráfico de Treinamento). */
  function vacanciesBarByOpen(stateOverride, statusFilter) {
    let vacs = listVacancies(stateOverride || currentState()).filter((v) => v.openAt);
    if (statusFilter === "abertas") vacs = vacs.filter((v) => !v.closeAt);
    else if (statusFilter === "fechadas") vacs = vacs.filter((v) => v.closeAt);
    const inRange = filterByRange(vacs.map((v) => ({ ...v, date: String(v.openAt).slice(0, 10) })));
    return inRange
      .map((v) => {
        const days = daysBetween(v.openAt, v.closeAt || todayISO()) || 0;
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
     por filial (loja) no período filtrado. `stateOverride` (opcional) troca
     o estado usado — vem do filtro de estado próprio do gráfico de
     Treinamento, independente do filtro de estado da aba. */
  function treinamentoBarByFilial(stateOverride) {
    const ind = getIndicatorById("treinamento");
    if (!ind) return [];
    const entries = filteredEntries(ind, stateOverride);
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
  function treinamentoFilialEntries(label, stateOverride) {
    const ind = getIndicatorById("treinamento");
    if (!ind) return [];
    const entries = filteredEntries(ind, stateOverride);
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

  /* Agregação para o gráfico de barras do Custo médio da diária geral: soma
     o valor pago por colaborador no período filtrado. Inclui os lançamentos
     sem competência definida quando "Mostrar sem período" está ativo, igual
     ao KPI (ver indicatorCurrentValue). */
  function custoDiariaBarByColaborador() {
    const ind = getIndicatorById("custo_diaria");
    if (!ind) return [];
    let list = filteredEntries(ind);
    if (diariaShowSemPeriodo.value) {
      const sem = diariaSemPeriodoEntries();
      if (sem.length) list = list.concat(sem);
    }
    const byColaborador = new Map();
    list.forEach((e) => {
      const meta = e.meta || {};
      const nome = meta.employeeName || "Sem colaborador";
      byColaborador.set(nome, (byColaborador.get(nome) || 0) + (Number(e.value) || 0));
    });
    return [...byColaborador.entries()]
      .map(([label, value]) => ({
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
      /* Tempo médio de contratação é o único indicador "computed" cujo
         cálculo depende diretamente de datas (abertura da vaga) — por isso,
         ao contrário dos demais (headcount, turnover, retenção...), respeita
         o filtro de período do dashboard. Vem de `hiringAvg` (busca
         assíncrona direto da API, ver watch acima), não do snapshot local. */
      if (ind.id === "tempo_contratacao") {
        return hiringAvg.value;
      }
      /* Headcount e Turnover (normal/Exp) seguem o filtro de período (mês)
         ativo. Headcount reconstrói "como estava" no mês filtrado usando a
         Data de admissão de cada colaborador como base (ver activeInMonth em
         lib/employees.js) — sempre a partir do quadro completo, não de um
         "mês de lançamento" próprio. Retenção e Tempo de permanência não são
         mais "computed" (viraram lançamento manual mensal). */
      const range = filter.start ? { start: filter.start, end: filter.end } : null;
      if (ind.id === "headcount") return headcountCountInRange(currentState(), range);
      /* Turnover é uma taxa (%), não a contagem bruta de desligamentos — ver
         turnoverRateStats em lib/employees.js. Admissões usam como base o mês
         anterior (previousMonthRange): conta colaboradores cuja Data de
         admissão caiu naquele mês; Headcount é o do mês filtrado (sem
         média). */
      if (ind.id === "turnover") return turnoverRateStats(currentState(), range).turnoverPct;
      if (ind.id === "tempo_permanencia") return turnoverAvgTenureDays(currentState(), range);
      if (ind.id === "retencao") return retentionRate(currentState(), range, previousMonthRange()).retencaoPct;
      return computedSnapshot(ind.id, currentState());
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
    const ym = filter.start ? singleMonthOfRange(filter.start, filter.end) : null;
    if (!ym) return null;
    const prevYm = addMonthsYm(ym, -1);
    return { start: firstDayOfYm(prevYm), end: lastDayOfYm(prevYm) };
  }

  /* ---------- KPIs ---------- */

  const kpis = computed(() => {
    return INDICATORS.map((ind) => {
      const entries = filteredEntries(ind);
      const allEntries = scopeEntries(ind, getEntriesFor(ind.id, currentState()));
      let current = indicatorCurrentValue(ind);
      let prev = null;
      const prevMonthRangeForDelta = filter.start ? previousMonthRange() : null;
      if (prevMonthRangeForDelta && allEntries.length) {
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
      if (ind.id === "custo_contratacao") {
        return {
          id: "custo_contratacao",
          kind: "bar",
          title: ind.name,
          sub: "Salário por vaga, no período filtrado",
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
          valueFormat: "currency"
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
     `stateOverride` (opcional) troca o estado usado — vem do filtro de
     estado próprio do gráfico, independente do filtro de estado da aba
     (mesmo padrão do gráfico de Treinamento). Cada barra carrega o id do
     registro (permanenciaId), usado ao clicar para abrir o detalhe certo. */
  function turnoverTenureBarByEmployee(stateOverride) {
    const list = listPermanenciaRecords(stateOverride || currentState())
      .filter((p) => p.dataAdmissao && p.dataDemissao)
      .map((p) => ({
        date: String(p.dataDemissao).slice(0, 10),
        label: p.colaborador || "—",
        value: daysBetween(p.dataAdmissao, p.dataDemissao) || 0,
        permanenciaId: p.id
      }));
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
        ind.id !== "treinamento"
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
    INDICATORS.forEach((ind) => {
      (all[ind.id] || []).forEach((e) => {
        if (!inDateRange(e)) return;
        if (!matchesState(e)) return;
        rows.push({ entry: e, ind });
      });
    });
    (all[SALARY_IND.id] || []).forEach((e) => {
      if (!inDateRange(e)) return;
      if (!matchesState(e)) return;
      rows.push({ entry: e, ind: SALARY_IND });
    });
    // Ordenação cronológica decrescente: o lançamento mais recente no topo.
    // Desempate por id (criações mais novas primeiro) para o mesmo dia.
    rows.sort(
      (a, b) =>
        compareDateDesc(a.entry.date, b.entry.date) ||
        String(b.entry.id || "").localeCompare(String(a.entry.id || ""))
    );

    if (!q) return rows;
    return rows.filter((r) => {
      if (normalizeText(r.ind.name).includes(q)) return true;
      const meta = r.entry.meta;
      if (!meta || typeof meta !== "object") return false;
      return Object.values(meta).some((v) => typeof v === "string" && normalizeText(v).includes(q));
    });
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

  /* ---------- Cockpit: gráfico central por KPI selecionado ---------- */
  const COCKPIT_AVG_TYPES = ["percent", "days", "months"];
  const NO_PERIODO_MONTH = "0001-01";

  /* Monta os dados do gráfico grande do Cockpit a partir do KPI selecionado
     (ou o gráfico padrão — Custo de folha de salário — quando nenhum está
     selecionado; Panorama atual foi desativado). Mesma regra de agregação
     usada nos cards de "Evolução por indicador" (ver KpiChartCard.vue),
     centralizada aqui para reaproveitar no Cockpit. */
  function cockpitChartFor(kpiId, treinamentoState, hiringStatus, permanenciaState) {
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
        valueFormat: "currency"
      };
    }

    if (kpiId === "turnover") {
      return {
        id: "turnover",
        kind: "pie",
        title: "Turnover",
        sub: "Entrada vs Saída",
        data: chartPieData(),
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
    if (kpiId === "custo_total") {
      return {
        id: "custo_total",
        kind: "bar",
        title: "Custo de folha de salário",
        sub: "Soma dos custos por filial no período filtrado",
        data: custosBarByFilial(),
        valueFormat: "currency"
      };
    }
    if (kpiId === "treinamento") {
      return {
        id: "treinamento",
        kind: "bar",
        title: "Treinamento",
        sub: "Carga horária por filial no período filtrado",
        data: treinamentoBarByFilial(treinamentoState),
        valueFormat: "hours"
      };
    }
    if (kpiId === "tempo_contratacao") {
      return {
        id: "tempo_contratacao",
        kind: "bar",
        title: "Tempo médio de contratação",
        sub: "Vagas abertas no período — dias até o fechamento (ou até hoje, se em aberto)",
        data: vacanciesBarByOpen(null, hiringStatus),
        valueFormat: ""
      };
    }
    if (kpiId === "tempo_permanencia") {
      return {
        id: "tempo_permanencia",
        kind: "bar",
        title: "Tempo médio de permanência",
        sub: "Dias entre admissão e desligamento, por colaborador",
        data: turnoverTenureBarByEmployee(permanenciaState),
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
        sub: "Salário por vaga, no período filtrado",
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
        valueFormat: "currency"
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
    custosBarByFilial,
    custoContratacaoBarByFuncao,
    custoDiariaBarByColaborador,
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
