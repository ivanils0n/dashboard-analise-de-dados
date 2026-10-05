export const INDICATORS = [
  {
    id: "headcount",
    name: "Headcount",
    desc: "Quadro de colaboradores (código, colaborador, função, admissão, desligamento, mês referente) — o filtro por mês usa o mês referente de cada linha",
    calc: "Colaboradores do quadro cujo mês referente é o mês filtrado",
    type: "number",
    unit: "colaboradores",
    decimals: 0,
    higherIsBetter: true,
    computed: true,
    manual: true,
    form: "headcount"
  },
  {
    id: "turnover",
    name: "Turnover",
    desc: "((Admitidos + Demitidos) / 2) / Ativos × 100 — pizza mostra Entrada (admitidos) vs Saída (demitidos), calculados a partir do Headcount do mês filtrado",
    calc: "((Admitidos + Demitidos) ÷ 2) ÷ Ativos × 100",
    type: "percent",
    unit: "%",
    decimals: 1,
    higherIsBetter: false,
    computed: true,
    manual: false
  },
  {
    id: "absenteismo",
    name: "Saúde e Segurança",
    desc: "Faltas, atestados, suspensões, advertências e acidentes de trabalho lançados no Mapa de Absenteísmo",
    calc: "Total de ocorrências lançadas no Mapa de Absenteísmo no período",
    type: "number",
    unit: "ocorrências",
    decimals: 0,
    higherIsBetter: false,
    computed: true,
    manual: false
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
    computed: true,
    manual: true,
    form: "vaga"
  },
  {
    id: "custo_contratacao",
    name: "Custo médio de contratação",
    desc: "Média dos salários das vagas fechadas",
    calc: "Soma dos salários das vagas fechadas ÷ quantidade de vagas fechadas no período",
    type: "currency",
    unit: "R$",
    decimals: 2,
    higherIsBetter: false,
    computed: false,
    manual: false
  },
  {
    id: "tempo_permanencia",
    name: "Tempo médio de permanência",
    desc: "Média de dias entre a admissão e o desligamento dos colaboradores do Headcount desligados no mês filtrado",
    calc: "Soma dos dias entre admissão e desligamento ÷ quantidade de colaboradores desligados no mês filtrado (Headcount)",
    type: "days",
    unit: "dias",
    decimals: 1,
    higherIsBetter: true,
    computed: true,
    manual: false
  },
  {
    id: "retencao",
    name: "Retenção",
    desc: "((Headcount final − Novas contratações) / Headcount inicial) × 100 — Headcount final: quadro do mês filtrado; Novas contratações: admissões do Headcount no mês; Headcount inicial: quadro do mês anterior",
    calc: "((Headcount final − Novas contratações) ÷ Headcount inicial) × 100",
    type: "percent",
    unit: "%",
    decimals: 1,
    higherIsBetter: true,
    computed: true,
    manual: false
  },
  {
    id: "custo_diaria",
    name: "Custo médio da diária geral",
    desc: "Valor pago em diárias (colaborador, filial, líder, regional, período e diária)",
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
    id: "ferias",
    name: "Férias",
    desc: "Valor pago em férias (colaborador, banco, data de pagamento, filial e mês referente), lido da aba \"ferias\" da planilha",
    calc: "Soma do valor total das férias no mês referente filtrado",
    type: "currency",
    unit: "R$",
    decimals: 2,
    higherIsBetter: false,
    computed: false,
    manual: false
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
    name: "Custo de Pessoal",
    desc: "Valor pago por colaborador (nome, banco, data de pagamento, empresa, filial e mês referente), lido da aba \"custo_folha\" da planilha",
    calc: "Soma do valor total pago no mês referente filtrado",
    type: "currency",
    unit: "R$",
    decimals: 2,
    higherIsBetter: false,
    computed: false,
    manual: false
  },
  {
    id: "ticket_medio",
    name: "Custo médio por colaborador",
    desc: "Custo médio de pessoal por colaborador: Custo de Pessoal do mês ÷ Headcount do mês, no estado filtrado",
    calc: "(Folha + Férias + Rescisões + Benefícios) ÷ total de Headcount (mês e estado filtrados)",
    type: "currency",
    unit: "R$",
    decimals: 2,
    higherIsBetter: false,
    computed: true,
    manual: false
  },
  {
    id: "horas_regional",
    name: "Regional Treinamentos",
    desc: "Quantidade de gerentes regionais com treinamento no período; as horas de cada um aparecem no gráfico",
    calc: "Quantidade de gerentes regionais distintos nos treinamentos do período",
    type: "number",
    unit: "regionais",
    decimals: 0,
    higherIsBetter: true,
    computed: true,
    manual: false
  },
  {
    id: "rescisoes",
    name: "Rescisões",
    desc: "Valores de rescisão por função (valor da rescisão, GRRF/consignado e multa de 40%), lidos da aba \"rescisoes\" da planilha",
    calc: "Valor da rescisão + GRRF/consignado + multa de 40% das rescisões no período (o gráfico também mostra só o valor líquido, sem GRRF/consignado e 40%)",
    type: "currency",
    unit: "R$",
    decimals: 2,
    higherIsBetter: false,
    computed: true,
    manual: false
  }
];

export const MANUAL_INDICATORS = INDICATORS.filter((i) => i.manual);

export const STATES = ["RO", "AM", "PA"];
export const DEFAULT_STATE = "RO";
export const DEFAULT_FILTER_STATE = "todos";

export const STATE_COLORS = { RO: "#ef4444", AM: "#3b82f6", PA: "#facc15" };
export const STATE_NAMES = { RO: "Rondônia", AM: "Amazonas", PA: "Pará" };

export function getIndicatorById(id) {
  return INDICATORS.find((ind) => ind.id === id) || null;
}

export const MODALIDADE_OPTIONS = [
  { value: "presencial", label: "Presencial" },
  { value: "online", label: "Online" }
];
