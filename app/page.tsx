import type { Metadata } from "next";
import Link from "next/link";
import { getBothTrend } from "@/lib/congress-data";
import { branches } from "@/lib/verticals";
import { site } from "@/lib/site";
import { getCourtHubSummary } from "@/lib/justice-data";
import { getExecutiveOrdersData } from "@/lib/executive-orders-data";
import { HubSparkline } from "@/components/HubSparkline";
import { CourtHubSparkline } from "@/components/court/CourtHubSparkline";
import { SiteFooter } from "@/components/senate/SiteFooter";
import { ordinal } from "@/components/senate/format";
import { PageHeader } from "@/components/PageHeader";

export const metadata: Metadata = {
  title: { absolute: `${site.name} · 1789–present` },
  description: site.hubDescription,
  alternates: { canonical: "/" },
  openGraph: {
    title: site.name,
    description: site.hubDescription,
    url: "/",
  },
};

const BLURBS: Record<string, string> = {
  congress:
    "Every member\u2019s votes as a two-dimensional ideology score, plus estimated net worth from financial disclosures.",
  "supreme-court":
    // PLACEHOLDER COPY — awaiting Corby's edit.
    "Where the justices sit over time, from Martin\u2013Quinn ideology scores.",
  presidency:
    "Executive orders signed each year since 1994, stacked by topic, with each presidential term marked.",
};

const fmt2 = (n: number) => n.toFixed(2);

export default function Hub() {
  const trend = getBothTrend();
  const latest = [...trend]
    .reverse()
    .find((p) => p.dem != null && p.rep != null);
  const court = getCourtHubSummary();
  const orders = getExecutiveOrdersData();
  const gap = latest ? (latest.rep as number) - (latest.dem as number) : null;

  return (
    <>
      <main className="mx-auto flex w-full max-w-[1180px] flex-1 flex-col gap-8 px-4 pb-16 pt-10 sm:px-6 sm:pt-14">
        <PageHeader title={site.tagline} size="hero">
          <p>
            Explore ideology, net worth, and more across all three branches of
            the U.S. government.
          </p>
          <p>
            Every roll call, every ruling, and every financial disclosure leaves
            a trail. We turn those public records into data you can scrub
            through, compare, and dig into. Start with Congress, the Supreme Court,
            or the presidency&rsquo;s executive orders.
          </p>
        </PageHeader>

        <div className="grid gap-4 md:grid-cols-2">
          {branches.map((b) => {
            const live = b.status === "live";
            const isCongress = b.id === "congress";
            return (
              <section
                key={b.id}
                aria-labelledby={`hub-${b.id}`}
                className={`flex flex-col gap-4 rounded-xl border border-line bg-surface p-5 ${
                  live ? "" : "opacity-70"
                }`}
              >
                <div className="flex items-baseline justify-between gap-3">
                  <h2
                    id={`hub-${b.id}`}
                    className="font-serif text-2xl font-semibold tracking-tight"
                  >
                    {live ? (
                      <Link href={b.href} className="hover:text-accent">
                        {b.label}
                      </Link>
                    ) : (
                      b.label
                    )}
                  </h2>
                  {!live && (
                    <span className="font-mono text-[0.68rem] uppercase tracking-[0.08em] text-ink-faint">
                      Coming soon
                    </span>
                  )}
                </div>
                <p className="text-[0.95rem] leading-relaxed text-ink-muted">
                  {BLURBS[b.id]}
                </p>

                {isCongress && gap != null && (
                  <div className="flex flex-col gap-2">
                    <HubSparkline trend={trend} />
                    <p className="text-[0.85rem] text-ink-muted">
                      <span className="font-serif text-2xl font-semibold text-ink">
                        {fmt2(gap)}
                      </span>{" "}
                      gap between the party means on dimension 1,{" "}
                      {ordinal(latest!.congress)} Congress (House and Senate)
                    </p>
                  </div>
                )}

                {b.id === "supreme-court" && (
                  <div className="flex flex-col gap-2">
                    <CourtHubSparkline summary={court} />
                    <p className="text-[0.85rem] text-ink-muted">
                      <span className="font-serif text-2xl font-semibold text-ink">
                        {court.medianJusticeName}
                      </span>{" "}
                      Median justice, {court.lastTerm} term
                    </p>
                  </div>
                )}

                {b.id === "presidency" && (
                  <p className="text-[0.85rem] text-ink-muted">
                    <span className="font-serif text-2xl font-semibold text-ink">
                      {orders.total.toLocaleString("en-US")}
                    </span>{" "}
                    executive orders signed since {orders.years[0].year}
                  </p>
                )}

                {live && (
                  <div className="mt-auto flex flex-wrap gap-2 pt-1">
                    {b.sections.map((s) => (
                      <Link
                        key={s.id}
                        href={s.href}
                        className="rounded-md border border-line-strong px-2.5 py-1 font-mono text-[0.7rem] uppercase tracking-[0.08em] text-ink-muted transition-colors hover:border-accent hover:text-ink"
                      >
                        {s.label} →
                      </Link>
                    ))}
                  </div>
                )}
              </section>
            );
          })}
        </div>
        <SiteFooter />
      </main>
    </>
  );
}
