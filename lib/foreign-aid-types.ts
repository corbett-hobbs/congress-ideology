/**
 * Client-safe shapes for /presidency/foreign-aid. The pipeline file is ~7 MB of
 * (recipient, year, sector) rows, so the page ships a dense-index payload instead:
 * countries, years and sectors are small tables, and every dollar figure is a
 * row of integers that points into them. Dollars are exact (no rounding).
 */

export interface AidCountryRef {
  /** The source's recipient name; unique among country recipients. This is the page's country id. */
  name: string;
  /** Trade pipeline `country_code` (the map geometry key), or null (West Bank and Gaza, Sudan (former), China (Tibet), Pacific Island Trust Territory). */
  key: string | null;
}

export interface AidTerm {
  termId: string;
  president: string;
  /** "Trump" */
  last: string;
  party: "D" | "R";
  /** First and last fiscal year assigned to this administration, clipped to the data. */
  fromFy: number;
  toFy: number;
  /** "Donald Trump (2025–present)" style label for the dropdown. */
  label: string;
}

export interface AidPayload {
  /** Source sector names, in display order (`SECTOR_ORDER`). Index = sector id in `rows`. */
  sectors: string[];
  /** Fiscal years, ascending and contiguous. Index = year id in `rows`. */
  years: number[];
  partialYears: number[];
  /** Latest fiscal year not flagged partial: the page's default year. */
  defaultYear: number;
  /** ISO date of the source's "data last updated" banner. */
  dataThrough: string;
  /** Country recipients, alphabetical. Index = country id in `rows`. */
  countries: AidCountryRef[];
  /** One entry per nonzero (country, year, sector): `[countryId, yearId, sectorId, disbursements, militaryDisbursements]`. */
  rows: [number, number, number, number, number][];
  /** Regional and global programs (not attributable to one country): `[yearId, sectorId, disbursements]`. */
  nonCountry: [number, number, number][];
  /** Presidents with at least one fiscal year in the data, oldest first. */
  terms: AidTerm[];
}
