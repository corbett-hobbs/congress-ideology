"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { justicePath } from "@/lib/justice-url";
import { ChartCard } from "@/components/charts/ChartCard";
import { PillGroup } from "@/components/charts/PillGroup";
import {
  fmtScore,
  isSeated,
  partyLabel,
  scoreAt,
  termLabel,
  type CourtFilter,
  type CourtJustice,
  type CourtPayload,
} from "@/lib/court-types";
import { CourtToolbar } from "./CourtToolbar";
import { JusticeSearch } from "./JusticeSearch";
import { JusticeStrip } from "./JusticeStrip";
import { PresidentRows, type PresidentSort } from "./PresidentRows";
import { JusticeTrajectory } from "./JusticeTrajectory";

const PLAY_INTERVAL_MS = 220;

const SORTS = [
  { value: "chronological", label: "Chronological" },
  { value: "spread", label: "Widest spread" },
] as const;

// PLACEHOLDER COPY — every string below awaiting Corby's edit.
const introFor = (first: number, last: number) =>
  `Martin–Quinn scores estimate each justice’s ideology from how they vote in divided cases: justices who vote alike land close together, and a justice’s position is allowed to move from one term to the next. Pick a term to see who sat on the Court, which presidents appointed them, and how far each one has moved since. The data run from the ${first} term through the ${last} term.`;

export function CourtExplorer({ data }: { data: CourtPayload }) {
  const { firstTerm, lastTerm } = data;
  const [term, setTerm] = useState(lastTerm);
  const [playing, setPlaying] = useState(false);
  const [appointed, setAppointed] = useState<CourtFilter["appointed"]>("all");
  const [president, setPresident] = useState<string | null>(null);
  const router = useRouter();
  // Nothing is "selected" any more: a click navigates. The chart props still take it.
  const selectedId: number | null = null;
  const [sort, setSort] = useState<PresidentSort>("chronological");

  const filter = useMemo<CourtFilter>(
    () => ({ appointed, president }),
    [appointed, president],
  );
  const byId = useMemo(
    () => new Map(data.justices.map((j) => [j.id, j])),
    [data.justices],
  );
  const rec = data.terms[term - firstTerm];
  const seated = useMemo(
    () => data.justices.filter((j) => isSeated(j, term)),
    [data.justices, term],
  );

  // Play steps through every term and stops at the latest (no loop).
  useEffect(() => {
    if (!playing) return;
    const id = setTimeout(() => {
      if (term >= lastTerm) setPlaying(false);
      else setTerm(term + 1);
    }, PLAY_INTERVAL_MS);
    return () => clearTimeout(id);
  }, [playing, term, lastTerm]);

  const togglePlay = useCallback(() => {
    setPlaying((p) => {
      if (p) return false;
      // Pressing play parked at the latest term restarts from the first.
      if (term >= lastTerm) setTerm(firstTerm);
      return true;
    });
  }, [term, firstTerm, lastTerm]);

  const changeTerm = useCallback((t: number) => {
    setPlaying(false);
    setTerm(t);
  }, []);

  /** Clicking a justice anywhere (strip dot, president row, trajectory line) opens their profile. */
  const onToggleSelect = useCallback(
    (id: number) => {
      const j = byId.get(id);
      if (j) router.push(justicePath(j));
    },
    [byId, router],
  );

  const changeAppointed = (v: CourtFilter["appointed"]) => {
    setAppointed(v);
    // Keep the two filters from contradicting each other.
    const p = president
      ? data.presidents.find((x) => x.key === president)
      : null;
    if (p && v !== "all" && p.party !== v) setPresident(null);
  };
  const presidentOptions = useMemo(
    () =>
      data.presidents
        .filter((p) => appointed === "all" || p.party === appointed)
        .slice()
        .reverse(),
    [data.presidents, appointed],
  );

  const ordered = [...seated].sort(
    (a, b) => scoreAt(a, term) - scoreAt(b, term),
  );
  const mostLiberal = ordered[0];
  const mostConservative = ordered[ordered.length - 1];
  const medianJustice = byId.get(rec.medianJusticeId);
  const names = (ids: number[]) =>
    ids.map((id) => byId.get(id)?.short).filter(Boolean).join(", ");
  const selected = selectedId != null ? (byId.get(selectedId) ?? null) : null;

  return (
    <>
      <CourtToolbar
        appointed={appointed}
        onAppointed={changeAppointed}
        president={president}
        onPresident={setPresident}
        presidentOptions={presidentOptions}
        term={term}
        min={firstTerm}
        max={lastTerm}
        playing={playing}
        onTermChange={changeTerm}
        onTogglePlay={togglePlay}
      />

      <main className="mx-auto flex w-full max-w-[1120px] flex-col gap-5 px-4 pb-16 pt-7 sm:px-6">
        <div>
          <h1 className="mb-4 font-serif text-[clamp(1.7rem,3.6vw,2.35rem)] font-medium leading-[1.1] tracking-[-0.01em]">
            How Does the Supreme Court Lean?
          </h1>
          <p className="text-[0.92rem] leading-[1.65] text-ink-muted">
            {introFor(firstTerm, lastTerm)}
          </p>
        </div>

        {/* Same card-height mechanism as the Congress explorer: the grid row is
            sized by chart 1's card (fixed-height strip + stats); chart 2's
            list is absolutely positioned inside a flex-1 wrapper at md+, so
            its length never drives the row height. */}
        <div className="grid grid-cols-1 gap-5 md:grid-cols-2 md:items-stretch">
          <ChartCard
            title="Where the justices stand"
            lede="The Court in the selected term, left to right. Dot color is the party of the president who appointed each justice. Click a justice for their profile."
            action={<JusticeSearch justices={data.justices} />}
          >
            <JusticeStrip
              data={data}
              term={term}
              filter={filter}
              selectedId={selectedId}
              onSelect={onToggleSelect}
            />

            <dl className="mt-1 grid grid-cols-2 gap-x-6 gap-y-2 text-[0.82rem] lg:grid-cols-4">
              <Stat label="Median justice" value={medianJustice?.short ?? "—"} />
              <Stat label="Most liberal" value={mostLiberal?.short ?? "—"} />
              <Stat label="Most conservative" value={mostConservative?.short ?? "—"} />
              <Stat label="Justices seated" value={String(seated.length)} mono />
            </dl>

            {/* Reserved height so the card never resizes when a mid-term change appears. */}
            <p className="mt-2 min-h-[2.6rem] text-[0.82rem] text-ink-muted lg:min-h-[1.4rem]">
              {(rec.left.length > 0 || rec.joined.length > 0) && (
                <>
                  <span className="text-ink-faint">Mid-term change </span>
                  <span className="font-medium text-ink">
                    {[
                      rec.left.length ? `${names(rec.left)} left` : "",
                      rec.joined.length ? `${names(rec.joined)} joined` : "",
                    ]
                      .filter(Boolean)
                      .join("; ")}
                  </span>
                </>
              )}
            </p>

            <p className="mt-2 text-[0.76rem] leading-[1.55] text-ink-faint">
              Martin&ndash;Quinn scores run on a single liberal&ndash;conservative
              scale and are not comparable in number to the DW-NOMINATE scores on
              the Congress pages. Dimming a party&rsquo;s appointees never changes
              the median. In terms with a mid-term change, hollow dots mark the
              justices who left or joined, and in the four terms MQ scores as two
              records (1937, 1938, 1956, 2005) the median is the Court after the
              change.
            </p>
            <SeatedTable term={term} seated={ordered} />
          </ChartCard>

          <ChartCard
            title="Who each president appointed"
            lede="Career average for every justice a president put on the Court. A ring marks justices sitting in the selected term."
            action={
              <PillGroup
                options={SORTS}
                value={sort}
                onChange={setSort}
                ariaLabel="Sort presidents"
              />
            }
          >
            {/* At md+ the list is absolutely positioned inside this flex-1
                wrapper (see the grid comment above); below md it simply
                expands and the page scrolls — no nested scroll on touch. */}
            <div className="relative mt-1 flex-1 md:min-h-[300px]">
              <div className="border-t border-line pt-1 md:absolute md:inset-0 md:overflow-y-auto">
                <PresidentRows
                  data={data}
                  term={term}
                  filter={filter}
                  selectedId={selectedId}
                  sort={sort}
                  onSelect={onToggleSelect}
                />
              </div>
            </div>
            <p className="mt-2 text-[0.76rem] leading-[1.55] text-ink-faint">
              Career average is the mean of a justice&rsquo;s per-term scores. It
              can hide justices who moved a long way. Justices still serving are
              not final.
            </p>
            <CareerTable data={data} />
          </ChartCard>
        </div>

        <ChartCard
          title="How each justice moved"
          lede={`Every justice’s score, term by term, since ${firstTerm}. Click or drag to change the term; click a line to follow one justice.`}
        >
          <JusticeTrajectory
            data={data}
            term={term}
            filter={filter}
            selectedId={selectedId}
            onSelect={onToggleSelect}
            onScrub={changeTerm}
          />
          <p className="mt-2 text-[0.76rem] leading-[1.55] text-ink-faint">
            Scores are smoothed by the model, so a justice&rsquo;s stability is
            partly an assumption of the method. The shaded band for a selected
            justice is its 95% estimation interval.
          </p>
          <MedianTable data={data} selected={selected} />
        </ChartCard>

        <footer className="flex flex-col gap-1.5 border-t border-line pt-6 text-[0.76rem] leading-[1.6] text-ink-faint">
          <p className="m-0 max-w-[46rem]">
            Source: Martin, Andrew D. and Kevin M. Quinn. 2002. &ldquo;Dynamic
            Ideal Point Estimation via Markov Chain Monte Carlo for the U.S.
            Supreme Court, 1953&ndash;1999.&rdquo; Political Analysis 10:134&ndash;153.
            Scores from{" "}
            <a
              href="https://mqscores.wustl.edu/"
              className="text-ink-muted underline decoration-line-strong underline-offset-2 hover:decoration-accent"
            >
              mqscores.wustl.edu
            </a>
            .
          </p>
          <p className="m-0 max-w-[46rem]">
            Appointing president and party from the Federal Judicial Center
            biographical directory.
          </p>
        </footer>
      </main>
    </>
  );
}

function Stat({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="min-w-0">
      <dt className="text-[0.72rem] text-ink-muted">{label}</dt>
      <dd className={`m-0 truncate font-medium ${mono ? "font-mono" : ""}`}>{value}</dd>
    </div>
  );
}

const TH =
  "border-b border-line px-2 py-1.5 text-left font-mono text-[0.65rem] uppercase tracking-[0.05em] text-ink-faint";

function TableShell({ summary, children }: { summary: string; children: React.ReactNode }) {
  return (
    <details className="mt-3">
      <summary className="cursor-pointer text-[0.75rem] font-medium text-accent">
        {summary}
      </summary>
      <div className="mt-2 max-h-80 overflow-y-auto rounded-md border border-line">
        <table className="w-full border-collapse text-[0.78rem]">{children}</table>
      </div>
    </details>
  );
}

function SeatedTable({ term, seated }: { term: number; seated: CourtJustice[] }) {
  return (
    <TableShell summary="View as table">
      <caption className="sr-only">Justices seated in {termLabel(term)}</caption>
      <thead className="sticky top-0 bg-surface-raised">
        <tr>
          {["Justice", "Appointed by", "Party", "Score"].map((h) => (
            <th key={h} className={TH}>
              {h}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {seated.map((j) => (
          <tr key={j.id} className="border-b border-line last:border-0">
            <td className="px-2 py-1">{j.name}</td>
            <td className="px-2 py-1">{j.pres}</td>
            <td className="px-2 py-1">{partyLabel(j.party)}</td>
            <td className="px-2 py-1 font-mono">{fmtScore(scoreAt(j, term))}</td>
          </tr>
        ))}
      </tbody>
    </TableShell>
  );
}

function CareerTable({ data }: { data: CourtPayload }) {
  const byId = new Map(data.justices.map((j) => [j.id, j]));
  return (
    <TableShell summary="View as table">
      <caption className="sr-only">Career average score by appointing president</caption>
      <thead className="sticky top-0 bg-surface-raised">
        <tr>
          {["President", "Justice", "Career average", "Scored terms"].map((h) => (
            <th key={h} className={TH}>
              {h}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {[...data.presidents].reverse().flatMap((p) =>
          p.justiceIds.map((id) => {
            const j = byId.get(id) as CourtJustice;
            return (
              <tr key={id} className="border-b border-line last:border-0">
                <td className="px-2 py-1">{p.key}</td>
                <td className="px-2 py-1">{j.name}</td>
                <td className="px-2 py-1 font-mono">{fmtScore(j.career)}</td>
                <td className="px-2 py-1 font-mono">
                  {j.t0}–{j.t1}
                </td>
              </tr>
            );
          }),
        )}
      </tbody>
    </TableShell>
  );
}

function MedianTable({
  data,
  selected,
}: {
  data: CourtPayload;
  selected: CourtJustice | null;
}) {
  return (
    <TableShell summary="View as table">
      <caption className="sr-only">Court median score by term</caption>
      <thead className="sticky top-0 bg-surface-raised">
        <tr>
          {["Term", "Court median", ...(selected ? [selected.name] : [])].map((h) => (
            <th key={h} className={TH}>
              {h}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {data.terms.map((t) => (
          <tr key={t.term} className="border-b border-line last:border-0">
            <td className="px-2 py-1 font-mono">{termLabel(t.term)}</td>
            <td className="px-2 py-1 font-mono">{fmtScore(t.median)}</td>
            {selected && (
              <td className="px-2 py-1 font-mono">
                {isSeated(selected, t.term) ? fmtScore(scoreAt(selected, t.term)) : "—"}
              </td>
            )}
          </tr>
        ))}
      </tbody>
    </TableShell>
  );
}
