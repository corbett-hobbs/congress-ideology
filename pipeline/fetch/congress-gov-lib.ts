import { BILL_TYPES, type BillType, type RawAction, type RawLaw } from "../../lib/laws-entities";
import { becameLawDates, isoDay, keepAction, normaliseCommittees, lawId, parsePublicLawNumber, pickSummary, slimActions, type SummaryVersion } from "./laws-raw";

/**
 * Congress.gov API v3 (api.congress.gov), used for the Congresses GovInfo Bill Status does not cover (93rd-107th) and
 * as the overlap check for one bulk Congress. The key goes in an `X-Api-Key` header and is never put in a URL or a log line.
 * Measured in docs/LAWS_PREFLIGHT.md: 20,000 calls an hour, about 3 calls per law, and the law *list* repeats rows and
 * omits laws, so the law numbers are walked 1..N and the missing ones are looked up by number.
 */
export const API_BASE = "https://api.congress.gov/v3";

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export interface ApiClientOptions {
  key: string;
  /** Average requests a second across all workers. The hourly limit (20,000) allows 5.5. */
  perSecond?: number;
  fetchImpl?: typeof fetch;
  sleep?: (ms: number) => Promise<void>;
}

/** A minimal paced client: one shared schedule so concurrent workers cannot exceed the rate, 429 and 5xx retried with back-off. */
export class CongressApi {
  private readonly gap: number;
  private next = 0;
  calls = 0;
  remaining: number | null = null;
  private readonly sleep: (ms: number) => Promise<void>;
  private readonly fetchImpl: typeof fetch;

  constructor(private readonly opts: ApiClientOptions) {
    this.gap = 1000 / (opts.perSecond ?? 5);
    this.sleep = opts.sleep ?? ((ms) => new Promise((r) => setTimeout(r, ms)));
    this.fetchImpl = opts.fetchImpl ?? fetch;
  }

  private async slot(): Promise<void> {
    const now = Date.now();
    const at = Math.max(now, this.next);
    this.next = at + this.gap;
    if (at > now) await this.sleep(at - now);
  }

  /** GET a path (`/bill/118/hr/815/actions`); returns null on 404. */
  async get(path: string, params: Record<string, string | number> = {}): Promise<unknown | null> {
    const q = new URLSearchParams({ format: "json", ...Object.fromEntries(Object.entries(params).map(([k, v]) => [k, String(v)])) });
    for (let attempt = 1; ; attempt++) {
      await this.slot();
      this.calls++;
      let res: Response;
      try {
        res = await this.fetchImpl(`${API_BASE}${path}?${q.toString()}`, { headers: { "x-api-key": this.opts.key, accept: "application/json" }, signal: AbortSignal.timeout(60_000) });
      } catch (e) {
        if (attempt >= 6) throw new ApiError(`GET ${path}: ${e instanceof Error ? e.message : "network error"}`, 0);
        await this.sleep(2000 * attempt);
        continue;
      }
      const rem = res.headers.get("x-ratelimit-remaining");
      if (rem !== null) this.remaining = Number(rem);
      if (res.status === 404) return null;
      if (res.ok) return await res.json();
      if ((res.status === 429 || res.status >= 500) && attempt < 8) {
        const retry = Number(res.headers.get("retry-after"));
        await this.sleep(res.status === 429 ? (Number.isFinite(retry) && retry > 0 ? retry * 1000 : 60_000) : 2000 * attempt);
        continue;
      }
      throw new ApiError(`GET ${path} -> ${res.status} ${res.statusText}`, res.status);
    }
  }

  /** Walk a paginated list (`limit` 250) and return the concatenated `field` arrays plus the source's own count. */
  async list(path: string, field: string): Promise<{ items: unknown[]; count: number }> {
    const items: unknown[] = [];
    let count = 0;
    for (let offset = 0; ; offset += 250) {
      const j = (await this.get(path, { limit: 250, offset })) as { pagination?: { count?: number; next?: string }; [k: string]: unknown } | null;
      if (!j) break;
      count = j.pagination?.count ?? count;
      const page = j[field];
      if (Array.isArray(page)) items.push(...page);
      if (!j.pagination?.next || !Array.isArray(page) || page.length === 0) break;
    }
    return { items, count };
  }
}

// ---- mapping API JSON -> RawLaw ----

interface ApiVote {
  chamber?: string;
  rollNumber?: number;
  sessionNumber?: number;
  date?: string;
}
interface ApiAction {
  actionDate?: string;
  text?: string;
  type?: string;
  sourceSystem?: { code?: number };
  recordedVotes?: ApiVote[];
}
export interface ApiBillDetail {
  number?: string;
  type?: string;
  originChamber?: string;
  title?: string;
  introducedDate?: string;
  updateDate?: string;
  sponsors?: { bioguideId?: string; fullName?: string }[];
  policyArea?: { name?: string } | null;
  laws?: { number?: string; type?: string }[];
  latestAction?: { actionDate?: string };
}
export interface ApiSummary {
  actionDate?: string;
  actionDesc?: string;
  text?: string;
}
export interface ApiCosponsor {
  bioguideId?: string;
  sponsorshipWithdrawnDate?: string | null;
}

export interface ApiCommittee {
  systemCode?: string;
  name?: string;
  chamber?: string;
  activities?: { name?: string; date?: string }[];
  subcommittees?: { systemCode?: string; name?: string; activities?: { name?: string; date?: string }[] }[];
}

/** `/bill/.../committees` items -> the stored shape. */
export const apiCommittees = (list: ApiCommittee[]) =>
  normaliseCommittees(list.map((c) => ({ code: c.systemCode, name: c.name, chamber: c.chamber, activities: c.activities, subcommittees: (c.subcommittees ?? []).map((s) => ({ code: s.systemCode, name: s.name, activities: s.activities })) })));

export const apiActions = (raw: ApiAction[]): RawAction[] =>
  raw.flatMap((a) => {
    const date = isoDay(a.actionDate);
    const type = a.type ?? "";
    const text = a.text ?? "";
    if (!date) return [];
    const votes: NonNullable<RawAction["votes"]> = (a.recordedVotes ?? []).flatMap((v) => {
      const ch = v.chamber === "House" || v.chamber === "Senate" ? v.chamber : null;
      return ch && Number.isInteger(v.rollNumber)
        ? [{ chamber: ch, roll: v.rollNumber as number, session: Number.isInteger(v.sessionNumber) ? (v.sessionNumber as number) : null, date: isoDay(v.date) }]
        : [];
    });
    if (!keepAction(type, text, votes.length > 0)) return [];
    return [{ date, type, text, src: Number.isInteger(a.sourceSystem?.code) ? (a.sourceSystem!.code as number) : null, ...(votes.length > 0 ? { votes } : {}) }];
  });

/** Build the records for one bill: one `RawLaw` per public-law number it carries in `congress`. */
export function lawsFromApiBill(congress: number, bill: ApiBillDetail, actions: ApiAction[], summaries: ApiSummary[], cosponsors: ApiCosponsor[], committees: ApiCommittee[]): RawLaw[] {
  const type = (bill.type ?? "").toLowerCase();
  if (!(BILL_TYPES as readonly string[]).includes(type)) throw new Error(`bill type "${bill.type}" cannot become a public law`);
  const numbers = (bill.laws ?? [])
    .filter((l) => l.type === "Public Law")
    .map((l) => parsePublicLawNumber(l.number ?? ""))
    .filter((x): x is [number, number] => x !== null && x[0] === congress);
  const slim = slimActions(apiActions(actions));
  const versions: SummaryVersion[] = summaries.map((s) => ({ stage: s.actionDesc ?? null, date: isoDay(s.actionDate), html: s.text ?? "" }));
  const summary = pickSummary(versions);
  const sponsor = bill.sponsors?.[0];
  const origin = bill.originChamber === "House" || bill.originChamber === "Senate" ? bill.originChamber : null;
  return numbers.map(([c, n]) => ({
    law_id: lawId(c, n),
    congress: c,
    number: n,
    bill_type: type as BillType,
    bill_number: bill.number ?? "",
    origin_chamber: origin,
    title: bill.title ?? "",
    introduced: isoDay(bill.introducedDate),
    sponsor: sponsor?.bioguideId ?? null,
    sponsor_name: sponsor?.fullName ?? null,
    cosponsors: cosponsors.filter((c2) => !c2.sponsorshipWithdrawnDate && c2.bioguideId).map((c2) => c2.bioguideId as string),
    policy_area: bill.policyArea?.name ?? null,
    summary_html: summary?.html ?? null,
    summary_stage: summary?.stage ?? null,
    became_law: becameLawDates(slim),
    latest_action_date: isoDay(bill.latestAction?.actionDate),
    updated: isoDay(bill.updateDate),
    actions: slim,
    committees: apiCommittees(committees),
  }));
}

/** A row of `/law/{congress}/pub`: just the fields the fetch plan needs. */
export interface LawListRow {
  type: string;
  number: string;
  updateDate?: string;
  laws: { number: string; type: string }[];
}
