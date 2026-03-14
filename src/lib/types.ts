// ============================================
// Auktio — Type Definitions
// ============================================

/** Raw feed types (from Skeleton API v2.0) */
export interface FeedResponse {
  auctions: FeedAuction[];
}

export interface FeedAuction {
  id: number;
  title: string;
  description: string;
  url: string;
  isLiveAuction: boolean;
  image: string[];
  start: string;
  end: string;
  lots: FeedLot[];
}

export interface FeedLot {
  id: number;
  serialNumber: number;
  artist: string[];
  category: string[];
  title: string;
  description: string;
  url: string;
  image: string[];
  availability: string | null;
  start: string;
  end: string;
  localEnd: string;
  price: {
    amount: number | null; // final sold price
    estimate: number | null;
    bid: number | null; // current bid
    currency: string;
    minBid: number | null;
  };
  location: {
    country: string;
    city: string;
    state: string | null;
  };
}

/** Application domain types */
export interface AuctionHouse {
  id: string;
  name: string;
  feedUrl: string;
  websiteUrl?: string;
  city?: string;
  country: string;
  logoUrl?: string;
  active: boolean;
  lastSynced?: string;
}

export type AuctionStatus = "upcoming" | "ongoing" | "ended" | "uncertain";

export type AuctionStatusSource =
  | "database"
  | "derived-from-lots"
  | "site-verified"
  | "uncertain";

export interface AuctionSummary {
  id: number;
  houseId: string;
  houseName: string;
  houseLogoUrl?: string;
  title: string;
  description?: string;
  url: string;
  imageUrl?: string;
  isLive: boolean;
  startTime?: string;
  endTime?: string;
  closingStartTime?: string;
  effectiveStartTime?: string;
  effectiveEndTime?: string;
  lotCount: number;
  activeLotCount: number;
  endedLotCount: number;
  lotDataIncomplete: boolean;
  status: AuctionStatus;
  statusSource: AuctionStatusSource;
  verificationPending?: boolean;
}

export interface AuctionsResponse {
  auctions: AuctionSummary[];
  stats: Record<AuctionStatus, number>;
  daysBack: number;
  daysForward: number;
}

export interface Lot {
  id: number;
  auctionId: number;
  houseId: string;
  serialNumber?: number;
  title: string;
  description?: string;
  url: string;
  categories: string[];
  aiCategories: string[];
  artists: string[];
  images: string[];
  thumbnailUrl?: string;
  currency: string;
  estimate?: number;
  currentBid?: number;
  minBid?: number;
  soldPrice?: number;
  startTime?: string;
  endTime?: string;
  localEndTime?: string;
  city?: string;
  country: string;
  availability?: string;
  isActive: boolean;
  houseName?: string; // joined from auc_auction_houses
  houseLogoUrl?: string; // joined from auc_auction_houses
}

/** Search & filter parameters */
export interface SearchParams {
  query?: string;
  searchMode?: SearchMode;
  status?: SearchStatus;
  auctionIds?: number[];
  lotIds?: number[];
  categories?: string[];
  city?: string;
  houseId?: string;
  hasBids?: boolean;
  minPrice?: number;
  maxPrice?: number;
  sortBy?: SortOption;
  activeOnly?: boolean;
  page?: number;
  pageSize?: number;
}

export type SearchMode = "keyword" | "vector" | "hybrid" | "semantic";

export type SearchStatus = "active" | "ended" | "all";

export type SortOption =
  | "ending-soon"
  | "recently-ended"
  | "newly-listed"
  | "price-asc"
  | "price-desc"
  | "estimate-desc"
  | "most-bids"
  | "least-bids"
  | "last-bid"
  | "relevance";

/** API response types */
export interface SearchResponse {
  lots: Lot[];
  total: number;
  page: number;
  pageSize: number;
  stats: {
    windowCount: number;
  };
  facets: {
    categories: FacetCount[];
    cities: FacetCount[];
    houses: FacetCount[];
  };
}

export interface FacetCount {
  value: string;
  count: number;
  label?: string;
}

/** Ingestion result */
export interface IngestResult {
  houseId: string;
  status: "success" | "error" | "partial";
  lotsAdded: number;
  lotsUpdated: number;
  lotsSkipped: number;
  lotsRemoved: number;
  soldPricesUpdated?: number;
  durationMs: number;
  error?: string;
}

/** Price history point */
export interface PricePoint {
  bidAmount: number;
  recordedAt: string;
}
