import type { DefaultSession } from "next-auth";
import type { AppUserRole } from "@/lib/app-users";

declare module "next-auth/jwt" {
  interface JWT {
    appUserId?: string;
    role?: AppUserRole;
    isActive?: boolean;
    authProvider?: string;
    lastLoginAt?: string;
  }
}

declare module "next-auth" {
  interface Session {
    user: DefaultSession["user"] & {
      id: string;
      role: AppUserRole;
      isActive: boolean;
      authProvider: string | null;
      lastLoginAt: string | null;
    };
  }
}
