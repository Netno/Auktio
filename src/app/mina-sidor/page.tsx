import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";

import { authOptions } from "@/lib/auth-options";
import { MinaSidorPageClient } from "@/components/MinaSidorPageClient";
import { type MinaSidorTab } from "@/lib/mina-sidor";

const VALID_TABS: MinaSidorTab[] = [
  "overview",
  "rules",
  "notifications",
  "profile",
  "privacy",
];

type MinaSidorPageProps = {
  searchParams?: {
    tab?: string;
  };
};

export default async function MinaSidorPage({
  searchParams,
}: MinaSidorPageProps) {
  const session = await getServerSession(authOptions);

  if (!session?.user?.id) {
    redirect("/auth/email?next=/mina-sidor");
  }

  const requestedTab = searchParams?.tab;
  const initialTab = VALID_TABS.includes(requestedTab as MinaSidorTab)
    ? (requestedTab as MinaSidorTab)
    : "overview";

  return <MinaSidorPageClient initialTab={initialTab} />;
}
