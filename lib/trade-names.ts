/**
 * Display names for trade partners. Census's partner names carry legal
 * qualifiers ("Germany (Federal Republic of Germany)"); the page shows the
 * name people use. Keyed by `country_code`, only where Census's name needs it.
 * Anything not listed passes through unchanged.
 */
const DISPLAY: Record<string, string> = {
  FLK: "Falkland Islands",
  DNK: "Denmark",
  DEU: "Germany",
  MDA: "Moldova",
  VAT: "Vatican City",
  YUG: "Yugoslavia",
  SYR: "Syria",
  YEM: "Yemen",
  MMR: "Myanmar",
  LAO: "Laos",
  PRK: "North Korea",
  KOR: "South Korea",
  CCK: "Cocos (Keeling) Islands",
  CXR: "Christmas Island",
  WSM: "Samoa",
  FSM: "Micronesia",
  COG: "Congo (Brazzaville)",
  COD: "Congo (Kinshasa)",
  TZA: "Tanzania",
  XGZ: "Gaza Strip",
  XWB: "West Bank",
  SUN: "Soviet Union",
  UNALLOC_8220: "Unidentified countries",
  UNALLOC_8500: "International organizations",
};

export function displayCountryName(code: string, censusName: string): string {
  return DISPLAY[code] ?? censusName;
}
