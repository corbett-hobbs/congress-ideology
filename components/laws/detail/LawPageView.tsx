import Link from "next/link";
import { SetBackLink } from "@/components/BackLinkContext";
import { MethodologyNote } from "@/components/MethodologyNote";
import { PageHeader } from "@/components/PageHeader";
import { ChartCard } from "@/components/charts/ChartCard";
import { ACTION_KIND_LABEL, longDate, methodText, PARTY_NAME, partySplit, yeaShare, type PartyLetter, type TimelineAction } from "@/lib/law-details-derive";
import type { LawCommitteeEntry, LawPageData, LawPerson } from "@/lib/law-details-types";
import { ordinal } from "@/lib/laws-entities";
import type { ChamberTally } from "@/lib/laws-types";

const PARTY_VAR: Record<PartyLetter, string> = { D: "var(--dem)", R: "var(--rep)", I: "var(--demrep)" };
const BADGE = "inline-flex items-center rounded-full border border-line-strong px-2 py-px text-[0.68rem] font-medium text-ink-muted";
const LINK = "text-ink underline decoration-line-strong underline-offset-2 hover:decoration-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus";

function Person({ p }: { p: LawPerson }) {
  return p.path ? (
    <Link href={p.path} className={LINK}>
      {p.name}
    </Link>
  ) : (
    <span className="text-ink">{p.name}</span>
  );
}

function Dot({ party }: { party: PartyLetter }) {
  return <i aria-hidden className="inline-block h-2 w-2 flex-none rounded-full" style={{ background: PARTY_VAR[party] }} />;
}

/** Facts line under the title: number, bill, date, signer, sponsor, policy area. */
function Facts({ law }: { law: LawPageData }) {
  const signerParty = law.president.party;
  return (
    <>
      <p className="m-0">
        {law.publicLaw} · {law.billLabel} · {ordinal(law.congress)} Congress
        {law.originChamber ? ` · began in the ${law.originChamber}` : ""}
      </p>
      <p className="m-0">
        {law.veto ? "Vetoed by " : "Signed by "}
        <span className="inline-flex items-center gap-1 whitespace-nowrap text-ink">
          <Dot party={signerParty} />
          {law.president.name}
        </span>
        <span className="text-ink-faint">{` (${signerParty})`}</span>
        {law.veto ? `; passed over the veto on ${longDate(law.date)}` : ` on ${longDate(law.date)}`}
        {law.sponsor && (
          <>
            {" · sponsored by "}
            <Person p={law.sponsor} />
            {` (${law.sponsor.label})`}
          </>
        )}
        {law.area ? ` · ${law.area}` : ""}
      </p>
      {(law.major === true || law.veto) && (
        <p className="m-0 flex flex-wrap gap-1.5">
          {law.major === true && (
            <span className={BADGE} title="One of David Mayhew’s important enactments">
              Major law
            </span>
          )}
          {law.veto && <span className={BADGE}>Veto override</span>}
        </p>
      )}
    </>
  );
}

function Summary({ law }: { law: LawPageData }) {
  return (
    <ChartCard title="Summary" lede="The Congressional Research Service’s plain-language summary of what the law does.">
      {law.summary ? (
        <div className="flex flex-col gap-3 text-[0.9rem] leading-[1.65]">
          {law.summary.map((p, i) => (
            <p key={i} className="m-0">
              {p}
            </p>
          ))}
          {law.summaryCut && (
            <p className="m-0 text-[0.82rem] text-ink-muted">
              The summary is cut off here because it is long.{" "}
              {law.congressGovUrl && (
                <a href={law.congressGovUrl} target="_blank" rel="noreferrer" className={LINK}>
                  Read the full text on Congress.gov
                </a>
              )}
            </p>
          )}
        </div>
      ) : (
        <p className="m-0 text-[0.88rem] text-ink-muted">The Congressional Research Service has not written a summary of this law.</p>
      )}
    </ChartCard>
  );
}

function Timeline({ law }: { law: LawPageData }) {
  return (
    <ChartCard title="Timeline" lede={`From introduction to ${law.veto ? "the override" : "signing"}, newest first: the committees, the floor and the president.`}>
      <ol className="m-0 list-none p-0">
        {law.actions.map((a: TimelineAction, i) => {
          const first = i === 0 || law.actions[i - 1]!.date !== a.date;
          return (
            <li key={i} className={`grid grid-cols-[5.6rem_minmax(0,1fr)] gap-x-3 py-1.5 text-[0.82rem] leading-[1.45] sm:grid-cols-[6.5rem_9rem_minmax(0,1fr)] ${first ? "border-t border-line first:border-t-0" : ""}`}>
              <span className="tabular-nums text-ink-muted">{first ? longDate(a.date) : ""}</span>
              <span className="text-[0.72rem] uppercase tracking-[0.04em] text-ink-faint max-sm:hidden">{ACTION_KIND_LABEL[a.kind]}</span>
              <span className="min-w-0">
                <span className="sm:hidden text-[0.68rem] uppercase tracking-[0.04em] text-ink-faint">{`${ACTION_KIND_LABEL[a.kind]} · `}</span>
                {a.text}
                {a.rolls.map((r) => (
                  <span key={r} className={`${BADGE} ml-2 whitespace-nowrap`}>
                    {r}
                  </span>
                ))}
              </span>
            </li>
          );
        })}
      </ol>
      <MethodologyNote>
        <p>Shows the introduction, each committee and subcommittee step the source dates (referral, hearings, markup, report, discharge), and the floor, conference, presidential and became-law steps. Calendar placements, messages between the chambers, amendments and committee report numbers are not shown. Two entries the source lists twice are shown once.</p>
      </MethodologyNote>
    </ChartCard>
  );
}

/** Yea and nay are not party colours: the source holds totals only, so blue and red would read as Democrats and Republicans. */
const YEA = "var(--ink)";
const NAY = "var(--line-strong)";

function VoteRow({ chamber, t, label }: { chamber: string; t: ChamberTally; label?: string }) {
  const counted = t[0] === 0 && t[1] !== null && t[2] !== null;
  const share = yeaShare(t[1], t[2]);
  return (
    <li className="grid grid-cols-[4.5rem_minmax(0,1fr)] items-center gap-x-3 gap-y-1 py-1.5 text-[0.85rem] sm:w-[22rem] sm:grid-cols-[4.5rem_minmax(0,1fr)]">
      <span className="font-medium text-ink">{chamber}</span>
      <span className="min-w-0 text-ink-muted">
        {label ?? methodText(t)}
        {counted && <span className="sr-only">{`: ${t[1]} yea, ${t[2]} nay`}</span>}
      </span>
      {counted && share !== null ? (
        <span className="col-span-2 flex items-center gap-2">
          <span aria-hidden className="flex h-2.5 min-w-0 flex-1 overflow-hidden rounded-sm bg-line">
            <span style={{ width: `${share * 100}%`, background: YEA }} />
            <span style={{ width: `${(1 - share) * 100}%`, background: NAY }} />
          </span>
          <span className="whitespace-nowrap tabular-nums text-ink">{`${t[1]}–${t[2]}`}</span>
        </span>
      ) : (
        <span className="col-span-2 text-[0.78rem] text-ink-faint">No tally</span>
      )}
    </li>
  );
}

/** The passage votes, in the page header under the facts. */
function Votes({ law }: { law: LawPageData }) {
  const { house, senate, override } = law.passage;
  return (
    <section aria-label="Passage votes" className="mt-1">
      <h2 className="m-0 flex flex-wrap items-center gap-x-4 gap-y-1 text-[0.72rem] font-medium uppercase tracking-[0.06em] text-ink-faint">
        <span>Passage votes</span>
        <span className="inline-flex items-center gap-3 normal-case tracking-normal">
          <span className="inline-flex items-center gap-1.5">
            <i aria-hidden className="inline-block size-2 rounded-sm" style={{ background: YEA }} />
            Yea
          </span>
          <span className="inline-flex items-center gap-1.5">
            <i aria-hidden className="inline-block size-2 rounded-sm" style={{ background: NAY }} />
            Nay
          </span>
        </span>
      </h2>
      <ul className="m-0 list-none divide-y divide-line p-0 sm:flex sm:flex-wrap sm:gap-x-10 sm:divide-y-0">
        <VoteRow chamber="House" t={house} />
        <VoteRow chamber="Senate" t={senate} />
      </ul>
      {override && (
        <>
          <h3 className="mb-0 mt-3 text-[0.82rem] font-medium text-ink">Veto override votes</h3>
          <ul className="m-0 list-none divide-y divide-line p-0 sm:flex sm:flex-wrap sm:gap-x-10 sm:divide-y-0">
            <VoteRow chamber="House" t={override[0] === null ? [3, null, null] : [0, override[0], override[1]]} label={override[0] === null ? "Not recorded" : "Needs two-thirds"} />
            <VoteRow chamber="Senate" t={override[2] === null ? [3, null, null] : [0, override[2], override[3]]} label={override[2] === null ? "Not recorded" : "Needs two-thirds"} />
          </ul>
        </>
      )}
      <MethodologyNote>
        <p>
          The final version of the law, as each chamber passed it. A chamber that passed it by voice vote or unanimous consent has no count. “Method not stated” means the record does not say how the chamber voted. Who voted which way is not shown yet, so the bar is not split by party.
        </p>
      </MethodologyNote>
    </section>
  );
}

function Cosponsors({ law }: { law: LawPageData }) {
  const people = law.cosponsors;
  const split = partySplit(people.map((p) => p.party));
  return (
    <ChartCard title="Cosponsors" lede={people.length === 0 ? "No members signed on as cosponsors of this bill." : `${people.length} member${people.length === 1 ? "" : "s"} signed on as cosponsors, besides the sponsor.`}>
      {people.length > 0 && (
        <>
          <div aria-hidden className="flex h-3 w-full overflow-hidden rounded-sm bg-line">
            {split.map((s) => (
              <span key={s.party} style={{ width: `${(100 * s.n) / people.length}%`, background: PARTY_VAR[s.party] }} />
            ))}
          </div>
          <p className="m-0 mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[0.8rem]">
            {split.map((s) => (
              <span key={s.party} className="inline-flex items-center gap-1.5">
                <Dot party={s.party} />
                <span className="tabular-nums font-medium">{s.n}</span>
                <span className="text-ink-muted">{PARTY_NAME[s.party]}</span>
              </span>
            ))}
          </p>
          <ul tabIndex={0} aria-label="Cosponsors, scrollable" className="touch-scroll m-0 mt-3 max-h-72 list-none overflow-y-auto overscroll-contain rounded-md border border-line p-0">
            {people.map((p, i) => (
              <li key={`${p.name}-${i}`} className="flex flex-wrap items-center gap-x-2 border-b border-line px-3 py-1.5 text-[0.82rem] last:border-b-0">
                <Dot party={p.party} />
                <Person p={p} />
                <span className="text-ink-faint">{p.label}</span>
              </li>
            ))}
          </ul>
        </>
      )}
      <MethodologyNote>
        <p>
          Cosponsors who withdrew are not listed. A name links to a profile only for members of the current Congress.
          {law.cosponsorsUnresolved > 0 ? ` ${law.cosponsorsUnresolved} cosponsor${law.cosponsorsUnresolved === 1 ? "" : "s"} could not be matched to a member record and ${law.cosponsorsUnresolved === 1 ? "is" : "are"} left out.` : ""}
        </p>
      </MethodologyNote>
    </ChartCard>
  );
}

function CommitteeItem({ c }: { c: LawCommitteeEntry }) {
  return (
    <li className="border-b border-line px-3 py-2 text-[0.82rem] last:border-b-0">
      {c.path ? (
        <Link href={c.path} className={LINK}>
          {c.name}
        </Link>
      ) : (
        <span className="text-ink">{c.name}</span>
      )}
      {c.chamber && <span className="text-ink-faint">{` · ${c.chamber}`}</span>}
      {c.steps.length > 0 && <span className="text-ink-muted">{` · ${c.steps.join(", ")}`}</span>}
      {c.subcommittees.length > 0 && <span className="block text-[0.75rem] text-ink-muted">{`Subcommittee: ${c.subcommittees.join("; ")}`}</span>}
    </li>
  );
}

function Committees({ law }: { law: LawPageData }) {
  return (
    <ChartCard title="Committees" lede={law.committees.length === 0 ? "The record shows no committee referral for this bill." : "The committees the bill was sent to, and what each did with it."}>
      {law.committees.length > 0 && <ul className="m-0 list-none rounded-md border border-line p-0">{law.committees.map((c, i) => <CommitteeItem key={`${c.name}-${i}`} c={c} />)}</ul>}
      <MethodologyNote>
        <p>A committee links to its page only where it exists in the current Congress; older and renamed committees are named without a link.</p>
      </MethodologyNote>
    </ChartCard>
  );
}

export function LawPageView({ law }: { law: LawPageData }) {
  return (
    <main className="mx-auto flex w-full max-w-[1180px] flex-col gap-6 px-4 pb-16 pt-9 sm:px-6 sm:pt-11">
      <SetBackLink href="/congress/laws" />
      <PageHeader eyebrow="Congress · Laws" title={law.title}>
        <Facts law={law} />
        <Votes law={law} />
      </PageHeader>
      <Summary law={law} />
      <Timeline law={law} />
      <Cosponsors law={law} />
      <Committees law={law} />
      <section aria-label="Official record" className="rounded-[10px] border border-line bg-surface p-[1.1rem_1.35rem] text-[0.85rem] text-ink-muted">
        <h2 className="m-0 font-serif text-[1.05rem] font-medium text-ink">Official record</h2>
        <p className="m-0 mt-1">
          {law.congressGovUrl ? (
            <>
              The bill’s full text and every action, including introduction and committee steps, are on{" "}
              <a href={law.congressGovUrl} target="_blank" rel="noreferrer" className={LINK}>
                Congress.gov
              </a>
              .
            </>
          ) : (
            "The bill’s full record is on Congress.gov."
          )}{" "}
          Data through {longDate(law.dataThrough)}.
        </p>
      </section>
    </main>
  );
}
