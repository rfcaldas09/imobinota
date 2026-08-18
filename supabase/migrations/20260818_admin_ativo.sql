-- Adiciona flag de visibilidade no painel admin
-- true = aparece na lista (padrão), false = oculto pelo admin
alter table profiles
  add column if not exists admin_ativo boolean not null default true;
