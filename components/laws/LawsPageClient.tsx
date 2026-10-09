"use client";

import { HowToRead } from "@/components/HowToRead";
import { PageHeader } from "@/components/PageHeader";
import { openYear } from "@/lib/laws-derive";
import type { LawsPayload } from "@/lib/laws-types";
import { LawsCountCard } from "./LawsCountCard";
import { LawsFilterBar } from "./LawsFilterBar";
import { LawsStateProvider, useLawsActions, useLawsValues } from "./LawsState";
import { LawsSupportCard } from "./LawsSupportCard";

function ControlToggle() {
  const { control } = useLawsValues();
  const { setControl } = useLawsActions();
  return (
    <label className="flex cursor-pointer items-center gap-2 text-[0.8rem] text-ink-muted">
      <input type="checkbox" checked={control} onChange={(e) => setControl(e.target.checked)} className="h-4 w-4 cursor-pointer accent-[var(--accent)]" />
      Show which party held the House and Senate under each chart
    </label>
  );
}

/**
 * /congress/laws. One shared state (`LawsState`): the years window, the policy area, major laws only, the support band and
 * the hovered / pinned Congress. The window and the policy area narrow both cards (rule 4); the band picked on card 2 also
 * narrows card 1. Cards 3 (policy areas by decade) and the list of every law follow in a later session.
 */
export function LawsPageClient({ data }: { data: LawsPayload }) {
  const first = openYear(data.congresses[0]!);
  return (
    <LawsStateProvider data={data}>
      <LawsFilterBar />
      <main className="mx-auto flex w-full max-w-[1180px] flex-col gap-6 px-4 pb-16 pt-7 sm:px-6">
        <PageHeader eyebrow="Congress · Laws" title="What Laws Does Congress Pass?">
          <p>
            The Ideology page shows where each member sits; this page shows what Congress enacts. Every public law since {first} is tallied by the Congress that passed it and its policy area, so you can watch the output shrink, the mix shift and the votes narrow. Narrow the years with the slider or the presidents under it, or pick a policy area or a vote in the charts.
          </p>
          <HowToRead>
            <p>
              One bar is one two-year Congress, labelled by the year it opens. A law counts in the Congress that enacted it, signed or not (veto overrides included); private laws are left out. The president under each bar is the one who signed most of that Congress&rsquo;s laws. A law&rsquo;s policy area is the single area the Congressional Research Service assigns its bill, grouped here into topic groups. Its vote band comes from the closest final-passage vote it faced in either chamber, so a law is only as broadly supported as its narrowest vote; laws passed by voice vote or unanimous consent in both chambers have no tally and form their own band. Select a Congress to see its numbers and pin it on both charts; select it again to release it. The legends are filters: a policy area under the top chart, or a vote band under the second. &ldquo;Major laws&rdquo; in the top bar narrows everything to the laws David Mayhew&rsquo;s lists of important enactments name.
            </p>
          </HowToRead>
        </PageHeader>

        <ControlToggle />
        <LawsCountCard />
        <LawsSupportCard />

        <p className="m-0 text-[0.8rem] leading-[1.6] text-ink-muted">
          Source: Congress.gov (Library of Congress) for laws, policy areas and sponsors; Voteview (Lewis, Poole, Rosenthal, Boche, Rudkin and Sonnet) as the check on roll-call tallies; David Mayhew, lists of important enactments, for major laws; the Senate Historical Office and the Clerk of the House for party control. Presidents: the White House Historical Association. Data through {data.dataThrough}.
        </p>
      </main>
    </LawsStateProvider>
  );
}
