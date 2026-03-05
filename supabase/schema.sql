create extension if not exists "pgcrypto";

create table if not exists public.uploads (
  id uuid primary key default gen_random_uuid(),
  code text unique not null,
  owner_id bigint not null,
  type text not null,
  text_content text,
  file_id text,
  file_name text,
  mime_type text,
  file_size integer,
  max_access integer,
  access_count integer not null default 0,
  required_channels text[],
  created_at timestamptz not null default now()
);

create table if not exists public.drafts (
  id uuid primary key default gen_random_uuid(),
  admin_id bigint not null,
  code text not null,
  max_access integer,
  required_channels text[],
  created_at timestamptz not null default now()
);

create table if not exists public.accesses (
  id uuid primary key default gen_random_uuid(),
  upload_id uuid not null references public.uploads(id) on delete cascade,
  user_id bigint not null,
  created_at timestamptz not null default now(),
  unique (upload_id, user_id)
);

create table if not exists public.rate_limits (
  id uuid primary key default gen_random_uuid(),
  scope text not null,
  user_id bigint not null,
  window_start timestamptz not null,
  request_count integer not null,
  unique (scope, user_id)
);

create table if not exists public.users (
  id bigint primary key,
  first_name text,
  username text,
  last_seen timestamptz not null default now(),
  created_at timestamptz not null default now()
);
