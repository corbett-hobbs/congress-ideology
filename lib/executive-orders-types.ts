/**
 * Client-safe shapes for the executive-orders page — the client half of the
 * `executive-orders-data.ts` / `executive-orders-types.ts` split (same reason as
 * `committee-data` / `committee-types`: chart components need the types and the
 * topic styling without pulling in `server-only` file reads).
 */
import { EO_TOPICS, type EoTopic } from "./executive-orders-entities";

export { EO_TOPICS, EO_TOPIC_LABELS, type EoTopic } from "./executive-orders-entities";

export type TopicCounts = Record<EoTopic, number>;

export const emptyCounts = (): TopicCounts =>
  Object.fromEntries(EO_TOPICS.map((t) => [t, 0])) as TopicCounts;

/** One order, as the click-a-year list needs it. */
export interface EoListItem {
  n: number;
  title: string;
  topic: EoTopic;
  /** Federal Register document number (links to federalregister.gov/d/<doc>). */
  doc: string;
  /** ISO signing date. */
  signed: string;
  termId: string;
}

export interface EoAdmin {
  termId: string;
  president: string;
  party: "Democratic" | "Republican";
  start: string;
  end: string | null;
}

/** One president's slice of one calendar year (a transition year has two). */
export interface EoYearTerm {
  termId: string;
  total: number;
  counts: TopicCounts;
}

export interface EoYear {
  year: number;
  total: number;
  counts: TopicCounts;
  /** Signing-date split by president; length 2 in a transition year. */
  byTerm: EoYearTerm[];
  /** True for the calendar year still in progress. */
  partial: boolean;
  items: EoListItem[];
}

export interface EoPayload {
  years: EoYear[];
  administrations: EoAdmin[];
  total: number;
  /** Latest signing date in the data. */
  throughDate: string;
}

/**
 * Topic styling. Colour alone cannot carry nine categories (see
 * docs/DATA_CONVENTIONS.md, executive-orders palette): the 9 topics are three
 * colour families x three fills (solid / hatch / dots). Pairs that share a fill
 * are separated by colour under the CVD gate in validate_palette.js; pairs
 * that share a colour are separated by fill.
 */
/** The `fill` value for a topic: its `--topic-<topic>` colour token (one solid colour per topic). */
export function topicFill(topic: EoTopic): string {
  return `var(--topic-${topic})`;
}
