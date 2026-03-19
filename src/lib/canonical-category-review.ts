import { hasOnlyGenericRawCategories } from "./category-normalization";

export type CanonicalCategoryReviewReason =
  | "missing-categories"
  | "contains-diverse"
  | "generic-raw-category";

type ReviewCandidateInput = {
  categories: string[] | null | undefined;
  rawCategories: string[] | null | undefined;
};

type IngestCategoryResolutionInput = {
  existingCategories: string[] | null | undefined;
  incomingCategories: string[] | null | undefined;
  incomingRawCategories: string[] | null | undefined;
};

export function getCanonicalCategoryReviewReasons(
  lot: ReviewCandidateInput,
): CanonicalCategoryReviewReason[] {
  const reasons: CanonicalCategoryReviewReason[] = [];

  if (!lot.categories || lot.categories.length === 0) {
    reasons.push("missing-categories");
  }

  if (lot.categories?.includes("Diverse")) {
    reasons.push("contains-diverse");
  }

  if (hasOnlyGenericRawCategories(lot.rawCategories)) {
    reasons.push("generic-raw-category");
  }

  return reasons;
}

export function needsCanonicalCategoryReview(lot: ReviewCandidateInput) {
  return getCanonicalCategoryReviewReasons(lot).length > 0;
}

export function resolveCanonicalCategoriesForIngest(
  input: IngestCategoryResolutionInput,
) {
  const existingCategories = input.existingCategories ?? [];
  const incomingCategories = input.incomingCategories ?? [];
  const hasSpecificExistingCategories =
    existingCategories.length > 0 && !existingCategories.includes("Diverse");
  const incomingHasOnlyDiverse =
    incomingCategories.length === 1 && incomingCategories[0] === "Diverse";

  if (!hasSpecificExistingCategories) {
    return incomingCategories;
  }

  if (hasOnlyGenericRawCategories(input.incomingRawCategories)) {
    return existingCategories;
  }

  if (incomingCategories.length === 0 || incomingHasOnlyDiverse) {
    return existingCategories;
  }

  return incomingCategories;
}