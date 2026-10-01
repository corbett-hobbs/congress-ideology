import type { Metadata } from "next";
import { PageHeader } from "@/components/PageHeader";
import { site } from "@/lib/site";

/**
 * /presidency/trade — the Presidency vertical's Trade section. This is the shell
 * (route, nav entry, data layer in lib/trade-data.ts); the filter bar and charts
 * land in later sessions.
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
  return (
    <main className="mx-auto flex w-full max-w-[1180px] flex-col gap-6 px-4 pb-16 pt-7 sm:px-6">
      <PageHeader title="How Does the U.S. Trade With the World?">
        <p>
          Who the country buys from and sells to, what tariffs were in force, and what changed when the courts,
          Congress and the White House pulled different levers. Trade values come from the Census Bureau. Calculated
          duties on imports come from the Census Bureau from 2010 and from the U.S. International Trade Commission
          for 1993 to 2009.
        </p>
      </PageHeader>

      <p className="m-0 text-[0.8rem] leading-[1.6] text-ink-muted">
        Source: U.S. Census Bureau (trade values and calculated duties, 2010 on); U.S. International Trade Commission
        DataWeb (calculated duties, 1993 to 2009). Goods only, Census basis; services are not included. Calculated duties
        are computed from import entries, not Treasury receipts.
      </p>
    </main>
  );
}
