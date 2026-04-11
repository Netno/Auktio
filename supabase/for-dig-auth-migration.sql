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

create table if not exists auc_user_search_log (
  id                   bigserial primary key,
  user_id              text references auc_users(id) on delete cascade,
  session_id           text,
  query_text           text,
  query_embedding      vector(768),
  selected_categories  text[] not null default '{}',
  filters_applied      jsonb not null default '{}'::jsonb,
  result_count         int not null default 0,
  results_clicked      int not null default 0,
  first_click_position int,
  source               text not null check (source in ('search_bar', 'autocomplete', 'category_pill', 'filter_change')),
  created_at           timestamptz default now(),

  check (user_id is not null or session_id is not null),
  check (result_count >= 0),
  check (results_clicked >= 0),
  check (first_click_position is null or first_click_position > 0)
);

create table if not exists auc_search_click_log (
  id                  bigserial primary key,
  search_id           bigint not null references auc_user_search_log(id) on delete cascade,
  lot_id              bigint not null references auc_lots(id) on delete cascade,
  position_in_results int not null check (position_in_results > 0),
  created_at          timestamptz default now()
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

create table if not exists auc_user_notification_settings (
  id                        bigserial primary key,
  user_id                   text not null references auc_users(id) on delete cascade,
  email_enabled             boolean not null default true,
  digest_frequency          text not null default 'daily' check (digest_frequency in ('off', 'daily')),
  instant_enabled           boolean not null default true,
  quiet_hours_start         int check (quiet_hours_start is null or (quiet_hours_start >= 0 and quiet_hours_start <= 23)),
  quiet_hours_end           int check (quiet_hours_end is null or (quiet_hours_end >= 0 and quiet_hours_end <= 23)),
  max_notifications_per_day int not null default 6 check (max_notifications_per_day >= 0),
  created_at                timestamptz default now(),
  updated_at                timestamptz default now(),

  unique(user_id)
);

create table if not exists auc_user_recommendation_rules (
  id                  bigserial primary key,
  user_id             text not null references auc_users(id) on delete cascade,
  label               text not null,
  surface             text not null default 'both' check (surface in ('home', 'notification', 'both')),
  enabled             boolean not null default true,
  strictness          text not null default 'blended' check (strictness in ('strict', 'blended')),
  query_text          text,
  categories          text[] not null default '{}',
  excluded_categories text[] not null default '{}',
  brands_or_makers    text[] not null default '{}',
  house_ids           text[] not null default '{}',
  min_price           numeric,
  max_price           numeric,
  notification_types  text[] not null default '{}',
  cooldown_hours      int not null default 24 check (cooldown_hours >= 0),
  priority            int not null default 0,
  created_at          timestamptz default now(),
  updated_at          timestamptz default now(),

  check (
    coalesce(nullif(btrim(query_text), ''), '') <> '' or
    cardinality(categories) > 0 or
    cardinality(brands_or_makers) > 0 or
    cardinality(house_ids) > 0
  ),
  check (min_price is null or min_price >= 0),
  check (max_price is null or max_price >= 0),
  check (min_price is null or max_price is null or min_price <= max_price)
);

create table if not exists auc_user_behavior_events (
  id          bigserial primary key,
  user_id     text not null references auc_users(id) on delete cascade,
  lot_id      bigint references auc_lots(id) on delete cascade,
  search_id   bigint references auc_user_search_log(id) on delete set null,
  event_type  text not null check (event_type in ('favorite_add', 'search_click', 'search_repeat', 'lot_view', 'dismiss', 'hide', 'bid_placed')),
  weight      double precision not null default 1,
  metadata    jsonb not null default '{}'::jsonb,
  occurred_at timestamptz default now()
);

create table if not exists auc_user_alert_matches (
  id              bigserial primary key,
  user_id         text not null references auc_users(id) on delete cascade,
  rule_id         bigint references auc_user_recommendation_rules(id) on delete cascade,
  lot_id          bigint not null references auc_lots(id) on delete cascade,
  match_kind      text not null check (match_kind in ('rule_direct', 'similar_to_saved', 'followed_house', 'price_fit', 'returned_unsold')),
  reason_codes    text[] not null default '{}',
  score           double precision not null default 0,
  score_breakdown jsonb not null default '{}'::jsonb,
  delivery_state  text not null default 'pending' check (delivery_state in ('pending', 'seen', 'dismissed', 'notified')),
  first_seen_at   timestamptz default now(),
  last_seen_at    timestamptz default now(),
  notified_at     timestamptz,

  unique(user_id, rule_id, lot_id, match_kind)
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

create index if not exists idx_auc_user_search_log_user
  on auc_user_search_log(user_id, created_at desc);

create index if not exists idx_auc_user_search_log_session
  on auc_user_search_log(session_id, created_at desc);

create index if not exists idx_auc_search_click_log_search
  on auc_search_click_log(search_id, created_at desc);

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

create index if not exists idx_auc_user_notification_settings_user
  on auc_user_notification_settings(user_id);

create index if not exists idx_auc_user_recommendation_rules_user
  on auc_user_recommendation_rules(user_id, priority desc, updated_at desc);

create index if not exists idx_auc_user_recommendation_rules_surface
  on auc_user_recommendation_rules(surface, enabled, updated_at desc);

create index if not exists idx_auc_user_recommendation_rules_categories
  on auc_user_recommendation_rules using gin(categories);

create index if not exists idx_auc_user_recommendation_rules_houses
  on auc_user_recommendation_rules using gin(house_ids);

create index if not exists idx_auc_user_recommendation_rules_brands
  on auc_user_recommendation_rules using gin(brands_or_makers);

create index if not exists idx_auc_user_behavior_events_user
  on auc_user_behavior_events(user_id, occurred_at desc);

create index if not exists idx_auc_user_behavior_events_lot
  on auc_user_behavior_events(lot_id, occurred_at desc);

create index if not exists idx_auc_user_alert_matches_user
  on auc_user_alert_matches(user_id, delivery_state, last_seen_at desc);

create index if not exists idx_auc_user_alert_matches_rule
  on auc_user_alert_matches(rule_id, last_seen_at desc);

create index if not exists idx_auc_user_alert_matches_lot
  on auc_user_alert_matches(lot_id, last_seen_at desc);

alter table if exists auc_user_search_log enable row level security;
alter table if exists auc_search_click_log enable row level security;
alter table if exists auc_user_email_verification_tokens enable row level security;
alter table if exists auc_user_password_reset_tokens enable row level security;
alter table if exists auc_auth_rate_limits enable row level security;
alter table if exists auc_anonymous_favorites enable row level security;
alter table if exists auc_user_interest_profiles enable row level security;
alter table if exists auc_user_matches enable row level security;
alter table if exists auc_user_preference_settings enable row level security;
alter table if exists auc_user_notification_settings enable row level security;
alter table if exists auc_user_recommendation_rules enable row level security;
alter table if exists auc_user_behavior_events enable row level security;
alter table if exists auc_user_alert_matches enable row level security;
