"use client";

import { useState } from "react";
import { MethodologyNote } from "@/components/MethodologyNote";
import { PARTY_NAME, partySplit } from "@/lib/law-details-derive";
import type { LawPerson } from "@/lib/law-details-types";
import { Dot, LINK, Person } from "./LawPeople";

const SHOWN = 2;

/**
 * The cosponsors in the law page's header: the first two by name, then "+N others" that opens the full list (party dot, name,
 * "D-NY-12"). Names link only for current members. The party counts and the two caveats sit in the open list.
 */
export function CosponsorsHeader({ people, unresolved }: { people: readonly LawPerson[]; unresolved: number }) {
  const [open, setOpen] = useState(false);
  if (people.length === 0) {
    return (
      <p className="m-0">
        <span className="text-ink-faint">Cosponsors: </span>none
      </p>
    );
  }
  const first = people.slice(0, SHOWN);
  const rest = people.length - first.length;
  const split = partySplit(people.map((p) => p.party));
  return (
    <div className="m-0">
      <p className="m-0">
        <span className="text-ink-faint">{`Cosponsors (${people.length}): `}</span>
        {first.map((p, i) => (
          <span key={`${p.name}-${i}`} className="whitespace-nowrap">
            <span className="inline-flex items-center gap-1">
              <Dot party={p.party} />
              <Person p={p} />
            </span>
            {i < first.length - 1 || rest > 0 ? ", " : ""}
          </span>
        ))}
        {rest > 0 && " "}
        {rest > 0 && (
          <button type="button" aria-expanded={open} aria-controls="law-cosponsors" onClick={() => setOpen((o) => !o)} className={`${LINK} cursor-pointer`}>
            {open ? "Show fewer" : `+${rest} other${rest === 1 ? "" : "s"}`}
          </button>
        )}
      </p>
      {open && (
        <div id="law-cosponsors" className="mt-2">
          <p className="m-0 flex flex-wrap gap-x-4 gap-y-1 text-[0.8rem]">
            {split.map((s) => (
              <span key={s.party} className="inline-flex items-center gap-1.5">
                <Dot party={s.party} />
                <span className="font-medium tabular-nums text-ink">{s.n}</span>
                <span className="text-ink-muted">{PARTY_NAME[s.party]}</span>
              </span>
            ))}
          </p>
          <ul tabIndex={0} aria-label="Cosponsors, scrollable" className="touch-scroll m-0 mt-2 max-h-60 list-none overflow-y-auto overscroll-contain rounded-md border border-line bg-surface p-0 sm:max-w-[34rem]">
            {people.map((p, i) => (
              <li key={`${p.name}-${i}`} className="flex flex-wrap items-center gap-x-2 border-b border-line px-3 py-1.5 text-[0.82rem] last:border-b-0">
                <Dot party={p.party} />
                <Person p={p} />
                <span className="text-ink-faint">{p.label}</span>
              </li>
            ))}
          </ul>
          <MethodologyNote>
            <p>
              Cosponsors who withdrew are not listed. A name links to a profile only for members of the current Congress.
              {unresolved > 0 ? ` ${unresolved} cosponsor${unresolved === 1 ? "" : "s"} could not be matched to a member record and ${unresolved === 1 ? "is" : "are"} left out.` : ""}
            </p>
          </MethodologyNote>
        </div>
      )}
    </div>
  );
}
