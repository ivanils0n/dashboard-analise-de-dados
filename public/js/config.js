/* =========================================================
   Configuração dos indicadores de Gente & Gestão (RH)
   ---------------------------------------------------------
   manual  : aparece no modal "Lançar dados" (entrada manual)
   computed: calculado automaticamente a partir da aba Equipe
   form    : tipo de formulário do modal (para indicadores manuais)
   ========================================================= */

const INDICATORS = [
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
    desc: "Faltas, atrasos e afastamentos",
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
  }
];

const MANUAL_INDICATORS = INDICATORS.filter((i) => i.manual);
const COMPUTED_INDICATORS = INDICATORS.filter((i) => i.computed);

/* Estados disponíveis e estado padrão do filtro (RO) */
const STATES = ["RO", "AM", "PA"];
const DEFAULT_STATE = "RO";

function getIndicatorById(id) {
  return INDICATORS.find((ind) => ind.id === id) || null;
}