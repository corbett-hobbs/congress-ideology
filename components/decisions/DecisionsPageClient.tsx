"use client";

import { HowToRead } from "@/components/HowToRead";
import { PageHeader } from "@/components/PageHeader";
import { fmtInt } from "@/lib/decisions-derive";
import type { DecisionsPayload } from "@/lib/decisions-types";
import { AreasCard } from "./AreasCard";
import { CasesCard } from "./CasesCard";
import { DecisionsFilterBar } from "./DecisionsFilterBar";
import { DecisionsStateProvider } from "./DecisionsState";
import { SplitCard } from "./SplitCard";

/**
 * /supreme-court/decisions. One shared state (`DecisionsState`): the years window, the issue area and the hovered / pinned
 * term. The window and the area narrow cards 1 and 2 (rule 4); card 3 compares areas over the same window and sets the area.
 */
export function DecisionsPageClient({ data }: { data: DecisionsPayload }) {
  const first = data.terms[0];
  const last = data.terms[data.terms.length - 1];
  return (
    <DecisionsStateProvider data={data}>
      <DecisionsFilterBar />
      <main className="mx-auto flex w-full max-w-[1180px] flex-col gap-6 px-4 pb-16 pt-7 sm:px-6">
        <PageHeader eyebrow="Supreme Court · Decisions" title="How Does the Supreme Court Decide?">
          <p>
            The Ideology page shows where each justice sits; this page shows what the Court does with its cases. Every case argued since {first} is tallied by how many justices dissented, so you can watch the docket shrink, unanimity rise and fall, and the 5–4 decision become more or less common. Narrow the years with the slider or the Chief Justices under it, or pick an issue area to see only those cases.
          </p>
          <HowToRead>
            <p>
              A case counts once, in the term it was decided. “Unanimous” means no justice dissented; the other bands count the justices who dissented, so “5–4” is four dissents (a 4–4 tie is counted there too). Hover or tap a term to see its numbers; click to pin it on both time charts. Shares for small issue areas are rough, because a few cases can move them a long way.
            </p>
          </HowToRead>
        </PageHeader>

        <CasesCard />
        <SplitCard />
        <AreasCard />

        <p className="m-0 text-[0.8rem] leading-[1.6] text-ink-muted">
          Source: {data.citation}, case-centered by citation, argued cases only, terms {first}–{last}. A term runs October to June. {fmtInt(data.unclearVotes)} cases whose vote is marked unclear are left out. Licensed CC BY-NC 3.0 US.
        </p>
      </main>
    </DecisionsStateProvider>
  );
}
