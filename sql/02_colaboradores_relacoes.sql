-- =============================================================================
-- COLABORADORES — chaves estrangeiras de departamento e filial
-- -----------------------------------------------------------------------------
-- Adiciona as colunas department_id e filial_id nas tabelas de colaboradores
-- (uma por estado), ligando cada colaborador ao departamento (setor) e à
-- filial/unidade em que trabalha. As colunas usam `text` (mesmo tipo da PK
-- das tabelas-filhas, consistente com o schema existente).
-- =============================================================================

do $$
declare
  e text; -- sufixo do estado: ro, am, pa
begin
  foreach e in array array['ro', 'am', 'pa'] loop
    execute format('alter table public.%I add column if not exists department_id text references public.%I (id) on delete set null',
      'colaboradores_' || e, 'departamentos_' || e);
    execute format('alter table public.%I add column if not exists filial_id text references public.%I (id) on delete set null',
      'colaboradores_' || e, 'filiais_' || e);

    execute format('create index if not exists %I on public.%I (department_id)',
      'colaboradores_' || e || '_department_idx', 'colaboradores_' || e);
    execute format('create index if not exists %I on public.%I (filial_id)',
      'colaboradores_' || e || '_filial_idx', 'colaboradores_' || e);
  end loop;
end $$;
