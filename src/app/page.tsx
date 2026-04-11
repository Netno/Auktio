import { Suspense } from "react";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth-options";
import { HomePageClient } from "@/components/HomePageClient";
import { canAccessRecommendationsForSession } from "@/lib/recommendations-access";

export default async function Page() {
  const session = await getServerSession(authOptions);
  const canAccessRecommendations = canAccessRecommendationsForSession(session);

  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center bg-brand-50">
          <div className="animate-pulse font-serif text-xl text-brand-400">
            Laddar Auktio...
          </div>
        </div>
      }
    >
      <HomePageClient canAccessRecommendations={canAccessRecommendations} />
    </Suspense>
  );
}
