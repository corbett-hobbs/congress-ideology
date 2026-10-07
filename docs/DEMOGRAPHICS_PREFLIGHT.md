# Demographics page ("Who Serves in Congress?") — pre-flight inventory

Step 0 of the demographics session. Read from the committed outputs and the raw `congress-legislators` snapshots on
2026-10-07; no feature code. Numbers come from scripts run over `pipeline/raw/congress-legislators/legislators-{current,historical}.yaml`
(12,770 people) and `pipeline/output/{legislators,terms}.json`.

**Result: the gate fails on first-day rosters. Nothing past this document was built.** Birthdates and gender pass. See
"Gate" at the bottom for the options.

## 1. Birthdates

- `legislators.json` carries **`birth_year` only** (`transform/legislators.ts` slices the year off `bio.birthday`). The full
  birthday is in the raw YAML, so the transform would need to emit a `birthday` (plain fact, `YYYY-MM-DD`).
- Source coverage, member-Congress rows (voting members whose nominal term covers the convening day, 73rd-119th, 25,353 rows):
  **full date on 25,349, year-only on 0, none on 4 (0.016%)**. Those four rows are three people: Edward Rohrbough (R000410, 78th
  and 80th), Everett Burkhalter (B001104, 88th), John Hutchinson (H001013, 96th). Far under the 5% gate, in every era.

## 2. Gender

- Field `gender` in `legislators.json` (`"M" | "F"`, required by the Zod schema). Over the same 25,353 rows: **F 2,061, M 23,292,
  missing 0.** Binary source; say so in Data notes.

## 3. First-day roster — **cannot be reconstructed without guessing**

`terms.json` is (legislator × Congress × chamber) with no dates, so it cannot do it. The YAML does carry `start` / `end`, but
**they are nominal Congress-length ranges for most historical members, including people who joined mid-term**:

- Zadoc Weatherford (AL-7) succeeded William Bankhead after Bankhead's death in 1940. Both rows read `1939-01-03..1941-01-03`.
- Frances Bolton (OH-22) succeeded her husband Chester Bolton in 1940: both `1939-01-03..1941-01-03`.
- Walter Lynch / Edward Curley (NY-22), Tiernan / Fogarty (RI-2, 1967), and 24+ more in the 76th alone are the same pattern.
- A death or resignation does not shorten the leaver's `end` either, so neither row marks which person held the seat on day one.

So the YAML is effectively Congress-grain, the same as Voteview (which has no dates at all). A single seat with two occupants
cannot be resolved to "who was there on the first day" without inferring an order (alphabetical, vote count, bioguide id), and
every such rule is a guess.

Counts of voting members whose nominal term covers the Congress's convening day (see §4 for the dates), against the real seat total:

| Chamber | Expected | What the data gives |
| --- | --- | --- |
| House | 435 (437 in the 87th–88th after Alaska and Hawaii) | **Over 437 in 28 of 47 Congresses**, up to 459 (76th), 453 (77th, 78th), 451 (80th), 450 (75th, 82nd), 449 (73rd, 87th). Settles at 433–436 from the 99th on, where terms are accurate. |
| Senate | 96 (73rd–85th), 98 (86th, Alaska) then 100 | Exact in 74th, 76th, 78th–85th and most of the 87th+; **off in 73rd and 75th (94), 77th (95), 86th (100: Hawaii's senators carry a nominal start of 1959-01-03 though seated in August), 91st (99), 92nd (98), 94th (99), 111th (98), 116th, 117th, 119th (99)**. Most of those are real vacancies; the 86th is the same nominal-date error as the House. |

Full per-Congress counts (House / Senate, convening-day match, voting members only): 73: 449/94 · 74: 444/96 · 75: 450/94 ·
76: 459/96 · 77: 453/95 · 78: 453/96 · 79: 448/96 · 80: 451/96 · 81: 446/96 · 82: 450/96 · 83: 442/96 · 84: 441/96 ·
85: 445/96 · 86: 448/100 · 87: 449/100 · 88: 445/100 · 89: 442/100 · 90: 439/100 · 91: 447/99 · 92: 443/98 · 93: 440/100 ·
94: 442/99 · 95: 441/100 · 96: 440/100 · 97: 443/100 · 98: 439/100 · 99: 439/100 · 100: 438/100 · 101: 435/100 ·
102: 435/100 · 103: 435/100 · 104: 435/100 · 105: 436/100 · 106: 435/100 · 107: 434/100 · 108: 435/100 · 109: 434/100 ·
110: 435/100 · 111: 434/98 · 112: 435/100 · 113: 433/100 · 114: 434/100 · 115: 434/100 · 116: 433/99 · 117: 433/99 ·
118: 434/100 · 119: 434/99.

The "any time during the Congress" grain (`terms.json`) is House 440–455, Senate 101–104 for the same Congresses.

## 4. Congress start dates

`pipeline/transform/congress.ts` `congressStartDate` returns Jan 3 (March 4 through the 73rd). **That is the constitutional default,
not when the Congress convened**: matching on Jan 3 found zero House members in 18 Congresses, because the source dates terms from the day
members were sworn in. The modal House term start in January–March of the Congress's first year is the real convening date:

73: 1933-03-09 · 74: 1935-01-03 · 75: 1937-01-05 · 76: 1939-01-03 · 77: 1941-01-03 · 78: 1943-01-06 · 79: 1945-01-03 ·
80: 1947-01-03 · 81: 1949-01-03 · 82: 1951-01-03 · 83: 1953-01-03 · 84: 1955-01-05 · 85: 1957-01-03 · 86: 1959-01-07 ·
87: 1961-01-03 · 88: 1963-01-09 · 89: 1965-01-04 · 90: 1967-01-10 · 91: 1969-01-03 · 92: 1971-01-21 · 93: 1973-01-03 ·
94: 1975-01-14 · 95: 1977-01-04 · 96: 1979-01-15 · 97: 1981-01-05 · 98: 1983-01-03 · 99: 1985-01-03 · 100: 1987-01-06 ·
101: 1989-01-03 · 102: 1991-01-03 · 103: 1993-01-05 · 104: 1995-01-04 · 105: 1997-01-07 · 106: 1999-01-06 · 107: 2001-01-03 ·
108: 2003-01-07 · 109: 2005-01-04 · 110: 2007-01-04 · 111: 2009-01-06 · 112: 2011-01-05 · 113: 2013-01-03 · 114: 2015-01-06 ·
115: 2017-01-03 · 116: 2019-01-03 · 117: 2021-01-03 · 118: 2023-01-03 · 119: 2025-01-03.

Edge cases: the 73rd's terms start on the March 9 special session, not March 4; the 92nd (Jan 21) and 96th (Jan 15) are late.
A pinned-age definition ("whole years on the Congress's first day") would use these dates, and a table verified by a test
against the YAML, not the Jan 3 function.

## 5. Non-voting members

`terms.json` **includes** delegates and resident commissioners: states `PR` (67 rows), `DC` (30), `GU` (27), `VI` (27), `AS` (23),
`MP` (9), `PI` (41, Philippines), `DK` (16, Dakota Territory), `OL` (3). Pre-statehood Alaska and Hawaii delegates carry the
`AK` / `HI` codes, so a state-code filter alone would miscount them as voting in the 73rd–85th. The site rule is voting members only
(DATA_CONVENTIONS §3, "never scored"); the demographics derive would need an explicit non-voting set including AK/HI before their statehood.

## 6. Presidents

- `lib/economy-presidents.ts`: `administrations.json` (Clinton, 1993-01-20 onward) plus `BUSH_41`.
- `lib/troops-presidents.ts`: `HISTORICAL_ADMINISTRATIONS` Truman (1945-04-12) through Bush 41.
- **Neither covers 1933–1945.** Plan: add Franklin D. Roosevelt (`term_id` 1933-03-04, end 1945-04-12, Democratic; the third and fourth
  terms are the same tenure) to `HISTORICAL_ADMINISTRATIONS`. That is the single shared extension; no third terms table. First-day rule differences:
  the 79th (1945-01-03) starts under Roosevelt (Truman served most of it), and the 73rd (1933-03-09) under Roosevelt.

## 7. Tenure

Both YAMLs are 1789+: `terms.json` covers all 12,770 people back to the 1st Congress (8,614 first served before the 73rd). So
"Congresses served" can count back across the 1933 boundary without new data.

## Gate

The gate says to stop and report when "first-day rosters cannot be reconstructed without guessing". They cannot (§3): the source
records term ranges, not seat-occupancy dates, for most members before the 1990s, and the House over-count (up to 24 extra
members) is the mid-term-replacement problem the first-day definition was written to avoid. Birthdates (0.03% missing) and
the Senate alone are not the problem; the House is.

### Options for the person to choose from

1. **Add a real seat-occupancy source** (Bioguide / GovTrack service dates, which record actual swearing-in and departure dates
   per person) and join on `bioguide_id` to fix `start`/`end`. Keeps the settled "first-day roster" definition. Biggest build,
   best data. Then the pipeline change is `birthday` on `legislators.json` plus corrected `start`/`end` on `terms.json`.
2. **Redefine the roster** as everyone who held a seat at any time in the Congress (`terms.json` as it is today), with ages taken
   on the Congress's convening date. Mid-term replacements count, so "who served in the 76th" is ~455 House members, not 435,
   and the page says so. No new source; cheapest. Changes the settled definition and the seat counts the tests would gate on.
3. **Show Senate (clean from the 74th) and the House from the 99th (or 101st)** only, hiding years the source can't resolve. Honest
   but breaks the 1933 start the slider and term band assume.

Nothing else was changed. Scratch scripts were removed; no pipeline, schema, route or nav change was made.

## Decision (2026-10-07)

Option 2 was chosen: the roster is everyone who held a voting seat at any time in the Congress, with ages counted on the
convening day. The one pipeline change is `birthday` on `legislators.json` (plain fact; `birth_year` stays). `terms.json` is
unchanged and the convening dates live in `lib/demographics-entities.ts`, verified against the raw YAML by a test. Definitions and
the president rule: `docs/DEMOGRAPHICS_METHODOLOGY.md`.
