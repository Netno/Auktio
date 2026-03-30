export const SEARCH_EVALSET = [
  {
    query: "visa mig saker för trädgården",
    expectedConcepts: ["garden"],
    expectedTerms: ["trädgårdsmöbler", "trädgårdsstolar", "trädgårdsbord"],
  },
  {
    query: "föremål man kan hänga på väggen",
    expectedConcepts: ["wall-display"],
    expectedTerms: ["tavla", "målning", "litografi", "väggur", "spegel"],
  },
  {
    query: "något för förvaring i hallen",
    expectedConcepts: ["storage"],
    expectedTerms: ["skåp", "byrå", "hylla", "kista"],
  },
  {
    query: "saker för dukning",
    expectedConcepts: ["table-setting"],
    expectedTerms: ["servis", "tallrik", "bestick", "glas"],
  },
] as const;
