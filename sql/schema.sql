create table if not exists public.estados (
  sigla text primary key,
  nome  text not null
);

insert into public.estados (sigla, nome) values
('RO', 'Rondônia'),
('AM', 'Amazonas'),
('PA', 'Pará')
on conflict (sigla) do nothing;

create table if not exists public.lancamentos_ro (
  id           text primary key,
  indicador_id text not null,
  data         date not null,
  valor        double precision not null default 0,
  meta         jsonb,
  criado_em    timestamptz not null default now()
);

create index if not exists lancamentos_ro_indicador_data_idx on public.lancamentos_ro (indicador_id, data);

create table if not exists public.vagas_ro (
  id                text primary key,
  nome              text not null,
  aberta_em         timestamptz not null,
  fechada_em        timestamptz,
  salario           numeric(12,2),
  tipo_contratacao  text check (tipo_contratacao in ('clt', 'pj')),
  filial_id         text,
  estado_sigla      text references public.estados(sigla)
);

create index if not exists vagas_ro_estado_idx on public.vagas_ro (estado_sigla);

create table if not exists public.headcount_ro (
  id                text primary key,
  codigo            text,
  colaborador       text not null,
  funcao            text,
  remuneracao       numeric(12,2),
  data_admissao     date,
  mes_referencia    date not null,
  status            text not null default 'ativo' check (status in ('ativo', 'demitido')),
  demitido_mes      date,
  filial_id         text,
  estado_sigla      text references public.estados(sigla)
);

create index if not exists headcount_ro_estado_idx on public.headcount_ro (estado_sigla);
create index if not exists headcount_ro_mes_idx on public.headcount_ro (mes_referencia);

create table if not exists public.turnover_ro (
  id                text primary key,
  filial_id         text,
  mes_referencia    date not null,
  admitidos         integer not null default 0,
  demitidos         integer not null default 0,
  ativos            integer not null default 0,
  estado_sigla      text references public.estados(sigla)
);

create index if not exists turnover_ro_estado_idx on public.turnover_ro (estado_sigla);
create index if not exists turnover_ro_mes_idx on public.turnover_ro (mes_referencia);

create table if not exists public.permanencia_ro (
  id                text primary key,
  colaborador       text not null,
  data_admissao     date not null,
  data_demissao     date not null,
  filial_id         text,
  estado_sigla      text references public.estados(sigla)
);

create index if not exists permanencia_ro_estado_idx on public.permanencia_ro (estado_sigla);
create index if not exists permanencia_ro_demissao_idx on public.permanencia_ro (data_demissao);

create table if not exists public.colaboradores_ro (
  id                text primary key,
  nome              text not null,
  setor             text not null,
  cargo             text,
  usuario           text not null,
  estado_sigla      text references public.estados(sigla),
  salario           numeric(12,2),
  department_id     text,
  filial_id         text,
  lider_imediato    text,
  gerente_regional  text,
  regional          text,
  vale_transporte   numeric(12,2),
  vale_alimentacao  numeric(12,2),
  inss              numeric(12,2),
  fgts              numeric(12,2),
  irrf              numeric(12,2),
  premio_art_62     numeric(12,2),
  premio_loja       numeric(12,2),
  comissao          numeric(12,2),
  entrada_em        date,
  status            text not null check (status in ('ativo', 'desligado', 'afastado')),
  tipo              text not null check (tipo in ('efetivado', 'experiencia')),
  criado_em         timestamptz not null default now(),
  atualizado_em     timestamptz,
  desligado_em      timestamptz
);

create index if not exists colaboradores_ro_status_idx on public.colaboradores_ro (status);
create index if not exists colaboradores_ro_department_idx on public.colaboradores_ro (department_id);
create index if not exists colaboradores_ro_filial_idx on public.colaboradores_ro (filial_id);

create table if not exists public.filiais_ro (
  id            text primary key,
  id_filial     text not null,
  cnpj          text not null,
  nome          text not null,
  abreviado     text not null,
  gerente       text,
  estado_sigla  text references public.estados(sigla),
  criado_em     timestamptz not null default now(),
  atualizado_em timestamptz
);

create table if not exists public.departamentos_ro (
  id            text primary key,
  nome          text not null,
  sigla         text,
  estado_sigla  text references public.estados(sigla),
  criado_em     timestamptz not null default now(),
  atualizado_em timestamptz
);

create index if not exists departamentos_ro_estado_idx on public.departamentos_ro (estado_sigla);

create table if not exists public.lancamentos_am (
  id           text primary key,
  indicador_id text not null,
  data         date not null,
  valor        double precision not null default 0,
  meta         jsonb,
  criado_em    timestamptz not null default now()
);

create index if not exists lancamentos_am_indicador_data_idx on public.lancamentos_am (indicador_id, data);

create table if not exists public.vagas_am (
  id                text primary key,
  nome              text not null,
  aberta_em         timestamptz not null,
  fechada_em        timestamptz,
  salario           numeric(12,2),
  tipo_contratacao  text check (tipo_contratacao in ('clt', 'pj')),
  filial_id         text,
  estado_sigla      text references public.estados(sigla)
);

create index if not exists vagas_am_estado_idx on public.vagas_am (estado_sigla);

create table if not exists public.headcount_am (
  id                text primary key,
  codigo            text,
  colaborador       text not null,
  funcao            text,
  remuneracao       numeric(12,2),
  data_admissao     date,
  mes_referencia    date not null,
  status            text not null default 'ativo' check (status in ('ativo', 'demitido')),
  demitido_mes      date,
  filial_id         text,
  estado_sigla      text references public.estados(sigla)
);

create index if not exists headcount_am_estado_idx on public.headcount_am (estado_sigla);
create index if not exists headcount_am_mes_idx on public.headcount_am (mes_referencia);

create table if not exists public.turnover_am (
  id                text primary key,
  filial_id         text,
  mes_referencia    date not null,
  admitidos         integer not null default 0,
  demitidos         integer not null default 0,
  ativos            integer not null default 0,
  estado_sigla      text references public.estados(sigla)
);

create index if not exists turnover_am_estado_idx on public.turnover_am (estado_sigla);
create index if not exists turnover_am_mes_idx on public.turnover_am (mes_referencia);

create table if not exists public.permanencia_am (
  id                text primary key,
  colaborador       text not null,
  data_admissao     date not null,
  data_demissao     date not null,
  filial_id         text,
  estado_sigla      text references public.estados(sigla)
);

create index if not exists permanencia_am_estado_idx on public.permanencia_am (estado_sigla);
create index if not exists permanencia_am_demissao_idx on public.permanencia_am (data_demissao);

create table if not exists public.colaboradores_am (
  id                text primary key,
  nome              text not null,
  setor             text not null,
  cargo             text,
  usuario           text not null,
  estado_sigla      text references public.estados(sigla),
  salario           numeric(12,2),
  department_id     text,
  filial_id         text,
  lider_imediato    text,
  gerente_regional  text,
  regional          text,
  vale_transporte   numeric(12,2),
  vale_alimentacao  numeric(12,2),
  inss              numeric(12,2),
  fgts              numeric(12,2),
  irrf              numeric(12,2),
  premio_art_62     numeric(12,2),
  premio_loja       numeric(12,2),
  comissao          numeric(12,2),
  entrada_em        date,
  status            text not null check (status in ('ativo', 'desligado', 'afastado')),
  tipo              text not null check (tipo in ('efetivado', 'experiencia')),
  criado_em         timestamptz not null default now(),
  atualizado_em     timestamptz,
  desligado_em      timestamptz
);

create index if not exists colaboradores_am_status_idx on public.colaboradores_am (status);
create index if not exists colaboradores_am_department_idx on public.colaboradores_am (department_id);
create index if not exists colaboradores_am_filial_idx on public.colaboradores_am (filial_id);

create table if not exists public.filiais_am (
  id            text primary key,
  id_filial     text not null,
  cnpj          text not null,
  nome          text not null,
  abreviado     text not null,
  gerente       text,
  estado_sigla  text references public.estados(sigla),
  criado_em     timestamptz not null default now(),
  atualizado_em timestamptz
);

create table if not exists public.departamentos_am (
  id            text primary key,
  nome          text not null,
  sigla         text,
  estado_sigla  text references public.estados(sigla),
  criado_em     timestamptz not null default now(),
  atualizado_em timestamptz
);

create index if not exists departamentos_am_estado_idx on public.departamentos_am (estado_sigla);

create table if not exists public.lancamentos_pa (
  id           text primary key,
  indicador_id text not null,
  data         date not null,
  valor        double precision not null default 0,
  meta         jsonb,
  criado_em    timestamptz not null default now()
);

create index if not exists lancamentos_pa_indicador_data_idx on public.lancamentos_pa (indicador_id, data);

create table if not exists public.vagas_pa (
  id                text primary key,
  nome              text not null,
  aberta_em         timestamptz not null,
  fechada_em        timestamptz,
  salario           numeric(12,2),
  tipo_contratacao  text check (tipo_contratacao in ('clt', 'pj')),
  filial_id         text,
  estado_sigla      text references public.estados(sigla)
);

create index if not exists vagas_pa_estado_idx on public.vagas_pa (estado_sigla);

create table if not exists public.headcount_pa (
  id                text primary key,
  codigo            text,
  colaborador       text not null,
  funcao            text,
  remuneracao       numeric(12,2),
  data_admissao     date,
  mes_referencia    date not null,
  status            text not null default 'ativo' check (status in ('ativo', 'demitido')),
  demitido_mes      date,
  filial_id         text,
  estado_sigla      text references public.estados(sigla)
);

create index if not exists headcount_pa_estado_idx on public.headcount_pa (estado_sigla);
create index if not exists headcount_pa_mes_idx on public.headcount_pa (mes_referencia);

create table if not exists public.turnover_pa (
  id                text primary key,
  filial_id         text,
  mes_referencia    date not null,
  admitidos         integer not null default 0,
  demitidos         integer not null default 0,
  ativos            integer not null default 0,
  estado_sigla      text references public.estados(sigla)
);

create index if not exists turnover_pa_estado_idx on public.turnover_pa (estado_sigla);
create index if not exists turnover_pa_mes_idx on public.turnover_pa (mes_referencia);

create table if not exists public.permanencia_pa (
  id                text primary key,
  colaborador       text not null,
  data_admissao     date not null,
  data_demissao     date not null,
  filial_id         text,
  estado_sigla      text references public.estados(sigla)
);

create index if not exists permanencia_pa_estado_idx on public.permanencia_pa (estado_sigla);
create index if not exists permanencia_pa_demissao_idx on public.permanencia_pa (data_demissao);

create table if not exists public.colaboradores_pa (
  id                text primary key,
  nome              text not null,
  setor             text not null,
  cargo             text,
  usuario           text not null,
  estado_sigla      text references public.estados(sigla),
  salario           numeric(12,2),
  department_id     text,
  filial_id         text,
  lider_imediato    text,
  gerente_regional  text,
  regional          text,
  vale_transporte   numeric(12,2),
  vale_alimentacao  numeric(12,2),
  inss              numeric(12,2),
  fgts              numeric(12,2),
  irrf              numeric(12,2),
  premio_art_62     numeric(12,2),
  premio_loja       numeric(12,2),
  comissao          numeric(12,2),
  entrada_em        date,
  status            text not null check (status in ('ativo', 'desligado', 'afastado')),
  tipo              text not null check (tipo in ('efetivado', 'experiencia')),
  criado_em         timestamptz not null default now(),
  atualizado_em     timestamptz,
  desligado_em      timestamptz
);

create index if not exists colaboradores_pa_status_idx on public.colaboradores_pa (status);
create index if not exists colaboradores_pa_department_idx on public.colaboradores_pa (department_id);
create index if not exists colaboradores_pa_filial_idx on public.colaboradores_pa (filial_id);

create table if not exists public.filiais_pa (
  id            text primary key,
  id_filial     text not null,
  cnpj          text not null,
  nome          text not null,
  abreviado     text not null,
  gerente       text,
  estado_sigla  text references public.estados(sigla),
  criado_em     timestamptz not null default now(),
  atualizado_em timestamptz
);

create table if not exists public.departamentos_pa (
  id            text primary key,
  nome          text not null,
  sigla         text,
  estado_sigla  text references public.estados(sigla),
  criado_em     timestamptz not null default now(),
  atualizado_em timestamptz
);

create index if not exists departamentos_pa_estado_idx on public.departamentos_pa (estado_sigla);

-- Turnover deixou de ser calculado a partir do colaborador (aba Equipe) e
-- passou a ser lançado manualmente (ver tabelas turnover_ro/am/pa acima).
alter table if exists public.colaboradores_ro drop column if exists conta_turnover;
alter table if exists public.colaboradores_am drop column if exists conta_turnover;
alter table if exists public.colaboradores_pa drop column if exists conta_turnover;

create table if not exists public.usuarios (
  id         uuid primary key default gen_random_uuid(),
  email      text not null unique,
  usuario    text not null unique,
  nome       text not null,
  perfil     text not null check (perfil in ('admin', 'analista', 'visitante')),
  ativo      boolean not null default true,
  senha_hash text not null,
  criado_em  timestamptz not null default now()
);

create sequence if not exists public.registro_alteracoes_id_seq;

create table if not exists public.registro_alteracoes (
  id          bigint primary key default nextval('public.registro_alteracoes_id_seq'),
  tabela      text not null,
  registro_id text not null,
  operacao    text not null check (operacao in ('upsert', 'delete')),
  dados       jsonb,
  criado_em   timestamptz not null default now()
);

create index if not exists idx_registro_alteracoes_id on public.registro_alteracoes (id);

insert into public.usuarios (email, usuario, nome, perfil, ativo, senha_hash)
values (
  'admin@gente.gestao',
  'admin',
  'Administrador',
  'admin',
  true,
  'pbkdf2$sha256$100000$lhOo7ejoeX2FgoW8BMHLgA==$FScexErWCGEPVxm34XCPGlSGPEjshHar4+MLf4jH6eA='
)
on conflict (email) do nothing;
