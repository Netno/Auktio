import type { AuctionHouse } from "@/lib/types";

/**
 * Feed source registry.
 * Add new auction houses here — the ingester will pick them up automatically.
 * These are also seeded into the auc_auction_houses table on first run.
 */
export const FEED_SOURCES: Omit<AuctionHouse, "active" | "lastSynced">[] = [
  {
    id: "olsens-auktioner",
    name: "Olsens Auktioner",
    feedUrl: "https://www.olsensauktioner.se/api/feed?apiVersion=2.0",
    websiteUrl: "https://www.olsensauktioner.se",
    city: "Norrköping",
    country: "SE",
  },
  {
    id: "ystads-auktioner",
    name: "Ystads Auktioner",
    feedUrl: "https://www.ystadsauktioner.se/api/feed?apiVersion=2.0",
    websiteUrl: "https://www.ystadsauktioner.se",
    city: "Ystad",
    country: "SE",
  },
  {
    id: "knutson-bloom",
    name: "Knutson & Bloom Auktioner",
    feedUrl: "https://www.knutsonbloomauktioner.se/api/feed?apiVersion=2.0",
    websiteUrl: "https://www.knutsonbloomauktioner.se",
    city: "Malmö",
    country: "SE",
  },
  {
    id: "myntauktioner",
    name: "Myntauktioner",
    feedUrl: "https://www.myntauktioner.se/api/feed?apiVersion=2.0",
    websiteUrl: "https://www.myntauktioner.se",
    city: "Stockholm",
    country: "SE",
  },
  {
    id: "dahlstroms-rare-prints",
    name: "Dahlstroms Rare Prints",
    feedUrl:
      "https://auctions.dahlstromsrareprints.com/api/feed?apiVersion=2.0",
    websiteUrl: "https://auctions.dahlstromsrareprints.com",
    city: "Tallinn",
    country: "EE",
  },
  {
    id: "karlssons-auktioner",
    name: "Karlssons Auktioner",
    feedUrl: "https://www.karlssonsauktioner.se/api/feed?apiVersion=2.0",
    websiteUrl: "https://www.karlssonsauktioner.se",
    city: "Trelleborg",
    country: "SE",
  },
  {
    id: "dalarnas-auktionsbyra",
    name: "Dalarnas Auktionsbyra",
    feedUrl: "https://www.dalarnasauktionsbyra.se/api/feed?apiVersion=2.0",
    websiteUrl: "https://www.dalarnasauktionsbyra.se",
    city: "Borlange",
    country: "SE",
  },
  {
    id: "laholms-auktioner",
    name: "Laholms Handel Auktioner Partier",
    feedUrl: "https://www.laholmsauktioner.se/api/feed?apiVersion=2.0",
    websiteUrl: "https://www.laholmsauktioner.se",
    city: "Laholm",
    country: "SE",
  },
  {
    id: "bergviks-auktionstjanst",
    name: "Bergviks Auktionstjanst",
    feedUrl: "https://www.auktionstjanst.se/api/feed?apiVersion=2.0",
    websiteUrl: "https://www.auktionstjanst.se",
    city: "Bergvik",
    country: "SE",
  },
  {
    id: "snapphane-auktioner",
    name: "Snapphane Auktioner",
    feedUrl: "https://www.snapphaneauktioner.se/api/feed?apiVersion=2.0",
    websiteUrl: "https://www.snapphaneauktioner.se",
    city: "Hassleholm",
    country: "SE",
  },
  {
    id: "bastionen-auktioner",
    name: "Bastionen Auktioner",
    feedUrl: "https://www.basti.dk/api/feed?apiVersion=2.0",
    websiteUrl: "https://www.basti.dk",
    city: "Vordingborg",
    country: "DK",
  },
  // ─── Add more sources below ───
  // {
  //   id: "uppsalaauktion",
  //   name: "Uppsala Auktionskammare",
  //   feedUrl: "https://www.uppsalaauktion.se/api/feed?apiVersion=2.0",
  //   websiteUrl: "https://www.uppsalaauktion.se",
  //   city: "Uppsala",
  //   country: "SE",
  // },
];

/** All known categories across feeds (for facet display order) */
export const CATEGORY_ORDER = [
  "Möbler",
  "Design",
  "Konst",
  "Silver",
  "Smycken",
  "Mattor",
  "Belysning",
  "Glas",
  "Porslin",
  "Klockor",
  "Retro",
  "Böcker",
  "Diverse",
] as const;

export type KnownCategory = (typeof CATEGORY_ORDER)[number];

/** Swedish cities we know about */
export const KNOWN_CITIES = [
  "Stockholm",
  "Göteborg",
  "Malmö",
  "Uppsala",
  "Norrköping",
  "Linköping",
  "Helsingborg",
  "Lund",
  "Västerås",
  "Örebro",
  "Ystad",
  "Trelleborg",
  "Borlänge",
  "Laholm",
  "Hässleholm",
  "Bergvik",
] as const;
