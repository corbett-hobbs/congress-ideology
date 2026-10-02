import type { Metadata } from "next";
import Link from "next/link";
import { getBothTrend, getViewCurrent } from "@/lib/congress-data";
import { branches } from "@/lib/verticals";
import { site } from "@/lib/site";
import { getCourtPayload } from "@/lib/justice-data";
import { getExecutiveOrdersData } from "@/lib/executive-orders-data";
import { HubEoChart } from "@/components/executive-orders/HubEoChart";
import { HubCompass } from "@/components/HubCompass";
import { CourtHubStrip } from "@/components/court/CourtHubStrip";
import { SiteFooter } from "@/components/senate/SiteFooter";
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
    "Executive orders, the economy, trade, and immigration, laid out against each presidential term, from gas prices and tariffs to deportations.",
};


export default function Hub() {
  const trend = getBothTrend();
  const congress = getViewCurrent("both");
  const court = getCourtPayload();
  const orders = getExecutiveOrdersData();

  // Party gap per Congress, to say how today's divide ranks historically.
  const gaps = trend
    .filter((p) => p.dem != null && p.rep != null)
    .map((p) => ({ year: p.year, gap: (p.rep as number) - (p.dem as number) }));
  const nowGap = gaps[gaps.length - 1];
  const wider = gaps.filter((g) => g.gap > nowGap.gap).length;
  const lastWider = [...gaps].reverse().find((g) => g.gap > nowGap.gap);

  const seated = court.justices.filter(
    (j) => j.t0 <= court.lastTerm && court.lastTerm <= j.t1,
  );
  const gopAppointed = seated.filter((j) => j.party === "R").length;

  return (
    <>
      <main className="mx-auto flex w-full max-w-[1180px] flex-1 flex-col gap-8 px-4 pb-16 pt-10 sm:px-6 sm:pt-14">
        <PageHeader title={site.tagline} size="hero">
          <p>
            Explore the presidency, Congress, and the Supreme Court through the
            public record: executive orders, the economy, trade, immigration,
            ideology, and net worth.
          </p>
          <p>
            Every order signed, roll call cast, ruling issued, and financial
            disclosure filed leaves a trail. We turn those records into data you
            can scrub through, compare, and dig into. Start with the presidency
            to see what each administration did and what was happening in the
            country while it did.
          </p>
        </PageHeader>

        <div className="grid gap-4 lg:grid-cols-3">
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
                      <Link
                        href={`${b.href}/${b.defaultSection}`}
                        className="hover:text-accent"
                      >
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

                {isCongress && (
                  <div className="flex flex-col gap-2">
                    <HubCompass members={congress.plottable} />
                    <p className="text-[0.85rem] text-ink-muted">
                      <span className="font-serif text-2xl font-semibold text-ink">
                        {wider === 0
                          ? "Most divided ever"
                          : `Most divided since ${lastWider!.year}`}
                      </span>{" "}
The two parties are{" "}
                      {wider === 0
                        ? "farther apart than at any point"
                        : `farther apart than at any point since ${lastWider!.year}`}
                      , judging by how members vote
                    </p>
                  </div>
                )}

                {b.id === "supreme-court" && (
                  <div className="flex flex-col gap-2">
                    <CourtHubStrip data={court} />
                    <p className="text-[0.85rem] text-ink-muted">
                      <span className="font-serif text-2xl font-semibold text-ink">
                        {gopAppointed} of {seated.length}
                      </span>{" "}
                      justices were appointed by Republican presidents,{" "}
                      {court.lastTerm} term
                    </p>
                  </div>
                )}

                {b.id === "presidency" && (
                  <div className="flex flex-col gap-2">
                    <HubEoChart data={orders} />
                    <p className="text-[0.85rem] text-ink-muted">
                      <span className="font-serif text-2xl font-semibold text-ink">
                        {orders.total.toLocaleString("en-US")}
                      </span>{" "}
                      executive orders signed since {orders.years[0].year}
                    </p>
                  </div>
                )}

                {live && (
                  <div className="mt-auto flex flex-wrap gap-2 pt-1">
                    {b.sections.map((s) =>
                      s.status === "live" ? (
                        <Link
                          key={s.id}
                          href={s.href}
                          className="rounded-md border border-line-strong px-2.5 py-1 font-mono text-[0.7rem] uppercase tracking-[0.08em] text-ink-muted transition-colors hover:border-accent hover:text-ink"
                        >
                          {s.label} →
                        </Link>
                      ) : (
                        <span
                          key={s.id}
                          aria-disabled="true"
                          className="rounded-md border border-line px-2.5 py-1 font-mono text-[0.7rem] uppercase tracking-[0.08em] text-ink-faint"
                        >
                          {s.label} · soon
                        </span>
                      ),
                    )}
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
