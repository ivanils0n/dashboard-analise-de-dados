/* Indicadores e constantes de Gente & Gestão. */

export const INDICATORS = [
  {
    id: "headcount",
    name: "Headcount",
    desc: "Quadro de colaboradores (código, colaborador, função, remuneração, admissão) — o filtro por mês reconstrói quem já tinha sido admitido até aquele mês e ainda não foi desligado",
    calc: "Colaboradores admitidos até o mês filtrado e ainda não desligados",
    type: "number",
    unit: "colaboradores",
    decimals: 0,
    higherIsBetter: true,
    /* Quadro persistente (todos os colaboradores já lançados). O filtro por
       mês do dashboard não restringe a importação — ele reconstrói "como
       estava" naquele mês usando a Data de admissão como base (ver
       activeInMonth em lib/employees.js): conta quem já tinha sido admitido
       até o mês filtrado e exclui quem já havia sido desligado até ele. */
    computed: true,
    manual: true,
    form: "headcount"
  },
  {
    id: "turnover",
    name: "Turnover",
    desc: "((Admitidos + Demitidos) / 2) / Ativos × 100 — pizza mostra Entrada (admitidos) vs Saída (demitidos); quantidade lançada manualmente por filial e mês, sem depender de colaboradores nem do KPI de Headcount",
    calc: "((Admitidos + Demitidos) ÷ 2) ÷ Ativos × 100",
    type: "percent",
    unit: "%",
    decimals: 1,
    higherIsBetter: false,
    /* Não depende mais de colaboradores nem da aba Equipe: o usuário lança (ou
       importa por planilha) a quantidade de admitidos, demitidos e ativos por
       filial no mês — puramente visual no KPI, mas usada no cálculo de
       Turnover (%) e Retenção (ver turnoverRateStats/retentionRate em
       lib/employees.js). "Ativos" substitui o Headcount no cálculo — o
       Turnover não depende mais do quadro lançado no KPI de Headcount. A
       pizza do card funde Turnover de Entrada e Turnover de Saída num único
       gráfico (Entrada = admitidos; Saída = demitidos), em vez de dois KPIs
       separados. `manual: true` é o que faz aparecer no seletor do
       LaunchModal. */
    computed: true,
    manual: true,
    form: "turnover"
  },
  {
    id: "absenteismo",
    name: "Absenteísmo",
    desc: "Faltas, atestados e acidentes, importados mensalmente",
    calc: "Soma das ocorrências (faltas, atestados e acidentes) no período",
    type: "number",
    unit: "ocorrências",
    decimals: 0,
    higherIsBetter: false,
    computed: false,
    manual: true,
    form: "mensal"
  },
  {
    id: "tempo_contratacao",
    name: "Tempo médio de contratação",
    desc: "Prazo entre abertura e fechamento da vaga (vagas abertas contam até hoje)",
    calc: "Soma dos dias entre abertura e fechamento ÷ quantidade de vagas fechadas no período",
    type: "days",
    unit: "dias",
    decimals: 1,
    higherIsBetter: false,
    /* Calculado sob demanda (ver avgHiringDays em lib/employees.js), como os
       demais indicadores "computed" — assim o valor do card sempre reflete
       o dia atual, sem depender do filtro de período escolhido. `manual`
       continua true: é o que faz o indicador aparecer no seletor do
       LaunchModal, que abre o formulário de vagas (form "vaga"). */
    computed: true,
    manual: true,
    form: "vaga"
  },
  {
    id: "custo_contratacao",
    name: "Custo médio de contratação",
    desc: "Média dos salários das vagas (abertas e fechadas)",
    calc: "Soma dos salários das vagas ÷ quantidade de vagas no período",
    type: "currency",
    unit: "R$",
    decimals: 2,
    higherIsBetter: false,
    computed: false,
    manual: true,
    form: "custo"
  },
  {
    id: "tempo_permanencia",
    name: "Tempo médio de permanência",
    desc: "Média de dias entre a Data de admissão e a Data de demissão, importada por planilha própria (colaborador, admissão, demissão)",
    calc: "Soma dos dias entre admissão e demissão ÷ quantidade de colaboradores desligados no período",
    type: "days",
    unit: "dias",
    decimals: 1,
    higherIsBetter: true,
    /* Registro independente do Turnover (que virou só quantidade): tem seu
       próprio modal (PermanenciaModal.vue), com lançamento manual e
       importação por planilha (ver turnoverAvgTenureDays em
       lib/employees.js). `manual: false` tira o indicador do seletor do
       LaunchModal — o botão direito no KPI abre o modal dedicado em vez do
       Lançamento. */
    computed: true,
    manual: false
  },
  /* Turnover (Exp) desativado — indicador comentado, não aparece mais no
     dashboard nem no seletor do LaunchModal.
  {
    id: "turnover_experiencia",
    name: "Turnover (Exp)",
    desc: "Desligamentos em período de experiência, lançados manualmente",
    type: "number",
    unit: "desligamentos",
    decimals: 0,
    higherIsBetter: false,
    computed: true,
    manual: true,
    form: "turnover_exp"
  },
  */
  {
    id: "retencao",
    name: "Retenção",
    desc: "((Headcount final − Novas contratações) / Headcount inicial) × 100 — Headcount final: quadro no último dia do mês; Novas contratações: admissões no mês; Headcount inicial: quadro no primeiro dia do mês",
    calc: "((Headcount final − Novas contratações) ÷ Headcount inicial) × 100",
    type: "percent",
    unit: "%",
    decimals: 1,
    higherIsBetter: true,
    /* Deixou de ser lançamento manual mensal: agora vem direto do quadro do
       Headcount (Headcount inicial/final reconstruídos pela Data de
       admissão, ver activeInMonth) e das admissões do mês (ver
       retentionRate em lib/employees.js). `manual: false` tira o indicador
       do seletor do LaunchModal — não existe mais formulário próprio. */
    computed: true,
    manual: false
  },
  {
    id: "custo_diaria",
    name: "Custo médio da diária geral",
    desc: "Valor pago em diárias (colaborador, departamento, filial, líder, regional, período e diária)",
    calc: "Total pago em diárias ÷ quantidade de colaboradores",
    type: "currency",
    unit: "R$",
    decimals: 2,
    higherIsBetter: false,
    computed: false,
    manual: true,
    form: "diaria"
  },
  {
    id: "treinamento",
    name: "Treinamento",
    desc: "Carga horária em treinamentos (colaborador, cargo, loja, tema, modalidade)",
    calc: "Soma da carga horária dos treinamentos no período",
    type: "hours",
    unit: "horas",
    decimals: 1,
    higherIsBetter: true,
    computed: false,
    manual: true,
    form: "treinamento"
  },
  {
    id: "custo_total",
    name: "Custo de folha de salário",
    desc: "Custos totais por estado e filial (CNPJ, razão social, custo e % de participação)",
    calc: "Soma dos custos totais no período",
    type: "currency",
    unit: "R$",
    decimals: 2,
    higherIsBetter: false,
    computed: false,
    manual: true,
    form: "custo_total"
  }
];

export const MANUAL_INDICATORS = INDICATORS.filter((i) => i.manual);
export const COMPUTED_INDICATORS = INDICATORS.filter((i) => i.computed);

export const STATES = ["RO", "AM", "PA"];
export const DEFAULT_STATE = "RO";
/* Estado inicial do filtro global (ao lado do usuário/menu) ao abrir o
   dashboard. Separado de DEFAULT_STATE porque este último também é usado
   como estado concreto de fallback (formulários, criação de registros) —
   nesses casos "todos" não seria um estado válido. */
export const DEFAULT_FILTER_STATE = "todos";

export const STATE_NAMES = { RO: "Rondônia", AM: "Amazonas", PA: "Pará" };

// Login: o usuário digita o nome e o domínio completa o e-mail.
export const AUTH_EMAIL_DOMAIN = "gente.gestao";

export const STATUS_LABELS = { ativo: "Ativo", afastado: "Afastado", desligado: "Desligado" };
export const TYPE_LABELS = { efetivado: "Efetivado", experiencia: "Em experiência" };
export const ABSENTEEISM_TYPES = {
  falta: "Falta",
  atraso: "Atestado",
  afastamento: "Acidente"
};
export const ABSENTEEISM_OPTIONS = ["falta", "atraso", "afastamento"];

export function getIndicatorById(id) {
  return INDICATORS.find((ind) => ind.id === id) || null;
}

/* Custos de pessoal mensais registrados por colaborador (salário é a base e
   fica no próprio colaborador). Usados no detalhe do funcionário no Headcount. */
export const PERSONNEL_COST_FIELDS = [
  { key: "valeTransporte", label: "Vale-transporte" },
  { key: "valeAlimentacao", label: "Vale-alimentação" },
  { key: "inss", label: "INSS" },
  { key: "fgts", label: "FGTS" },
  { key: "irrf", label: "IRRF" },
  { key: "premioArt62", label: "Premiação art. 62" },
  { key: "premioLoja", label: "Premiação loja" },
  { key: "comissao", label: "Comissão" }
];

/* Modalidades do lançamento de treinamento. */
export const MODALIDADE_OPTIONS = [
  { value: "presencial", label: "Presencial" },
  { value: "online", label: "Online" }
];
