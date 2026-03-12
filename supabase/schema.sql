-- ============================================
-- Auktio — Database Schema
-- Run this in Supabase SQL Editor
-- ============================================

-- Enable pgvector for AI embeddings
create extension if not exists vector;

-- Enable full-text search (Swedish)
create extension if not exists unaccent;

-- Immutable wrapper for weighted tsvector (required for generated columns)
create or replace function auc_lot_search_text(
  p_title text,
  p_description text,
  p_categories text[],
  p_artists text[]
)
returns tsvector
language sql immutable parallel safe as $$
  select
    setweight(to_tsvector('swedish'::regconfig, coalesce(p_title, '')), 'A') ||
    setweight(to_tsvector('swedish'::regconfig, coalesce(p_description, '')), 'B') ||
    setweight(to_tsvector('swedish'::regconfig, coalesce(array_to_string(p_categories, ' '), '')), 'C') ||
    setweight(to_tsvector('swedish'::regconfig, coalesce(array_to_string(p_artists, ' '), '')), 'A')
$$;

-- ============================================
-- AUCTION HOUSES
-- ============================================
create table if not exists auc_auction_houses (
  id            text primary key,           -- slug: "olsens-auktioner"
  name          text not null,              -- "Olsens Auktioner"
  feed_url      text not null,              -- API feed URL
  website_url   text,
  city          text,
  country       text default 'SE',
  logo_url      text,
  active        boolean default true,
  last_synced   timestamptz,
  created_at    timestamptz default now()
);

-- ============================================
-- AUCTIONS (auction events/sessions)
-- ============================================
create table if not exists auc_auctions (
  id            bigint primary key,         -- from feed
  house_id      text references auc_auction_houses(id) on delete cascade,
  title         text not null,
  description   text,
  url           text,
  is_live       boolean default false,
  start_time    timestamptz,
  end_time      timestamptz,
  image_url     text,
  created_at    timestamptz default now(),
  updated_at    timestamptz default now(),

  unique(house_id, id)
);

-- ============================================
-- LOTS (individual items)
-- ============================================
create table if not exists auc_lots (
  id              bigint primary key,         -- from feed
  auction_id      bigint references auc_auctions(id) on delete cascade,
  house_id        text references auc_auction_houses(id) on delete cascade,
  serial_number   bigint,
  title           text not null,
  description     text,
  url             text,

  -- Categories & classification
  categories      text[] default '{}',        -- original categories from feed
  ai_categories   text[] default '{}',        -- AI-enriched categories
  artists         text[] default '{}',

  -- Images
  images          text[] default '{}',
  thumbnail_url   text,                       -- first image or generated thumb

  -- Pricing
  currency        text default 'SEK',
  estimate        numeric(12,2),              -- auction house estimate
  current_bid     numeric(12,2),
  min_bid         numeric(12,2),
  sold_price      numeric(12,2),              -- final price if sold

  -- Timing
  start_time      timestamptz,
  end_time        timestamptz,
  local_end_time  timestamptz,

  -- Location
  city            text,
  country         text default 'SE',
  state           text,

  -- Status
  availability    text,                       -- null, "sold", "unsold", "withdrawn"

  -- Change detection
  content_hash    text,                       -- djb2 hash of key fields, used to skip unchanged lots

  -- AI / Vector
  embedding           vector(768),              -- for semantic search (Gemini embeddings)
  image_description   text,                     -- AI-generated description of lot images (Gemini Vision)

  -- Search optimization
  search_text     tsvector generated always as (
    auc_lot_search_text(title, description, categories, artists)
  ) stored,

  -- Metadata
  raw_data        jsonb,                      -- original feed data for debugging
  created_at      timestamptz default now(),
  updated_at      timestamptz default now(),

  unique(house_id, id)
);

-- ============================================
-- PRICE HISTORY (for tracking price changes)
-- ============================================
create table if not exists auc_price_history (
  id            bigserial primary key,
  lot_id        bigint references auc_lots(id) on delete cascade,
  bid_amount    numeric(12,2),
  recorded_at   timestamptz default now()
);

-- ============================================
-- FAVORITES (user watchlist, anonymous via device_id)
-- ============================================
create table if not exists auc_favorites (
  id            bigserial primary key,
  device_id     text not null,              -- anonymous user identifier
  lot_id        bigint references auc_lots(id) on delete cascade,
  created_at    timestamptz default now(),

  unique(device_id, lot_id)
);

-- ============================================
-- FEED SYNC LOG
-- ============================================
create table if not exists auc_sync_log (
  id            bigserial primary key,
  house_id      text references auc_auction_houses(id),
  status        text not null,              -- 'success', 'error', 'partial'
  lots_added    int default 0,
  lots_updated  int default 0,
  lots_skipped  int default 0,
  lots_removed  int default 0,
  error_message text,
  duration_ms   int,
  started_at    timestamptz default now()
);

-- ============================================
-- INDEXES
-- ============================================

-- Full-text search index (Swedish)
create index if not exists idx_auc_lots_search on auc_lots using gin(search_text);

-- Vector similarity search
create index if not exists idx_auc_lots_embedding on auc_lots using ivfflat(embedding vector_cosine_ops)
  with (lists = 50);

-- Common query patterns
create index if not exists idx_auc_lots_active on auc_lots(end_time desc) where availability is null;
create index if not exists idx_auc_lots_categories on auc_lots using gin(categories);
create index if not exists idx_auc_lots_house on auc_lots(house_id, end_time desc);
create index if not exists idx_auc_lots_city on auc_lots(city);
create index if not exists idx_auc_lots_price on auc_lots(current_bid) where availability is null;
create index if not exists idx_auc_lots_end_time on auc_lots(end_time desc) where availability is null;

create index if not exists idx_auc_price_history_lot on auc_price_history(lot_id, recorded_at desc);
create index if not exists idx_auc_favorites_device on auc_favorites(device_id);

-- ============================================
-- FUNCTIONS
-- ============================================

-- Full-text search function with ranking
create or replace function auc_search_lots(
  search_query text,
  category_filter text[] default null,
  city_filter text default null,
  min_price numeric default null,
  max_price numeric default null,
  active_only boolean default true,
  result_limit int default 50,
  result_offset int default 0
)
returns table (
  lot_id bigint,
  title text,
  description text,
  categories text[],
  images text[],
  current_bid numeric,
  estimate numeric,
  currency text,
  city text,
  end_time timestamptz,
  house_name text,
  url text,
  relevance real
)
language plpgsql
as $$
begin
  return query
  select
    l.id,
    l.title,
    l.description,
    l.categories,
    l.images,
    l.current_bid,
    l.estimate,
    l.currency,
    l.city,
    l.end_time,
    ah.name as house_name,
    l.url,
    case
      when search_query is not null and search_query != ''
      then ts_rank_cd(l.search_text, plainto_tsquery('swedish', search_query))
      else 1.0
    end as relevance
  from auc_lots l
  join auc_auction_houses ah on ah.id = l.house_id
  where
    (not active_only or (l.end_time > now() and l.availability is null))
    and (search_query is null or search_query = '' or
         l.search_text @@ plainto_tsquery('swedish', search_query))
    and (category_filter is null or l.categories && category_filter)
    and (city_filter is null or l.city = city_filter)
    and (min_price is null or l.current_bid >= min_price)
    and (max_price is null or l.current_bid <= max_price)
  order by relevance desc, l.end_time asc
  limit result_limit
  offset result_offset;
end;
$$;

-- Semantic (vector) search function
create or replace function auc_semantic_search_lots(
  query_embedding vector(768),
  match_threshold float default 0.7,
  match_count int default 20
)
returns table (
  lot_id bigint,
  title text,
  categories text[],
  images text[],
  current_bid numeric,
  city text,
  end_time timestamptz,
  similarity float
)
language plpgsql
as $$
begin
  return query
  select
    l.id,
    l.title,
    l.categories,
    l.images,
    l.current_bid,
    l.city,
    l.end_time,
    1 - (l.embedding <=> query_embedding) as similarity
  from auc_lots l
  where
    l.embedding is not null
    and 1 - (l.embedding <=> query_embedding) > match_threshold
  order by l.embedding <=> query_embedding
  limit match_count;
end;
$$;

-- Category count function (for facets)
create or replace function auc_get_category_counts(active_only boolean default true)
returns table (value text, count bigint)
language plpgsql
as $$
begin
  return query
  select unnest(l.categories) as value, count(*) as count
  from auc_lots l
  where (not active_only or (l.end_time > now() and l.availability is null))
  group by value
  order by count desc;
end;
$$;

-- ============================================
-- ROW LEVEL SECURITY
-- ============================================
-- All tables have RLS enabled with NO public policies.
-- This means the secret key is required to access any data.
-- Our Next.js API routes use SUPABASE_SECRET_KEY (service role)
-- which bypasses RLS entirely — so they still have full access.

alter table auc_auction_houses enable row level security;
alter table auc_auctions enable row level security;
alter table auc_lots enable row level security;
alter table auc_price_history enable row level security;
alter table auc_favorites enable row level security;
alter table auc_sync_log enable row level security;

-- No policies = anon/authenticated roles are blocked.
-- Service role bypasses RLS automatically.

-- ============================================
-- SEED: Initial auction house
-- ============================================
insert into auc_auction_houses (id, name, feed_url, website_url, city, country)
values (
  'olsens-auktioner',
  'Olsens Auktioner',
  'https://www.olsensauktioner.se/api/feed?apiVersion=2.0',
  'https://www.olsensauktioner.se',
  'Norrköping',
  'SE'
) on conflict (id) do nothing;
