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

-- ---------------------------------------------------------
-- SINCRONIZAÇÃO DE COLUNAS
-- ---------------------------------------------------------
-- Tabelas criadas por versões anteriores podem não ter todas
-- as colunas esperadas pelo app (ex.: estado_sigla). Este bloco
-- adiciona as colunas faltantes sem destruir os dados existentes.
do $$
declare
  e text;
begin
  foreach e in array array['ro', 'am', 'pa'] loop

    -- Lançamentos dos indicadores
    execute format('alter table public.%I add column if not exists indicador_id text', 'lancamentos_' || e);
    execute format('alter table public.%I add column if not exists data date', 'lancamentos_' || e);
    execute format('alter table public.%I add column if not exists valor double precision', 'lancamentos_' || e);
    execute format('alter table public.%I add column if not exists meta jsonb', 'lancamentos_' || e);
    execute format('alter table public.%I add column if not exists criado_em timestamptz', 'lancamentos_' || e);

    -- Vagas
    execute format('alter table public.%I add column if not exists nome text', 'vagas_' || e);
    execute format('alter table public.%I add column if not exists aberta_em timestamptz', 'vagas_' || e);
    execute format('alter table public.%I add column if not exists fechada_em timestamptz', 'vagas_' || e);
    execute format('alter table public.%I add column if not exists estado_sigla text references public.estados(sigla)', 'vagas_' || e);

    -- Colaboradores
    execute format('alter table public.%I add column if not exists nome text', 'colaboradores_' || e);
    execute format('alter table public.%I add column if not exists setor text', 'colaboradores_' || e);
    execute format('alter table public.%I add column if not exists usuario text', 'colaboradores_' || e);
    execute format('alter table public.%I add column if not exists estado_sigla text references public.estados(sigla)', 'colaboradores_' || e);
    execute format('alter table public.%I add column if not exists entrada_em date', 'colaboradores_' || e);
    execute format('alter table public.%I add column if not exists status text', 'colaboradores_' || e);
    execute format('alter table public.%I add column if not exists tipo text', 'colaboradores_' || e);
    execute format('alter table public.%I add column if not exists conta_turnover boolean', 'colaboradores_' || e);
    execute format('alter table public.%I add column if not exists criado_em timestamptz', 'colaboradores_' || e);
    execute format('alter table public.%I add column if not exists atualizado_em timestamptz', 'colaboradores_' || e);
    execute format('alter table public.%I add column if not exists desligado_em timestamptz', 'colaboradores_' || e);

    -- Filiais
    execute format('alter table public.%I add column if not exists id_filial text', 'filiais_' || e);
    execute format('alter table public.%I add column if not exists cnpj text', 'filiais_' || e);
    execute format('alter table public.%I add column if not exists nome text', 'filiais_' || e);
    execute format('alter table public.%I add column if not exists abreviado text', 'filiais_' || e);
    execute format('alter table public.%I add column if not exists gerente text', 'filiais_' || e);
    execute format('alter table public.%I add column if not exists estado_sigla text references public.estados(sigla)', 'filiais_' || e);
    execute format('alter table public.%I add column if not exists criado_em timestamptz', 'filiais_' || e);
    execute format('alter table public.%I add column if not exists atualizado_em timestamptz', 'filiais_' || e);

  end loop;
end $$;
-- ---------------------------------------------------------
-- O acesso agora exige login (Supabase Auth). Cada usuário tem
-- um perfil em public.usuarios com um dos perfis:
--   admin     : tudo + gestão de usuários
--   analista  : tudo (dados), sem gestão de usuários
--   visitante : somente leitura do dashboard
--
-- LOGIN: o usuário digita apenas o "usuário" (ex.: admin); o
-- e-mail completo é construído como <usuario>@gente.gestao.
-- =========================================================

create extension if not exists pgcrypto;

-- ---------------------------------------------------------
-- 3) TABELA DE USUÁRIOS (PERFIS)
-- ---------------------------------------------------------
create table if not exists public.usuarios (
  id        uuid primary key references auth.users(id) on delete cascade,
  email     text not null unique,
  usuario   text not null unique,
  nome      text not null,
  perfil    text not null check (perfil in ('admin', 'analista', 'visitante')),
  ativo     boolean not null default true,
  criado_em timestamptz not null default now()
);

-- ---------------------------------------------------------
-- FUNÇÃO DE PERFIL (security definer evita recursão no RLS)
-- Resolve pelo id do JWT OU pelo e-mail do JWT — assim o perfil
-- continua funcionando mesmo se houver divergência entre
-- auth.uid() e a linha de perfil (ex.: seed rodado antes).
-- ---------------------------------------------------------
create or replace function public.user_perfil()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select perfil
    from public.usuarios
   where id = auth.uid()
      or lower(email) = lower(coalesce(auth.jwt() ->> 'email', ''))
   limit 1;
$$;

-- Perfil do usuário logado (usado pelo app após o login).
create or replace function public.meu_perfil()
returns table (id uuid, email text, usuario text, nome text, perfil text, ativo boolean, criado_em timestamptz)
language sql
stable
security definer
set search_path = public
as $$
  select u.id, u.email, u.usuario, u.nome, u.perfil, u.ativo, u.criado_em
    from public.usuarios u
   where u.id = auth.uid()
      or lower(u.email) = lower(coalesce(auth.jwt() ->> 'email', ''))
   limit 1;
$$;

-- Lista todos os usuários (somente admin).
create or replace function public.listar_usuarios()
returns table (id uuid, email text, usuario text, nome text, perfil text, ativo boolean, criado_em timestamptz)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if public.user_perfil() <> 'admin' then
    raise exception 'Acesso negado: apenas administradores podem listar usuários';
  end if;
  return query
    select u.id, u.email, u.usuario, u.nome, u.perfil, u.ativo, u.criado_em
      from public.usuarios u
     order by u.usuario;
end;
$$;

-- ---------------------------------------------------------
-- FUNÇÕES DE GESTÃO DE USUÁRIOS (só admin)
-- ---------------------------------------------------------

-- Cria usuário no Supabase Auth + perfil em public.usuarios.
create or replace function public.criar_usuario(
  p_nome    text,
  p_usuario text,
  p_perfil  text,
  p_senha   text
) returns uuid
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_login text := lower(trim(p_usuario));
  v_email text := v_login || '@gente.gestao';
  v_id    uuid := gen_random_uuid();
begin
  if public.user_perfil() <> 'admin' then
    raise exception 'Acesso negado: apenas administradores podem criar usuários';
  end if;
  if length(trim(p_senha)) < 6 then
    raise exception 'A senha deve ter no mínimo 6 caracteres';
  end if;
  if exists (select 1 from public.usuarios where usuario = v_login) then
    raise exception 'Já existe um usuário com esse login';
  end if;
  if exists (select 1 from auth.users where email = v_email) then
    raise exception 'Já existe um usuário com esse e-mail';
  end if;

  insert into auth.users (
    instance_id, id, aud, role, email, encrypted_password,
    email_confirmed_at, created_at, updated_at,
    confirmation_token, recovery_token, email_change_token_new, email_change,
    raw_app_meta_data, raw_user_meta_data
  ) values (
    '00000000-0000-0000-0000-000000000000',
    v_id, 'authenticated', 'authenticated', v_email,
    crypt(p_senha, gen_salt('bf')),
    now(), now(), now(),
    '', '', '', '',
    '{"provider":"email","providers":["email"]}',
    jsonb_build_object('nome', p_nome, 'usuario', v_login, 'perfil', p_perfil)
  );

  insert into auth.identities (
    id, user_id, provider_id, identity_data, provider,
    last_sign_in_at, created_at, updated_at
  ) values (
    gen_random_uuid(), v_id, v_id,
    jsonb_build_object('sub', v_id::text, 'email', v_email,
      'email_verified', true, 'phone_verified', false),
    'email', now(), now(), now()
  );

  insert into public.usuarios (id, email, usuario, nome, perfil, ativo)
  values (v_id, v_email, v_login, trim(p_nome), p_perfil, true);

  return v_id;
end;
$$;

-- Exclui usuário (Supabase Auth + perfil). O perfil é removido em
-- cascata (FK) quando o registro de auth é apagado.
create or replace function public.excluir_usuario(p_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_email text;
begin
  if public.user_perfil() <> 'admin' then
    raise exception 'Acesso negado: apenas administradores podem excluir usuários';
  end if;
  if p_id = auth.uid() then
    raise exception 'Você não pode excluir o próprio usuário';
  end if;

  select email into v_email from public.usuarios where id = p_id;

  -- remove do auth.users pelo id, conferindo o e-mail (evita apagar
  -- outro usuário caso a linha de perfil aponte para um id errado)
  delete from auth.users
   where id = p_id
     and (v_email is null or lower(email) = lower(v_email));

  -- estado inconsistente: remove pelo e-mail do perfil
  if not found and v_email is not null then
    delete from auth.users where lower(email) = lower(v_email);
  end if;

  -- garante que o registro saia da listagem: quando o auth user foi
  -- removido pelo e-mail (id divergente), o cascade não cobre esta
  -- linha — apaga-a aqui explicitamente.
  if v_email is not null then
    delete from public.usuarios where id = p_id;
  end if;
end;
$$;

-- Altera o nome de exibição do próprio usuário (não afeta o login).
create or replace function public.atualizar_meu_nome(p_nome text)
returns void
language sql
security definer
set search_path = public
as $$
  update public.usuarios
     set nome = trim(p_nome)
   where id = auth.uid();
$$;

-- ---------------------------------------------------------
-- GRANTS (permissões de chamada)
-- ---------------------------------------------------------
grant execute on function public.user_perfil() to anon, authenticated;
grant execute on function public.meu_perfil() to authenticated;
grant execute on function public.listar_usuarios() to authenticated;
grant execute on function public.criar_usuario(text, text, text, text) to authenticated;
grant execute on function public.excluir_usuario(uuid) to authenticated;
grant execute on function public.atualizar_meu_nome(text) to authenticated;
grant select, insert, update, delete on public.usuarios to anon, authenticated;

-- ---------------------------------------------------------
-- ROW LEVEL SECURITY
-- ---------------------------------------------------------

-- ---- usuarios ----
alter table public.usuarios enable row level security;

drop policy if exists "usuarios_leitura" on public.usuarios;
create policy "usuarios_leitura" on public.usuarios
  for select to authenticated
  using (id = auth.uid() or public.user_perfil() = 'admin');

drop policy if exists "usuarios_insercao_admin" on public.usuarios;
create policy "usuarios_insercao_admin" on public.usuarios
  for insert to authenticated
  with check (public.user_perfil() = 'admin');

drop policy if exists "usuarios_atualizacao_admin" on public.usuarios;
create policy "usuarios_atualizacao_admin" on public.usuarios
  for update to authenticated
  using (public.user_perfil() = 'admin')
  with check (public.user_perfil() = 'admin');

drop policy if exists "usuarios_exclusao_admin" on public.usuarios;
create policy "usuarios_exclusao_admin" on public.usuarios
  for delete to authenticated
  using (public.user_perfil() = 'admin');

-- ---- estados ----
alter table public.estados enable row level security;
drop policy if exists "estados_leitura_publica" on public.estados;
drop policy if exists "estados_leitura_autenticada" on public.estados;
create policy "estados_leitura_autenticada" on public.estados
  for select to authenticated using (true);

-- ---- tabelas por estado (12 tabelas) ----
-- Leitura para qualquer usuário autenticado; escrita somente
-- para admin/analista (visitante é somente leitura).
-- Remove as antigas policies públicas (acesso anon).
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

-- ---------------------------------------------------------
-- USUÁRIOS INICIAIS (admin, analista, visitante)
-- ---------------------------------------------------------
-- Cria os três usuários se ainda não existirem. As senhas abaixo
-- são apenas para o primeiro acesso — troque pelo menu do usuário
-- (avatar no canto superior direito) após logar.
-- Idempotente: reexecutar o script não duplica nem quebra nada.
do $$
declare
  v_id uuid;
  u record;
begin
  for u in select * from (values
    ('admin@gente.gestao',      'admin',      'Administrador', 'admin',      'Admin@123'),
    ('analista@gente.gestao',   'analista',   'Analista',      'analista',   'Analista@123'),
    ('visitante@gente.gestao',  'visitante',  'Visitante',     'visitante',  'Visitante@123')
  ) as t(email, usuario, nome, perfil, senha)
  loop
    -- 1) Garante o usuário no Supabase Auth (cria se ainda não existir)
    select id into v_id from auth.users where email = u.email;
    if v_id is null then
      v_id := gen_random_uuid();
      insert into auth.users (
        instance_id, id, aud, role, email, encrypted_password,
        email_confirmed_at, created_at, updated_at,
        confirmation_token, recovery_token, email_change_token_new, email_change,
        raw_app_meta_data, raw_user_meta_data
      ) values (
        '00000000-0000-0000-0000-000000000000', v_id, 'authenticated', 'authenticated',
        u.email, extensions.crypt(u.senha, extensions.gen_salt('bf')), now(), now(), now(),
        '', '', '', '',
        '{"provider":"email","providers":["email"]}',
        jsonb_build_object('nome', u.nome, 'usuario', u.usuario, 'perfil', u.perfil)
      );
      insert into auth.identities (
        id, user_id, provider_id, identity_data, provider, last_sign_in_at, created_at, updated_at
      ) values (
        gen_random_uuid(), v_id, v_id,
        jsonb_build_object('sub', v_id::text, 'email', u.email,
          'email_verified', true, 'phone_verified', false),
        'email', now(), now(), now()
      );
    end if;

    -- 2) Garante o perfil em public.usuarios, reconciliando registros
    --    duplicados/órfãos de execuções anteriores (mesmo usuário ou e-mail
    --    ligado a outro registro). Remove apenas o registro inconsistente.
    delete from public.usuarios
     where (usuario = u.usuario or email = u.email)
       and not (usuario = u.usuario and email = u.email);

    if exists (select 1 from public.usuarios where email = u.email and usuario = u.usuario) then
      update public.usuarios
         set id = v_id, nome = u.nome, perfil = u.perfil, ativo = true
       where email = u.email and usuario = u.usuario;
    else
      insert into public.usuarios (id, email, usuario, nome, perfil, ativo)
      values (v_id, u.email, u.usuario, u.nome, u.perfil, true);
    end if;
  end loop;
end $$;
