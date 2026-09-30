/** The toggle on a justice page: which set of justices is highlighted, on both the chart and the swarm/roster. */
export type JusticeMode = "alongside" | "neighbors";

export const MODE_OPTIONS: readonly { value: JusticeMode; label: string }[] = [
  { value: "alongside", label: "Served alongside" },
  { value: "neighbors", label: "Nearest neighbors" },
];

export const partyVar = (p: "D" | "R") => (p === "D" ? "var(--dem)" : "var(--rep)");
