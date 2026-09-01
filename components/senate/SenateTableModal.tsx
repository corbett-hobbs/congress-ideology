"use client";

import { useEffect } from "react";
import Link from "next/link";
import type { SenateMember } from "@/lib/senate-data";
import { senatorPath } from "@/lib/senator-url";
import { fmt3, GROUP_VAR, ordinal, partyLabel } from "./format";

interface SenateTableModalProps {
  open: boolean;
  congress: number;
  members: SenateMember[];
  onClose: () => void;
}

export function SenateTableModal({
  open,
  congress,
  members,
  onClose,
}: SenateTableModalProps) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  const rows = [...members].sort(
    (a, b) => (a.dim1 ?? a.careerDim1 ?? 0) - (b.dim1 ?? b.careerDim1 ?? 0),
  );

  return (
    <div
      className="fixed inset-0 z-40 flex items-center justify-center bg-[rgba(10,12,16,0.45)] p-6"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="flex max-h-[80vh] w-[min(640px,100%)] flex-col overflow-hidden rounded-xl border border-line bg-surface">
        <div className="flex items-center justify-between border-b border-line px-[1.2rem] py-[1rem]">
          <h2 className="font-serif text-[1.15rem] font-semibold">
            {ordinal(congress)} Congress — {members.length} senators
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
        <div className="overflow-auto px-[1.2rem] pb-[1.2rem]">
          <table className="w-full border-collapse text-[0.82rem]">
            <thead>
              <tr>
                {["Name", "State", "Party", "Dim. 1", "Dim. 2"].map((h) => (
                  <th
                    key={h}
                    className="sticky top-0 border-b border-line bg-surface px-[0.4rem] py-2 text-left font-mono text-[0.68rem] uppercase tracking-[0.06em] text-ink-faint"
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((m) => (
                <tr key={m.bioguideId}>
                  <td className="border-b border-line px-[0.4rem] py-[0.42rem]">
                    <span
                      className="mr-[0.4rem] inline-block size-2 rounded-full align-middle"
                      style={{ background: GROUP_VAR[m.group] }}
                    />
                    <Link
                      href={senatorPath(m)}
                      className="hover:text-accent hover:underline"
                    >
                      {m.name}
                    </Link>
                  </td>
                  <td className="border-b border-line px-[0.4rem] py-[0.42rem]">
                    {m.state}
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
