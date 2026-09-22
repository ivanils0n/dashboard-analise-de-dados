export type Perfil = "admin" | "analista" | "visitante";

export type Bindings = {
  // URL do Google Apps Script publicado como Web App (ver apps-script/Code.gs).
  APPS_SCRIPT_URL: string;
  // Segredo combinado enviado em toda chamada ao Apps Script (Propriedades do script lá).
  APPS_SCRIPT_SECRET: string;
  JWT_SECRET: string;
  CORS_ORIGIN?: string;
  LOGIN_LIMITER?: RateLimit;
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
