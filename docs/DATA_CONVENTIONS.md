# Data conventions

The rules every data feature in this project follows. Read this before adding a
source, a pipeline stage, or a page that joins data.

---

## 1. `bioguide_id` is the canonical join key

`bioguide_id` (the [Biographical Directory of the United States
Congress](https://bioguide.congress.gov/) identifier, e.g. `R000575`) is the one
identifier that ties every entity in this project together — legislators, terms,
disclosures, committee memberships, scores. **Full stop.**

- No feature introduces a second identifier convention. Not `govtrack`, not
  `icpsr`, not `thomas`, not a synthetic slug-as-key.
- Anything in `pipeline/output/` is keyed by `bioguide_id` and contains **no
  other person identifier**. Foreign identifiers are dropped at the `transform`
  stage, not carried through "just in case."
- If a record genuinely cannot be resolved to a `bioguide_id`, that is a
  pipeline error to surface (see §4), not a row to pass along with a null key.

### Voteview and `icpsr`

Voteview's native identifier is `icpsr` (an integer assigned by ICPSR/Voteview).
Its `HSall_members.csv` also carries a `bioguide_id` column, which today is
~99.9% populated (68 of ~51k member-rows are missing it, almost all Presidents).

Despite that, the **`icpsr` → `bioguide_id` mapping of record for this project is
the crosswalk built from `@unitedstates/congress-legislators`** — the `id:`
block on each legislator carries both `id.icpsr` and `id.bioguide`. At the
`transform` stage:

1. Build `icpsr → bioguide_id` from `legislators-current.yaml` **and**
   `legislators-historical.yaml` (Voteview spans 1789–present, so historical
   coverage is required).
2. Resolve every Voteview row through that map.
3. Reconcile against Voteview's own `bioguide_id` column; a disagreement is a
   pipeline error (§4).
4. Emit `bioguide_id` only.

`id.icpsr` is usually a single integer but is occasionally a list in the
historical file — normalize to "one or more `icpsr` per `bioguide_id`".

Non-legislator Voteview rows (`chamber == "President"`) are filtered out before
the crosswalk runs; this project is about members of Congress.

**As built (Session 2):** `id_crosswalk.json` is congress-legislators' mapping
(12,298 icpsr) **augmented** with ~332 pairs taken from Voteview's own
`icpsr`/`bioguide_id` columns, for members congress-legislators has but hasn't
recorded an `icpsr` for. Every augmented pair points at a `bioguide_id` that
does exist in congress-legislators. Each entry carries a `source` field
(`congress-legislators` | `voteview`). 3 Voteview member rows resolve to no
`bioguide_id` in either source and are allowlisted in
`pipeline/transform/scores.ts` (`KNOWN_UNRESOLVABLE`) with a reason; a *new*
unresolvable row is fatal.

---

## 2. Entity model

The source layer in `pipeline/output/` is **normalized**: one fact lives in one
place. Page-shaped data is denormalized by joining these entities **at build
time**, never stored pre-joined. `congress_number` (e.g. `119`) is the
canonical time axis, not calendar year. Each file is a JSON array, one row per
line; every row is validated against its `lib/entities.ts` schema before it is
written.

### Built (Session 2)

| File                  | Grain                                       | Key                                              | Notes |
| --------------------- | ------------------------------------------- | ------------------------------------------------ | ----- |
| `id_crosswalk.json`   | one row per `icpsr`                          | `icpsr`                                          | `icpsr → bioguide_id` + `source`. See §1. |
| `legislators.json`    | one row per person                           | `bioguide_id`                                    | Stable identity: `name.*`, `birth_year?`, `gender`. Nothing that varies by Congress. Source: congress-legislators. |
| `terms.json`          | one row per (legislator, Congress, chamber)  | `bioguide_id` + `congress_number` + `chamber`    | `state`, `district` (House; `null` for at-large/delegate/Senate), `party`, `caucus`, `party_affiliations?`. Source: congress-legislators term records, expanded per Congress (`pipeline/transform/congress.ts`). See §3a. |
| `ideology_scores.json`| one row per (legislator, Congress, chamber)  | `bioguide_id` + `congress_number` + `chamber`    | The four DW-NOMINATE coordinates (wide, nullable) + `n_votes` (roll-call votes cast that Congress, disambiguates who held a seat when a state has >2 senators) + `party_code` (Voteview's own party attribution for that member-Congress — colours historical third parties on the main-page charts, see `lib/party-palette.ts`). Source: Voteview. `chamber` is in the grain so a member who served both chambers in one Congress keeps both per-Congress (`nokken_poole`) scores. See §3. |

Term records don't carry a Congress number — they're date ranges — so one
Senate term record expands to ~3 `terms.json` rows. Terms of sitting members
that run past the latest Congress in the Voteview data are clamped to it.

### Built (Session 5 — committees)

| File                          | Grain                                    | Key                              | Notes |
| ----------------------------- | ---------------------------------------- | -------------------------------- | ----- |
| `committees.json`             | one row per top-level committee          | `committee_id`                   | `committee_id` (the THOMAS id — `HSJU`, `SSFI`, `JSEC`), `name`, derived `short_name`, `chamber` (`house`/`senate`/`joint`). **Current Congress only.** `committee_id` is a *committee* key, not a person key — §1's "no other identifier" rule is about person ids. |
| `committee_memberships.json`  | one row per (legislator, committee)      | `bioguide_id`                    | Inverted from the source (committee→members) to member-keyed, per §1. `committee_id`, `party` (`majority`/`minority`), `role` (`chair`/`ranking_member`/`member`, normalised from the source `title`), `rank`. No `congress_number` column — this file only ever describes the current Congress. |

A committee's **blended position** (mean `nokken_poole_dim1`/`dim2` over its
scored roster) and its **spread** (`max(dim1) − min(dim1)`) are **derived at
build time** in `lib/committee-data.ts`, never stored — page-shaped data is
joined, not pre-computed into `output/` (§2, above).

### Built (Session — subcommittees)

| File                             | Grain                                       | Key                                 | Notes |
| --------------------------------- | -------------------------------------------- | ------------------------------------ | ----- |
| `subcommittees.json`              | one row per subcommittee                    | `subcommittee_id`                    | `subcommittee_id` = parent `committee_id` + the subcommittee's own 2-digit THOMAS id (`HSAG15`, `SSAF13`), `parent_committee_id`, `name` (the raw name — no boilerplate to strip, unlike a top-level committee's), `chamber` (inherited from the parent). **Current Congress only.** Source: `committees-current.yaml`'s `subcommittees[]`, joined by `pipeline/transform/committees.ts`'s `buildSubcommittees`. |
| `subcommittee_memberships.json`   | one row per (legislator, subcommittee)       | `bioguide_id`                        | Same shape/inversion as `committee_memberships.json`, one grain down: `subcommittee_id`, `party`, `role`, `rank`. |

No subcommittee-level blended position is derived or stored: most
subcommittees are too small a roster for a mean `dim1` to be a meaningful
signal (deliberately out of scope, unlike the top-level committee blend
above).

### Built (financial disclosures)

| File                          | Grain                          | Key                          | Notes |
| ------------------------------ | ------------------------------ | ----------------------------- | ----- |
| `financial_disclosures.json`  | one row per (legislator, reporting year) | `bioguide_id` + `year` | House Clerk (`house_clerk`) and Senate eFD (`senate_efd`) annual disclosures, produced by the Python sidecar in `pipeline/financial_disclosures/`. Schema: `financialDisclosure` in `lib/entities.ts` (validated at the app's read boundary) and, on the Python side, `pipeline/financial_disclosures/schema.py`. `year` is the year the report **covers**, not the filing year. `assets_total`/`liabilities_total`/`net_worth` are sums of EIGA band midpoints; `asset_band_counts`/`liability_band_counts` are counts of band *labels*, not line items — no item names or per-item values here (that's `line-items/<year>.json`, below). See `docs/NET_WORTH_METHODOLOGY.md` for the full range/midpoint policy `lib/wealth-bands.ts` and `lib/wealth-data.ts` build on top of this file. |
| `line-items/<year>.json`      | one row per (legislator, reporting year) that reconciled at item grain | `bioguide_id` + `year` | Sibling to `financial_disclosures.json`, one level down in grain: each row holds `items[]`, the verbatim per-asset/per-liability lines (`kind`, `description`, `band_label`, `lo`/`hi`, `owner`, `form_type`) behind that filing's band counts. Produced by `pipeline/financial_disclosures/build_line_items.py`, sharded by year (0.9–5.7 MB per file as of the 2026-09-29 full run — 2025, the newest and largest year, runs slightly over the plan's informal 5MB/file target; not re-sharded further since a single year is still a reasonable one-time fetch). Schema: `disclosureLineItem` in `lib/entities.ts` and, on the Python side, `pipeline/financial_disclosures/line_item_schema.py`. **Reconciliation gate**: a filing is only emitted here if its freshly re-extracted item band multiset exactly reproduces that same filing's own `asset_band_counts`/`liability_band_counts` in `financial_disclosures.json` — a filing that doesn't reconcile has no row here at all (excluded, not partially emitted). Only high-confidence, non-scanned, `digital_text` filings are considered (scanned/paper filings are out of scope). Extraction is column-position-based for House PDFs (`pipeline/financial_disclosures/house_line_items.py`) and structured-table-based for Senate HTML (`pipeline/financial_disclosures/senate_line_items.py`); see the run's own `pipeline/output/line-items/_report.json` for emitted/excluded counts. Known residual risk (documented in `house_line_items.py`'s module docstring): the reconciliation gate confirms band *totals* match but can't guarantee an individual description is paired with its correct value when a page has multiple same-band items back-to-back. |

Page-shaped net worth data (the current-member roster joined to usable
filing years, cohort/rate/gap derivations, the compact client payload) is
derived at build time in `lib/wealth-derive.ts`/`lib/wealth-data.ts`, never
stored in `pipeline/output/` (§2, above).

### Built (Wikipedia bios)

| File                          | Grain                          | Key                          | Notes |
| ------------------------------ | ------------------------------ | ----------------------------- | ----- |
| `wikipedia_summaries.json`    | one row per **current** member with a usable article | `bioguide_id` | A **source-layer** file, like `member-photos.json`: a fetched-and-trimmed copy of external text, not a derived join. Built by `pipeline/fetch/wikipedia.ts` (network; run by the weekly `wikipedia-freshness` Action, not by CI). Fields: `bioguide_id`, `title`, `extract`, `url`, `revision`, `fetched_at`, `needs_review`. **The `extract` is trimmed, not the full lead**: first two sentences, ≤ ~320 chars, cut on a sentence boundary by the one tested function `trimExtract` (`pipeline/wikipedia/trim.ts`); never rewritten. Members with no `id.wikipedia`, a 404, or a non-`standard` page have **no row** — no placeholder; the profile header omits the bio. `needs_review` flags an extract < 80 chars or one never mentioning congress/senate/representative (likely wrong-person match); flagged rows are still emitted and are for the reviewer of the refresh PR. Zod schema `wikipediaSummary` in `pipeline/validate/schemas.ts`, checked by `pnpm validate`. `revision` and `fetched_at` are carried over from the committed row while the shown text (title, extract, url) is unchanged, so edits elsewhere in an article yield no diff; `revision` therefore records the revision the current text was fetched at. Read by `lib/wikipedia-bio.ts`. Attribution: `docs/CREDITS.md`. |

### Planned — schema in `lib/types.ts`, no data source integrated yet

| Entity                  | Grain                                          | Notes |
| ----------------------- | ---------------------------------------------- | ----- |
| **IssueScore**          | one row per legislator × Congress × metric     | *Melted* format reserved for future interest-group scores — **not** where DW-NOMINATE lives (that's `ideology_scores.json`, wide). |

---

## 3. DW-NOMINATE: two score families, do not conflate them

Voteview's `HSall_members.csv` carries **two** pairs of ideal-point coordinates.
They answer different questions and must never be averaged, swapped, or treated
as interchangeable.

| Columns                                | Varies?                                            | Use for |
| -------------------------------------- | ------------------------------------------------- | ------- |
| `nominate_dim1`, `nominate_dim2`       | **Static.** One value per legislator, repeated unchanged across every Congress they served. | "Where does this person sit, overall / across their whole career." A single dot per member. |
| `nokken_poole_dim1`, `nokken_poole_dim2` | **Per-Congress.** Recomputed each Congress from that Congress's votes. | Ideological drift over time — anything animated, any trend line, any "how did they move." |

- `dim1` is the primary economic/left–right axis; `dim2` is the secondary
  (historically race/region/social) axis.
- The static `nominate_*` score is the DW-NOMINATE constant-space estimate.
  `nokken_poole_*` is the per-period ("Nokken–Poole") estimate.
- `nokken_poole_*` is **empty for `President` rows** and can be sparse for
  members with very few votes in a Congress. Missing values are `null` in
  `ideology_scores.json` — never `0` (which is the chamber center, a meaningful
  value).
- Both families are stored **wide** in `ideology_scores.json` (columns
  `nominate_dim1/2`, `nokken_poole_dim1/2`), one row per (legislator, Congress,
  chamber). The static `nominate_*` value repeats across a member's rows — that
  is deliberate: the join key for combining scores with terms is
  `congress_number`, and repeating keeps "one fact, one place" honest.

---

## 3a. `party` vs `caucus`

congress-legislators distinguishes a member's **registration** (`party`, e.g.
`Independent`) from the **conference they organize with** (`caucus`, e.g.
`Democrat`) — Sanders, King, post-2022 Sinema. Both are preserved separately in
`terms.json`:

- `caucus` is what group/color features should use by default — it reflects how
  the chamber actually functions (committee ratios, leadership).
- `party` stays available for any feature that shows `Independent` as its own
  category rather than folding it into D/R.
- When the source doesn't distinguish, `caucus` defaults to `party`.
- `party` is `null` only for a few pre-1820 terms with no recorded party.

**Mid-Congress switches.** When a member changed affiliation during a Congress
(Van Drew, Jeffords, Thurmond's 1964 switch mid-Senate-term), that row's
top-level `party`/`caucus` is the affiliation **in effect at the start of that
Congress**, and the full sequence — clipped to that Congress — is carried in
`party_affiliations: [{start, end, party, caucus?}]`. A consumer wanting the
end-of-Congress party reads `party_affiliations.at(-1)`. Note this differs from
congress-legislators' own convention, where a term's top-level `party` is the
*ending* affiliation.

**Terms without a score.** ~1.6% of `terms.json` rows have no matching
`ideology_scores.json` row: pre-1901 (Voteview's uneven early coverage),
non-voting delegates (never scored — DC, PR, territories, pre-statehood
AK/HI/NM/…), and members who served too little of a Congress to be scored. The
`_report.json` breaks this down each run.

---

## 4. Fail loudly, never silently

A malformed or unresolvable row must stop the pipeline with a specific error
naming the file, the row, and what was wrong — **not** produce a null, a `0`, a
dropped record, or a broken page three stages later.

- `validate` schema-checks raw data before any transform reads it.
- `transform` treats an unresolved `bioguide_id`, an `icpsr` collision, or a
  reconciliation mismatch as fatal.
- The app may assume `pipeline/output/` is clean; it does no defensive
  re-validation of shape at request time.

---

## 5. Raw data is committed

`pipeline/raw/` and `pipeline/output/` are checked into git. Builds are
reproducible and have no build-time network dependency. Source-data updates are
reviewed as ordinary `git diff`s, and — for Voteview — proposed automatically by
`.github/workflows/voteview-freshness.yml` as a pull request that a human
merges. See `pipeline/README.md`.

---

## 6. Supreme Court track

A **separate data track** from Congress: justices are not in `legislators.json`,
`terms.json` or `ideology_scores.json`, and nothing here joins to `bioguide_id`.
Output lives in `pipeline/output/court/`; Zod schemas are in
`lib/court-entities.ts`; the transform is `pipeline/transform/court.ts`
(pure logic) + `court-run.ts` (I/O), run as part of `pnpm transform`.

| File | Grain | Key | Notes |
| ---- | ----- | --- | ----- |
| `justices.json` | one row per **person** | `justice_id` | Stable identity only: `name.{first,middle?,last,suffix?,full}`, `birth_year`, `death_year` (null = living), `appointing_president` + `appointing_party`, `nomination_date`, `confirmation_date`, `service_start`, `service_end` (null = serving). Source: FJC. Appointment fields describe the appointment **in effect at the justice's first scored term** (Stone → Coolidge's 1925 seat, Hughes → Hoover's 1930 Chief seat); `service_start`/`service_end` span all appointments (Hughes: 1910, with a 1916–1930 gap). `chief_justice_appointment` (`president`, `party`, `nomination_date`, `confirmation_date`, `start_date`; null if never Chief) is set for every justice who served as Chief Justice — Hughes, Stone, Vinson, Warren, Burger, Rehnquist, Roberts. For Stone (FDR) and Rehnquist (Reagan) it is the later elevation by a different president; for the others it repeats `appointing_*`. Which term a justice was Chief in is derivable from `start_date` and the next Chief's; a per-term role is deliberately not stored. |
| `mq_scores.json` | (justice × term) | `justice_id` + `term` | `mq_score` (`post_mn`, the site's recommended estimate), `mq_sd`, `mq_median`, `mq_lo95`, `mq_hi95`. The uncertainty fields are core. |
| `court_terms.json` | (term[, segment]) | `term` + `segment` | `median_score` (`med`), `median_sd`, `min_score`, `max_score`, `median_justice_id` + `median_justice_probability`. `segment` is `"a"`/`"b"` for the four terms MQ publishes as two records (1937, 1938, 1956, 2005) and `null` otherwise. Never deduped by `term` alone. |
| `court_median_probabilities.json` | (term[, segment] × justice) | `term` + `segment` + `justice_id` | Long form of `court.csv`'s one-column-per-justice probabilities that each justice is the median. Only justices with a probability in that record are present. |
| `_report.json` | run summary | — | Source hashes + release label, counts, term range, justices per term, explained anomalies, the crosswalk match list. No timestamps (deterministic). |

**App-side shaping.** The Court pages read these four files through
`lib/justice-data.ts`, which ships a compact client payload (`lib/court-types.ts`):
per-justice `s`/`lo`/`hi` arrays aligned to the justice's first scored term
(`t0`..`t1`) rather than per-row records. This is an in-memory convenience, not a
new on-disk codec. Derivation rules (split-term median, fixed domain, turnover,
presidents) are in `docs/SCOTUS_DATA_METHODOLOGY.md`.

**`justice_id` is the SCDB numeric `justice` identifier** (e.g. 108 = Thomas,
111 = John G. Roberts). This is a deliberate exception to §1's "no second
person-identifier convention": justices have no `bioguide_id`. It is one id per
person — Stone and Rehnquist keep a single id across their Associate → Chief
service (verified in the data; a person under two ids, or two people under one,
is a build error). FJC's `nid` is a foreign id: it appears only in the
crosswalk and, since the justice profile pages, as `justices.json` `fjc_nid` (the bio-source key; `justice_id` stays the page/route key — a deliberate departure from "key by FJC id", because SCDB id is what every other court file already joins on).

**Crosswalk.** `pipeline/transform/court-crosswalk.json` (committed, hand-reviewed)
maps each MQ justice to an FJC record: `justice_id`, MQ name code, last name,
`fjc_nid`. On every run the transform re-derives each match from **last name
plus service-window overlap with the justice's MQ terms** (never last name
alone) and fails if an MQ justice has no entry, matches no FJC justice, matches
more than one, or disagrees with the committed `fjc_nid`. Last-name collisions
in the MQ era that the window resolves: Jackson (Robert H. / Ketanji Brown),
Roberts (Owen J. / John G.), Harlan (John Marshall I, 1877–1911 / II, 1955–71),
White (Byron / Edward Douglass), Marshall (Thurgood / John). FJC also lists the
D.C. "Supreme Court" bench; rows are filtered to
`Supreme Court of the United States` exactly.

**Justice profile additions.** `justices.json` also carries `fjc_nid`,
`senate_vote` (`{ayes, nays}` for the appointment in effect at the first scored
term; `null` = voice vote — every null is an FJC "Voice" row) and
`appointment_start` (that appointment's first day). The FJC `Ayes/Nays` cell is
parsed strictly only for appointments that reach this file (18th-century rows
hold junk like `10//14`). Service end is the FJC senior-status date, else the
termination date (FJC's termination can be a death date years after retirement,
e.g. Stevens 2019 vs. 2010) and is cross-checked at build time to be within a
year of the last scored term + 1.

`court/justice_bios.json` (**written by `pnpm fetch:justice-bios`, not the
transform**, like `wikipedia_summaries.json`): one row per justice with a safely
matched Wikipedia article — `justice_id`, `title`, trimmed `extract` (up to three
sentences), `url`, `revision`, `fetched_at`, `needs_review`, and `photo`
(`path` under `public/images/justices/`, `source_url`, `license`) or `null`.
Matching is defensive: a candidate article is accepted only if the page is a
standard article whose lead names the Supreme Court / a justice AND its Wikidata
birth (and death) year equals FJC's (the REST lead strips the "(born …)"
parenthetical, so Wikidata is the source for years). No acceptable candidate
fails the run; fix with `TITLE_OVERRIDES` in `pipeline/fetch/justice-bios.ts`
(Harlan II and Vinson/Byrnes/Rehnquist needed them). Photos only when the file
page's license metadata says public domain / CC0 (Kagan's is CC BY-SA, so none;
48 of 49 have one). `pnpm validate` checks the schema, id resolution and that
every photo exists.

**`term`** is the October Term start year as an integer (2024 = OT2024, Oct 2024
– Jun 2025), never a Congress number.

**Validation (fails the build):** finite numbers; `mq_sd > 0`;
`mq_lo95 ≤ mq_score ≤ mq_hi95`; `(justice_id, term)` unique; terms contiguous
1937–latest; 9 justices per term except the documented turnover terms in
`EXPLAINED_TERM_COUNTS` (1937, 1938, 1956, 1958, 1961, 1975, 2005 — a listed
count that changes, or an unlisted deviation, fails); referential integrity both
ways; `min ≤ median ≤ max`; median-justice probabilities sum to 1; and a **sign
tripwire** (Thomas > Sotomayor and Scalia > Ginsburg in every shared term) so a
flipped convention can't silently mislabel the site. Convention confirmed
empirically: **negative = liberal, positive = conservative**.

**Caveats any UI must respect**
- **One dimension only** — there is no second axis.
- Scores are **estimates with posterior uncertainty**; show `mq_sd`/interval
  wherever a score is shown.
- **The MQ scale is not comparable to DW-NOMINATE.** Never plot MQ and Congress
  scores on one axis or compare them numerically.
- The latest release **lags the current term** (the 2024 release ends at OT2024).
- Scores exist only for justices serving from the 1937 term onward.
- Within a term, scores are per-term estimates; turnover terms have more than
  nine justices with scores.

**Raw inputs and refresh.** `pipeline/raw/mq/<year>/` holds `justices.csv`,
`court.csv`, optional `README.txt` and `SOURCE.json` (release label, how it was
retrieved, SHA-256 of each file). The transform picks the **latest** year
folder and refuses to run if a file no longer matches its recorded hash.
`mqscores.wustl.edu` serves a Cloudflare bot challenge to scripts, so we do not
scrape it: **the manual snapshot is the primary path** — download the CSVs in a
browser, place them in `pipeline/raw/mq/<year>/`, run
`pnpm fetch:mq -- --adopt <year>` (records `retrieved_via: manual` + local
hashes), then `pnpm transform`. `pnpm fetch:mq` / `--probe` try a plain
request and stop with instructions on a challenge; the monthly
`mq-freshness.yml` Action does the same and ends with a warning annotation, not
a failure. FJC bios: `pnpm fetch:fjc`.
