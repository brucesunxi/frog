alter table wallets add column if not exists financial_revision bigint not null default 0;

create table if not exists wallet_operations (
  player_id uuid not null references players(id) on delete cascade,
  request_id text not null,
  kind text not null check (kind in ('spend','use')),
  payload jsonb not null,
  created_at timestamptz not null default now(),
  primary key (player_id,request_id)
);

create table if not exists campaign_reward_claims (
  player_id uuid not null references players(id) on delete cascade,
  request_id text not null,
  level_id integer not null check (level_id between 1 and 100),
  base_coins integer not null check (base_coins >= 0),
  details jsonb not null,
  created_at timestamptz not null default now(),
  primary key (player_id,request_id)
);

create table if not exists campaign_chapter_bonuses (
  player_id uuid not null references players(id) on delete cascade,
  level_id integer not null check (level_id between 1 and 100),
  request_id text not null,
  coins integer not null check (coins > 0),
  primary key (player_id,level_id)
);
