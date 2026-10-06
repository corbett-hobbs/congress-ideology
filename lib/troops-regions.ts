/**
 * The fixed region map for the troops-abroad page, keyed by ISO3 (`countries.json` `country_code`), with a name
 * fallback for the few places DMDC prints that have no ISO3. Client-safe and pure. Judgement calls, settled with
 * Corby (docs/TROOPS_METHODOLOGY.md "Regions"):
 *   Turkey, Greenland, Cyprus and the Caucasus -> Europe; North Africa (Morocco, Algeria, Tunisia, Libya) -> Africa;
 *   Egypt -> Middle East & South/Central Asia; Djibouti -> Africa; Diego Garcia (IOT) -> Middle East & South/Central Asia;
 *   Central Asia -> Middle East & South/Central Asia; UNKNOWN / ZZ-UNKNOWN / UNDEFINED -> Afloat & unassigned.
 * Territories have no region: they are listed apart from the map (G2).
 */
export const REGIONS = [
  { id: "europe", label: "Europe", color: "var(--cont-europe)" },
  { id: "east_asia_pacific", label: "East Asia & Pacific", color: "var(--cont-oceania)" },
  { id: "middle_east_south_central_asia", label: "Middle East & South/Central Asia", color: "var(--cont-asia)" },
  { id: "africa", label: "Africa", color: "var(--cont-africa)" },
  { id: "western_hemisphere", label: "Western Hemisphere", color: "var(--cont-south-america)" },
  { id: "afloat_unassigned", label: "Afloat & unassigned", color: "var(--cont-other)" },
] as const;

export type RegionId = (typeof REGIONS)[number]["id"];
export const REGION_IDS = REGIONS.map((r) => r.id) as RegionId[];

const split = (s: string) => s.trim().split(/\s+/);

const BY_REGION: Record<Exclude<RegionId, "afloat_unassigned">, string[]> = {
  europe: split(`ALB ARM AUT AZE BLR BEL BIH BGR HRV CYP CZE DNK EST FIN FRA GEO DEU GIB GRC GRL GGY HUN ISL IRL ITA XKX LVA LIE LTU LUX MLT MDA MNE NLD MKD NOR POL PRT ROU RUS SRB SVK SVN ESP SJM SWE CHE TUR UKR GBR SUN VAT YUG CSK`),
  east_asia_pacific: split(`ATA AUS BRN KHM CHN FJI HKG IDN JPN KIR LAO MAC MYS MHL FSM MNG MMR NZL NIU PLW PNG PHL WSM SGP SLB KOR PRK TWN THA TLS TON VNM UMI`),
  middle_east_south_central_asia: split(`AFG BHR BGD EGY IND IOT IRN IRQ ISR JOR KAZ KWT KGZ LBN LKA MDV NPL OMN PAK QAT SAU SYR TJK TKM ARE UZB YEM BTN`),
  africa: split(`DZA AGO BEN BWA BFA BDI CPV CMR CAF TCD COM COD COG CIV DJI GNQ ERI SWZ ETH GAB GMB GHA GIN KEN LSO LBR LBY MDG MWI MLI MRT MUS MAR MOZ NAM NER NGA RWA SEN SYC SLE SOM ZAF SSD SDN TZA TGO TUN UGA ZMB ZWE ESH SHN STP GNB`),
  western_hemisphere: split(`ATG ARG ABW BHS BRB BLZ BMU BOL BRA VGB CAN CHL COL CRI CUB CUW DMA DOM ECU SLV GTM GUY HTI HND JAM MTQ MEX NIC PAN PRY PER KNA LCA SPM SXM SUR TTO URY VEN ANT BLM GRD TCA`),
};

/** Places DMDC prints without an ISO3, assigned by name (canonical alias names). */
const BY_NAME: Record<string, RegionId> = {
  Akrotiri: "europe",
  "Ashmore and Cartier Islands": "east_asia_pacific",
  "Bassas da India": "africa",
  "British Atlantic Ocean Territory": "africa",
  "Coral Sea Islands": "east_asia_pacific",
  "Spratly Islands": "east_asia_pacific",
  "Trucial States": "middle_east_south_central_asia",
  // Pre-2008 places (docs/TROOPS_METHODOLOGY.md "History").
  "East Germany": "europe",
  Azores: "europe",
  "British West Indies": "western_hemisphere",
  "Easter Island": "western_hemisphere",
  Kashmir: "middle_east_south_central_asia",
  "Line Islands": "east_asia_pacific",
  Sarawak: "east_asia_pacific",
  "South Yemen": "middle_east_south_central_asia",
  Zanzibar: "africa",
  "Ascension Island": "africa",
  "Trust Territory of the Pacific Islands": "east_asia_pacific",
  "Midway Islands": "east_asia_pacific",
  "Johnston Atoll": "east_asia_pacific",
  Eniwetok: "east_asia_pacific",
};

const BY_ISO = new Map<string, RegionId>();
for (const [region, codes] of Object.entries(BY_REGION)) {
  for (const c of codes) {
    if (BY_ISO.has(c)) throw new Error(`troops-regions: ${c} is in two regions`);
    BY_ISO.set(c, region as RegionId);
  }
}

/** Region of a host or afloat row, or null when the place is unmapped (the data layer fails on null). */
export function regionOf(row: { class: "host" | "territory" | "afloat_unassigned"; iso3: string | null; name: string }): RegionId | null {
  if (row.class === "afloat_unassigned") return "afloat_unassigned";
  if (row.class === "territory") return null;
  return (row.iso3 ? BY_ISO.get(row.iso3) : undefined) ?? BY_NAME[row.name] ?? null;
}

export const regionLabel = (id: RegionId) => REGIONS.find((r) => r.id === id)!.label;
