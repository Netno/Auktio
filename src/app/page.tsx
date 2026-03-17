import { Suspense } from "react";
import { HomePageClient } from "@/components/HomePageClient";

export default function Page() {
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
      <HomePageClient />
    </Suspense>
  );
}
