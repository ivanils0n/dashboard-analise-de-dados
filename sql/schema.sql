-- =========================================================
-- Gente & Gestão — Dashboard RH · Schema Supabase (Postgres)
-- Execute este script no SQL Editor do Supabase.
-- Tabelas e colunas em português.
-- Seguro para rodar mais de uma vez: cria apenas o que
-- ainda não existe.
--
-- ESTRUTURA POR ESTADO:
-- Não existem mais tabelas "base". Cada estado (RO, AM, PA)
-- possui tabelas dedicadas para lançamentos, vagas,
-- colaboradores e filiais:
--   lancamentos_{ro,am,pa}  ·  vagas_{ro,am,pa}
--   colaboradores_{ro,am,pa} ·  filiais_{ro,am,pa}
-- Cada informação fica vinculada ao seu estado na própria
-- tabela (coluna estado_sigla ou meta.estado).
-- =========================================================

-- ---------------------------------------------------------
-- 1) TABELA DE ESTADOS (Mestre)
-- ---------------------------------------------------------
create table if not exists public.estados (
  sigla text primary key,
  nome  text not null
);

insert into public.estados (sigla, nome) values
('RO', 'Rondônia'),
('AM', 'Amazonas'),
('PA', 'Pará')
on conflict (sigla) do nothing;

-- ---------------------------------------------------------
-- 2) TABELAS POR ESTADO
--    Cria as 12 tabelas (4 entidades × 3 estados) de forma
--    idempotente, com índices e chaves estrangeiras.
-- ---------------------------------------------------------
do $$
declare
  e text; -- sufixo do estado: ro, am, pa
begin
  foreach e in array array['ro', 'am', 'pa'] loop

    -- Lançamentos dos indicadores (meta guarda o estado: meta.estado)
    execute format('create table if not exists public.%I (
      id           text primary key,
      indicador_id text not null,
      data         date not null,
      valor        double precision not null default 0,
      meta         jsonb,
      criado_em    timestamptz not null default now()
    )', 'lancamentos_' || e);
    execute format('create index if not exists %I on public.%I (indicador_id, data)',
      'lancamentos_' || e || '_indicador_data_idx', 'lancamentos_' || e);

    -- Vagas (Tempo médio de contratação)
    execute format('create table if not exists public.%I (
      id           text primary key,
      nome         text not null,
      aberta_em    timestamptz not null,
      fechada_em   timestamptz,
      estado_sigla text references public.estados(sigla)
    )', 'vagas_' || e);
    execute format('create index if not exists %I on public.%I (estado_sigla)',
      'vagas_' || e || '_estado_idx', 'vagas_' || e);

    -- Colaboradores (aba Equipe)
    execute format('create table if not exists public.%I (
      id             text primary key,
      nome           text not null,
      setor          text not null,
      usuario        text not null,
      estado_sigla   text references public.estados(sigla),
      entrada_em     date,
      status         text not null check (status in (''ativo'', ''desligado'', ''afastado'')),
      tipo           text not null check (tipo in (''efetivado'', ''experiencia'')),
      conta_turnover boolean not null default false,
      criado_em      timestamptz not null default now(),
      atualizado_em  timestamptz,
      desligado_em   timestamptz
    )', 'colaboradores_' || e);
    execute format('create index if not exists %I on public.%I (status)',
      'colaboradores_' || e || '_status_idx', 'colaboradores_' || e);

    -- Filiais (aba Filiais)
    execute format('create table if not exists public.%I (
      id           text primary key,
      id_filial    text not null,
      cnpj         text not null,
      nome         text not null,
      abreviado    text not null,
      gerente      text,
      estado_sigla text references public.estados(sigla),
      criado_em    timestamptz not null default now(),
      atualizado_em timestamptz
    )', 'filiais_' || e);

  end loop;
end $$;

-- =========================================================
-- ROW LEVEL SECURITY
-- O app ainda não tem login: as policies abaixo liberam
-- acesso público (anon key) a todas as tabelas. Quando
-- adicionar autenticação (Supabase Auth), troque por
-- policies baseadas em auth.uid() e remova estas.
-- =========================================================

-- ---- estados ----
alter table public.estados enable row level security;
drop policy if exists "estados_leitura_publica" on public.estados;
create policy "estados_leitura_publica" on public.estados
  for select to anon, authenticated using (true);

-- ---- tabelas por estado (12 tabelas) ----
-- Habilita RLS e cria as mesmas políticas públicas para cada tabela de estado.
do $$
declare
  t text;
  p text;
begin
  foreach t in array array[
    'lancamentos_ro', 'lancamentos_am', 'lancamentos_pa',
    'vagas_ro', 'vagas_am', 'vagas_pa',
    'colaboradores_ro', 'colaboradores_am', 'colaboradores_pa',
    'filiais_ro', 'filiais_am', 'filiais_pa'
  ]
  loop
    execute format('alter table public.%I enable row level security', t);

    p := t || '_leitura_publica';
    execute format('drop policy if exists %I on public.%I', p, t);
    execute format('create policy %I on public.%I for select to anon, authenticated using (true)', p, t);

    p := t || '_insercao_publica';
    execute format('drop policy if exists %I on public.%I', p, t);
    execute format('create policy %I on public.%I for insert to anon, authenticated with check (true)', p, t);

    p := t || '_atualizacao_publica';
    execute format('drop policy if exists %I on public.%I', p, t);
    execute format('create policy %I on public.%I for update to anon, authenticated using (true) with check (true)', p, t);

    p := t || '_exclusao_publica';
    execute format('drop policy if exists %I on public.%I', p, t);
    execute format('create policy %I on public.%I for delete to anon, authenticated using (true)', p, t);
  end loop;
end $$;
