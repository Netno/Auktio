export type SearchEvalBucket =
  | "broad-intent"
  | "concrete-object"
  | "modifier-intent"
  | "regression-check"
  | "rag-alignment";

export interface SearchEvalCase {
  id: string;
  query: string;
  bucket: SearchEvalBucket;
  focus: string;
  expectedConcepts: string[];
  expectedTerms: string[];
  unacceptableTerms?: string[];
  notes?: string;
}

export const SEARCH_EVALSET: readonly SearchEvalCase[] = [
  {
    id: "garden-browse-1",
    query: "visa mig saker för trädgården",
    bucket: "broad-intent",
    focus:
      "Broad outdoor browse intent should prioritize garden furniture and decor.",
    expectedConcepts: ["garden"],
    expectedTerms: ["trädgårdsmöbler", "trädgårdsstolar", "trädgårdsbord"],
    unacceptableTerms: ["smycke", "vapen", "armbandsur"],
  },
  {
    id: "garden-browse-2",
    query: "något till uteplatsen",
    bucket: "broad-intent",
    focus: "Outdoor patio phrasing should map to the same garden concept.",
    expectedConcepts: ["garden"],
    expectedTerms: ["trädgårdsstol", "trädgårdsmöbel", "urna", "kruka"],
    unacceptableTerms: ["ljusstake", "brosch", "gevär"],
  },
  {
    id: "garden-browse-3",
    query: "utomhusmöbler",
    bucket: "concrete-object",
    focus: "Concrete outdoor-furniture query should stay highly precise.",
    expectedConcepts: ["garden"],
    expectedTerms: ["trädgårdsmöbler", "trädgårdsstolar", "trädgårdsbord"],
    unacceptableTerms: ["målning", "smycke"],
  },
  {
    id: "wall-browse-1",
    query: "föremål man kan hänga på väggen",
    bucket: "broad-intent",
    focus:
      "Broad wall-display intent should prefer explicit wall items over generic decor.",
    expectedConcepts: ["wall-display"],
    expectedTerms: ["tavla", "affisch", "väggrelief", "väggur", "spegel"],
    unacceptableTerms: ["halsband", "örhängen", "armband", "brosch"],
  },
  {
    id: "wall-browse-2",
    query: "saker till väggen",
    bucket: "broad-intent",
    focus: "Shorter phrasing should still retrieve wall-display items.",
    expectedConcepts: ["wall-display"],
    expectedTerms: ["tavla", "väggrelief", "väggur", "poster"],
    unacceptableTerms: ["medaljong", "smycke"],
  },
  {
    id: "wall-concrete-1",
    query: "väggur",
    bucket: "concrete-object",
    focus:
      "Exact wall clock query must remain precise after broad-query tuning.",
    expectedConcepts: ["wall-display"],
    expectedTerms: ["väggur"],
    unacceptableTerms: ["litografi", "halsband"],
  },
  {
    id: "wall-concrete-2",
    query: "väggrelief",
    bucket: "concrete-object",
    focus: "Exact wall relief query should rank explicit wall reliefs first.",
    expectedConcepts: ["wall-display"],
    expectedTerms: ["väggrelief"],
    unacceptableTerms: ["brosch", "örhängen"],
  },
  {
    id: "storage-browse-1",
    query: "något för förvaring i hallen",
    bucket: "broad-intent",
    focus:
      "Storage intent should prefer cabinets, chests and shelves over general furniture.",
    expectedConcepts: ["storage"],
    expectedTerms: ["skåp", "byrå", "hylla", "kista"],
    unacceptableTerms: ["bord", "målning", "stol"],
  },
  {
    id: "storage-browse-2",
    query: "möbel för förvaring",
    bucket: "broad-intent",
    focus: "General storage furniture query should remain storage-oriented.",
    expectedConcepts: ["storage"],
    expectedTerms: ["skåp", "vitrinskåp", "byrå", "bokhylla"],
    unacceptableTerms: ["soffa", "bord"],
  },
  {
    id: "storage-concrete-1",
    query: "vitrinskåp",
    bucket: "concrete-object",
    focus: "Exact display cabinet query should remain precise.",
    expectedConcepts: [],
    expectedTerms: ["vitrinskåp"],
    unacceptableTerms: ["tavla", "skulptur"],
  },
  {
    id: "storage-concrete-2",
    query: "kista",
    bucket: "concrete-object",
    focus: "Chest queries should not get diluted by broad storage expansions.",
    expectedConcepts: [],
    expectedTerms: ["kista"],
    unacceptableTerms: ["bord", "stol"],
  },
  {
    id: "table-setting-browse-1",
    query: "saker för dukning",
    bucket: "broad-intent",
    focus: "Table-setting intent should prioritize practical dining objects.",
    expectedConcepts: ["table-setting"],
    expectedTerms: ["servis", "tallrik", "bestick", "glas"],
    unacceptableTerms: ["väggrelief", "vas", "målning"],
  },
  {
    id: "table-setting-browse-2",
    query: "något att duka med",
    bucket: "broad-intent",
    focus:
      "Natural phrasing should still retrieve serving and table-setting items.",
    expectedConcepts: ["table-setting"],
    expectedTerms: ["tallrik", "glas", "bestick", "fat"],
    unacceptableTerms: ["byrå", "brosch"],
  },
  {
    id: "table-setting-concrete-1",
    query: "servis",
    bucket: "concrete-object",
    focus: "Exact dinnerware query should stay strongly lexical.",
    expectedConcepts: [],
    expectedTerms: ["servis"],
    unacceptableTerms: ["ljusstake", "vägglampa"],
  },
  {
    id: "table-setting-concrete-2",
    query: "bestick",
    bucket: "concrete-object",
    focus: "Cutlery query should not be pushed down by generic dining decor.",
    expectedConcepts: [],
    expectedTerms: ["bestick"],
    unacceptableTerms: ["vas", "skulptur"],
  },
  {
    id: "modifier-material-1",
    query: "vägglampa i mässing",
    bucket: "modifier-intent",
    focus: "Object plus material modifier should keep both signals intact.",
    expectedConcepts: ["wall-display"],
    expectedTerms: ["vägglampa", "mässing"],
    unacceptableTerms: ["taklampa", "armband"],
  },
  {
    id: "modifier-style-1",
    query: "retro trädgårdsmöbler",
    bucket: "modifier-intent",
    focus: "Style modifier should not break garden-intent retrieval.",
    expectedConcepts: ["garden"],
    expectedTerms: ["trädgårdsmöbler", "retro"],
    unacceptableTerms: ["modern konst"],
  },
  {
    id: "modifier-room-1",
    query: "förvaring till hallen i trä",
    bucket: "modifier-intent",
    focus: "Room + material modifiers should still preserve storage intent.",
    expectedConcepts: ["storage"],
    expectedTerms: ["skåp", "hylla", "byrå", "trä"],
    unacceptableTerms: ["matbord", "tavla"],
  },
  {
    id: "regression-painting-1",
    query: "målning",
    bucket: "regression-check",
    focus:
      "Painting searches must still rank paintings, not all wall-display items equally.",
    expectedConcepts: [],
    expectedTerms: ["målning", "olja", "akryl", "tavla"],
    unacceptableTerms: ["väggur", "vägglampa"],
  },
  {
    id: "regression-jewelry-1",
    query: "örhängen",
    bucket: "regression-check",
    focus: "Jewelry queries must not be penalized by wall-display logic.",
    expectedConcepts: [],
    expectedTerms: ["örhängen"],
    unacceptableTerms: ["väggrelief", "väggur", "tavla"],
  },
  {
    id: "regression-watch-1",
    query: "armbandsur",
    bucket: "regression-check",
    focus: "Watch queries should remain watch-specific.",
    expectedConcepts: [],
    expectedTerms: ["armbandsur"],
    unacceptableTerms: ["väggur", "poster"],
  },
  {
    id: "regression-chair-1",
    query: "stol",
    bucket: "regression-check",
    focus:
      "Simple lexical furniture queries should not be distorted by concept expansions.",
    expectedConcepts: [],
    expectedTerms: ["stol"],
    unacceptableTerms: ["tavla", "servis"],
  },
  {
    id: "rag-alignment-1",
    query: "visa mig saker för trädgården",
    bucket: "rag-alignment",
    focus:
      "Top candidates in standard search and RAG retrieval should show the same garden intent.",
    expectedConcepts: ["garden"],
    expectedTerms: ["trädgårdsstolar", "trädgårdsbord", "trädgårdsmöbler"],
    notes:
      "Compare standard API results with sources returned by the RAG path.",
  },
  {
    id: "rag-alignment-2",
    query: "föremål man kan hänga på väggen",
    bucket: "rag-alignment",
    focus:
      "RAG retrieval should not diverge into jewelry or unrelated decor for wall intent.",
    expectedConcepts: ["wall-display"],
    expectedTerms: ["tavla", "väggrelief", "väggur", "poster"],
    unacceptableTerms: ["örhängen", "armband", "brosch"],
    notes:
      "Use this as the main alignment canary between API and RAG retrieval.",
  },
] as const;
