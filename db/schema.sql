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

create table if not exists players (
  id uuid primary key default gen_random_uuid(),
  install_id text unique,
  play_games_player_id_hash text unique,
  display_name text,
  app_platform text not null default 'web',
  app_version text,
  country text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  banned_at timestamptz
);

create table if not exists wallets (
  player_id uuid primary key references players(id) on delete cascade,
  coin_balance integer not null default 0 check (coin_balance >= 0),
  lifetime_purchased_coins integer not null default 0 check (lifetime_purchased_coins >= 0),
  lifetime_granted_coins integer not null default 0 check (lifetime_granted_coins >= 0),
  lifetime_spent_coins integer not null default 0 check (lifetime_spent_coins >= 0),
  updated_at timestamptz not null default now()
);

create table if not exists coin_ledger (
  id uuid primary key default gen_random_uuid(),
  player_id uuid not null references players(id) on delete cascade,
  type text not null check (type in ('purchase','spend','grant','refund','adjustment')),
  amount integer not null,
  balance_after integer not null check (balance_after >= 0),
  reason text not null,
  ref_type text,
  ref_id text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists inventory (
  player_id uuid not null references players(id) on delete cascade,
  item_id text not null,
  quantity integer not null default 0 check (quantity >= 0),
  updated_at timestamptz not null default now(),
  primary key (player_id, item_id)
);

create table if not exists item_spends (
  id uuid primary key default gen_random_uuid(),
  player_id uuid not null references players(id) on delete cascade,
  item_id text not null,
  coin_cost integer not null check (coin_cost >= 0),
  quantity integer not null default 1 check (quantity > 0),
  level_id integer,
  created_at timestamptz not null default now()
);

create table if not exists google_play_purchases (
  purchase_token text primary key,
  player_id uuid not null references players(id) on delete cascade,
  product_id text not null,
  order_id text,
  purchase_state text not null default 'pending',
  quantity integer not null default 1,
  coins_granted integer not null default 0,
  consumed_at timestamptz,
  acknowledged_at timestamptz,
  raw_response jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists level_progress (
  player_id uuid not null references players(id) on delete cascade,
  level_id integer not null,
  status text not null default 'unlocked' check (status in ('locked','unlocked','completed')),
  stars integer not null default 0 check (stars between 0 and 3),
  best_time integer not null default 0,
  best_score integer not null default 0,
  attempts integer not null default 0,
  deaths integer not null default 0,
  completed_at timestamptz,
  updated_at timestamptz not null default now(),
  primary key (player_id, level_id)
);

create table if not exists level_attempts (
  id uuid primary key default gen_random_uuid(),
  player_id uuid not null references players(id) on delete cascade,
  level_id integer not null,
  result text not null check (result in ('start','complete','fail','quit')),
  duration_ms integer not null default 0,
  deaths integer not null default 0,
  score integer not null default 0,
  stars integer not null default 0 check (stars between 0 and 3),
  powerups_used jsonb not null default '{}'::jsonb,
  coins_spent integer not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists idx_players_install_id on players(install_id);
create index if not exists idx_players_play_games_hash on players(play_games_player_id_hash);
create index if not exists idx_coin_ledger_player_created on coin_ledger(player_id, created_at desc);
create index if not exists idx_google_play_purchases_player on google_play_purchases(player_id, created_at desc);
create index if not exists idx_level_progress_player on level_progress(player_id, level_id);
create index if not exists idx_level_attempts_player_created on level_attempts(player_id, created_at desc);

create table if not exists challenges (
  id uuid primary key default gen_random_uuid(),
  public_token text not null unique,
  owner_player_id uuid not null references players(id) on delete cascade,
  parent_public_token text,
  seed integer not null check (seed > 0),
  rules_version integer not null default 1,
  map_id text not null default 'first_hop_60',
  target_rescues integer not null check (target_rescues between 0 and 30),
  target_elapsed_ms integer not null check (target_elapsed_ms between 0 and 61000),
  target_deaths integer not null check (target_deaths between 0 and 3),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '7 days')
);

create table if not exists challenge_attempts (
  id uuid primary key default gen_random_uuid(),
  challenge_id uuid not null references challenges(id) on delete cascade,
  player_id uuid not null references players(id) on delete cascade,
  status text not null default 'started' check (status in ('started','finished','rejected')),
  rescues integer,
  elapsed_ms integer,
  deaths integer,
  outcome text check (outcome in ('win','loss','tie')),
  validation_error text,
  started_at timestamptz not null default now(),
  finished_at timestamptz
);

create table if not exists challenge_rooms (
  id uuid primary key default gen_random_uuid(),
  public_token text not null unique,
  host_player_id uuid not null references players(id) on delete cascade,
  guest_player_id uuid references players(id) on delete set null,
  seed integer not null check (seed > 0),
  rules_version integer not null default 1,
  map_id text not null default 'first_hop_60',
  status text not null default 'waiting' check (status in ('waiting','ready','playing','finished','cancelled')),
  starts_at timestamptz,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '24 hours'),
  check (guest_player_id is null or guest_player_id <> host_player_id)
);

create table if not exists challenge_room_players (
  room_id uuid not null references challenge_rooms(id) on delete cascade,
  player_id uuid not null references players(id) on delete cascade,
  role text not null check (role in ('host','guest')),
  status text not null default 'joined' check (status in ('joined','finished','rejected')),
  rescues integer,
  elapsed_ms integer,
  deaths integer,
  validation_error text,
  joined_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  finished_at timestamptz,
  primary key (room_id, player_id),
  unique (room_id, role)
);

create table if not exists referral_attributions (
  player_id uuid primary key references players(id) on delete cascade,
  share_token text not null,
  source text not null check (source in ('app_link','install_referrer','manual','web')),
  attributed_at timestamptz not null default now()
);

create table if not exists growth_events (
  id uuid primary key default gen_random_uuid(),
  player_id uuid references players(id) on delete set null,
  event_name text not null,
  challenge_token text,
  client_event_id text not null,
  properties jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (player_id, client_event_id)
);

create index if not exists idx_challenges_owner_created on challenges(owner_player_id, created_at desc);
create index if not exists idx_challenge_attempts_challenge on challenge_attempts(challenge_id, finished_at desc);
create index if not exists idx_challenge_rooms_host_created on challenge_rooms(host_player_id, created_at desc);
create index if not exists idx_challenge_room_players_room on challenge_room_players(room_id, last_seen_at desc);
create index if not exists idx_growth_events_name_created on growth_events(event_name, created_at desc);
