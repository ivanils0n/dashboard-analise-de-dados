-- =============================================================================
-- DELTA SYNC — sincronização incremental (economia de egress)
-- -----------------------------------------------------------------------------
-- O frontend guarda cada registro do banco em sua própria chave do localStorage
-- (ggd:<tabela>:<id>). Ao recarregar, ele chama gg_delta_sync(p_versao) e recebe
-- SOMENTE os itens alterados (upsert) ou removidos (delete) desde a última
-- versão sincronizada. Aplica-se então:
--   delete -> localStorage.removeItem(id)
--   upsert -> localStorage.setItem(id, dados)
-- Nada de recarregar a lista inteira quando um único item mudou.
--
-- Implementação no banco (outbox/CDC):
--   • registro_alteracoes : changelog com INSERT/UPDATE/DELETE por registro
--   • registrar_alteracao(): função disparada por trigger em cada tabela
--   • gg_delta_sync(p_versao) : alterações após a versão informada
--   • gg_delta_versao()       : versão atual (máximo id do changelog)
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1) CHANGELOG (outbox)
-- -----------------------------------------------------------------------------
create table if not exists public.registro_alteracoes (
  id           bigint generated always as identity primary key,
  tabela       text not null,
  registro_id  text not null,
  operacao     text not null check (operacao in ('upsert', 'delete')),
  dados        jsonb,
  criado_em    timestamptz not null default now()
);

create index if not exists idx_registro_alteracoes_id on public.registro_alteracoes (id);

-- -----------------------------------------------------------------------------
-- 2) FUNÇÃO DISPARADA POR TRIGGER
--    security definer: executa como dono, registrando a alteração mesmo quando
--    o usuário autenticado não tem INSERT direto no changelog.
-- -----------------------------------------------------------------------------
create or replace function public.registrar_alteracao()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tabela text := TG_TABLE_NAME;
begin
  if TG_OP = 'DELETE' then
    insert into public.registro_alteracoes (tabela, registro_id, operacao, dados)
    values (v_tabela, OLD.id::text, 'delete', null);
    return OLD;
  end if;

  insert into public.registro_alteracoes (tabela, registro_id, operacao, dados)
  values (v_tabela, NEW.id::text, 'upsert', to_jsonb(NEW));

  if TG_OP = 'INSERT' then return NEW; end if;
  return NEW;
end;
$$;

-- -----------------------------------------------------------------------------
-- 3) TRIGGERS NAS 15 TABELAS POR ESTADO
-- -----------------------------------------------------------------------------
do $$
declare
  t text;
begin
  foreach t in array array[
    'lancamentos_ro',   'lancamentos_am',   'lancamentos_pa',
    'vagas_ro',         'vagas_am',         'vagas_pa',
    'colaboradores_ro', 'colaboradores_am', 'colaboradores_pa',
    'filiais_ro',       'filiais_am',       'filiais_pa',
    'departamentos_ro', 'departamentos_am', 'departamentos_pa'
  ] loop
    execute format('drop trigger if exists %I on public.%I', 'trg_alteracao_' || t, t);
    execute format('create trigger %I after insert or update or delete on public.%I
      for each row execute function public.registrar_alteracao()',
      'trg_alteracao_' || t, t);
  end loop;
end $$;

-- -----------------------------------------------------------------------------
-- 4) RPCs DO DELTA
-- -----------------------------------------------------------------------------
create or replace function public.gg_delta_sync(p_versao bigint default 0)
returns table (versao_atual bigint, tabela text, registro_id text, operacao text, dados jsonb)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_atual bigint;
begin
  select coalesce(max(id), 0) into v_atual from public.registro_alteracoes;
  return query
    select v_atual, r.tabela, r.registro_id, r.operacao, r.dados
      from public.registro_alteracoes r
     where r.id > p_versao
     order by r.id;
end;
$$;

create or replace function public.gg_delta_versao()
returns bigint
language sql
security definer
set search_path = public
stable
as $$
  select coalesce(max(id), 0) from public.registro_alteracoes;
$$;

revoke all on function public.gg_delta_sync(bigint) from public;
grant execute on function public.gg_delta_sync(bigint) to authenticated;

revoke all on function public.gg_delta_versao() from public;
grant execute on function public.gg_delta_versao() to authenticated;

-- -----------------------------------------------------------------------------
-- NOTA DE RETENÇÃO
-- -----------------------------------------------------------------------------
-- O changelog cresce conforme há escritas (irrelevante para poucos registros).
-- Se precisar podar o histórico antigo com segurança, aguarde todos os clientes
-- sincronizarem e rode, por exemplo:
--   delete from public.registro_alteracoes
--    where id < (select coalesce(max(id), 0) from public.registro_alteracoes) - 10000;
