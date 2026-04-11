import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth-options";
import { MinDataPageClient } from "@/components/MinDataPageClient";
import { canAccessPersonalizationForSession } from "@/lib/recommendations-access";

export default async function MinDataPage() {
  const session = await getServerSession(authOptions);

  if (!session?.user?.id) {
    redirect("/auth/email?next=/min-data");
  }

  if (!canAccessPersonalizationForSession(session)) {
    redirect("/");
  }

  return <MinDataPageClient />;
}
