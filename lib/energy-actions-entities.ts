import { z } from "zod";
import { federalRegisterNumber, tariffSource } from "./tariff-actions-entities";

/**
 * Schema for the hand-curated energy policy-actions timeline (`pipeline/reference/energy-actions.json`
 * -> `pipeline/output/energy_actions.json`). Same pattern as the tariff actions: editorial data, every
 * row rests on a primary source that was actually fetched. Curation rules: `docs/ENERGY_ACTIONS_CURATION.md`.
 *
 * A flag marks WHEN something happened beside a series. It never says the action caused the movement;
 * `lagged_effect` marks the rows where the enabling act precedes the market by years (copy: "enabled,
 * not caused").
 */

/** The weekly check complains, and any "Latest developments" list hides, when `last_reviewed` is older than this. */
export const ENERGY_ACTIONS_STALE_DAYS = 30;

/** Priority-1 (always flagged) rows are capped so the chart stays readable. */
export const MAX_ENERGY_PRIORITY_1 = 10;

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

export const ENERGY_AUTHORITY_TYPES = ["executive", "congressional", "agency", "court"] as const;
export const ENERGY_AREAS = ["spr", "crude_exports", "lng", "pipeline", "climate_agreement", "electricity", "general"] as const;
/**
 * `release_sale` (SPR oil sold), `release_exchange` (SPR oil lent, returned later with a premium),
 * `release_mixed` (both in one action), `refill` (purchase or return to the reserve).
 */
export const ENERGY_KINDS = [
  "release_sale",
  "release_exchange",
  "release_mixed",
  "refill",
  "permit_granted",
  "permit_denied",
  "permit_revoked",
  "pause",
  "pause_ended",
  "statute",
  "treaty_entry",
  "treaty_exit",
  "order",
  "announcement",
] as const;

export const energyAction = z
  .object({
    /** Stable slug: `<date>-<short-name>`. */
    action_id: z.string().regex(/^\d{4}-\d{2}-\d{2}-[a-z0-9]+(-[a-z0-9]+)*$/),
    /** The EFFECTIVE date. When it differs from the announcement or signing, `announced_date` holds that. */
    date: isoDate,
    announced_date: isoDate.optional(),
    /** Chart-ready, neutral, 60 characters or fewer. */
    label_short: z.string().min(1).max(60),
    description: z.string().min(1),
    authority_type: z.enum(ENERGY_AUTHORITY_TYPES),
    area: z.enum(ENERGY_AREAS),
    kind: z.enum(ENERGY_KINDS),
    /** `series_id`s in energy_series.json this flag can sit beside (empty = an event marker only). */
    series: z.array(z.string()),
    /** True when the effect on the series, if any, comes years after the action. The UI says "enabled", never "caused". */
    lagged_effect: z.boolean(),
    flag_priority: z.union([z.literal(1), z.literal(2)]),
    links: z
      .object({
        /** `eo_number`s in executive_orders.json. Content is not duplicated here. */
        eo_numbers: z.array(z.number().int()).optional(),
      })
      .strict()
      .optional(),
    /** Federal Register document numbers, when the action has one. */
    federal_register_documents: z.array(federalRegisterNumber).optional(),
    sources: z.array(tariffSource).min(1),
  })
  .strict();
export type EnergyAction = z.infer<typeof energyAction>;

export const energyActionsFile = z
  .object({
    /** The date through which a human checked for new actions. */
    last_reviewed: isoDate,
    actions: z.array(energyAction),
  })
  .strict();
export type EnergyActionsFile = z.infer<typeof energyActionsFile>;

export const daysSinceEnergyReview = (lastReviewed: string, today: string) =>
  Math.round((Date.parse(`${today}T00:00:00Z`) - Date.parse(`${lastReviewed}T00:00:00Z`)) / 86_400_000);

export const isEnergyReviewStale = (lastReviewed: string, today: string) => daysSinceEnergyReview(lastReviewed, today) > ENERGY_ACTIONS_STALE_DAYS;
