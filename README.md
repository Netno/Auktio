# Auktio

**Alla Sveriges auktioner, ett intelligent sök.**

Auktio aggregerar föremål från svenska auktionshus till en snabb, sökbar plattform med AI-driven kategorisering, prishistorik och bevakningsfunktioner.

## Tech Stack

| Layer | Technology | Free Tier |
|---|---|---|
| **Frontend** | Next.js 14 (App Router) + TypeScript + Tailwind | — |
| **Hosting** | Vercel | 100 GB bandwidth |
| **Database** | Supabase (PostgreSQL + pgvector) | 500 MB |
| **Search** | PostgreSQL full-text (Swedish) + pgvector | Included |
| **AI** | Google Gemini API | 1500 req/day free |
| **Cron** | Vercel Cron Jobs | 1/day (Hobby), see below |

## Quick Start

### 1. Clone & Install

```bash
git clone https://github.com/your-org/auktio.git
cd auktio
npm install
```

### 2. Set up Supabase

1. Create a free project at [supabase.com](https://supabase.com)
2. Go to SQL Editor → paste the contents of `supabase/schema.sql` → Run
3. Copy your project URL and keys from Settings → API

### 3. Configure Environment

```bash
cp .env.local.example .env.local
# Edit .env.local with your Supabase credentials
```

### 4. Ingest Feed Data

```bash
# Run the feed ingester manually
npm run ingest
```

### 5. Run Development Server

```bash
npm run dev
# Open http://localhost:3000
```

## Project Structure

```
auktio/
├── src/
│   ├── app/                    # Next.js App Router
│   │   ├── api/
│   │   │   ├── ingest/         # Cron-triggered feed ingestion
│   │   │   └── search/         # Search API with facets
│   │   ├── layout.tsx          # Root layout + fonts
│   │   ├── page.tsx            # Main search page
│   │   └── globals.css
│   ├── components/
│   │   ├── Header.tsx          # Nav with logo + favorites
│   │   ├── SearchHero.tsx      # Hero section + search input
│   │   ├── FilterBar.tsx       # Category pills + advanced filters
│   │   ├── StatsBar.tsx        # Aggregate statistics
│   │   ├── LotCard.tsx         # Individual lot card
│   │   ├── LotGrid.tsx         # Responsive grid + loading skeletons
│   │   └── Pagination.tsx
│   ├── hooks/
│   │   ├── use-search.ts       # Search state + URL sync + debounce
│   │   └── use-favorites.ts    # Watchlist with localStorage
│   ├── lib/
│   │   ├── supabase.ts         # Client + server Supabase clients
│   │   ├── feed-ingester.ts    # Feed fetch → normalize → upsert
│   │   ├── types.ts            # TypeScript type definitions
│   │   └── utils.ts            # Formatting helpers
│   └── config/
│       └── sources.ts          # Feed source registry
├── supabase/
│   └── schema.sql              # Full database schema + RLS + functions
├── vercel.json                 # Cron job config (3x daily)
├── tailwind.config.ts          # Custom design tokens
└── .env.local.example          # Environment template
```

## Adding a New Auction House

1. Open `src/config/sources.ts`
2. Add a new entry to `FEED_SOURCES`:

```typescript
{
  id: "new-auction-house",
  name: "Nytt Auktionshus",
  feedUrl: "https://www.example.se/api/feed?apiVersion=2.0",
  websiteUrl: "https://www.example.se",
  city: "Stockholm",
  country: "SE",
}
```

3. Run `npm run ingest` — done!

The feed ingester expects the Skeleton API v2.0 format. For auction houses on other platforms, you'll need to add a feed adapter.

## Key Features

### Search
- **Full-text search** using PostgreSQL `tsvector` with Swedish language support
- **Weighted ranking**: title & artist matches rank highest, then description, then categories
- **Faceted filtering**: category, city, price range, auction house
- **URL-synced state**: all search params in URL for sharing/bookmarking

### AI Pipeline (Phase 2)
- **Auto-categorization**: Gemini API analyzes lot titles/descriptions → enriched categories
- **Semantic search**: "hitta skandinavisk 60-talsdesign" → pgvector cosine similarity
- **Embedding generation**: runs during ingestion, stored in `vector(768)` column

### Data Pipeline
- **Vercel Cron**: runs 3x daily (06:00, 12:00, 18:00 UTC)
- **Upsert strategy**: new lots are added, existing lots updated (price, bids, status)
- **Price history**: bid changes tracked over time for trend analysis
- **Sync logging**: every ingestion run logged with counts and duration

## Deploy to Vercel

```bash
# Install Vercel CLI
npm i -g vercel

# Deploy
vercel

# Set environment variables in Vercel dashboard
# Settings → Environment Variables → add all from .env.local.example
```

**Note on Cron Jobs**: Vercel Hobby plan allows 1 cron job/day. Upgrade to Pro ($20/mo) for the 3x/day schedule in `vercel.json`, or adjust the schedule to `0 6 * * *` (once daily).

## Roadmap

- [x] Feed ingestion pipeline
- [x] Full-text search (Swedish)
- [x] Category filtering + facets
- [x] Favorites / watchlist
- [x] Responsive grid with skeleton loading
- [ ] AI auto-categorization (Gemini)
- [ ] Semantic vector search
- [ ] Price history charts
- [ ] Email notifications for watched lots
- [ ] User accounts (Supabase Auth)
- [ ] Multi-language support (EN, NO, DA)
- [ ] Feed adapters for non-Skeleton platforms

## License

Private — © Skeleton / Barnebys Group
