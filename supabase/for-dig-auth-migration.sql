-- Auktio - For dig + email auth delta migration
-- Run this in Supabase SQL Editor on an EXISTING database.
-- This is safer than rerunning the entire schema.sql because
-- create table if not exists does not add missing columns to existing tables.

create extension if not exists vector;
create extension if not exists unaccent;

alter table if exists auc_users
  add column if not exists password_hash text,
  add column if not exists password_set_at timestamptz,
  add column if not exists email_verified_at timestamptz;

create table if not exists auc_user_email_verification_tokens (
  id            bigserial primary key,
  user_id       text not null references auc_users(id) on delete cascade,
  email         text not null,
  token_hash    text not null unique,
  expires_at    timestamptz not null,
  consumed_at   timestamptz,
  created_at    timestamptz default now()
);

create table if not exists auc_user_password_reset_tokens (
  id            bigserial primary key,
  user_id       text not null references auc_users(id) on delete cascade,
  email         text not null,
  token_hash    text not null unique,
  expires_at    timestamptz not null,
  consumed_at   timestamptz,
  created_at    timestamptz default now()
);

create table if not exists auc_auth_rate_limits (
  id            bigserial primary key,
  action        text not null,
  identifier    text not null,
  created_at    timestamptz default now()
);

create table if not exists auc_anonymous_favorites (
  id            bigserial primary key,
  session_id    text not null,
  lot_id        bigint not null references auc_lots(id) on delete cascade,
  created_at    timestamptz default now(),

  unique(session_id, lot_id)
);

create table if not exists auc_user_interest_profiles (
  id                 bigserial primary key,
  user_id            text not null references auc_users(id) on delete cascade,
  centroid_embedding vector(768),
  source_breakdown   jsonb not null default '{}'::jsonb,
  top_categories     text[] not null default '{}',
  avg_price_range    jsonb not null default '{}'::jsonb,
  is_dirty           boolean not null default true,
  last_signal_at     timestamptz,
  created_at         timestamptz default now(),
  updated_at         timestamptz default now(),

  unique(user_id)
);

create unique index if not exists idx_auc_user_interest_profiles_unique_user
  on auc_user_interest_profiles(user_id);

create table if not exists auc_user_matches (
  id                  bigserial primary key,
  user_id             text not null references auc_users(id) on delete cascade,
  lot_id              bigint not null references auc_lots(id) on delete cascade,
  interest_profile_id bigint references auc_user_interest_profiles(id) on delete set null,
  source_lot_id       bigint references auc_lots(id) on delete set null,
  score               double precision not null,
  match_source        text not null,
  source_context      text,
  notified_at         timestamptz,
  created_at          timestamptz default now(),
  updated_at          timestamptz default now(),

  unique(user_id, lot_id)
);

alter table if exists auc_user_matches
  drop constraint if exists auc_user_matches_match_source_check;

alter table if exists auc_user_matches
  add constraint auc_user_matches_match_source_check
  check (match_source in ('expired_favorite', 'active_favorite', 'search', 'interest_profile_v1'));

create table if not exists auc_user_preference_settings (
  id                      bigserial primary key,
  user_id                 text not null references auc_users(id) on delete cascade,
  personalization_enabled boolean not null default true,
  search_history_enabled  boolean not null default true,
  created_at              timestamptz default now(),
  updated_at              timestamptz default now(),

  unique(user_id)
);

create index if not exists idx_auc_user_email_verification_tokens_lookup
  on auc_user_email_verification_tokens(token_hash, expires_at)
  where consumed_at is null;

create index if not exists idx_auc_user_password_reset_tokens_lookup
  on auc_user_password_reset_tokens(token_hash, expires_at)
  where consumed_at is null;

create index if not exists idx_auc_auth_rate_limits_lookup
  on auc_auth_rate_limits(action, identifier, created_at desc);

create index if not exists idx_auc_anonymous_favorites_session
  on auc_anonymous_favorites(session_id, created_at desc);

create index if not exists idx_auc_user_interest_profiles_user
  on auc_user_interest_profiles(user_id, updated_at desc);

create index if not exists idx_auc_user_interest_profiles_dirty
  on auc_user_interest_profiles(updated_at asc)
  where is_dirty = true;

create index if not exists idx_auc_user_matches_user
  on auc_user_matches(user_id, score desc, created_at desc);

create index if not exists idx_auc_user_matches_lot
  on auc_user_matches(lot_id);

create index if not exists idx_auc_user_preference_settings_user
  on auc_user_preference_settings(user_id);

alter table if exists auc_user_search_log enable row level security;
alter table if exists auc_search_click_log enable row level security;
alter table if exists auc_user_email_verification_tokens enable row level security;
alter table if exists auc_user_password_reset_tokens enable row level security;
alter table if exists auc_auth_rate_limits enable row level security;
alter table if exists auc_anonymous_favorites enable row level security;
alter table if exists auc_user_interest_profiles enable row level security;
alter table if exists auc_user_matches enable row level security;
alter table if exists auc_user_preference_settings enable row level security;
