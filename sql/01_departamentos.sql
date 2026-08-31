-- =============================================================================
-- DEPARTAMENTOS — nova aba de gestão de departamentos
-- -----------------------------------------------------------------------------
-- Segue a mesma estratégia de "tabelas por estado" já usada por colaboradores,
-- filiais, vagas e lançamentos: departamentos_ro, departamentos_am, departamentos_pa.
--
-- Cada departamento pertence a UM estado (estado_sigla) e é usado como "setor"
-- do colaborador. O campo `sigla` é opcional (abreviação do departamento).
--
-- Idempotente: pode rodar mais de uma vez.
-- Execute depois do sql/schema.sql (base).
-- =============================================================================

do $$
declare
  e text; -- sufixo do estado: ro, am, pa
begin
  foreach e in array array['ro', 'am', 'pa'] loop
    execute format('create table if not exists public.%I (
      id            text primary key,
      nome          text not null,
      sigla         text,
      estado_sigla  text references public.estados(sigla),
      criado_em     timestamptz not null default now(),
      atualizado_em timestamptz
    )', 'departamentos_' || e);
    execute format('create index if not exists %I on public.%I (estado_sigla)',
      'departamentos_' || e || '_estado_idx', 'departamentos_' || e);
  end loop;
end $$;

-- -----------------------------------------------------------------------------
-- RLS — mesmas regras das demais tabelas por estado:
-- leitura para autenticados; escrita somente admin/analista.
-- -----------------------------------------------------------------------------
do $$
declare
  t text;
  p text;
begin
  foreach t in array array['departamentos_ro', 'departamentos_am', 'departamentos_pa'] loop
    execute format('alter table public.%I enable row level security', t);

    execute format('drop policy if exists %I on public.%I', t || '_leitura_publica', t);
    execute format('drop policy if exists %I on public.%I', t || '_insercao_publica', t);
    execute format('drop policy if exists %I on public.%I', t || '_atualizacao_publica', t);
    execute format('drop policy if exists %I on public.%I', t || '_exclusao_publica', t);

    p := t || '_leitura_autenticada';
    execute format('drop policy if exists %I on public.%I', p, t);
    execute format('create policy %I on public.%I for select to authenticated using (true)', p, t);

    p := t || '_insercao_gestor';
    execute format('drop policy if exists %I on public.%I', p, t);
    execute format('create policy %I on public.%I for insert to authenticated with check (public.user_perfil() in (''admin'', ''analista''))', p, t);

    p := t || '_atualizacao_gestor';
    execute format('drop policy if exists %I on public.%I', p, t);
    execute format('create policy %I on public.%I for update to authenticated using (public.user_perfil() in (''admin'', ''analista'')) with check (public.user_perfil() in (''admin'', ''analista''))', p, t);

    p := t || '_exclusao_gestor';
    execute format('drop policy if exists %I on public.%I', p, t);
    execute format('create policy %I on public.%I for delete to authenticated using (public.user_perfil() in (''admin'', ''analista''))', p, t);
  end loop;
end $$;
