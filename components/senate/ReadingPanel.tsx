import type { ChamberMember } from "@/lib/congress-types";

interface ReadingPanelProps {
  congressLabel: string;
  seatsShown: number;
  mostLiberal: ChamberMember | undefined;
  mostConservative: ChamberMember | undefined;
}

export function ReadingPanel({
  congressLabel,
  seatsShown,
  mostLiberal,
  mostConservative,
}: ReadingPanelProps) {
  return (
    <aside className="rounded-[10px] border border-line bg-surface p-[1rem_1.1rem]">
      <p className="mb-[0.6rem] font-mono text-[0.68rem] uppercase tracking-[0.08em] text-ink-faint">
        This chamber · {congressLabel}
      </p>
      <dl className="flex flex-col gap-2">
        <Row term="Seats shown" desc={String(seatsShown)} mono />
        <Row term="Most liberal" desc={mostLiberal?.name ?? "—"} />
        <Row term="Most conservative" desc={mostConservative?.name ?? "—"} />
      </dl>
    </aside>
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
