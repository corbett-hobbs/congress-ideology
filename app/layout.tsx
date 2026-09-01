import type { Metadata } from "next";
import { Newsreader, IBM_Plex_Sans, IBM_Plex_Mono } from "next/font/google";
import { site, siteUrl } from "@/lib/site";
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

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${newsreader.variable} ${plexSans.variable} ${plexMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col bg-bg text-ink">
        <SiteHeader />
        {children}
      </body>
    </html>
  );
}
