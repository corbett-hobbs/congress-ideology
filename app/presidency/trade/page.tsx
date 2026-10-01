import type { Metadata } from "next";
import { TradePageClient } from "@/components/trade/TradePageClient";
import { getTradePageData } from "@/lib/trade-data";
import { site } from "@/lib/site";

/**
 * /presidency/trade — the Presidency vertical's Trade section. The filter bar and
 * the trade-balance chart are in; the tariff, partner and scatter charts land in
 * later sessions (docs: trade UI execution plan).
 */
export const metadata: Metadata = {
  title: "How does the U.S. trade with the world?",
  description:
    "U.S. goods trade with every partner and the calculated duties on imports since 1991, with presidential terms marked. From the Census Bureau and the U.S. International Trade Commission.",
  alternates: { canonical: "/presidency/trade" },
  openGraph: {
    title: `How does the U.S. trade with the world? · ${site.name}`,
    description: "U.S. goods trade and calculated duties on imports, by country. From the Census Bureau and the USITC.",
    url: "/presidency/trade",
  },
};

export default function TradePage() {
  return <TradePageClient data={getTradePageData()} />;
}
