/** Continent grouping for the "Did tariffs shift trade?" scatter, keyed by the canonical country code. */
export type Continent = "africa" | "asia" | "europe" | "north-america" | "south-america" | "oceania" | "other";

export const CONTINENTS: readonly { id: Continent; label: string }[] = [
  { id: "north-america", label: "North America" },
  { id: "south-america", label: "South America" },
  { id: "europe", label: "Europe" },
  { id: "asia", label: "Asia" },
  { id: "africa", label: "Africa" },
  { id: "oceania", label: "Oceania" },
  { id: "other", label: "Other" },
];

const groups: Record<Exclude<Continent, "other">, string> = {
  "north-america":
    "GRL CAN SPM MEX GTM BLZ SLV HND NIC CRI PAN BMU BHS CUB JAM TCA CYM HTI DOM AIA VGB KNA ATG MSR DMA LCA VCT GRD BRB TTO ANT SXM CUW ABW GLP MTQ",
  "south-america": "COL VEN GUY SUR GUF ECU PER BOL CHL BRA PRY URY ARG FLK",
  europe:
    "ISL SWE SJM NOR FIN FRO DNK GBR IRL NLD BEL LUX AND MCO FRA DEU AUT CSK CZE SVK HUN LIE CHE EST LVA LTU POL SUN RUS BLR UKR MDA ESP PRT GIB MLT SMR VAT ITA YUG HRV SVN BIH MKD SCG SRB XKX MNE ALB GRC ROU BGR",
  asia:
    "ARM AZE GEO KAZ KGZ TJK TKM UZB TUR CYP SYR LBN IRQ IRN ISR XGZ XWB JOR KWT SAU QAT ARE YEM OMN BHR AFG IND PAK NPL BGD LKA MMR THA VNM LAO KHM MYS SGP IDN TLS BRN PHL MAC BTN MDV CHN MNG PRK KOR HKG TWN JPN",
  oceania: "AUS NFK CCK CXR HMD PNG NZL COK TKL NIU WSM SLB VUT PCN KIR TUV NCL WLF PYF MHL FSM PLW NRU FJI TON",
  africa:
    "MAR DZA TUN LBY EGY SDN SSD ESH GNQ MRT CMR SEN MLI GIN SLE CIV GHA GMB NER TGO NGA CAF GAB TCD SHN BFA BEN AGO COG GNB CPV STP LBR COD BDI RWA SOM ETH ERI DJI UGA KEN SYC IOT TZA MUS MOZ MDG MYT COM REU ATF ZAF NAM BWA ZMB SWZ ZWE MWI LSO",
};

const byCode = new Map<string, Continent>();
for (const [id, codes] of Object.entries(groups)) for (const c of codes.split(" ")) byCode.set(c, id as Continent);

export const continentOf = (code: string): Continent => byCode.get(code) ?? "other";
