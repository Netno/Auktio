import { canAccessAdmin } from "@/lib/app-users";

type RecommendationsSessionLike =
  | {
      user?: {
        role?: unknown;
        isActive?: boolean | null;
      } | null;
    }
  | null
  | undefined;

export function canAccessRecommendations(role: unknown) {
  return canAccessAdmin(role);
}

export function canAccessPersonalization(role: unknown) {
  return canAccessRecommendations(role);
}

export function canAccessRecommendationsForSession(
  session: RecommendationsSessionLike,
) {
  if (!session?.user || session.user.isActive === false) {
    return false;
  }

  return canAccessRecommendations(session.user.role);
}

export function canAccessPersonalizationForSession(
  session: RecommendationsSessionLike,
) {
  return canAccessRecommendationsForSession(session);
}
