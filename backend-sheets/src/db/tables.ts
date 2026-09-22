// Metadados das tabelas por estado (fonte: sql/schema.sql).
// Usados para validar entradas e montar queries sempre com nomes/colunas da allowlist.

export const ESTADOS = ["RO", "AM", "PA"] as const;
export type Estado = (typeof ESTADOS)[number];

// Sentinela usado nas rotas de leitura para "sem filtro de estado" — desde a
// consolidação das abas (uma só por entidade, com a coluna estado_sigla
// distinguindo RO/AM/PA), isso permite ler os 3 estados numa única chamada ao
// Apps Script em vez de 3. Nunca aceito em escrita (criar/editar sem saber o
// estado seria ambíguo).
export const ESTADO_TODOS = "TODOS" as const;
export type EstadoFiltro = Estado | typeof ESTADO_TODOS;

export function normalizeEstado(value: string | undefined | null): Estado | null {
  if (!value) return null;
  const upper = value.toUpperCase();
  return (ESTADOS as readonly string[]).includes(upper) ? (upper as Estado) : null;
}

export function normalizeEstadoFiltro(value: string | undefined | null): EstadoFiltro | null {
  if (!value) return null;
  if (value.toUpperCase() === ESTADO_TODOS) return ESTADO_TODOS;
  return normalizeEstado(value);
}

export type ColumnType = "text" | "number" | "boolean" | "date" | "timestamptz" | "json";
export type FilterKind = "eq" | "ilike" | "gte" | "lte" | "isnull";

export type ColumnDef = {
  name: string;
  type: ColumnType;
  required?: boolean;
  readOnly?: boolean;
  notNull?: boolean;
  values?: readonly string[];
  stateRef?: boolean;
};

export type FilterDef = {
  param: string;
  column: string;
  kind: FilterKind;
};

export type EntityDef = {
  key: string;
  label: string;
  columns: ColumnDef[];
  filters: FilterDef[];
  search: string[];
  orderBy: string;
  hasUpdatedAt?: boolean;
};

export const ENTITIES: Record<string, EntityDef> = {
  vagas: {
    key: "vagas",
    label: "Vagas",
    orderBy: "aberta_em desc",
    search: ["nome"],
    filters: [
      { param: "tipo_contratacao", column: "tipo_contratacao", kind: "eq" },
      { param: "filial_id", column: "filial_id", kind: "eq" },
      { param: "aberta", column: "fechada_em", kind: "isnull" },
      // Filtro por período de abertura (também disponível a quem consome a API).
      { param: "data_de", column: "aberta_em", kind: "gte" },
      { param: "data_ate", column: "aberta_em", kind: "lte" }
    ],
    columns: [
      { name: "id", type: "text" },
      { name: "nome", type: "text", required: true },
      { name: "aberta_em", type: "timestamptz", required: true },
      { name: "fechada_em", type: "timestamptz" },
      { name: "salario", type: "number" },
      { name: "tipo_contratacao", type: "text", values: ["clt", "pj"] },
      { name: "filial_id", type: "text" },
      { name: "estado_sigla", type: "text", stateRef: true }
    ]
  },
  headcount: {
    key: "headcount",
    label: "Headcount",
    orderBy: "mes_referencia desc",
    search: ["codigo", "colaborador", "funcao"],
    filters: [
      { param: "data_de", column: "mes_referencia", kind: "gte" },
      { param: "data_ate", column: "mes_referencia", kind: "lte" }
    ],
    columns: [
      { name: "id", type: "text" },
      { name: "codigo", type: "text" },
      { name: "colaborador", type: "text", required: true },
      { name: "funcao", type: "text" },
      { name: "remuneracao", type: "number" },
      { name: "data_admissao", type: "date" },
      { name: "mes_referencia", type: "date", required: true },
      { name: "status", type: "text", values: ["ativo", "demitido"], notNull: true },
      { name: "demitido_mes", type: "date" },
      { name: "filial_id", type: "text" },
      { name: "estado_sigla", type: "text", stateRef: true }
    ]
  },
  turnover: {
    key: "turnover",
    label: "Turnover",
    orderBy: "mes_referencia desc",
    search: [],
    filters: [
      { param: "filial_id", column: "filial_id", kind: "eq" },
      { param: "data_de", column: "mes_referencia", kind: "gte" },
      { param: "data_ate", column: "mes_referencia", kind: "lte" }
    ],
    columns: [
      { name: "id", type: "text" },
      { name: "filial_id", type: "text" },
      { name: "mes_referencia", type: "date", required: true },
      { name: "admitidos", type: "number", notNull: true },
      { name: "demitidos", type: "number", notNull: true },
      { name: "ativos", type: "number", notNull: true },
      { name: "estado_sigla", type: "text", stateRef: true }
    ]
  },
  permanencia: {
    key: "permanencia",
    label: "Tempo médio de permanência",
    orderBy: "data_demissao desc",
    search: ["colaborador"],
    filters: [
      { param: "filial_id", column: "filial_id", kind: "eq" },
      { param: "data_de", column: "data_demissao", kind: "gte" },
      { param: "data_ate", column: "data_demissao", kind: "lte" }
    ],
    columns: [
      { name: "id", type: "text" },
      { name: "colaborador", type: "text", required: true },
      { name: "data_admissao", type: "date", required: true },
      { name: "data_demissao", type: "date", required: true },
      { name: "filial_id", type: "text" },
      { name: "estado_sigla", type: "text", stateRef: true }
    ]
  },
  filiais: {
    key: "filiais",
    label: "Filiais",
    hasUpdatedAt: true,
    orderBy: "criado_em desc",
    search: ["nome", "abreviado", "cnpj", "id_filial"],
    filters: [{ param: "gerente", column: "gerente", kind: "ilike" }],
    columns: [
      { name: "id", type: "text" },
      { name: "id_filial", type: "text", required: true },
      { name: "cnpj", type: "text", required: true },
      { name: "nome", type: "text", required: true },
      { name: "abreviado", type: "text", required: true },
      { name: "gerente", type: "text" },
      { name: "estado_sigla", type: "text", stateRef: true },
      { name: "criado_em", type: "timestamptz", readOnly: true },
      { name: "atualizado_em", type: "timestamptz", readOnly: true }
    ]
  },
  // Substituem a antiga tabela genérica "lancamentos" (indicador_id + meta
  // json): cada indicador manual agora tem colunas tipadas próprias. Custo de
  // contratação não tem aba — é calculado ao vivo a partir de "vagas".
  diarias: {
    key: "diarias",
    label: "Diárias",
    orderBy: "competencia desc",
    search: ["nome_colaborador"],
    filters: [
      { param: "data_de", column: "competencia", kind: "gte" },
      { param: "data_ate", column: "competencia", kind: "lte" }
    ],
    columns: [
      { name: "id", type: "text" },
      { name: "nome_colaborador", type: "text", required: true },
      { name: "funcao", type: "text" },
      { name: "departamento", type: "text" },
      { name: "filial", type: "text" },
      { name: "lider_imediato", type: "text" },
      { name: "gerente_regional", type: "text" },
      { name: "regional", type: "text" },
      { name: "motivo", type: "text" },
      { name: "competencia", type: "date", required: true },
      { name: "sem_periodo", type: "boolean", notNull: true },
      { name: "valor", type: "number", notNull: true, required: true },
      { name: "estado_sigla", type: "text", stateRef: true }
    ]
  },
  treinamentos: {
    key: "treinamentos",
    label: "Treinamentos",
    orderBy: "competencia desc",
    search: ["nome_colaborador"],
    filters: [
      { param: "data_de", column: "competencia", kind: "gte" },
      { param: "data_ate", column: "competencia", kind: "lte" }
    ],
    columns: [
      { name: "id", type: "text" },
      { name: "nome_colaborador", type: "text", required: true },
      { name: "cargo", type: "text" },
      // Sem coluna própria de sigla: o gráfico por filial (useDashboardData.js
      // -> treinamentoFilialLabel) agrupa comparando este texto com o
      // cadastro de Filiais.
      { name: "filial", type: "text" },
      { name: "tema", type: "text" },
      { name: "modalidade", type: "text", values: ["Presencial", "Online"] },
      { name: "competencia", type: "date", required: true },
      // Única fonte de carga horária (antes havia "value" + "meta.cargaHoraria"
      // redundantes — ver comentário no frontend/useDashboardData.js).
      { name: "horas", type: "number", notNull: true, required: true },
      { name: "estado_sigla", type: "text", stateRef: true }
    ]
  },
  custo_folha: {
    key: "custo_folha",
    label: "Custo de folha de salário",
    orderBy: "competencia desc",
    search: ["razao_social", "filial_cnpj"],
    filters: [
      { param: "cnpj", column: "filial_cnpj", kind: "eq" },
      { param: "data_de", column: "competencia", kind: "gte" },
      { param: "data_ate", column: "competencia", kind: "lte" }
    ],
    columns: [
      { name: "id", type: "text" },
      // Sem FK pra Filiais: guarda CNPJ e razão social direto, do mesmo jeito
      // que o modal de Custo de Folha já busca/mostra (ver LaunchModal.vue).
      { name: "filial_cnpj", type: "text", required: true },
      { name: "razao_social", type: "text", required: true },
      { name: "percent", type: "number" },
      { name: "competencia", type: "date", required: true },
      { name: "valor", type: "number", notNull: true, required: true },
      { name: "estado_sigla", type: "text", stateRef: true }
    ]
  },
  absenteismo: {
    key: "absenteismo",
    label: "Absenteísmo",
    orderBy: "competencia desc",
    search: [],
    filters: [
      { param: "data_de", column: "competencia", kind: "gte" },
      { param: "data_ate", column: "competencia", kind: "lte" }
    ],
    columns: [
      { name: "id", type: "text" },
      { name: "competencia", type: "date", required: true },
      { name: "valor", type: "number", notNull: true, required: true },
      { name: "estado_sigla", type: "text", stateRef: true }
    ]
  },
  // Marcação de "mês incompleto" (ver src/lib/monthStatus.js no frontend):
  // a existência de uma linha para o mês+estado já é o marcador, sem mais
  // nenhum dado — também vivia na antiga "lancamentos" genérica.
  meses_incompletos: {
    key: "meses_incompletos",
    label: "Meses incompletos",
    orderBy: "competencia desc",
    search: [],
    filters: [],
    columns: [
      { name: "id", type: "text" },
      { name: "competencia", type: "date", required: true },
      { name: "estado_sigla", type: "text", stateRef: true }
    ]
  }
};

export const ENTITY_KEYS = Object.keys(ENTITIES);

// Uma aba por entidade (não mais uma por entidade x estado): quem separa RO/AM/PA
// agora é a coluna estado_sigla dentro da própria aba, não o nome dela.
export function tableName(entityKey: string): string {
  return entityKey;
}

// Valida os nomes usados pelo endpoint em lote (sincronização do frontend):
// "vagas_ro" (um estado) ou "vagas" puro (todos os estados, só para leitura —
// ver ESTADO_TODOS em routes/data.ts). Checa o nome inteiro contra ENTITIES
// antes de tentar separar um sufixo de estado — necessário porque algumas
// chaves de entidade já têm "_" no nome (ex.: "custo_folha"), então uma regex
// genérica não dá pra distinguir "custo_folha" de "custo_folha_ro" sem
// primeiro validar contra a lista real de entidades.
export function parseStateTable(
  table: string
): { entityKey: string; estado: EstadoFiltro } | null {
  if (table in ENTITIES) return { entityKey: table, estado: ESTADO_TODOS };
  const match = /^(.+)_(ro|am|pa)$/.exec(table);
  if (!match) return null;
  const entityKey = match[1];
  if (!(entityKey in ENTITIES)) return null;
  return { entityKey, estado: normalizeEstado(match[2]) as Estado };
}

// Aba "usuarios" — não é um recurso por estado, então fica fora de ENTITIES.
export const USERS_SHEET = "usuarios";
export const USERS_COLUMNS: ColumnDef[] = [
  { name: "id", type: "text" },
  { name: "usuario", type: "text", required: true },
  { name: "nome", type: "text", required: true },
  { name: "perfil", type: "text", required: true, values: ["admin", "analista", "visitante"] },
  { name: "ativo", type: "boolean", notNull: true },
  { name: "senha_hash", type: "text", required: true },
  { name: "criado_em", type: "timestamptz", readOnly: true }
];
