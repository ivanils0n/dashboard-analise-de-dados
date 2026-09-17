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
) with (schema_locked = false);

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
) with (schema_locked = false);

create index if not exists turnover_ro_estado_idx on public.turnover_ro (estado_sigla);
create index if not exists turnover_ro_mes_idx on public.turnover_ro (mes_referencia);

create table if not exists public.permanencia_ro (
  id                text primary key,
  colaborador       text not null,
  data_admissao     date not null,
  data_demissao     date not null,
  filial_id         text,
  estado_sigla      text references public.estados(sigla)
) with (schema_locked = false);

create index if not exists permanencia_ro_estado_idx on public.permanencia_ro (estado_sigla);
create index if not exists permanencia_ro_demissao_idx on public.permanencia_ro (data_demissao);
