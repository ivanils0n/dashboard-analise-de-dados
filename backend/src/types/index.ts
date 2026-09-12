export type Perfil = "admin" | "analista" | "visitante";

export type Bindings = {
  DATABASE_URL: string;
  JWT_SECRET: string;
  CORS_ORIGIN?: string;
};

export type TokenPayload = {
  sub: string;
  email: string;
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
