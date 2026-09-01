import type { Metadata } from "next";
import { Suspense } from "react";
import { Newsreader, IBM_Plex_Sans, IBM_Plex_Mono } from "next/font/google";
import { site, siteUrl } from "@/lib/site";
import { CHAMBERS, type Chamber } from "@/lib/chamber";
import { getChamberCurrent } from "@/lib/congress-data";
import { stateName } from "@/lib/states";
import { SiteHeader } from "@/components/SiteHeader";
import "./globals.css";

const newsreader = Newsreader({
  variable: "--font-newsreader",
  subsets: ["latin"],
  style: ["normal", "italic"],
  display: "swap",
});

const plexSans = IBM_Plex_Sans({
  variable: "--font-plex-sans",
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  display: "swap",
});

const plexMono = IBM_Plex_Mono({
  variable: "--font-plex-mono",
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  display: "swap",
});

const HEADLINE = `${site.name} · 1789–present`;

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: {
    default: HEADLINE,
    template: `%s · ${site.name}`,
  },
  description: site.description,
  applicationName: site.name,
  authors: [{ name: "Corbett Hobbs" }],
  openGraph: {
    type: "website",
    siteName: site.name,
    title: HEADLINE,
    description: site.description,
  },
  twitter: {
    card: "summary_large_image",
    title: HEADLINE,
    description: site.description,
  },
};

function statesByChamber(): Record<Chamber, string[]> {
  const out = {} as Record<Chamber, string[]>;
  for (const chamber of CHAMBERS) {
    out[chamber] = [...new Set(getChamberCurrent(chamber).all.map((m) => m.state))].sort(
      (a, b) => stateName(a).localeCompare(stateName(b)),
    );
  }
  return out;
}

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${newsreader.variable} ${plexSans.variable} ${plexMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col bg-bg text-ink">
        <Suspense fallback={<div className="h-12 border-b border-line" />}>
          <SiteHeader statesByChamber={statesByChamber()} />
        </Suspense>
        {children}
      </body>
    </html>
  );
}
