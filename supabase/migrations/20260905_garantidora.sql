-- Módulo Garantidora / Desembolsos — V1
-- Execute este arquivo no SQL Editor do Supabase (ou via supabase db push)

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Flag controla_garantidora no perfil
-- ─────────────────────────────────────────────────────────────────────────────
alter table profiles
  add column if not exists controla_garantidora boolean not null default false;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. Campos de Composição do Pacote de Aluguel nos contratos
-- ─────────────────────────────────────────────────────────────────────────────
alter table contratos
  add column if not exists condominio         numeric(12,2),
  add column if not exists estimativa_agua    numeric(12,2),
  add column if not exists estimativa_energia numeric(12,2),
  add column if not exists outros_encargos    numeric(12,2);

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. Tabela de classificações de desembolso
-- ─────────────────────────────────────────────────────────────────────────────
create table if not exists classificacoes_desembolso (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users(id) on delete cascade,
  nome       text not null,
  created_at timestamptz not null default now()
);

alter table classificacoes_desembolso enable row level security;

-- Políticas RLS
do $$ begin
  -- SELECT: cada usuário vê apenas suas próprias classificações
  if not exists (
    select 1 from pg_policies
    where tablename = 'classificacoes_desembolso' and policyname = 'cls_desembolso_select'
  ) then
    create policy cls_desembolso_select on classificacoes_desembolso
      for select using (auth.uid() = user_id);
  end if;

  -- INSERT
  if not exists (
    select 1 from pg_policies
    where tablename = 'classificacoes_desembolso' and policyname = 'cls_desembolso_insert'
  ) then
    create policy cls_desembolso_insert on classificacoes_desembolso
      for insert with check (auth.uid() = user_id);
  end if;

  -- DELETE
  if not exists (
    select 1 from pg_policies
    where tablename = 'classificacoes_desembolso' and policyname = 'cls_desembolso_delete'
  ) then
    create policy cls_desembolso_delete on classificacoes_desembolso
      for delete using (auth.uid() = user_id);
  end if;
end $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. Tabela de desembolsos
-- ─────────────────────────────────────────────────────────────────────────────
create table if not exists desembolsos (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null references auth.users(id) on delete cascade,
  cobranca_id      uuid references cobrancas(id) on delete set null,
  classificacao_id uuid references classificacoes_desembolso(id) on delete set null,
  valor            numeric(12,2) not null,
  data             date not null,
  tipo             text not null default 'parcial', -- 'parcial' | 'total'
  obs              text,
  created_at       timestamptz not null default now()
);

alter table desembolsos enable row level security;

-- Políticas RLS
do $$ begin
  if not exists (
    select 1 from pg_policies
    where tablename = 'desembolsos' and policyname = 'desembolsos_select'
  ) then
    create policy desembolsos_select on desembolsos
      for select using (auth.uid() = user_id);
  end if;

  if not exists (
    select 1 from pg_policies
    where tablename = 'desembolsos' and policyname = 'desembolsos_insert'
  ) then
    create policy desembolsos_insert on desembolsos
      for insert with check (auth.uid() = user_id);
  end if;

  if not exists (
    select 1 from pg_policies
    where tablename = 'desembolsos' and policyname = 'desembolsos_update'
  ) then
    create policy desembolsos_update on desembolsos
      for update using (auth.uid() = user_id);
  end if;

  if not exists (
    select 1 from pg_policies
    where tablename = 'desembolsos' and policyname = 'desembolsos_delete'
  ) then
    create policy desembolsos_delete on desembolsos
      for delete using (auth.uid() = user_id);
  end if;
end $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. Coluna classificacao_id nos desembolsos (caso a tabela já existia sem ela)
-- ─────────────────────────────────────────────────────────────────────────────
alter table desembolsos
  add column if not exists classificacao_id uuid references classificacoes_desembolso(id) on delete set null;

-- Índices úteis
create index if not exists idx_desembolsos_user_id    on desembolsos(user_id);
create index if not exists idx_desembolsos_cobranca_id on desembolsos(cobranca_id);
