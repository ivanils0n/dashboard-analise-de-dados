-- =============================================================================
-- gg_dados_hash() — RPC de revalidação leve do cache (utilitário)
-- -----------------------------------------------------------------------------
-- NOTA: o cache local atual usa Delta Sync (sql/05_delta_sync.sql) com payload
-- incremental. Esta função permanece disponível como utilitário/fallback, mas
-- não é mais chamada pelo frontend.
-- -----------------------------------------------------------------------------
-- Retorna um hash (md5) de todos os dados relevantes, calculado no banco.
-- O frontend guarda esse hash junto com o cache em localStorage e, ao recarregar
-- a página, chama apenas esta função (payload mínimo) para decidir se os dados
-- mudaram. Sem mudanças, o cache local é reutilizado — reduzindo o egress.
--
-- Tabelas ausentes (ex.: departamentos_* ainda não criadas) são ignoradas.
-- =============================================================================

create or replace function public.gg_dados_hash()
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  tables text[] := array[
    'lancamentos_ro',   'lancamentos_am',   'lancamentos_pa',
    'vagas_ro',         'vagas_am',         'vagas_pa',
    'colaboradores_ro', 'colaboradores_am', 'colaboradores_pa',
    'filiais_ro',       'filiais_am',       'filiais_pa',
    'departamentos_ro', 'departamentos_am', 'departamentos_pa'
  ];
  t      text;
  r      text;
  parts  text[] := array[]::text[];
begin
  foreach t in array tables loop
    if to_regclass('public.' || t) is not null then
      execute format(
        $q$
          select coalesce(
            md5(string_agg(linha.ct::text, ';' order by linha.ct::text)),
            ''
          )
          from (select t as ct from public.%I t) linha
        $q$,
        t
      ) into r;
      parts := parts || (t || '=' || r);
    end if;
  end loop;

  return md5(array_to_string(parts, '|'));
end;
$$;

revoke all on function public.gg_dados_hash() from public;
grant execute on function public.gg_dados_hash() to authenticated, anon, service_role;
