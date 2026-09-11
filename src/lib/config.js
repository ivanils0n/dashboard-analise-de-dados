/* Indicadores e constantes de Gente & Gestão. */

export const INDICATORS = [
  {
    id: "headcount",
    name: "Headcount",
    desc: "Número de colaboradores ativos (calculado pela equipe)",
    type: "number",
    unit: "colaboradores",
    decimals: 0,
    higherIsBetter: true,
    computed: true,
    manual: false
  },
  {
    id: "turnover_entradas",
    name: "Turnover - Entradas",
    desc: "Colaboradores admitidos (marcados para contabilizar)",
    type: "number",
    unit: "entradas",
    decimals: 0,
    higherIsBetter: false,
    computed: true,
    manual: false
  },
  {
    id: "turnover_saidas",
    name: "Turnover - Saídas",
    desc: "Colaboradores desligados (marcados para contabilizar)",
    type: "number",
    unit: "saídas",
    decimals: 0,
    higherIsBetter: false,
    computed: true,
    manual: false
  },
  {
    id: "absenteismo",
    name: "Absenteísmo",
    desc: "Faltas, atestados e acidentes",
    type: "number",
    unit: "ocorrências",
    decimals: 0,
    higherIsBetter: false,
    computed: false,
    manual: true,
    form: "absenteismo"
  },
  {
    id: "tempo_contratacao",
    name: "Tempo médio de contratação",
    desc: "Prazo entre abertura e fechamento da vaga",
    type: "days",
    unit: "dias",
    decimals: 1,
    higherIsBetter: false,
    computed: false,
    manual: true,
    form: "vaga"
  },
  {
    id: "custo_contratacao",
    name: "Custo de contratação",
    desc: "Investimento médio por contratação",
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
    name: "Tempo de permanência",
    desc: "Tempo médio dos colaboradores desligados",
    type: "days",
    unit: "dias",
    decimals: 1,
    higherIsBetter: true,
    computed: true,
    manual: false
  },
  {
    id: "turnover_experiencia",
    name: "Turnover no período de experiência",
    desc: "Desligamentos de colaboradores em período de experiência",
    type: "number",
    unit: "desligamentos",
    decimals: 0,
    higherIsBetter: false,
    computed: true,
    manual: false
  },
  {
    id: "retencao",
    name: "Retenção",
    desc: "Percentual de colaboradores ativos (efetivados ou em experiência)",
    type: "percent",
    unit: "%",
    decimals: 1,
    higherIsBetter: true,
    computed: true,
    manual: false
  },
  {
    id: "custo_diaria",
    name: "Custo da diária geral",
    desc: "Valor pago em diárias (colaborador, departamento, filial, líder, regional, período e diária)",
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
    name: "Custos Totais",
    desc: "Custos totais por estado e filial (CNPJ, razão social, custo e % de participação)",
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
