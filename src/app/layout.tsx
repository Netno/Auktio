import type { Metadata } from "next";
import { DM_Sans, Playfair_Display } from "next/font/google";
import "./globals.css";

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
      <body className="font-sans antialiased">{children}</body>
    </html>
  );
}
