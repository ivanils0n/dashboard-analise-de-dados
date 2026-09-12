insert into public.usuarios (email, usuario, nome, perfil, ativo, senha_hash)
values (
  'admin@gente.gestao',
  'admin',
  'Administrador',
  'admin',
  true,
  'pbkdf2$sha256$100000$AD4KeXD5SKuQixaLMNU9KQ==$U2IGYiPEU3KxNr5sBGyJyzqtT462+p+8CvbobHUqOvE='
)
on conflict (email) do update set
  nome = excluded.nome,
  perfil = excluded.perfil,
  ativo = excluded.ativo,
  senha_hash = excluded.senha_hash;
