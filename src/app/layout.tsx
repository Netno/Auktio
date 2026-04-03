import { Suspense } from "react";
import type { Metadata } from "next";
import { DM_Sans, Playfair_Display } from "next/font/google";
import Script from "next/script";
import { AnonymousActivityMigration } from "@/components/AnonymousActivityMigration";
import { AnonymousSessionBootstrap } from "@/components/AnonymousSessionBootstrap";
import { AuthProvider } from "@/components/AuthProvider";
import { ConsentBanner } from "@/components/ConsentBanner";
import { GoogleAnalyticsTracker } from "@/components/GoogleAnalyticsTracker";
import "./globals.css";

const GA_MEASUREMENT_ID = "G-WK3BHYK9ND";

const dmSans = DM_Sans({
  subsets: ["latin"],
  variable: "--font-dm-sans",
  display: "swap",
});

const playfair = Playfair_Display({
  subsets: ["latin"],
  variable: "--font-playfair",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Auktio — Alla Sveriges auktioner, ett intelligent sök",
  description:
    "Sök och bevaka föremål från Sveriges ledande auktionshus. Intelligent sökning och AI-driven kategorisering.",
  keywords: [
    "auktion",
    "auktioner",
    "Sverige",
    "antikt",
    "konst",
    "design",
    "möbler",
    "silver",
    "smycken",
  ],
  openGraph: {
    title: "Auktio",
    description: "Alla Sveriges auktioner, ett intelligent sök",
    type: "website",
    locale: "sv_SE",
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="sv" className={`${dmSans.variable} ${playfair.variable}`}>
      <head>
        <link
          rel="preconnect"
          href="https://media.skeleton.bbys.io"
          crossOrigin=""
        />
        <link rel="dns-prefetch" href="https://media.skeleton.bbys.io" />
      </head>
      <body className="font-sans antialiased">
        <AuthProvider>
          <Script
            src={`https://www.googletagmanager.com/gtag/js?id=${GA_MEASUREMENT_ID}`}
            strategy="afterInteractive"
          />
          <Script id="google-analytics" strategy="afterInteractive">
            {`
              window.dataLayer = window.dataLayer || [];
              function gtag(){dataLayer.push(arguments);}
              gtag('js', new Date());
              gtag('consent', 'default', {
                analytics_storage: 'denied',
                ad_storage: 'denied',
                ad_user_data: 'denied',
                ad_personalization: 'denied',
                functionality_storage: 'granted',
                personalization_storage: 'denied',
                security_storage: 'granted',
                wait_for_update: 500
              });
              gtag('config', '${GA_MEASUREMENT_ID}', { send_page_view: false });
            `}
          </Script>
          <AnonymousSessionBootstrap />
          <AnonymousActivityMigration />
          <Suspense fallback={null}>
            <GoogleAnalyticsTracker measurementId={GA_MEASUREMENT_ID} />
          </Suspense>
          <ConsentBanner />
          {children}
        </AuthProvider>
      </body>
    </html>
  );
}
