import type { NextAuthOptions } from "next-auth";
import GoogleProvider from "next-auth/providers/google";
import {
  getBootstrapRoleForEmail,
  getAppUserByEmail,
  isAppUserRole,
  syncGoogleUser,
} from "@/lib/app-users";

export const authOptions: NextAuthOptions = {
  providers: [
    GoogleProvider({
      clientId: process.env.AUTH_GOOGLE_ID ?? "",
      clientSecret: process.env.AUTH_GOOGLE_SECRET ?? "",
    }),
  ],
  secret: process.env.AUTH_SECRET,
  pages: {
    error: "/auth/error",
  },
  callbacks: {
    async signIn({ user, account }) {
      if (
        account?.provider !== "google" ||
        !user.email ||
        !account.providerAccountId
      ) {
        return false;
      }

      await syncGoogleUser({
        email: user.email,
        name: user.name,
        imageUrl: user.image,
        googleSubject: account.providerAccountId,
      });

      return true;
    },
    async jwt({ token }) {
      if (token.email) {
        const appUser = await getAppUserByEmail(token.email);

        if (appUser) {
          token.appUserId = appUser.id;
          token.role = appUser.role;
          token.isActive = appUser.isActive;
          token.authProvider = appUser.authProvider;
          token.lastLoginAt = appUser.lastLoginAt ?? undefined;
        } else {
          token.role = getBootstrapRoleForEmail(token.email);
          token.isActive = true;
          token.authProvider = "google";
        }
      }

      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id =
          typeof token.appUserId === "string"
            ? token.appUserId
            : typeof token.sub === "string"
              ? token.sub
              : "";
        session.user.role = isAppUserRole(token.role) ? token.role : "user";
        session.user.isActive = token.isActive !== false;
        session.user.authProvider =
          typeof token.authProvider === "string" ? token.authProvider : null;
        session.user.lastLoginAt =
          typeof token.lastLoginAt === "string" ? token.lastLoginAt : null;
      }

      return session;
    },
  },
};
