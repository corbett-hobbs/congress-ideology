/**
 * Public URL for a filing's source document, from `source_system` +
 * `source_doc_id` (+ `year` for House, whose PDF path is year-scoped).
 * Mirrors the two fetch URL templates in
 * `pipeline/financial_disclosures/fetch.py` (House) and
 * `pipeline/financial_disclosures/senate_fetch.py` (Senate) — this is the
 * app-side restatement, since nothing on the TS side builds these today.
 *
 * Verified live (2026-09-29): all three sampled House doc ids resolve
 * (200); the Senate URL redirects an unauthenticated visitor to
 * efdsearch.senate.gov's terms-of-use page (`/search/home/`) rather than the
 * report directly — a site-wide session gate on efdsearch.senate.gov, not
 * specific to any one report. This is still the correct permalink (the same
 * `report_url` shape `senate_fetch.py` itself resolves from a search
 * result), so it's used as-is rather than routed through the search page.
 */

export type SourceSystem = "house_clerk" | "senate_efd";

export function sourceDocUrl(
  sourceSystem: SourceSystem,
  sourceDocId: string,
  year: number,
): string {
  if (sourceSystem === "house_clerk") {
    return `https://disclosures-clerk.house.gov/public_disc/financial-pdfs/${year}/${sourceDocId}.pdf`;
  }
  return `https://efdsearch.senate.gov/search/view/annual/${sourceDocId}/`;
}

export const SOURCE_SYSTEM_LABEL: Record<SourceSystem, string> = {
  house_clerk: "House Clerk",
  senate_efd: "Senate eFD",
};
