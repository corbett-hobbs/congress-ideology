# Overseas bases: source notes (Phase 0 findings)

Status: **Phase 0 stopped at the "coverage ends long before the troop series" condition. No pipeline or UI work has been done.**

## Divergence 1: the pinned snapshot had no base file

`pipeline/raw/troopdata/` held only the quarter-format troop CSV, `LICENSE.md` and `DESCRIPTION`. The base data is a separate upstream file at the same pinned commit (`338bbda`): `data-raw/basedata.csv`. With Corby's approval it was added to `TROOPDATA_FILES` in `pipeline/fetch/troopdata-lib.ts` and fetched with `pnpm fetch:troopdata` (25,608 bytes, hash in `manifest.json`). This extends the existing fetch; there is no new script or workflow.

## Findings

1. **File and columns.** `basedata.csv`, 414 rows, nine columns: `countryname, ccode (COW), iso3c, basename, lat, lon, base, lilypad, fundedsite`. Example: `Germany,255,DEU,Ramstein AFB,49.44,7.5971,1,0,0`; `Afghanistan,700,AFG,Bagram AB,34.946222,69.264639,1,0,0`; `Italy,325,ITA,Aviano AB,46.069863,12.598471,1,0,0`; `Qatar,694,QAT,Al Udeid AB,25.117222,51.314722,1,0,0`; `Wake Island,2,USA,Wake Island,19.280042,166.647717,0,1,0`.
2. **No stable identifier.** Names only. One exact duplicate within a country (`ITA` Naval Support Activity Naples). Near-duplicates exist (Yokota appears twice under different names, Camp Humphreys twice at two different places). A `base_id` would have to be derived (iso3 + slug + row index), which is not stable across upstream edits.
3. **Coverage: a single undated snapshot, "through 2018" per upstream docs. No per-year presence, no first/last year per base.** Source is David Vine's lists (American University). The troop series on the page runs to Mar 2026. **This is the stop condition.** Consequences: the layer cannot be tied to the year slider, cannot say a base is open now, and would omit or wrongly include sites from 2019 onward (the plan already anticipates the label "source through YYYY" with YYYY = 2018).
4. **Site types.** Three non-exclusive flags: `base` (major base) 255, `lilypad` (under 200 personnel or "other site" in Pentagon reports) 113, `fundedsite` (host-nation base funded by the U.S.) 45, plus one row flagged both lilypad and funded. Every row has exactly one flag except that one.
5. **Codes.** ISO3 is used, with errors. Not in `countries.json`: `KSV` (Kosovo; the map key is `XKX`, trade is `XKO`) and `USA` (31 rows, all territories, see 6). Wrong or odd: `CHN` for Hong Kong, `COG` labelled "Congo, Democratic Republic" (check which country), `GBR` for Ascension and British Indian Ocean Territory (Diego Garcia; fine for the country, but the map outline differs), `DNK` for Greenland, `NLD` for Aruba/Netherlands Antilles, `NZL` for Antarctica, `NER` with a "NIger" spelling, `GEO` spelled "Georigia". Name variants inside one code are normal.
6. **Territories.** `USA` rows: Puerto Rico 19, Northern Mariana Islands 4, Guam 3, Virgin Islands 2, American Samoa 1, Johnston Atoll 1, Wake Island 1. No ships/afloat rows. Domestic U.S. states are not present.
7. **Coordinate quality.** All present values are in range and none are 0. **7 rows have no coordinates** (Douala; Israel Site 54; Yongpyong; Mount Pirata, Vieques; Sabt; Ushariya; Ayn Dadad). **Wrong points seen:** both "Camp Humphreys" rows are suffixed with the wrong city (Chechon, Taejon) and the second sits at 36.35, 127.38, which is Daejeon, about 100 km from Humphreys. 10 names contain a raw tab or country text glued onto the name (`Guantanamo Bay\tCuba`, `Osan\tSouth Korea`, ...). The encoding is Latin-1, not UTF-8 (a UTF-8 read fails). Spot checks that landed correctly: Ramstein, Aviano, Incirlik, Al Udeid, Misawa, Diego Garcia, Thule, Kadena, Camp Bondsteel. Both Yokota rows are plausible (one is at 35.69, 139.69, central Tokyo, not the base). Guantanamo Bay is present at 20.01, -75.12, which is roughly right.
8. **Licence.** `LICENSE.md` (GPL-3.0) is committed beside the raw file and is the licence of the R package. The base list itself is Vine's compilation; the package docs cite the American University repository. A credit to both (Flynn's `troopdata`, Vine's lists) is needed on the page and in `docs/CREDITS.md`.
9. **Projection.** Not yet reproduced. From `pipeline/transform/world-map.ts`: `geoNaturalEarth1().fitWidth(996, <all land except Antarctica>)`, then translated by (+2, +2); width 1000, height from the lowest ring. Points outside Natural Earth's clip will project to `null` (antimeridian: Wake at 166.6E and Guam at 144.9E are fine in this projection). The three-point check (Guam, Diego Garcia, Wake) was not run because of the stop condition.
10. **Marker pattern.** Not yet read in detail (`components/troops/MapCard`).

## Missing from this snapshot (by construction, post-2018)

Anything opened or renamed after 2018, including new sites in the Philippines (EDCA), Poland, Norway, Greece, and recent Middle East and African sites. Not curated here (out of scope).

## Decision needed

Proceed with a layer that is honestly labelled "Known installations (Vine/troopdata, through 2018)" and shows a snapshot, or change the source. Options are in the session notes.
