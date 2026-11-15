-- Escala Kids (MEVAM Kids) - Schema Supabase Compartilhado (Sem Login)
-- Execute este script uma única vez em: Supabase Dashboard > SQL Editor > New query

-- Remove versões anteriores, se existirem
drop table if exists public.escala_contact_links cascade;
drop table if exists public.escala_entries cascade;
drop table if exists public.escala_contacts cascade;
drop table if exists public.escala_templates cascade;

-- 1. Tabela de escalas (voluntários escalados por domingo e culto)
create table public.escala_entries (
  id text primary key,
  date text not null,
  shift text not null check (shift in ('manha', 'noite')),
  group_id text not null,
  volunteer_name text not null,
  phone text not null default '',
  status text not null default 'pendente' check (status in ('pendente', 'confirmado', 'recusado')),
  message_sent boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index idx_escala_entries_date
  on public.escala_entries (date);

-- 2. Tabela de catálogo de contatos (pessoa -> WhatsApp vinculado)
create table public.escala_contacts (
  name_key text primary key,
  volunteer_name text not null default '',
  phone text not null default '',
  updated_at timestamptz not null default now()
);

-- 3. Tabela de vínculos entre nomes parecidos (mesma pessoa ou pessoas distintas)
create table public.escala_contact_links (
  id text primary key,
  name_key_a text not null,
  name_key_b text not null,
  display_name_a text not null default '',
  display_name_b text not null default '',
  relation text not null check (relation in ('same', 'distinct')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- 4. Tabela de modelos de mensagem personalizados
create table public.escala_templates (
  id text primary key default 'default',
  default_noite text not null,
  default_manha text not null,
  group_overrides jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

-- Políticas de acesso compartilhado (sem necessidade de login)
alter table public.escala_entries enable row level security;
alter table public.escala_contacts enable row level security;
alter table public.escala_contact_links enable row level security;
alter table public.escala_templates enable row level security;

create policy "Acesso compartilhado escala_entries"
  on public.escala_entries
  for all
  to anon, authenticated
  using (true)
  with check (true);

create policy "Acesso compartilhado escala_contacts"
  on public.escala_contacts
  for all
  to anon, authenticated
  using (true)
  with check (true);

create policy "Acesso compartilhado escala_contact_links"
  on public.escala_contact_links
  for all
  to anon, authenticated
  using (true)
  with check (true);

create policy "Acesso compartilhado escala_templates"
  on public.escala_templates
  for all
  to anon, authenticated
  using (true)
  with check (true);
