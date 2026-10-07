# Demographics page ("Who Serves in Congress?") — methodology

Page: `/congress/demographics`. Code: `lib/demographics-{entities,types,derive,data,chart}.ts`, `components/demographics/`. Tests:
`lib/demographics-derive.test.ts` (over the real committed files). Pre-flight findings and the decision behind the roster
definition: `docs/DEMOGRAPHICS_PREFLIGHT.md`.

## Sources

- Member biographies (`birthday`, `gender`): `pipeline/output/legislators.json` (from `@unitedstates/congress-legislators`;
  the full `birthday` was added to the transform for this page).
- Who held a seat in which Congress, and the caucus: `pipeline/output/terms.json` (one row per legislator x Congress x chamber).
- Presidents: `administrations.json` (1993-) plus `HISTORICAL_ADMINISTRATIONS` in `lib/troops-presidents.ts`, which now starts
  with Franklin D. Roosevelt (1933-03-04). One shared list, no new terms table.
- Nothing pre-joined is stored; `getDemographicsPayload()` joins at build time (47 Congresses x 3 chamber views, a few tens of KB inline).

## Definitions

- **Roster.** Every voting member who held a seat at any time in the Congress, in the chosen chamber. A member who was replaced
  mid-term and the replacement both count, so a Congress has more members than seats (House 437-458 against 435, Senate 100-117
  against 100; "Both" 539-564). This replaces the first-day roster the page was first specified with: the source's term dates
  are nominal (a whole Congress for almost everyone before the 1990s, including people who joined mid-term), so "seated on
  the first day" cannot be rebuilt without guessing (see the pre-flight). "Both" counts each person once, so it can be a few
  below Senate + House (a person who held a seat in each chamber in one Congress). The test checks that difference exactly.
- **Voting members only.** Delegates and resident commissioners (`DC PR VI GU AS MP PI DK OL`) are left out. Alaska and Hawaii
  delegates before statehood are left out too (House rows for those states through the 85th Congress, plus Hawaii's delegate
  Burns, `B001127`, in the 86th).
- **Age.** Whole years on the day the Congress convened, from the full birthdate (a birthday on that day counts). It is counted
  on the convening day for every member of the roster, including one who joined later. Members with no birthdate are left out
  of the age figures and counted in `ageMissing`: 4 member-Congress rows in the 73rd-119th (three people: Rohrbough, Burkhalter,
  Hutchinson). Median and average are both precomputed (a median cannot be recovered from aggregates); one decimal, shown without a trailing ".0" (58, 50.5, 52.1).
- **Convening day.** Not Jan 3: the source dates a term from the day the member was sworn in, which is the day the Congress
  convened (the 92nd convened Jan 21, 1971; the 96th Jan 15, 1979; the 73rd's terms start at the March 9, 1933 special session).
  `CONVENING` in `lib/demographics-entities.ts` is the most common House term start in January-March of each Congress's first
  year; the test re-derives it from the raw YAML so the table cannot drift. `pipeline/transform/congress.ts` keeps its Jan 3 /
  March 4 mapping for expanding terms; this page does not use it.
- **Caucus, not party.** `terms.json` `caucus`: Democrats and Republicans (compound names such as "Democrat-Liberal" follow their
  party), everything else is "Other". Independents who caucus with a party are in that party. Age lines are Democrats and
  Republicans only; the women chart's third series is "Other women".
- **One caucus override.** Jo Ann Emerson (`E000172`) is an Independent for the whole 105th in the source but was a Republican
  apart from one year; she is counted as a Republican (`CAUCUS_OVERRIDE`), so no Congress has an "Other" woman.
- **Gender.** The source is binary (M/F); every row in range has a value.
- **Congresses served.** Distinct Congresses up to and including this one with any `terms.json` row for the person, either
  chamber, gaps included, delegate service included, counted back to the 1st Congress (so a member first elected in the 63rd is
  in the top band in the 73rd). Bands, labeled in years at two years a Congress: up to 2 years (1 Congress), 3-10 (2-5), 11-20 (6-10), over 20 (11 or more). The stat strip's average time is the mean count x 2.
- **President for a Congress.** The president in office on the Congress's first (convening) day. It differs from "who served
  most of the Congress" in 14 of 47 Congresses, every one that convenes before the January 20 inauguration of a new president or
  a mid-term succession: 79th (Roosevelt; Truman from April 1945), 83rd (Truman; Eisenhower), 87th (Eisenhower; Kennedy), 88th
  (Kennedy; Johnson from Nov 1963), 91st (Johnson; Nixon), 95th (Ford; Carter), 97th (Carter; Reagan), 101st (Reagan; G.H.W.
  Bush), 103rd (G.H.W. Bush; Clinton), 107th (Clinton; G.W. Bush), 111th (G.W. Bush; Obama), 115th (Obama; Trump), 117th
  (Trump; Biden), 119th (Biden; Trump). Trump's second term therefore has no Congress under the rule, so it has no segment.
- **Years-shown window.** The slider runs 1933-2027 (the 119th ends Jan 3, 2027). A Congress is drawn when the year it convened
  is inside the window. A president's slider segment covers the years of the Congresses they opened (first convening year to
  that Congress's second year), so terms never overlap on the slider.

## Charts

1. Age by caucus: two lines (Democrats, Republicans), Median / Average. No peak/low (two lines); one example value per line
   three quarters across the window.
2. Women: stacked by caucus (Democratic, Republican, Other), Share of members / Number of members. In share mode the y-axis
   fits the tallest share (it stops near 30%, not 100%). Peak and low columns are labeled. Picking a legend entry draws that
   series alone as a count; switching back to Share clears the pick.
3. Years in Congress (Congresses served x 2): share of members by band, every bar 100% (no peak/low, no legend isolate).

All three share one pinned Congress (a dashed playhead) and one years window, and sit on the same per-Congress slots as the
presidential-term strip under each axis.

## Sanity gates (tests)

- Seat-holders per Congress are never below the real seat count (Senate 96 through the 85th, 98 in the 86th, 100 after; House
  435) and stay under a ceiling (Senate 120, House 470).
- Tenure bands sum to the roster in every view (each tenure bar is 100%); Both = Senate + House - people in both chambers.
- Fewer than 0.5% of member-Congress rows lack a birthdate; ages sit between 40 and 70.
- The 73rd, 79th, 115th and 119th Congresses resolve to the presidents above; convening dates match the source.
