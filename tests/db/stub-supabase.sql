-- Simula o mínimo do Supabase (papéis, auth.users, auth.uid(), auth.jwt()) para testar o esquema numa base local. Nunca corre em produção.
do $$ begin
  if not exists (select 1 from pg_roles where rolname='anon') then create role anon nologin; end if;
  if not exists (select 1 from pg_roles where rolname='authenticated') then create role authenticated nologin; end if;
  if not exists (select 1 from pg_roles where rolname='service_role') then create role service_role nologin bypassrls; end if;
end $$;
create schema auth; 
create table auth.users(id uuid primary key default gen_random_uuid(), email text unique, created_at timestamptz not null default now());
create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true),'')::uuid $$;
create function auth.jwt() returns jsonb language sql stable as $$ select coalesce(nullif(current_setting('request.jwt.claims', true),''),'{}')::jsonb $$;
grant usage on schema auth to anon, authenticated, service_role;
grant usage on schema public to anon, authenticated, service_role;
alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
alter default privileges in schema public grant all on functions to anon, authenticated, service_role;
create extension if not exists pgcrypto;
-- Fatores MFA (só o necessário para testar a migração 15; no Supabase real esta tabela já existe)
create table auth.mfa_factors(id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade, factor_type text not null default 'totp', status text not null default 'unverified', created_at timestamptz not null default now());
-- Armazenamento (Storage): só o necessário para testar as políticas da migração 16 (no Supabase real isto já existe).
create schema if not exists storage;
create table if not exists storage.buckets(id text primary key, name text, public boolean default false, file_size_limit bigint, allowed_mime_types text[]);
create table if not exists storage.objects(id uuid primary key default gen_random_uuid(), bucket_id text references storage.buckets(id), name text, owner uuid, metadata jsonb);
alter table storage.objects enable row level security;
create or replace function storage.foldername(name text) returns text[] language sql immutable as $$ select (string_to_array(name, '/'))[1:array_length(string_to_array(name, '/'), 1) - 1] $$;
grant usage on schema storage to anon, authenticated, service_role;
grant select, insert, update, delete on storage.objects to authenticated;
grant select on storage.buckets to authenticated;
