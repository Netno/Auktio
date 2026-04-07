import { generateQueryEmbedding } from "@/lib/embeddings";
import {
  type NotificationMatchKind,
  type RecommendationRuleSurface,
  type UserRecommendationRule,
} from "@/lib/mina-sidor";
import { createServerClient } from "@/lib/supabase";
import { listUserRecommendationRules } from "@/lib/user-recommendation-rules";

type SemanticMatchRow = {
  lot_id: number;
  similarity: number;
  categories: string[] | null;
};

type RuleLotRow = {
  id: number;
  title: string;
  description: string | null;
  categories: string[] | null;
  ai_categories: string[] | null;
  artists: string[] | null;
  current_bid: number | null;
  estimate: number | null;
  sold_price: number | null;
  end_time: string | null;
  availability: string | null;
  house_id: string | null;
  auc_auction_houses?: {
    name?: string | null;
  } | null;
};

type ProfileContext = {
  centroidEmbedding: number[] | null;
  topCategories: string[];
};

export type RuleDrivenLotMatch = {
  ruleId: number;
  ruleLabel: string;
  lotId: number;
  score: number;
  matchKind: NotificationMatchKind;
  reasonCodes: string[];
  scoreBreakdown: Record<string, number>;
  sourceContext: string;
};

type BuildRuleDrivenMatchesParams = {
  userId: string;
  surface: Exclude<RecommendationRuleSurface, "both">;
  profileContext?: ProfileContext | null;
  perRuleLimit?: number;
  totalLimit?: number;
};

const LOT_SELECT =
  "id, title, description, categories, ai_categories, artists, current_bid, estimate, sold_price, end_time, availability, house_id, auc_auction_houses(name)";

function parseEmbedding(value: unknown) {
  if (Array.isArray(value)) {
    const vector = value.filter(
      (item): item is number =>
        typeof item === "number" && Number.isFinite(item),
    );

    return vector.length > 0 ? vector : null;
  }

  if (typeof value === "string") {
    try {
      return parseEmbedding(JSON.parse(value));
    } catch {
      return null;
    }
  }

  return null;
}

function normalizeText(value: string) {
  return value
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "");
}

function buildLotCorpus(row: RuleLotRow) {
  return normalizeText(
    [
      row.title,
      row.description ?? "",
      ...(row.artists ?? []),
      ...(row.categories ?? []),
      ...(row.ai_categories ?? []),
      row.auc_auction_houses?.name ?? "",
    ].join(" "),
  );
}

function tokenize(value: string) {
  return normalizeText(value)
    .split(/\s+/)
    .map((token) => token.trim())
    .filter((token) => token.length > 1);
}

function computeLexicalScore(corpus: string, text: string | null | undefined) {
  if (!text?.trim()) {
    return 0;
  }

  const normalizedPhrase = normalizeText(text);
  const terms = tokenize(text);

  if (terms.length === 0) {
    return 0;
  }

  const exactPhraseBoost = corpus.includes(normalizedPhrase) ? 0.35 : 0;
  const matchedTerms = terms.filter((term) => corpus.includes(term)).length;

  return Math.min(1, exactPhraseBoost + matchedTerms / terms.length);
}

function computeBrandScore(corpus: string, brandsOrMakers: string[]) {
  if (!brandsOrMakers.length) {
    return 0;
  }

  const normalizedNeedles = brandsOrMakers.map(normalizeText);
  const matchedTerms = normalizedNeedles.filter((needle) =>
    corpus.includes(needle),
  ).length;

  return matchedTerms / normalizedNeedles.length;
}

function buildCategoryBoost(
  row: RuleLotRow,
  topCategories: string[] | null | undefined,
) {
  if (!topCategories?.length) {
    return 0;
  }

  const lotCategories = new Set([
    ...(row.categories ?? []),
    ...(row.ai_categories ?? []),
  ]);
  const overlap = topCategories.filter((category) =>
    lotCategories.has(category),
  ).length;

  return Math.min(0.14, overlap * 0.035);
}

function buildFreshnessBoost(endTime: string | null) {
  if (!endTime) {
    return 0;
  }

  const endTimeMs = new Date(endTime).getTime();

  if (!Number.isFinite(endTimeMs)) {
    return 0;
  }

  const hoursUntilEnd = (endTimeMs - Date.now()) / (1000 * 60 * 60);

  if (hoursUntilEnd <= 0) {
    return 0;
  }

  if (hoursUntilEnd <= 12) {
    return 0.08;
  }

  if (hoursUntilEnd <= 48) {
    return 0.05;
  }

  return 0.02;
}

function getEffectivePrice(row: RuleLotRow) {
  return row.current_bid ?? row.estimate ?? row.sold_price ?? null;
}

function isLotActive(row: RuleLotRow) {
  if (row.availability === "sold" || row.availability === "withdrawn") {
    return false;
  }

  if (!row.end_time) {
    return true;
  }

  const endTimeMs = new Date(row.end_time).getTime();

  return !Number.isFinite(endTimeMs) || endTimeMs > Date.now();
}

function matchesRule(
  row: RuleLotRow,
  rule: UserRecommendationRule,
  querySemanticScore: number,
) {
  if (!isLotActive(row)) {
    return false;
  }

  if (
    rule.houseIds.length &&
    (!row.house_id || !rule.houseIds.includes(row.house_id))
  ) {
    return false;
  }

  const lotCategories = new Set([
    ...(row.categories ?? []),
    ...(row.ai_categories ?? []),
  ]);

  if (
    rule.categories.length &&
    !rule.categories.some((category) => lotCategories.has(category))
  ) {
    return false;
  }

  if (
    rule.excludedCategories.length &&
    rule.excludedCategories.some((category) => lotCategories.has(category))
  ) {
    return false;
  }

  const effectivePrice = getEffectivePrice(row);
  if (
    rule.minPrice != null &&
    (effectivePrice == null || effectivePrice < rule.minPrice)
  ) {
    return false;
  }
  if (
    rule.maxPrice != null &&
    (effectivePrice == null || effectivePrice > rule.maxPrice)
  ) {
    return false;
  }

  const corpus = buildLotCorpus(row);
  const lexicalScore = computeLexicalScore(corpus, rule.queryText);
  const brandScore = computeBrandScore(corpus, rule.brandsOrMakers);

  if (rule.strictness === "strict") {
    if (rule.queryText && lexicalScore < 0.55 && querySemanticScore < 0.77) {
      return false;
    }

    if (rule.brandsOrMakers.length && brandScore < 0.75) {
      return false;
    }
  } else if (rule.queryText && lexicalScore === 0 && querySemanticScore === 0) {
    return false;
  }

  if (rule.brandsOrMakers.length && brandScore === 0) {
    return false;
  }

  return true;
}

function deriveMatchKind(rule: UserRecommendationRule): NotificationMatchKind {
  if (
    rule.houseIds.length > 0 &&
    !rule.queryText &&
    rule.categories.length === 0 &&
    rule.brandsOrMakers.length === 0
  ) {
    return "followed_house";
  }

  if (
    (rule.minPrice != null || rule.maxPrice != null) &&
    !rule.queryText &&
    rule.categories.length === 0 &&
    rule.houseIds.length === 0 &&
    rule.brandsOrMakers.length === 0
  ) {
    return "price_fit";
  }

  return "rule_direct";
}

function scoreRuleMatch(params: {
  rule: UserRecommendationRule;
  row: RuleLotRow;
  topCategories: string[];
  profileSemanticScore: number;
  querySemanticScore: number;
}) {
  const { rule, row, topCategories, profileSemanticScore, querySemanticScore } =
    params;
  const corpus = buildLotCorpus(row);
  const lexicalScore = computeLexicalScore(corpus, rule.queryText);
  const brandScore = computeBrandScore(corpus, rule.brandsOrMakers);
  const categoryBoost = buildCategoryBoost(row, topCategories);
  const freshnessBoost = buildFreshnessBoost(row.end_time);
  const priorityBoost = Math.max(0, Math.min(0.12, rule.priority * 0.02));

  const scoreBreakdown = {
    lexical: Number(lexicalScore.toFixed(4)),
    brand: Number(brandScore.toFixed(4)),
    querySemantic: Number(querySemanticScore.toFixed(4)),
    profileSemantic: Number(profileSemanticScore.toFixed(4)),
    category: Number(categoryBoost.toFixed(4)),
    freshness: Number(freshnessBoost.toFixed(4)),
    priority: Number(priorityBoost.toFixed(4)),
  };

  const score = Math.min(
    0.999,
    0.12 +
      priorityBoost +
      lexicalScore * 0.26 +
      brandScore * 0.16 +
      querySemanticScore * 0.28 +
      profileSemanticScore * 0.14 +
      categoryBoost +
      freshnessBoost,
  );

  const reasonCodes = [
    rule.queryText ? "rule_query" : null,
    rule.categories.length ? "rule_category" : null,
    rule.houseIds.length ? "rule_house" : null,
    rule.brandsOrMakers.length ? "rule_brand" : null,
    rule.minPrice != null || rule.maxPrice != null ? "rule_price" : null,
    profileSemanticScore > 0.72 ? "profile_similarity" : null,
  ].filter((value): value is string => Boolean(value));

  return {
    score,
    scoreBreakdown,
    reasonCodes,
  };
}

async function loadProfileContext(
  userId: string,
  provided: ProfileContext | null | undefined,
): Promise<ProfileContext> {
  if (provided) {
    return provided;
  }

  const supabase = createServerClient();
  const { data } = await supabase
    .from("auc_user_interest_profiles")
    .select("centroid_embedding, top_categories")
    .eq("user_id", userId)
    .maybeSingle<{
      centroid_embedding: unknown;
      top_categories: string[] | null;
    }>();

  return {
    centroidEmbedding: parseEmbedding(data?.centroid_embedding),
    topCategories: data?.top_categories ?? [],
  };
}

async function loadSemanticScoreMap(
  embedding: number[] | null,
  matchCount: number,
) {
  if (!embedding) {
    return new Map<number, number>();
  }

  const supabase = createServerClient();
  const { data, error } = await supabase.rpc("auc_semantic_search_lots", {
    query_embedding: JSON.stringify(embedding),
    match_threshold: 0.68,
    match_count: matchCount,
  });

  if (error) {
    throw new Error(
      `[recommendation-rule-engine] Failed semantic search: ${error.message}`,
    );
  }

  return new Map(
    ((data ?? []) as SemanticMatchRow[])
      .filter((row) => Number.isInteger(row.lot_id) && row.lot_id > 0)
      .map((row) => [row.lot_id, row.similarity]),
  );
}

async function loadRuleQuerySemanticScoreMap(rule: UserRecommendationRule) {
  if (!rule.queryText?.trim()) {
    return new Map<number, number>();
  }

  try {
    const queryEmbedding = await generateQueryEmbedding(rule.queryText);
    return loadSemanticScoreMap(
      queryEmbedding,
      rule.strictness === "strict" ? 70 : 90,
    );
  } catch (error) {
    console.warn(
      "[recommendation-rule-engine] Failed query embedding for rule",
      rule.id,
      error,
    );
    return new Map<number, number>();
  }
}

async function fetchLotsByIds(lotIds: number[]) {
  if (!lotIds.length) {
    return [] as RuleLotRow[];
  }

  const supabase = createServerClient();
  const { data, error } = await supabase
    .from("auc_lots")
    .select(LOT_SELECT)
    .in("id", lotIds)
    .returns<RuleLotRow[]>();

  if (error) {
    throw new Error(
      `[recommendation-rule-engine] Failed to load lots by ids: ${error.message}`,
    );
  }

  return data;
}

async function fetchStructuredCandidates(rule: UserRecommendationRule) {
  const supabase = createServerClient();
  const nowIso = new Date().toISOString();
  const queries: PromiseLike<{
    data: RuleLotRow[] | null;
    error: { message: string } | null;
  }>[] = [];

  const buildBaseQuery = () => {
    let query = supabase
      .from("auc_lots")
      .select(LOT_SELECT)
      .gt("end_time", nowIso)
      .order("end_time", { ascending: true })
      .limit(rule.queryText || rule.brandsOrMakers.length ? 120 : 160);

    if (rule.houseIds.length) {
      query = query.in("house_id", rule.houseIds);
    }

    if (rule.minPrice != null) {
      query = query.gte("current_bid", rule.minPrice);
    }

    if (rule.maxPrice != null) {
      query = query.lte("current_bid", rule.maxPrice);
    }

    return query;
  };

  if (rule.categories.length) {
    queries.push(
      buildBaseQuery()
        .overlaps("categories", rule.categories)
        .returns<RuleLotRow[]>(),
    );
    queries.push(
      buildBaseQuery()
        .overlaps("ai_categories", rule.categories)
        .returns<RuleLotRow[]>(),
    );
  } else {
    queries.push(buildBaseQuery().returns<RuleLotRow[]>());
  }

  const results = await Promise.all(queries);
  const rows: RuleLotRow[] = [];

  for (const result of results) {
    if (result.error) {
      throw new Error(
        `[recommendation-rule-engine] Failed to load structured candidates: ${result.error.message}`,
      );
    }

    rows.push(...(result.data ?? []));
  }

  return rows;
}

function dedupeRows(rows: RuleLotRow[]) {
  const byId = new Map<number, RuleLotRow>();

  for (const row of rows) {
    if (!byId.has(row.id)) {
      byId.set(row.id, row);
    }
  }

  return Array.from(byId.values());
}

async function buildMatchesForRule(
  rule: UserRecommendationRule,
  topCategories: string[],
  profileSemanticScores: Map<number, number>,
  perRuleLimit: number,
) {
  const querySemanticScores = await loadRuleQuerySemanticScoreMap(rule);
  const semanticRows = await fetchLotsByIds(
    Array.from(querySemanticScores.keys()),
  );
  const structuredRows = await fetchStructuredCandidates(rule);
  const candidates = dedupeRows([...semanticRows, ...structuredRows]);

  return candidates
    .filter((row) =>
      matchesRule(row, rule, querySemanticScores.get(row.id) ?? 0),
    )
    .map((row) => {
      const querySemanticScore = querySemanticScores.get(row.id) ?? 0;
      const profileSemanticScore = profileSemanticScores.get(row.id) ?? 0;
      const scored = scoreRuleMatch({
        rule,
        row,
        topCategories,
        profileSemanticScore,
        querySemanticScore,
      });

      return {
        ruleId: rule.id,
        ruleLabel: rule.label,
        lotId: row.id,
        score: scored.score,
        matchKind: deriveMatchKind(rule),
        reasonCodes: scored.reasonCodes,
        scoreBreakdown: scored.scoreBreakdown,
        sourceContext: JSON.stringify({
          ruleId: rule.id,
          ruleLabel: rule.label,
          reasonCodes: scored.reasonCodes,
          strictness: rule.strictness,
        }),
      } satisfies RuleDrivenLotMatch;
    })
    .sort((left, right) => right.score - left.score)
    .slice(0, perRuleLimit);
}

export async function buildRuleDrivenMatches(
  params: BuildRuleDrivenMatchesParams,
) {
  const rules = (await listUserRecommendationRules(params.userId)).filter(
    (rule) =>
      rule.enabled &&
      (rule.surface === params.surface || rule.surface === "both"),
  );

  if (!rules.length) {
    return [] as RuleDrivenLotMatch[];
  }

  const profileContext = await loadProfileContext(
    params.userId,
    params.profileContext,
  );
  const profileSemanticScores = await loadSemanticScoreMap(
    profileContext.centroidEmbedding,
    Math.max(120, (params.totalLimit ?? 40) * 4),
  );
  const ruleMatches = await Promise.all(
    rules.map((rule) =>
      buildMatchesForRule(
        rule,
        profileContext.topCategories,
        profileSemanticScores,
        params.perRuleLimit ?? 12,
      ),
    ),
  );

  const flattened = ruleMatches.flat();

  if (params.surface === "notification") {
    return flattened
      .sort((left, right) => right.score - left.score)
      .slice(0, params.totalLimit ?? 60);
  }

  const byLotId = new Map<number, RuleDrivenLotMatch>();

  for (const match of flattened.sort(
    (left, right) => right.score - left.score,
  )) {
    const existing = byLotId.get(match.lotId);

    if (!existing || match.score > existing.score) {
      byLotId.set(match.lotId, match);
    }
  }

  return Array.from(byLotId.values())
    .sort((left, right) => right.score - left.score)
    .slice(0, params.totalLimit ?? 40);
}
