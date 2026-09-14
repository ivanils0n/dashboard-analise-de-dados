alter table public.vagas_ro add column if not exists salario numeric(12,2);
alter table public.vagas_am add column if not exists salario numeric(12,2);
alter table public.vagas_pa add column if not exists salario numeric(12,2);
