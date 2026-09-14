// Metadados das tabelas por estado (fonte: sql/schema.sql).
// Usados para validar entradas e montar queries sempre com nomes/colunas da allowlist.

export const ESTADOS = ["RO", "AM", "PA"] as const;
export type Estado = (typeof ESTADOS)[number];

export function normalizeEstado(value: string | undefined | null): Estado | null {
  if (!value) return null;
  const upper = value.toUpperCase();
  return (ESTADOS as readonly string[]).includes(upper) ? (upper as Estado) : null;
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
  colaboradores: {
    key: "colaboradores",
    label: "Colaboradores",
    hasUpdatedAt: true,
    orderBy: "criado_em desc",
    search: ["nome", "usuario", "cargo"],
    filters: [
      { param: "status", column: "status", kind: "eq" },
      { param: "setor", column: "setor", kind: "ilike" },
      { param: "cargo", column: "cargo", kind: "ilike" },
      { param: "department_id", column: "department_id", kind: "eq" },
      { param: "filial_id", column: "filial_id", kind: "eq" },
      { param: "tipo", column: "tipo", kind: "eq" }
    ],
    columns: [
      { name: "id", type: "text" },
      { name: "nome", type: "text", required: true },
      { name: "setor", type: "text", required: true },
      { name: "cargo", type: "text" },
      { name: "usuario", type: "text", required: true },
      { name: "estado_sigla", type: "text", stateRef: true },
      { name: "salario", type: "number" },
      { name: "department_id", type: "text" },
      { name: "filial_id", type: "text" },
      { name: "lider_imediato", type: "text" },
      { name: "gerente_regional", type: "text" },
      { name: "regional", type: "text" },
      { name: "vale_transporte", type: "number" },
      { name: "vale_alimentacao", type: "number" },
      { name: "inss", type: "number" },
      { name: "fgts", type: "number" },
      { name: "irrf", type: "number" },
      { name: "premio_art_62", type: "number" },
      { name: "premio_loja", type: "number" },
      { name: "comissao", type: "number" },
      { name: "entrada_em", type: "date" },
      {
        name: "status",
        type: "text",
        required: true,
        values: ["ativo", "desligado", "afastado"]
      },
      { name: "tipo", type: "text", required: true, values: ["efetivado", "experiencia"] },
      { name: "conta_turnover", type: "boolean", notNull: true },
      { name: "criado_em", type: "timestamptz", readOnly: true },
      { name: "atualizado_em", type: "timestamptz", readOnly: true },
      { name: "desligado_em", type: "timestamptz" }
    ]
  },
  vagas: {
    key: "vagas",
    label: "Vagas",
    orderBy: "aberta_em desc",
    search: ["nome"],
    filters: [
      { param: "tipo_contratacao", column: "tipo_contratacao", kind: "eq" },
      { param: "filial_id", column: "filial_id", kind: "eq" },
      { param: "aberta", column: "fechada_em", kind: "isnull" }
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
  departamentos: {
    key: "departamentos",
    label: "Departamentos",
    hasUpdatedAt: true,
    orderBy: "criado_em desc",
    search: ["nome", "sigla"],
    filters: [],
    columns: [
      { name: "id", type: "text" },
      { name: "nome", type: "text", required: true },
      { name: "sigla", type: "text" },
      { name: "estado_sigla", type: "text", stateRef: true },
      { name: "criado_em", type: "timestamptz", readOnly: true },
      { name: "atualizado_em", type: "timestamptz", readOnly: true }
    ]
  },
  lancamentos: {
    key: "lancamentos",
    label: "Lançamentos",
    orderBy: "data desc, criado_em desc",
    search: ["indicador_id"],
    filters: [
      { param: "indicador_id", column: "indicador_id", kind: "eq" },
      { param: "data_de", column: "data", kind: "gte" },
      { param: "data_ate", column: "data", kind: "lte" }
    ],
    columns: [
      { name: "id", type: "text" },
      { name: "indicador_id", type: "text", required: true },
      { name: "data", type: "date", required: true },
      { name: "valor", type: "number", notNull: true },
      { name: "meta", type: "json" },
      { name: "criado_em", type: "timestamptz", readOnly: true }
    ]
  }
};

export const ENTITY_KEYS = Object.keys(ENTITIES);

export function tableName(entityKey: string, estado: Estado): string {
  return `${entityKey}_${estado.toLowerCase()}`;
}

// Valida nomes no formato "colaboradores_ro" usados pelo endpoint em lote.
export function parseStateTable(table: string): { entityKey: string; estado: Estado } | null {
  const match = /^([a-z]+)_(ro|am|pa)$/.exec(table);
  if (!match) return null;
  const entityKey = match[1];
  if (!(entityKey in ENTITIES)) return null;
  return { entityKey, estado: normalizeEstado(match[2]) as Estado };
}
