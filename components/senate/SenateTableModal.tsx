"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import type { ChamberMember } from "@/lib/congress-types";
import type { Chamber, ChamberView } from "@/lib/chamber";
import { memberPath } from "@/lib/member-url";
import { fmt3, GROUP_VAR, ordinal, partyLabel, seatLabel } from "./format";

type ChamberFilter = "all" | Chamber;

const filterForView = (v: ChamberView): ChamberFilter => (v === "both" ? "all" : v);

interface SenateTableModalProps {
  open: boolean;
  congress: number;
  senateMembers: ChamberMember[];
  houseMembers: ChamberMember[];
  /** The explorer's current view — sets the table's default chamber filter. */
  activeView: ChamberView;
  /** When set, only that state's rows are shown. */
  stateFilter: string | null;
  onClose: () => void;
}

export function SenateTableModal({
  open,
  congress,
  senateMembers,
  houseMembers,
  activeView,
  stateFilter,
  onClose,
}: SenateTableModalProps) {
  const [chamberFilter, setChamberFilter] = useState<ChamberFilter>(
    filterForView(activeView),
  );

  // Re-sync the chamber filter to the page's view each time the modal opens.
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) setChamberFilter(filterForView(activeView));
  }

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  const rows = useMemo(() => {
    let src: ChamberMember[] =
      chamberFilter === "senate"
        ? senateMembers
        : chamberFilter === "house"
          ? houseMembers
          : [...senateMembers, ...houseMembers];
    if (stateFilter) src = src.filter((m) => m.state === stateFilter);
    return [...src].sort(
      (a, b) => (a.dim1 ?? a.careerDim1 ?? 0) - (b.dim1 ?? b.careerDim1 ?? 0),
    );
  }, [chamberFilter, senateMembers, houseMembers, stateFilter]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-40 flex items-center justify-center bg-[rgba(10,12,16,0.45)] p-6"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="flex max-h-[80vh] w-[min(680px,100%)] flex-col overflow-hidden rounded-xl border border-line bg-surface">
        <div className="flex items-center justify-between gap-4 border-b border-line px-[1.2rem] py-[1rem]">
          <h2 className="font-serif text-[1.1rem] font-semibold">
            {ordinal(congress)} Congress — {rows.length} members
            {stateFilter ? ` · ${stateFilter}` : ""}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close table"
            className="p-1 text-[1.1rem] leading-none text-ink-muted hover:text-ink"
          >
            ✕
          </button>
        </div>

        <div className="flex gap-[0.4rem] border-b border-line px-[1.2rem] py-[0.7rem]">
          {(
            [
              ["all", "Both chambers"],
              ["senate", "Senate"],
              ["house", "House"],
            ] as const
          ).map(([value, text]) => (
            <button
              key={value}
              type="button"
              onClick={() => setChamberFilter(value)}
              aria-pressed={chamberFilter === value}
              className={`rounded-md border px-[0.6rem] py-[0.3rem] text-[0.72rem] font-medium transition-colors ${
                chamberFilter === value
                  ? "border-accent bg-accent text-accent-ink"
                  : "border-line-strong bg-surface-raised text-ink-muted hover:border-accent"
              }`}
            >
              {text}
            </button>
          ))}
        </div>

        <div className="overflow-auto px-[1.2rem] pb-[1.2rem]">
          <table className="w-full border-collapse text-[0.82rem]">
            <thead>
              <tr>
                {["Name", "Chamber", "Seat", "Party", "Dim. 1", "Dim. 2"].map(
                  (h) => (
                    <th
                      key={h}
                      className="sticky top-0 border-b border-line bg-surface px-[0.4rem] py-2 text-left font-mono text-[0.68rem] uppercase tracking-[0.06em] text-ink-faint"
                    >
                      {h}
                    </th>
                  ),
                )}
              </tr>
            </thead>
            <tbody>
              {rows.map((m) => (
                <tr key={`${m.chamber}:${m.bioguideId}`}>
                  <td className="border-b border-line px-[0.4rem] py-[0.42rem]">
                    <span
                      className="mr-[0.4rem] inline-block size-2 rounded-full align-middle"
                      style={{ background: GROUP_VAR[m.group] }}
                    />
                    <Link
                      href={memberPath(m)}
                      className="hover:text-accent hover:underline"
                    >
                      {m.name}
                    </Link>
                  </td>
                  <td className="border-b border-line px-[0.4rem] py-[0.42rem]">
                    {m.chamber === "house" ? "House" : "Senate"}
                  </td>
                  <td className="border-b border-line px-[0.4rem] py-[0.42rem]">
                    {seatLabel(m)}
                  </td>
                  <td className="border-b border-line px-[0.4rem] py-[0.42rem]">
                    {partyLabel(m)}
                  </td>
                  <td className="border-b border-line px-[0.4rem] py-[0.42rem] font-mono tabular-nums">
                    {fmt3(m.dim1)}
                  </td>
                  <td className="border-b border-line px-[0.4rem] py-[0.42rem] font-mono tabular-nums">
                    {fmt3(m.dim2)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
