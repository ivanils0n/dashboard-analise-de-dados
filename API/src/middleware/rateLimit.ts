import type { MiddlewareHandler } from "hono";
import { ApiError } from "../utils/errors";
import type { AppEnv } from "../types";

export function loginRateLimit(): MiddlewareHandler<AppEnv> {
  return async (c, next) => {
    const limiter = c.env.LOGIN_LIMITER;
    if (limiter) {
      const ip = c.req.header("CF-Connecting-IP") ?? "unknown";
      const { success } = await limiter.limit({ key: `login:${ip}` });
      if (!success) {
        throw new ApiError(
          429,
          "Muitas tentativas de login. Aguarde 1 minuto e tente novamente.",
          "too_many_requests"
        );
      }
    }
    await next();
  };
}
