import Link from "next/link";
import type { ChamberMember } from "@/lib/congress-types";
import { memberPath } from "@/lib/member-url";
import { fmt3, GROUP_VAR, partyLabel, stateName } from "./format";

interface ReadingPanelProps {
  /** Hovered member takes precedence, else the pinned selection. */
  member: ChamberMember | null;
  /** "senator" / "representative" for the active chamber. */
  noun: string;
  congressLabel: string;
  seatsShown: number;
  mostLiberal: ChamberMember | undefined;
  mostConservative: ChamberMember | undefined;
}

function Block({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-[10px] border border-line bg-surface p-[1rem_1.1rem]">
      <p className="mb-[0.6rem] font-mono text-[0.68rem] uppercase tracking-[0.08em] text-ink-faint">
        {label}
      </p>
      {children}
    </div>
  );
}

export function ReadingPanel({
  member,
  noun,
  congressLabel,
  seatsShown,
  mostLiberal,
  mostConservative,
}: ReadingPanelProps) {
  return (
    <aside className="flex flex-col gap-4">
      <Block label={`Selected ${noun}`}>
        {member ? (
          <div className="min-h-[4.6rem]">
            <p className="mb-[0.15rem] font-serif text-[1.15rem] font-semibold">
              {member.name}
            </p>
            <div className="mb-[0.55rem] flex items-center gap-[0.4rem] text-[0.8rem] text-ink-muted">
              <span
                className="size-[0.55rem] flex-none rounded-full"
                style={{ background: GROUP_VAR[member.group] }}
              />
              {stateName(member.state)} · {partyLabel(member)}
            </div>
            <div className="flex gap-[1.1rem] font-mono text-[0.8rem]">
              <Coord label="Dim. 1" value={member.dim1} />
              <Coord label="Dim. 2" value={member.dim2} />
              <Coord label="Career d1" value={member.careerDim1} />
            </div>
            <Link
              href={memberPath(member)}
              className="mt-[0.7rem] inline-block text-[0.78rem] font-medium text-accent hover:underline"
            >
              {member.name}&rsquo;s profile →
            </Link>
          </div>
        ) : (
          <p className="min-h-[4.6rem] text-[0.85rem] italic text-ink-faint">
            Hover a {noun}; click for their profile
          </p>
        )}
      </Block>

      <Block label={`This chamber · ${congressLabel}`}>
        <dl className="flex flex-col gap-2">
          <Row term="Seats shown" desc={String(seatsShown)} mono />
          <Row term="Most liberal" desc={mostLiberal?.name ?? "—"} />
          <Row term="Most conservative" desc={mostConservative?.name ?? "—"} />
        </dl>
      </Block>
    </aside>
  );
}

function Coord({ label, value }: { label: string; value: number | null }) {
  return (
    <div>
      <span className="mb-[0.1rem] block text-[0.65rem] uppercase tracking-[0.06em] text-ink-faint">
        {label}
      </span>
      {fmt3(value)}
    </div>
  );
}

function Row({
  term,
  desc,
  mono,
}: {
  term: string;
  desc: string;
  mono?: boolean;
}) {
  return (
    <div className="flex justify-between gap-2 text-[0.82rem]">
      <dt className="text-ink-muted">{term}</dt>
      <dd
        className={`m-0 text-right font-medium ${mono ? "font-mono" : "font-sans"}`}
      >
        {desc}
      </dd>
    </div>
  );
}
