// Não duplicar aqui as fórmulas dos KPIs: elas vêm de INDICATORS (config.js), a fonte única.
// Este arquivo documenta só as análises (modais). Ao mudar uma fórmula no código, atualize o item correspondente.

export const REGRAS_GERAIS = [
  {
    nome: "Agregação no período",
    formula:
      "Absenteísmo, treinamento, custo de pessoal e férias somam os lançamentos do período. Custo da diária e custo de contratação usam a média (a diária divide pelos colaboradores distintos). Os demais indicadores usam o último valor do período."
  },
  {
    nome: "Colaboradores distintos",
    formula: "Contados pelo código e pelo nome sem acento, espaço ou pontuação, então grafias diferentes do mesmo nome contam uma vez."
  },
  {
    nome: "Mês vigente",
    formula: "Por padrão é o mês anterior ao atual (mês fechado). O seletor de período da dashboard altera esse mês."
  },
  {
    nome: "Variação contra o mês anterior",
    formula: "(valor atual − valor do mês anterior) ÷ valor do mês anterior × 100. Taxas e percentuais variam em pontos percentuais (p.p.) e tempos em dias."
  }
];

export const COMPARACAO = [
  {
    titulo: "Período e valores",
    itens: [
      { nome: "Período", formula: "1, 2, 3, 6 ou 12 meses terminando no mês da dashboard. Sempre entra mais um mês anterior ao período, usado só como base do primeiro mês." },
      { nome: "Valor de cada mês", formula: "O mesmo cálculo do card do indicador, aplicado a cada mês e ao estado escolhido (Todos, RO, AM ou PA). Mês sem dados aparece como —." },
      { nome: "Indicadores listados", formula: "Todos os indicadores da dashboard, exceto \"Horas por regional\"." }
    ]
  },
  {
    titulo: "Variação",
    itens: [
      { nome: "Variação do mês (%)", formula: "(valor do mês − valor do mês anterior) ÷ |valor do mês anterior| × 100. O primeiro mês é comparado com o mês anterior ao período." },
      { nome: "Base zero ou sem dado", formula: "Sem variação (—) quando o mês ou a base não tem valor, ou quando a base é zero. Só 0 contra 0 conta como 0%." },
      { nome: "Cor da variação", formula: "Verde = melhora, vermelho = piora, cinza = sem mudança. Depende do tipo do indicador: em \"quanto maior, melhor\" subir é verde; em \"quanto menor, melhor\" descer é verde." },
      { nome: "Variação média", formula: "Média simples das variações mensais (%) de todos os meses do período, ignorando os meses sem base." }
    ]
  },
  {
    titulo: "Classificação e ordenação",
    itens: [
      { nome: "Melhoraram / Pioraram", formula: "Pela variação média: melhorou se ela vai na direção boa do indicador, piorou se vai na direção ruim." },
      { nome: "Estáveis", formula: "Variação média igual a zero." },
      { nome: "Sem dados", formula: "Nenhum mês do período teve variação calculável." },
      { nome: "Maior melhora / Maior piora", formula: "Ordena pelo tamanho da variação média, só entre os indicadores que melhoraram ou pioraram. Os sem dados ficam no fim." },
      { nome: "Tendência", formula: "Linha com o mês anterior e os meses do período, desenhada entre o menor e o maior valor da série." }
    ]
  },
  {
    titulo: "Detalhes ao expandir uma linha",
    itens: [
      { nome: "Por estado", formula: "Cada indicador é recalculado separadamente para RO, AM e PA, com a mesma fórmula e a mesma variação." },
      { nome: "Custo de Pessoal", formula: "Abre em Folha, Férias, Rescisões e Benefícios. Componente zerado no mês aparece como —." },
      { nome: "Aviso \"incompleto\"", formula: "Aparece no Custo de Pessoal do mês quando algum componente (folha, férias, rescisões ou benefícios) não tem lançamento, e o total fica subestimado." }
    ]
  }
];

export const ANALISES = [
  {
    titulo: "Análise de Absenteísmo",
    itens: [
      { nome: "Ocorrências", formula: "Total de lançamentos do mês no Mapa de Absenteísmo (falta, atestado, suspensão, advertência ou acidente de trabalho)." },
      { nome: "Dias de ausência", formula: "Cada falta, atestado ou suspensão vale 1 dia. Acidente de trabalho vale pelo menos 1 dia. Advertência sozinha vale 0." },
      { nome: "Dias úteis do mês", formula: "Dias do mês, exceto domingos." },
      { nome: "Taxa de absenteísmo", formula: "Dias de ausência ÷ (ativos do Headcount × dias úteis do mês) × 100." },
      { nome: "Colaboradores afetados", formula: "Colaboradores distintos com pelo menos uma ocorrência no mês." },
      { nome: "Média por afetado", formula: "Ocorrências ÷ colaboradores afetados." },
      { nome: "Média de dias de atestado", formula: "Soma dos dias informados ÷ ocorrências com dias de atestado informados (atestados e acidentes)." },
      { nome: "Taxa por função e por filial", formula: "Dias de ausência do grupo ÷ (ativos do grupo × dias úteis do mês) × 100." },
      { nome: "Por CID", formula: "Quantidade de ocorrências de cada CID informado, de qualquer motivo." },
      { nome: "Reincidentes", formula: "10 colaboradores com mais ocorrências no mês. Alerta com 3 ou mais ocorrências, 3 ou mais faltas ou pelo menos 1 advertência." },
      { nome: "Período de experiência", formula: "Ocorrências de quem tinha até 90 dias entre a admissão e a data da ocorrência. Percentual = em experiência ÷ total de ocorrências." }
    ]
  },
  {
    titulo: "Análise de Turnover",
    itens: [
      { nome: "Ativos", formula: "Quadro ativo do Headcount no mês filtrado." },
      { nome: "Entrada", formula: "Admissões do mês ÷ ativos × 100." },
      { nome: "Saída", formula: "Desligamentos do mês ÷ ativos × 100." },
      { nome: "Turnover", formula: "((Admissões + Desligamentos) ÷ 2) ÷ ativos × 100, ou seja, a média de Entrada e Saída." },
      { nome: "Por função e por filial", formula: "Mesma fórmula sobre os ativos de cada grupo." },
      { nome: "Filial crítica / em atenção", formula: "Crítica: turnover da filial ≥ 1,5 × o turnover geral. Atenção: turnover ≥ turnover geral (e maior que zero)." },
      { nome: "Período de experiência", formula: "Desligados com até 90 dias entre admissão e desligamento ÷ total de desligados × 100." }
    ]
  },
  {
    titulo: "Análise de Headcount",
    itens: [
      { nome: "Colaboradores ativos", formula: "Quadro ativo do mês filtrado." },
      { nome: "Feminino · Masculino", formula: "Colaboradores de cada gênero ÷ ativos × 100." },
      { nome: "Tempo médio de casa", formula: "Média dos dias entre a admissão e o fim do mês filtrado, dos colaboradores ativos." },
      { nome: "Faixas de tempo de casa", formula: "Até 90 dias · 3 meses a 1 ano · 1 a 2 anos · 2 a 5 anos · mais de 5 anos." },
      { nome: "Faixa etária", formula: "Idade calculada até o fim do mês filtrado, em faixas de 10 em 10 anos até 51 anos ou mais." },
      { nome: "Acumulado do ano", formula: "Admissões − desligamentos de janeiro até o mês filtrado." }
    ]
  },
  {
    titulo: "Análise de Tempo Médio de Permanência",
    itens: [
      { nome: "Permanência", formula: "Dias entre a admissão e o desligamento dos colaboradores desligados no mês filtrado." },
      { nome: "Tempo médio", formula: "Soma dos dias de permanência ÷ colaboradores desligados no mês." },
      { nome: "Mediana", formula: "Prazo central entre os desligados (metade ficou menos, metade mais)." },
      { nome: "Filial crítica / em atenção", formula: "Aqui o pior é o tempo menor. Crítica: permanência da filial ≤ 2/3 da média geral. Atenção: abaixo da média geral." },
      { nome: "Variação", formula: "Em dias, contra o mês anterior ao filtrado." }
    ]
  },
  {
    titulo: "Análise de Contratação",
    itens: [
      { nome: "Vagas", formula: "Vagas abertas no mês filtrado, separadas em fechadas e em aberto." },
      { nome: "Tempo médio", formula: "Soma dos dias entre abertura e fechamento ÷ vagas fechadas no período." },
      { nome: "Custo médio", formula: "Salário médio das vagas fechadas no mês." },
      { nome: "Taxa de fechamento", formula: "Vagas fechadas ÷ vagas abertas no período × 100." },
      { nome: "Filial crítica / em atenção", formula: "Crítica: tempo da filial ≥ 1,5 × o tempo médio geral. Atenção: tempo ≥ tempo médio geral. A variação é em dias contra o mês anterior." }
    ]
  },
  {
    titulo: "Análise de Custo da Diária",
    itens: [
      { nome: "Valor", formula: "Soma das diárias pagas no período filtrado." },
      { nome: "Custo médio", formula: "Valor total ÷ colaboradores distintos." },
      { nome: "Por filial, função, motivo e colaborador", formula: "Soma das diárias de cada grupo, da maior para a menor, com a variação contra o mês anterior." }
    ]
  },
  {
    titulo: "Análise de Férias",
    itens: [
      { nome: "Valor", formula: "Soma dos pagamentos de férias no mês referente filtrado." },
      { nome: "Média por colaborador", formula: "Valor total ÷ colaboradores distintos." }
    ]
  },
  {
    titulo: "Análise de Treinamento",
    itens: [
      { nome: "Horas", formula: "Soma da carga horária dos lançamentos de treinamento no período filtrado." },
      { nome: "Média por colaborador", formula: "Total de horas ÷ colaboradores distintos." },
      { nome: "Por tema, filial e cargo", formula: "Soma das horas de cada grupo, da maior para a menor." }
    ]
  }
];
