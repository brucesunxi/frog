create extension if not exists pgcrypto;

create table if not exists users (
  id uuid primary key default gen_random_uuid(),
  google_sub text not null unique,
  email text not null,
  name text,
  picture_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  last_login_at timestamptz not null default now()
);

create table if not exists user_progress (
  user_id uuid primary key references users(id) on delete cascade,
  high_score integer not null default 0,
  total_stars integer not null default 0,
  levels_beaten integer not null default 0,
  level_stars jsonb not null default '{}'::jsonb,
  max_combo integer not null default 0,
  total_ads_watched integer not null default 0,
  updated_at timestamptz not null default now()
);

create index if not exists idx_users_email on users(email);
create index if not exists idx_progress_high_score on user_progress(high_score desc);
