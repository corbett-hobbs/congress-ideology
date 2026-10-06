import type { EconomyKey } from "@/lib/indicator-lookup";

/** Presentation config for the nine economy charts. Domains were checked against the 1991-onward data. */
export interface ChartSpec {
  key: EconomyKey;
  title: string;
  desc: string;
  kind: "line" | "jobs" | "income" | "fiscal" | "debt";
  domain: [number, number];
  ticks: number[];
  tick: (v: number) => string;
  /** Header readout format. */
  head: (v: number) => string;
  aria: string;
  /** Unit label for the table fallback. */
  unit: string;
  /** Name of the second series (shown in the tooltip and readout) when the chart has one. */
  label2?: string;
}

const MINUS = "−";
export const fx = (x: number, n: number) => {
  const s = (x + (x >= 0 ? 1e-9 : -1e-9)).toFixed(n);
  return Number(s) === 0 ? s.replace("-", "") : s.replace("-", MINUS); // no "−0.0%"
};
const nf = (n: number) => String(Math.abs(Math.round(n))).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
export const JOBS_CAP = 1000;

export const SPECS: Record<EconomyKey, ChartSpec> = {
  mis: {
    key: "mis",
    title: "Misery index",
    desc: "Unemployment rate plus the inflation rate, monthly. A rough one-number gauge of everyday economic strain, devised in the 1970s.",
    kind: "line",
    domain: [0, 16],
    ticks: [0, 5, 10, 15],
    tick: (v) => `${v}%`,
    head: (v) => fx(v, 1),
    aria: "Line chart of the misery index, the unemployment rate plus the year-over-year inflation rate, monthly from 1991 to the latest month",
    unit: "points",
  },
  gas: {
    key: "gas",
    title: "Gas price",
    desc: "Regular gasoline and diesel, national weekly average retail price, dollars per gallon. Not adjusted for inflation. Diesel data begins in 1994.",
    label2: "Diesel",
    kind: "line",
    domain: [0.5, 5.5],
    ticks: [1, 2, 3, 4, 5],
    tick: (v) => `$${v}`,
    head: (v) => `$${fx(v, 2)}`,
    aria: "Line chart of the weekly US regular gas price and diesel price per gallon since 1991",
    unit: "$ per gallon",
  },
  infl: {
    key: "infl",
    title: "Inflation",
    desc: "Year-over-year change in consumer prices (CPI, all items).",
    kind: "line",
    domain: [-3, 10],
    ticks: [0, 5, 10],
    tick: (v) => `${v}%`,
    head: (v) => `${fx(v, 1)}%`,
    aria: "Line chart of year-over-year consumer price inflation since 1991",
    unit: "%",
  },
  jobs: {
    key: "jobs",
    title: "Jobs added",
    desc: "Change in total nonfarm payrolls from the previous month, in jobs.",
    kind: "jobs",
    domain: [-JOBS_CAP, JOBS_CAP],
    ticks: [-1000, -500, 0, 500, 1000],
    tick: (v) => (v === 0 ? "0" : `${v < 0 ? MINUS : "+"}${Math.abs(v) === 1000 ? "1M" : `${Math.abs(v)}K`}`),
    head: (v) => `${v >= 0 ? "+" : MINUS}${nf(v)}K`,
    aria: "Bar chart of monthly job gains and losses since 1991, axis capped at plus or minus one million with larger months marked at the edges",
    unit: "thousand jobs",
  },
  un: {
    key: "un",
    title: "Unemployment",
    desc: "Share of the labor force without a job, seasonally adjusted.",
    kind: "line",
    domain: [0, 15],
    ticks: [0, 5, 10, 15],
    tick: (v) => `${v}%`,
    head: (v) => `${fx(v, 1)}%`,
    aria: "Line chart of the monthly unemployment rate since 1991",
    unit: "%",
  },
  mort: {
    key: "mort",
    title: "Mortgage rate",
    desc: "Average 30-year fixed rate, weekly (Freddie Mac survey).",
    kind: "line",
    domain: [2, 10],
    ticks: [2, 4, 6, 8, 10],
    tick: (v) => `${v}%`,
    head: (v) => `${fx(v, 2)}%`,
    aria: "Line chart of the weekly 30-year fixed mortgage rate since 1991, with the November 2022 survey method change marked",
    unit: "%",
  },
  inc: {
    key: "inc",
    title: "Household income",
    desc: "", // filled from the series' units field at render time
    kind: "income",
    domain: [60000, 90000],
    ticks: [60000, 70000, 80000, 90000],
    tick: (v) => `$${v / 1000}K`,
    head: (v) => `$${nf(v)}`,
    aria: "Line chart of real median household income by year since 1991",
    unit: "$",
  },
  def: {
    key: "def",
    title: "Federal deficit",
    desc: "Federal budget surplus (+) or deficit (−) as a share of GDP, by fiscal year.",
    kind: "fiscal",
    domain: [-16, 4],
    ticks: [-15, -10, -5, 0],
    tick: (v) => (v === 0 ? "0%" : `${MINUS}${Math.abs(v)}%`),
    head: (v) => `${v < 0 ? MINUS : "+"}${fx(Math.abs(v), 1)}%`,
    aria: "Bar chart of the federal surplus or deficit as a percent of GDP by fiscal year since 1991",
    unit: "% of GDP",
  },
  debt: {
    key: "debt",
    title: "Federal debt",
    desc: "Debt as a share of GDP, quarterly. The headline measure is debt held by the public.",
    kind: "debt",
    label2: "Total",
    domain: [20, 140],
    ticks: [40, 80, 120],
    tick: (v) => `${v}%`,
    head: (v) => `${fx(v, 1)}%`,
    aria: "Line chart of federal debt as a percent of GDP, quarterly since 1991, showing debt held by the public and total public debt",
    unit: "% of GDP",
  },
};

/** Card order, after the hero. */
export const CARD_ORDER: EconomyKey[] = ["gas", "infl", "jobs", "un", "mort", "inc", "def", "debt"];
