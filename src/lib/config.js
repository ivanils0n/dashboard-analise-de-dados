/* =========================================================
   Configuração dos indicadores de Gente & Gestão (RH)
   ---------------------------------------------------------
   manual  : aparece no modal "Lançar dados" (entrada manual)
   computed: calculado automaticamente a partir da aba Equipe
   form    : tipo de formulário do modal (para indicadores manuais)
   ========================================================= */

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
  }
];

export const MANUAL_INDICATORS = INDICATORS.filter((i) => i.manual);
export const COMPUTED_INDICATORS = INDICATORS.filter((i) => i.computed);

/* Estados disponíveis e estado padrão do filtro (RO) */
export const STATES = ["RO", "AM", "PA"];
export const DEFAULT_STATE = "RO";

export const STATE_NAMES = { RO: "Rondônia", AM: "Amazonas", PA: "Pará" };

/* Domínio usado no login: o usuário digita apenas o "usuário"
   (ex.: ivan) e o e-mail completo vira ivan@gente.gestao. */
export const AUTH_EMAIL_DOMAIN = "gente.gestao";

export const STATUS_LABELS = { ativo: "Ativo", afastado: "Afastado", desligado: "Desligado" };
export const TYPE_LABELS = { efetivado: "Efetivado", experiencia: "Em experiência" };
export const ABSENTEEISM_TYPES = {
  falta: "Falta",
  atraso: "Atestado",
  afastamento: "Acidente"
};

/* Motivo do submodal de ocorrência do Absenteísmo (ordem exibida). */
export const ABSENTEEISM_OPTIONS = ["falta", "atraso", "afastamento"];

export function getIndicatorById(id) {
  return INDICATORS.find((ind) => ind.id === id) || null;
}
