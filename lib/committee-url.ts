/**
 * Committee page URLs:
 *   /congress/committees/<committee_id>/<name-slug>
 *
 * The `committee_id` segment (the THOMAS id, e.g. `HSJU`) is canonical and
 * resolves the page on its own. The `name-slug` is for humans and search
 * engines; a request with the wrong slug but a valid id is redirected to the
 * canonical URL — same rule as the member profile routes. Pure and isomorphic.
 */
import { slugifyName } from "./member-url";

export const COMMITTEES_BASE_PATH = "/congress/committees";

export interface CommitteeRef {
  committeeId: string;
  /** The marquee `short_name` — the same string charts and the header show. */
  shortName: string;
}

export function committeeSlug(ref: Pick<CommitteeRef, "shortName">): string {
  return slugifyName(ref.shortName);
}

export function committeePath(ref: CommitteeRef): string {
  return `${COMMITTEES_BASE_PATH}/${ref.committeeId}/${committeeSlug(ref)}`;
}
