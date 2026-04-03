"use client";

import { useEffect, useRef } from "react";
import { useSession } from "next-auth/react";

export function AnonymousActivityMigration() {
  const { data: session, status } = useSession();
  const migratedUserIdRef = useRef<string | null>(null);

  useEffect(() => {
    const userId = session?.user?.id;

    if (status !== "authenticated" || !userId) {
      return;
    }

    if (migratedUserIdRef.current === userId) {
      return;
    }

    migratedUserIdRef.current = userId;

    void fetch("/api/auth/migrate-anonymous", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
    }).catch(() => {
      migratedUserIdRef.current = null;
    });
  }, [session?.user?.id, status]);

  return null;
}