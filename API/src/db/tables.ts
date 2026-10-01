export const ESTADOS = ["RO", "AM", "PA"] as const;
export type Estado = (typeof ESTADOS)[number];

export const ESTADO_TODOS = "TODOS" as const;
export type EstadoFiltro = Estado | typeof ESTADO_TODOS;

export function normalizeEstado(value: string | undefined | null): Estado | null {
  if (!value) return null;
  const upper = value.toUpperCase();
  return (ESTADOS as readonly string[]).includes(upper) ? (upper as Estado) : null;
}

export type ColumnType = "text" | "number" | "boolean" | "date" | "timestamptz" | "json";

export type ColumnDef = {
  name: string;
  type: ColumnType;
  required?: boolean;
  readOnly?: boolean;
  notNull?: boolean;
  values?: readonly string[];
  stateRef?: boolean;
};

export type EntityDef = {
  key: string;
  label: string;
  columns: ColumnDef[];
};

export const ENTITIES: Record<string, EntityDef> = {
  vagas: {
    key: "vagas",
    label: "Vagas",
    columns: [
      { name: "id", type: "text" },
      { name: "nome", type: "text", required: true },
      { name: "aberta_em", type: "timestamptz", required: true },
      { name: "fechada_em", type: "timestamptz" },
      { name: "salario", type: "number" },
      { name: "tipo_contratacao", type: "text", values: ["clt", "pj"] },
      { name: "filial", type: "text" },
      { name: "estado_sigla", type: "text", stateRef: true },
      { name: "recrutador", type: "text" },
      { name: "motivo_contratacao", type: "text" }
    ]
  },
  headcount: {
    key: "headcount",
    label: "Headcount",
    columns: [
      { name: "id", type: "text" },
      { name: "codigo", type: "text" },
      { name: "colaborador", type: "text", required: true },
      { name: "funcao", type: "text" },
      { name: "data_admissao", type: "date", required: true },
      { name: "genero", type: "text", values: ["masculino", "feminino"] },
      { name: "data_desligamento", type: "date" },
      { name: "mes_referente", type: "date", required: true },
      { name: "empresa", type: "text" },
      { name: "filial", type: "text" },
      { name: "estado_sigla", type: "text", stateRef: true }
    ]
  },
  rescisoes: {
    key: "rescisoes",
    label: "Rescisões",
    columns: [
      { name: "id", type: "text" },
      { name: "empresa", type: "text" },
      { name: "estado", type: "text", stateRef: true },
      { name: "colaborador", type: "text", required: true },
      { name: "filial", type: "text" },
      { name: "funcao", type: "text" },
      { name: "admissao", type: "date" },
      { name: "gerente_imediato", type: "text" },
      { name: "regional", type: "text" },
      { name: "motivo", type: "text" },
      { name: "justificativa_apurada", type: "text" },
      { name: "ponderacoes", type: "text" },
      { name: "ult_dia_aviso", type: "date" },
      { name: "valor_rescisao", type: "number" },
      { name: "grrf_consig", type: "number" },
      { name: "multa_40", type: "number" },
      { name: "mes_referencia", type: "date" }
    ]
  },
  filiais: {
    key: "filiais",
    label: "Filiais",
    columns: [
      { name: "id", type: "text" },
      { name: "cnpj", type: "text", required: true },
      { name: "nome", type: "text", required: true },
      { name: "abreviado", type: "text", required: true },
      { name: "gerente", type: "text" },
      { name: "estado_sigla", type: "text", stateRef: true }
    ]
  },
  diarias: {
    key: "diarias",
    label: "Diárias",
    columns: [
      { name: "id", type: "text" },
      { name: "nome_colaborador", type: "text", required: true },
      { name: "funcao", type: "text" },
      { name: "filial", type: "text" },
      { name: "lider_imediato", type: "text" },
      { name: "regional", type: "text" },
      { name: "motivo", type: "text" },
      { name: "competencia", type: "date", required: true },
      { name: "valor", type: "number", notNull: true, required: true },
      { name: "estado_sigla", type: "text", stateRef: true }
    ]
  },
  treinamentos: {
    key: "treinamentos",
    label: "Treinamentos",
    columns: [
      { name: "id", type: "text" },
      { name: "nome_colaborador", type: "text", required: true },
      { name: "cargo", type: "text" },
      { name: "filial", type: "text" },
      { name: "gerente_regional", type: "text" },
      { name: "tema", type: "text" },
      { name: "modalidade", type: "text", values: ["Presencial", "Online"] },
      { name: "competencia", type: "date", required: true },
      { name: "horas", type: "number", notNull: true, required: true },
      { name: "estado_sigla", type: "text", stateRef: true }
    ]
  },
  custo_folha: {
    key: "custo_folha",
    label: "Custo de Pessoal",
    columns: [
      { name: "id", type: "text" },
      { name: "codigo", type: "text" },
      { name: "nome", type: "text", required: true },
      { name: "banco", type: "text" },
      { name: "valor_total", type: "number", notNull: true, required: true },
      { name: "data_pagto", type: "date" },
      { name: "empresa", type: "text" },
      { name: "filial", type: "text" },
      { name: "mes_referente", type: "date", required: true },
      { name: "estado_sigla", type: "text", stateRef: true }
    ]
  },
  ferias: {
    key: "ferias",
    label: "Férias",
    columns: [
      { name: "id", type: "text" },
      { name: "codigo", type: "text" },
      { name: "nome", type: "text", required: true },
      { name: "banco", type: "text" },
      { name: "valor_total", type: "number", notNull: true, required: true },
      { name: "data_pagto", type: "date" },
      { name: "filial", type: "text" },
      { name: "mes_referente", type: "date", required: true },
      { name: "estado_sigla", type: "text", stateRef: true }
    ]
  },
  absenteismo: {
    key: "absenteismo",
    label: "Absenteísmo",
    columns: [
      { name: "id", type: "text" },
      { name: "competencia", type: "date", required: true },
      { name: "estado_sigla", type: "text", stateRef: true },
      { name: "colaborador", type: "text" },
      { name: "setor", type: "text" },
      { name: "filial", type: "text" },
      { name: "data", type: "date" },
      { name: "motivo", type: "text", values: ["Falta", "Atestado", "Suspensão", "Presente"] },
      { name: "observacao", type: "text" },
      { name: "advertencia", type: "boolean" },
      { name: "acidente_trabalho", type: "boolean" }
    ]
  }
};

export const ENTITY_KEYS = Object.keys(ENTITIES);

export function tableName(entityKey: string): string {
  return entityKey;
}

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
