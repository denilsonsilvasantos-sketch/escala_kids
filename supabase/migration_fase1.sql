-- Escala Mevam Kids - Migração Fase 1 (Perfis, Aniversários, Funções, Turnos e Parentesco)
-- Execute este script no Supabase Dashboard > SQL Editor > New query
-- Este script é 100% seguro e NÃO apaga nenhum voluntário ou escala existente.

alter table public.escala_contacts
  add column if not exists birth_day integer,
  add column if not exists birth_month integer,
  add column if not exists roles text[] not null default '{}',
  add column if not exists preferred_shifts text[] not null default '{}',
  add column if not exists family_group_id text not null default '',
  add column if not exists family_group_name text not null default '',
  add column if not exists family_sync_mode text not null default 'same_shift',
  add column if not exists birthday_sent_year integer;

create index if not exists idx_escala_contacts_birthday
  on public.escala_contacts (birth_month, birth_day);

create index if not exists idx_escala_contacts_family_group
  on public.escala_contacts (family_group_id);
