export type Perfil = "admin" | "analista" | "visitante";

export type Bindings = {
  APPS_SCRIPT_URL: string;
  APPS_SCRIPT_SECRET: string;
  JWT_SECRET: string;
  GOOGLE_CLIENT_EMAIL?: string;
  GOOGLE_PRIVATE_KEY?: string;
  GOOGLE_SHEET_ID?: string;
  CORS_ORIGIN?: string;
  LOGIN_LIMITER?: RateLimit;
  CACHE: KVNamespace;
  SHEET_WRITER?: DurableObjectNamespace<import("../db/sheetWriter").SheetWriter>;
};

export type TokenPayload = {
  sub: string;
  usuario: string;
  nome: string;
  perfil: Perfil;
  iat: number;
  exp: number;
};

export type TokenInput = Omit<TokenPayload, "iat" | "exp">;

export type Variables = {
  user: TokenPayload;
};

export type AppEnv = {
  Bindings: Bindings;
  Variables: Variables;
};

export type Pagination = {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
};
