"use client";

import { Suspense, useEffect, useState } from "react";
import { Heart, Menu, X } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useSession } from "next-auth/react";
import { AuthControls } from "@/components/AuthControls";
import { canAccessPersonalization } from "@/lib/recommendations-access";

interface HeaderProps {
  favoritesCount?: number;
  showFavsOnly?: boolean;
  onToggleFavs?: () => void;
  activeView?: "lots" | "auctions" | "admin" | "ai-usage" | "account";
}

interface HeaderMenuProps {
  items: HeaderNavItem[];
  className?: string;
  buttonClassName?: string;
}

type HeaderNavItem = {
  href: string;
  label: string;
  active: boolean;
};

function HeaderMenu({ items, className, buttonClassName }: HeaderMenuProps) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  return (
    <div
      className={`relative ${className ?? "col-span-2 sm:col-span-1 lg:col-span-auto"}`}
    >
      <button
        type="button"
        onClick={() => setOpen((current) => !current)}
        aria-expanded={open}
        aria-label="Öppna meny"
        className={
          buttonClassName ??
          "inline-flex min-h-10 w-full items-center justify-center gap-2 rounded-xl border border-white/[0.08] bg-white/[0.06] px-3 py-2 text-[13px] font-medium text-white/80 transition-all hover:bg-white/[0.12] hover:text-white sm:min-h-9 sm:w-auto sm:rounded-lg sm:px-4 sm:py-1.5"
        }
      >
        {open ? <X size={16} /> : <Menu size={16} />}
        <span>Meny</span>
      </button>

      {open && (
        <div className="absolute right-0 top-[calc(100%+8px)] z-50 min-w-[220px] overflow-hidden rounded-2xl border border-white/10 bg-brand-950 p-1.5 shadow-2xl shadow-black/40 sm:min-w-[240px]">
          {items.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={`flex items-center justify-between rounded-xl px-3 py-2 text-[13px] font-medium transition-all ${
                item.active
                  ? "bg-accent-500 text-white"
                  : "text-white hover:bg-white/10"
              }`}
            >
              <span>{item.label}</span>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

export function Header({
  favoritesCount,
  showFavsOnly,
  onToggleFavs,
  activeView = "lots",
}: HeaderProps) {
  const { data: session } = useSession();
  const canAccessPersonalizedFeatures = canAccessPersonalization(
    session?.user?.role,
  );
  const navItems: HeaderNavItem[] = [
    { href: "/", label: "Föremål", active: activeView === "lots" },
    {
      href: "/auctions",
      label: "Auktioner",
      active: activeView === "auctions",
    },
  ];

  if (session?.user && canAccessPersonalizedFeatures) {
    navItems.push({
      href: "/mina-sidor",
      label: "Mina Sidor",
      active: activeView === "account",
    });
  }

  if (session?.user?.role === "admin" || session?.user?.role === "owner") {
    navItems.push(
      { href: "/admin", label: "Admin", active: activeView === "admin" },
      {
        href: "/ai-usage",
        label: "AI-statistik",
        active: activeView === "ai-usage",
      },
    );
  }

  return (
    <header className="sticky top-0 z-50 bg-brand-900 border-b border-white/5">
      <div className="mx-auto max-w-[1360px] px-4 py-2 sm:flex sm:h-14 sm:items-center sm:justify-between sm:px-6 sm:py-0">
        <div className="flex items-center justify-between gap-3 sm:contents">
          <Link href="/" className="flex items-center gap-2.5 group">
            <span className="h-2 w-2 rounded-full bg-accent-500 transition-transform group-hover:scale-125" />
            <span className="font-serif text-[18px] font-semibold tracking-tight text-white/95 sm:text-[20px]">
              Auktio
            </span>
          </Link>

          <div className="flex items-center gap-2 sm:hidden">
            {onToggleFavs && canAccessPersonalizedFeatures && (
              <button
                onClick={onToggleFavs}
                className={`inline-flex min-h-9 items-center gap-2 rounded-full px-3 py-1.5 text-[12px] font-medium transition-all ${
                  showFavsOnly
                    ? "bg-accent-500 text-white"
                    : "border border-white/[0.08] bg-white/[0.06] text-white/75"
                }`}
              >
                <Heart
                  size={14}
                  fill={showFavsOnly ? "currentColor" : "none"}
                />
                <span>Bevakade</span>
                {(favoritesCount ?? 0) > 0 && (
                  <span className="rounded-full bg-white/20 px-2 py-0.5 text-[11px] font-semibold">
                    {favoritesCount}
                  </span>
                )}
              </button>
            )}

            <HeaderMenu
              items={navItems}
              className="relative"
              buttonClassName="inline-flex min-h-9 items-center justify-center gap-2 rounded-lg border border-white/[0.08] bg-white/[0.06] px-3 py-1.5 text-[12px] font-medium text-white/80 transition-all hover:bg-white/[0.12] hover:text-white"
            />
          </div>
        </div>

        <div className="mt-2 grid grid-cols-1 gap-2 sm:mt-0 sm:flex sm:items-center sm:gap-2">
          <Suspense
            fallback={
              <div className="hidden h-9 w-28 animate-pulse rounded-lg bg-white/[0.08] lg:block" />
            }
          >
            <AuthControls />
          </Suspense>

          {onToggleFavs && canAccessPersonalizedFeatures && (
            <button
              onClick={onToggleFavs}
              className={`hidden sm:inline-flex sm:min-h-9 sm:items-center sm:gap-2 sm:rounded-lg sm:px-4 sm:py-1.5 sm:text-[13px] sm:font-medium sm:transition-all ${
                showFavsOnly
                  ? "bg-accent-500 text-white"
                  : "border border-white/[0.08] bg-white/[0.06] text-white/70 hover:bg-white/[0.12] hover:text-white"
              }`}
            >
              <Heart size={14} fill={showFavsOnly ? "currentColor" : "none"} />
              <span>Bevakade</span>
              {(favoritesCount ?? 0) > 0 && (
                <span className="rounded-full bg-white/20 px-2 py-0.5 text-[11px] font-semibold">
                  {favoritesCount}
                </span>
              )}
            </button>
          )}
          <HeaderMenu items={navItems} className="hidden sm:block" />
        </div>
      </div>
    </header>
  );
}
