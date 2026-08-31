-- =============================================================================
-- VIEWS — contagens de colaboradores por departamento e por filial
-- -----------------------------------------------------------------------------
-- As views seguem as regras já usadas nos indicadores de turnover:
--   entradas = ativos do tipo "efetivado" que contam no turnover
--   saidas   = desligados do tipo "efetivado" que contam no turnover
--   ativos   = colaboradores com status "ativo" (headcount)
-- =============================================================================

-- -----------------------------------------------------------------------------
-- RESUMO POR DEPARTAMENTO
-- -----------------------------------------------------------------------------
create or replace view v_resumo_departamentos_ro as
select
  d.id                                                      as departamento_id,
  d.nome                                                    as departamento,
  d.sigla,
  d.estado_sigla,
  count(c.id)                                               as total_colaboradores,
  count(c.id) filter (where c.status = 'ativo')             as total_ativos,
  count(c.id) filter (
    where c.status = 'ativo' and c.tipo = 'efetivado' and c.conta_turnover
  )                                                         as entradas,
  count(c.id) filter (
    where c.status = 'desligado' and c.tipo = 'efetivado' and c.conta_turnover
  )                                                         as saidas
from departamentos_ro d
left join colaboradores_ro c on c.department_id = d.id
group by d.id, d.nome, d.sigla, d.estado_sigla;

create or replace view v_resumo_departamentos_am as
select
  d.id                                                      as departamento_id,
  d.nome                                                    as departamento,
  d.sigla,
  d.estado_sigla,
  count(c.id)                                               as total_colaboradores,
  count(c.id) filter (where c.status = 'ativo')             as total_ativos,
  count(c.id) filter (
    where c.status = 'ativo' and c.tipo = 'efetivado' and c.conta_turnover
  )                                                         as entradas,
  count(c.id) filter (
    where c.status = 'desligado' and c.tipo = 'efetivado' and c.conta_turnover
  )                                                         as saidas
from departamentos_am d
left join colaboradores_am c on c.department_id = d.id
group by d.id, d.nome, d.sigla, d.estado_sigla;

create or replace view v_resumo_departamentos_pa as
select
  d.id                                                      as departamento_id,
  d.nome                                                    as departamento,
  d.sigla,
  d.estado_sigla,
  count(c.id)                                               as total_colaboradores,
  count(c.id) filter (where c.status = 'ativo')             as total_ativos,
  count(c.id) filter (
    where c.status = 'ativo' and c.tipo = 'efetivado' and c.conta_turnover
  )                                                         as entradas,
  count(c.id) filter (
    where c.status = 'desligado' and c.tipo = 'efetivado' and c.conta_turnover
  )                                                         as saidas
from departamentos_pa d
left join colaboradores_pa c on c.department_id = d.id
group by d.id, d.nome, d.sigla, d.estado_sigla;

-- -----------------------------------------------------------------------------
-- RESUMO POR FILIAL (suporta a consulta segmentada por unidade)
-- -----------------------------------------------------------------------------
create or replace view v_resumo_filiais_ro as
select
  f.id                                                      as filial_id,
  f.id_filial,
  f.nome                                                    as filial,
  f.abreviado                                               as sigla,
  f.estado_sigla,
  count(c.id)                                               as total_colaboradores,
  count(c.id) filter (where c.status = 'ativo')             as total_ativos,
  count(c.id) filter (
    where c.status = 'ativo' and c.tipo = 'efetivado' and c.conta_turnover
  )                                                         as entradas,
  count(c.id) filter (
    where c.status = 'desligado' and c.tipo = 'efetivado' and c.conta_turnover
  )                                                         as saidas
from filiais_ro f
left join colaboradores_ro c on c.filial_id = f.id
group by f.id, f.id_filial, f.nome, f.abreviado, f.estado_sigla;

create or replace view v_resumo_filiais_am as
select
  f.id                                                      as filial_id,
  f.id_filial,
  f.nome                                                    as filial,
  f.abreviado                                               as sigla,
  f.estado_sigla,
  count(c.id)                                               as total_colaboradores,
  count(c.id) filter (where c.status = 'ativo')             as total_ativos,
  count(c.id) filter (
    where c.status = 'ativo' and c.tipo = 'efetivado' and c.conta_turnover
  )                                                         as entradas,
  count(c.id) filter (
    where c.status = 'desligado' and c.tipo = 'efetivado' and c.conta_turnover
  )                                                         as saidas
from filiais_am f
left join colaboradores_am c on c.filial_id = f.id
group by f.id, f.id_filial, f.nome, f.abreviado, f.estado_sigla;

create or replace view v_resumo_filiais_pa as
select
  f.id                                                      as filial_id,
  f.id_filial,
  f.nome                                                    as filial,
  f.abreviado                                               as sigla,
  f.estado_sigla,
  count(c.id)                                               as total_colaboradores,
  count(c.id) filter (where c.status = 'ativo')             as total_ativos,
  count(c.id) filter (
    where c.status = 'ativo' and c.tipo = 'efetivado' and c.conta_turnover
  )                                                         as entradas,
  count(c.id) filter (
    where c.status = 'desligado' and c.tipo = 'efetivado' and c.conta_turnover
  )                                                         as saidas
from filiais_pa f
left join colaboradores_pa c on c.filial_id = f.id
group by f.id, f.id_filial, f.nome, f.abreviado, f.estado_sigla;

-- -----------------------------------------------------------------------------
-- Permissões de leitura (mesma política das tabelas por estado)
-- -----------------------------------------------------------------------------
grant select on
  v_resumo_departamentos_ro, v_resumo_departamentos_am, v_resumo_departamentos_pa,
  v_resumo_filiais_ro,       v_resumo_filiais_am,       v_resumo_filiais_pa
  to authenticated;
