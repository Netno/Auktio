import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth-options";
import { MinDataPageClient } from "@/components/MinDataPageClient";

export default async function MinDataPage() {
  const session = await getServerSession(authOptions);

  if (!session?.user?.id) {
    redirect("/auth/email?next=/min-data");
  }

  return <MinDataPageClient />;
}