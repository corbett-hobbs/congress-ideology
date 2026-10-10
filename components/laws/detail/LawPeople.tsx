import Link from "next/link";
import type { PartyLetter } from "@/lib/law-details-derive";
import type { LawPerson } from "@/lib/law-details-types";

/** Shared by the law page's server and client pieces: the party colour of a member and their name (a link only for a current member). */
export const PARTY_VAR: Record<PartyLetter, string> = { D: "var(--dem)", R: "var(--rep)", I: "var(--demrep)" };

export const LINK = "text-ink underline decoration-line-strong underline-offset-2 hover:decoration-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus";

export function Dot({ party }: { party: PartyLetter }) {
  return <i aria-hidden className="inline-block h-2 w-2 flex-none rounded-full" style={{ background: PARTY_VAR[party] }} />;
}

export function Person({ p }: { p: LawPerson }) {
  return p.path ? (
    <Link href={p.path} className={LINK}>
      {p.name}
    </Link>
  ) : (
    <span className="text-ink">{p.name}</span>
  );
}
