import { z } from "zod";

/**
 * Schema for the hand-curated tariff-actions timeline (`pipeline/reference/tariff-actions.json`
 * -> `pipeline/output/tariff_actions.json`). Editorial data: every row rests on a primary
 * source. Curation rules: docs/TARIFF_ACTIONS_CURATION.md.
 */

/** The "Latest developments" list is hidden, and the weekly check complains, when `last_reviewed` is older than this. Flags are historical and never hide. */
export const TARIFF_ACTIONS_STALE_DAYS = 30;

/** Priority-1 (always flagged) rows are capped so the chart stays readable. */
export const MAX_PRIORITY_1 = 10;

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

export const TARIFF_AUTHORITIES = ["section_232", "section_301", "ieepa", "section_122", "court", "other"] as const;
export const TARIFF_KINDS = ["imposed", "increased", "reduced", "paused", "terminated", "struck_down", "replaced"] as const;
export const TARIFF_STATUSES = ["in_effect", "in_effect_under_challenge", "superseded", "terminated", "decided", "stayed"] as const;

export const tariffSource = z
  .object({
    title: z.string().min(1),
    publisher: z.string().min(1),
    url: z.url({ protocol: /^https$/ }),
    kind: z.enum(["primary", "secondary"]),
  })
  .strict();

/** A Federal Register document number: 2018-05478 (4-digit year, 5 digits) or 94-1531 (2-digit year). */
export const federalRegisterNumber = z.string().regex(/^(\d{4}-\d{5}|\d{2}-\d{1,5})$/, "not a Federal Register document number");

export const tariffAction = z
  .object({
    /** Stable slug: `<date>-<short-name>`. */
    action_id: z.string().regex(/^\d{4}-\d{2}-\d{2}-[a-z0-9]+(-[a-z0-9]+)*$/),
    /** The EFFECTIVE date. When it differs from the announcement, `announced_date` holds that. */
    date: isoDate,
    announced_date: isoDate.optional(),
    /** Chart-ready, neutral, about 50 characters or fewer. */
    label_short: z.string().min(1).max(60),
    description: z.string().min(1),
    authority: z.enum(TARIFF_AUTHORITIES),
    /** Names the statute when `authority` is `other` (for example Section 338 of the Tariff Act of 1930). */
    authority_note: z.string().optional(),
    kind: z.enum(TARIFF_KINDS),
    /** "all", or `country_code`s from countries.json (never aggregates). Exceptions go in `scope_note`. */
    countries: z.union([z.literal("all"), z.array(z.string()).min(1)]),
    scope_note: z.string().optional(),
    /** Status as of `last_reviewed`. */
    legal_status: z.enum(TARIFF_STATUSES),
    status_note: z.string().optional(),
    /** Only what the primary source states. Never a computed rate. */
    rate_note: z.string().optional(),
    flag_priority: z.union([z.literal(1), z.literal(2)]),
    is_cutover: z.boolean(),
    links: z
      .object({
        /** `eo_number`s in executive_orders.json. Content is not duplicated here. */
        eo_numbers: z.array(z.number().int()).optional(),
      })
      .strict()
      .optional(),
    /** Descriptive only: the Supreme Court data has no case identifiers to link to. */
    court_case: z.object({ name: z.string(), docket: z.string(), court: z.string() }).strict().optional(),
    /** Lets the later candidate feed skip documents already covered. */
    federal_register_documents: z.array(federalRegisterNumber).optional(),
    sources: z.array(tariffSource).min(1),
  })
  .strict();
export type TariffAction = z.infer<typeof tariffAction>;

export const tariffActionsFile = z
  .object({
    /** The date through which a human reviewed new developments, including court rulings and announcements that never reach the Federal Register. */
    last_reviewed: isoDate,
    actions: z.array(tariffAction),
  })
  .strict();
export type TariffActionsFile = z.infer<typeof tariffActionsFile>;

/** Whole days from `lastReviewed` to `today` (both ISO dates, UTC). */
export function daysSinceReview(lastReviewed: string, today: string): number {
  return Math.round((Date.parse(`${today}T00:00:00Z`) - Date.parse(`${lastReviewed}T00:00:00Z`)) / 86_400_000);
}

/** True when the Latest developments list should hide and the weekly check should complain. */
export const isReviewStale = (lastReviewed: string, today: string) => daysSinceReview(lastReviewed, today) > TARIFF_ACTIONS_STALE_DAYS;
