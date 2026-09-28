// Erro controlado da API: a mensagem pode ser mostrada ao cliente.
export class ApiError extends Error {
  readonly status: number;
  readonly code?: string;

  constructor(status: number, message: string, code?: string) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
  }
}

export function badRequest(message: string, code = "bad_request") {
  return new ApiError(400, message, code);
}

export function notFound(message = "Registro não encontrado.") {
  return new ApiError(404, message, "not_found");
}
