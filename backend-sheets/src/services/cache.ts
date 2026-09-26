import { ENTITY_KEYS, tableName, USERS_SHEET } from "../db/tables";
import { isFresh, readManyCachedSheets } from "../db/cache";
import { refreshCachedSheets } from "../db/sheets";
import type { Bindings } from "../types";

// Todas as abas cacheadas: uma por entidade (dados do dashboard) + a de
// usuários (login/perfil) — cachear "usuarios" é o que acelera o login, já
// que ele deixa de bater no Apps Script a cada tentativa.
export function allCachedSheetNames(): string[] {
  return [...ENTITY_KEYS.map(tableName), USERS_SHEET];
}

// Refresh manual (admin): busca tudo de novo e reseta a contagem de todas as
// abas para "agora", ignorando se já estavam frescas ou não.
export async function refreshAllCaches(env: Bindings) {
  return refreshCachedSheets(env, allCachedSheetNames());
}

// Refresh automático (cron a cada 5 min, ver wrangler.jsonc): só busca de novo
// o que já venceu (5 min desde a última atualização, seja do cron anterior ou
// de um refresh manual do admin) — é isso que faz a contagem "recomeçar" a
// partir do último refresh em vez de seguir um relógio fixo.
export async function refreshStaleCaches(env: Bindings) {
  const names = allCachedSheetNames();
  // Uma única ida à KV para checar as ~12 abas, em vez de uma leitura por aba.
  const cached = await readManyCachedSheets(env, names);
  const stale = names.filter((name) => {
    const entry = cached[name];
    return !entry || !isFresh(entry);
  });

  if (!stale.length) return { refreshed: [], errors: {} };
  return refreshCachedSheets(env, stale);
}
