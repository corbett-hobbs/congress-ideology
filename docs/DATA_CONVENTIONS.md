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
| `legislators.json`    | one row per person                           | `bioguide_id`                                    | Stable identity: `name.*`, `birth_year?`, `birthday?` (full `YYYY-MM-DD` where the source has one; added for the demographics page), `gender`. Nothing that varies by Congress. Source: congress-legislators. |
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

---

## 7. Executive orders track

A third data track, separate from Congress (§1–§3) and the Court (§6): executive
orders (EOs) 1994-present, shown as a per-year chart stacked by topic. Nothing
here joins to `bioguide_id` entities.

**Key.** `eo_number` — the Federal Register's `executive_order_number` — is a
new natural key and **is not a `bioguide_id`**: it names a document, not a
person. Presidents get **no person identifier** at all, only a `term_id` (an
inauguration date) into `administrations.json`; the §1 "one person-id
convention" rule is untouched. `amends` / `revokes` hold `eo_number`s and may
point at pre-1994 orders outside the data.

| File | Grain | Key | Notes |
| --- | --- | --- | --- |
| `pipeline/raw/federal-register/executive_orders.json` | one row per API document | — | Fetched directly from `federalregister.gov/api/v1` by `pnpm fetch:executive-orders`. One row per line, sorted by EO number. |
| `pipeline/output/executive_orders.json` | one row per EO | `eo_number` | `document_number`, `title`, `abstract` (nullable — the API has none for almost every order), `signing_date`, `publication_date`, `term_id`, `agencies[]`, `amends[]`, `revokes[]`, `topic`, `topic_method`, `needs_review`. Schema `executiveOrder` in `lib/executive-orders-entities.ts`. |
| `pipeline/output/administrations.json` | one row per uninterrupted tenure | `term_id` | `term_id` = inauguration date; `president`, `president_slug` (the Federal Register's `president.identifier`, cross-checked against every EO), `party`, `start`, `end` (`null` while in office). Hand-maintained in `pipeline/transform/administrations.ts`. Trump's two non-consecutive stints are two rows; Clinton, Bush and Obama's consecutive terms are one tenure each. |
| `pipeline/classification/eo_topics.json` | one row per EO | `eo_number` | The **committed classification cache** (below). |
| `pipeline/output/executive_orders_report.json` | run summary | — | counts, dropped documents, anchors, topic methods. |

**Real Federal Register field names** (verified against the live API):
`executive_order_number`, `document_number`, `title`, `abstract`,
`signing_date`, `publication_date`, `president` (`{identifier, name}`),
`agencies[]` (`name`, `raw_name`), `executive_order_notes` (identical to
`disposition_notes`), `html_url`, `pdf_url`, `citation`. **`executive_order_number`,
`executive_order_notes` and `president` are not in the API's default field set** —
they come back only when requested with `fields[]`. There is **no structured
amends/revokes field**: the relationships live in the free-text notes
("Amends: EO 13212, …\nRevokes: EO …\nSee: …"), which `parseNotes` reads (forward
labels only; "Revoked by"/"Amended by" belong to the other order).

**Year = signing date, never publication date.** A late-December signing never
lands in January. `term_id` is the tenure in force on the signing date
(`start <= date < next start`; Jan 20 → the incoming president). In a transition
year the chart aggregates carry both presidents (`EoYear.byTerm`).

**Documents the API files as EOs that are not.** `normalizeRaw` drops, and the
report lists: documents with no EO number (a 1995 "Continuation of Emergency
With Respect to UNITA" notice mis-filed as an EO) and the `C1-`/`R1-`
correction/republication documents that duplicate an original's number
(EOs 13526, 13719, 14388).

**Numbering is by publication, not signing.** EOs 13300, 13517 and 13947 are
signed a few days *before* the order numbered just ahead of them. These three
are allowlisted by number (`KNOWN_OUT_OF_ORDER`) with a reason; a new inversion
fails the build.

### Topics: one primary topic per EO

One topic per order so stacks sum to the true total. Secondary tags are not
stored. Fixed order (the stack order — colour follows topic, not rank):
`government_operations`, `economy_labor`, `trade`, `energy_environment`,
`health_education`, `immigration_justice`, `foreign_policy`, `national_security`,
`civil_rights_civic`. The starting 13-category list (seeded from Ballotpedia's published
categories as a *reference only* — no Ballotpedia data, tags or text is used)
was **merged to 9** for two reasons: *administrative state* and *government
operations* are the same set in practice (federal workforce, agency
organisation, advisory committees, closings, succession orders), and 13 categories
cannot be drawn distinguishably (palette note below). Merges: administrative
state + government operations; economy and labor + technology (AI, cyber-economy
and R&D orders are few, and the cyber/critical-infrastructure orders go to
national security by purpose); health + education; immigration + policing and
criminal justice. Trade and tariffs stays separate (the 2025 tariff orders are a
distinct, large group). **There is no "other" topic**: the first pass had one (80
orders), and nearly all of it was three coherent groups, so it was dissolved —
faith-based / community / volunteer-office orders and the orders about law firms
and federal media funding went to `government_operations`; civil rights and
equity, tribal and identity orders, culture/commemoration/sports task forces and
the like became `civil_rights_civic`. Every order now has a topic, but the
residue (law-firm orders, English as official language) is a forced fit.
"First day" and "revokes a prior order" are not topics;
revocation is derived from `revokes`.

**Classification is a committed artifact, never computed at build time.**
`pipeline/classification/eo_topics.json` is keyed by `eo_number` with
`topic_method`: `parent-inherit` | `model` | `manual`. `pnpm transform`, `pnpm
validate` and CI only *read* it; a new EO with no cached topic **fails loudly**
(listing the missing numbers) and is never defaulted to "other". Maintenance is
`pnpm classify:eos` (`pipeline/classify/executive-orders.ts`): it lets
amending/revoking orders inherit a parent's topic, then reports the orders still
needing one; `-- --labels FILE` records labels for those (`model`).
The weekly freshness workflow does that last step unattended: `pnpm classify:eos:auto`
(`pipeline/classify/executive-orders-auto.ts`) sends each remaining order's title,
agencies and notes to the Claude API (needs the `ANTHROPIC_API_KEY` repo secret) and
records the answer as `model`; answers below "high" confidence, or on a pointer-only
title, are stored `needs_review`. With no key, an API error or an answer outside the
nine topics the order stays uncached and the transform still fails loudly.
- *Inheritance* applies only when the order's **title is just a pointer** to
  another EO ("Amendment to Executive Order 13212", or the bare "Executive Order
  N of <date>"), using the parent from the notes (or the number in the title).
  A substantive order that merely revokes an old one ("Classified National
  Security Information") is classified on its own title.
- If the parent is **outside the data** (pre-1994), the order is classified from
  its own text and `needs_review` is set. Parents that disagree also set it.
- `model` rows were assigned by a language model (Claude) reading each title,
  agencies and, for pointer orders, the parent — from titles only; the API has no
  abstract for nearly every order. **Only a 100-row sample has been validated by a person (see below).**
  `docs/eo-topic-audit.csv` is a seeded random sample of 100 for human review
  (columns for the reviewer's verdict are blank); regenerate with `pnpm
  classify:audit` (refuses to overwrite a reviewed file without `--force`).
  The 100-row sample has been reviewed by a person (project owner): every row
  marked `agree`, no disagreements — except the few rows that were "Other" at review time, which were reassigned afterwards and are back to unreviewed. That is a spot check of 100 of ~1,540, not a
  full audit, so topic counts remain classifier-assisted.

### Validation (`pnpm validate`, `pnpm transform`)

Zod at the pipeline boundary (`lib/executive-orders-entities.ts`) plus
`validateExecutiveOrders`: `eo_number` unique and ascending, monotonic with
`signing_date` (three allowlisted exceptions), every `topic` in the enum, no null
topics, ISO dates, `term_id` resolves, and the Federal Register's own
`president` agrees with `administrations.ts` for every order. **Count anchors**
(each checked against the Federal Register; failures fail the build, fix the
anchor with a note, never loosen the check): Biden signed **162** EOs
(**13985–14146**); Trump signed **225** in 2025 (14147–14371); the 2025 total
across both presidents is **238** (Biden's 13 in January 2025, 14134–14146, plus
Trump's 225). *The session brief said "2025 totals 225 across both presidents";
that is Trump alone, and the anchor was corrected rather than loosened.*

### Topic colours: a palette that cannot be distinct by colour alone

Nine topics cannot pass the project's CVD gate (`validate_palette.js`) as colours alone, but
patterns (hatch, dots) read as noise on phones, so each topic is **one solid colour**:
`--topic-<topic>` tokens in `app/globals.css`, referenced by `topicFill` in
`lib/executive-orders-types.ts`. The tooltip, legend and list chips carry the topic name, so
colour is never the only cue. Colours avoid the party hues (`--dem`/`--rep`). They are **not** checked against `--oth` (the "other party" grey, never on this
page; no muted palette clears the light-surface contrast and ΔE ≥ 0.10 from dem,
rep *and* oth together). The topic tokens are no longer in the validator:
nine solid hues are not gated.

---

## 8. Economic indicators track

A fourth data track, separate from Congress (§1–§3), the Court (§6) and executive
orders (§7): economic indicators from FRED, shown as *context* beside the other
views. Methodology, series list and caveats: `docs/INDICATORS_METHODOLOGY.md`.
Schemas, the series catalog and the display-window constant:
`lib/indicator-entities.ts`.

**Time-axis join convention** — the sanctioned alternative to `bioguide_id` for
non-person data. Indicator rows are time series keyed by `(series_id, date)` and
carry **no person identifier at all**. They join to the rest of the site through
dates, at build time, never stored pre-joined:

- **date → Congress number.** Congress *n* begins January 3 of 1789 + 2(*n* − 1),
  e.g. 1991-01-03 → 102. `congressForDate` in `lib/indicator-derive.ts`. **This
  holds only from the 74th Congress (1935-01-03)**; Congresses before the 20th
  Amendment began March 4, so the helper throws for earlier dates rather than
  mislabel them. (`congressStartYear` in `lib/congress-types.ts` is the older
  year-only helper and has the same pre-1935 limit.)
- **date → president.** Through the existing identifier from §7: `term_id` (the
  inauguration date) into `administrations.json`, `start <= date <= end`.
  `termIdForDate`. No second president-id convention.
- **Fiscal years** (an annual series dated by the year the fiscal year *ends*):
  mapped to the Congress in session at that fiscal year's end, September 30 —
  FY2023 → 2023-09-30 → 118th. **A convention, not a fact**; flagged for human
  review. `congressForFiscalYear`.

| File | Grain | Key | Notes |
| --- | --- | --- | --- |
| `pipeline/raw/fred/<SERIES_ID>.json` | one snapshot per series | — | FRED's own values as strings (`"."` = missing), full history, `fetched_at`. `pnpm fetch:fred`. |
| `pipeline/output/indicator_series.json` | one row per series | `series_id` | `title`, `units`, `frequency`, `seasonal_adjustment`, `source_agency`, `first_observation`, `last_observation`, `observation_count`, `attribution`, `suggested_rollup` (`level`/`flow`/`end_of_period`, metadata only), `caveats`, `fetched_at`. |
| `pipeline/output/indicator_observations.json` | one row per (series, date) | `series_id` + `date` | `value` exactly as FRED reports it. Missing (`.`) rows are skipped — never 0/NaN. **Raw levels only; no derived values** (jobs added, inflation live in `lib/indicator-derive.ts`). |
| `pipeline/output/indicators_report.json` | run summary | — | Counts, last observation per series, the skipped-missing dates. Deterministic. |

**Window.** Each series' full history is ingested. `INDICATORS_DISPLAY_START`
(1991-01-21) is applied in one place, `lib/indicator-data.ts`. It is not the 102nd
Congress's Jan 3 start because FRED has no gas price for 1990-12-10..1991-01-14.
**Revisions.** Latest revised values as of `fetched_at`; ALFRED vintages are not
used. **Signs** are FRED's (deficit negative).

**Validation (fails the build, `pnpm validate` / `pnpm transform`):** Zod on both
outputs and the raw snapshots, FRED's frequency string unchanged from the catalog,
`(series_id, date)` unique, finite values, and a **coverage assertion**: every
series covers the window from `INDICATORS_DISPLAY_START` to its last observation
with no gap larger than twice its nominal frequency (an observation dated just
before the start may cover it — an annual value dated Jan 1). Tail lag is allowed
and reported (annual series trail by most of a year). No allowlist: if a gap
appears, fix the cause or change the window deliberately.

---

## 9. Immigration enforcement track

A fifth data track: ICE removals by fiscal year, shown later *by presidential
administration*. Methodology: `docs/IMMIGRATION_ENFORCEMENT_METHODOLOGY.md`;
schemas and the curated catalog types: `lib/enforcement-entities.ts`.

**Key.** `(period, metric, scope)` — `period` = fiscal year (the calendar year it
ends in), `metric = removals`, `scope = ice` (required, no default). **No
`bioguide_id` and no member-level key.** One fact, one place: the source layer is
the curated catalog; each output row is derived from it.

**Join to presidents** is by date through the existing §7 identifier: the row's
`administration_term_id` (a `term_id` into `administrations.json`) is the
administration in office on the fiscal year's last day (Sept 30). `blended` and
`administration_days` mark years where the administration changed. There is no
second presidential-terms table.

| File | Grain | Key | Notes |
| --- | --- | --- | --- |
| `pipeline/raw/ice/*` | one snapshot per ICE/DHS document + `<name>.txt` extract | `id` in the catalog | `pnpm fetch:ice`. Transform reads only the `.txt`. |
| `pipeline/reference/ice-removals-catalog.json` | sources, one entry per fiscal year (value + verbatim evidence + corroboration), breakdowns, notes | `fy` | Curated by hand from the snapshots; every value is verified against its quote at transform time. |
| `pipeline/output/enforcement_series.json` | one row per `(period, metric, scope)` | as above | `value`, `source`, `source_url`, `as_of`, `status` (`final`/`preliminary`), `note_ids`, attribution fields. Missing years are absent — never 0/NaN/interpolated. |
| `pipeline/output/enforcement_notes.json` | one row per note | `id` | `kind` (`definition_change`/`caveat`/`context`), `fy_start`, `fy_end` (null = to latest). |
| `pipeline/output/enforcement_report.json` | run summary | — | Separate from the Congress `_report.json`, like the other non-Congress tracks. Deterministic. |

**Validation** (fails `pnpm transform`): see the methodology doc. Never ingest DHS
press-release totals, OHSS tables, CBP counts or any other agency's figures.

---

## 10. Trade track

A sixth data track: U.S. trade with other countries (Census). Methodology:
`docs/TRADE_METHODOLOGY.md`; schemas: `lib/trade-entities.ts`.

**Key.** `country_code` (ISO 3166-1 alpha-3 where one exists; `XKX`/`XWB`/`XGZ` user-assigned;
ISO 3166-3-style codes for dissolved states; `AGG_<code>` for aggregates; `UNALLOC_<code>` for
Census residuals) is the join key for every trade file, the analog of `bioguide_id`. Several
Census codes can share one `country_code` (a recode), and their months are summed. `countries.json`
has `is_aggregate`; **filter on it before summing countries.** National series are keyed by
`(period, frequency, basis, scope, adjustment)`. No person key anywhere; presidents join through
dates (§7/§8), never stored pre-joined.

**Bases.** BOP (goods and services, annual) and Census (goods, monthly, by country) are
different by design and are never reconciled. Duties are *calculated* duties, 1993-01 onward: 1993–2009 a frozen one-time USITC DataWeb pull,
2010 on the Census API; every duties row carries `source`.

**Validation** fails `pnpm transform`: row schemas, balance identity, no negatives, no duplicate
keys, no gaps in the claimed ranges, country rows vs World, duties country rows vs the total.

---

## 11. Foreign assistance track

A seventh data track: U.S. foreign assistance by recipient, year and sector (ForeignAssistance.gov). Methodology:
`docs/FOREIGN_AID_METHODOLOGY.md`; schemas: `lib/foreign-aid-entities.ts`.

| File | Grain | Key | Notes |
| --- | --- | --- | --- |
| `pipeline/output/foreign_assistance.json` | one row per (recipient, fiscal year, sector category), FY2001- | `recipient_type` + `recipient_name` + `fiscal_year` + `sector_category`; join key to trade is `country_key` = `countries.json` `country_code` | Headline `disbursements_usd` (nominal), `obligations_usd?`, `military_disbursements_usd`. Regional and global rows are kept: **filter on `recipient_type` before summing countries.** National totals are derived at build time, never stored. |
| `pipeline/output/foreign_assistance_meta.json` | one object | — | `data_through`, first/latest fiscal year, per-year `is_partial` (a documented calendar rule: the source publishes no completeness flag), sector taxonomy. |
| `pipeline/output/foreign_assistance_report.json` | run summary | — | Crosswalk results incl. **unmapped** entities, negative-row counts, reconciliation against the published cross-check targets, file sizes. Deterministic. |

Raw: `pipeline/raw/foreign-assistance/<fy>.json` + `meta.json` (`pnpm fetch:foreign-assistance`; keyless; not in
`fetch:all`; re-run by hand). The transform reads `output/countries.json`, so it runs after the trade transform.
**Validation** (fails `pnpm validate` / `pnpm transform`): row schemas, snapshot row counts equal the source's own totals,
no duplicate grain keys, fiscal years inside the served range, categories inside the source taxonomy, finite amounts,
positive national yearly totals. Negative row-level disbursements are source-documented and kept.

## 12. Troops abroad track

An eighth data track: active-duty personnel by place of duty (DMDC location reports, Sep 2008-). Methodology:
`docs/TROOPS_METHODOLOGY.md`; schemas: `lib/troops-entities.ts`. Data layer only; no page yet.

| File | Grain | Key | Notes |
| --- | --- | --- | --- |
| `pipeline/output/troops_location.json` | one row per (period, canonical place), overseas section only | `period` + `name` | `state` is `value` / `suppressed` (blank starred row, **not 0**) / `null` (Army N/A). `class` is `host` / `territory` / `afloat_unassigned`: **filter on `class` before summing hosts.** `iso3` joins to `countries.json` `country_code` where the place is a real country. |
| `pipeline/output/troops_location_meta.json` | one object | n/a | Periods covered, data-through, the Dec 2017 break, the Afghanistan/Iraq/Syria removal, Space Force merge, exception table, per-period printed totals, gaps, flags and derived `abroad_total`. |
| `pipeline/output/troops_location_report.json` | run summary | n/a | Gate counts per period, row counts, unmapped fallbacks, file size. Deterministic. |

Raw: `pipeline/raw/dmdc-location/<YYYY-MM>.xlsx` + `manifest.json` (`pnpm fetch:dmdc-location`; keyless; not in `pnpm pipeline`).

History (1950-2007) lives beside it: `pipeline/output/troops_history.json` (one row per `(year, name)`, `snapshot` june/september, `source` troopdata/dmdc_309a,
`quality` reported/estimate, same `class`/`iso3`/`state` vocabulary), `troops_history_meta.json` (per-year source, abroad total, flags, gaps, substitutions,
comparability notes) and `troops_history_report.json` (gate results). Raw: `pipeline/raw/troopdata/` (`pnpm fetch:troopdata`, pinned commit, GPL-3.0 LICENSE.md
committed) and `pipeline/reference/dmdc-309a-sep.csv`. See `docs/TROOPS_METHODOLOGY.md` "History".

### Bases (overseas installations)

A location track beside the troop series, from the same pinned troopdata snapshot (`pipeline/raw/troopdata/basedata.csv`, David Vine's lists, **one
undated snapshot, documented "through 2018"**). `pipeline/output/bases.json` is one row per site keyed on `base_id` (`<iso3>-<slug>`), never `bioguide_id`;
fields `name, country, iso3, lat, lon, site_type` (base / lilypad / funded_site), `x, y` (projected at build time with `world_map.json`'s projection),
`source`, `needs_review` + `review_note`. It joins the troop series **by `iso3`**, and never by date: there is no per-year presence, so it is not tied to the year
slider and no count of bases is compared across years. No headcounts, no branch. `bases_report.json` is the human report (rows per country and type, every
excluded row and why, ISO overrides and exceptions, countries with troops but no bases and the reverse, size). Gates (the transform fails): every `iso3` is in
`countries.json` or the documented territory exception table; coordinates in range; no duplicate `base_id`; projected `x,y` inside the map. Territories
(Puerto Rico, Guam, ...) are kept under their own ISO3; Antarctica and rows with no coordinates are excluded and listed. Runs after `world-map-run`
(and so after `trade-run`). Notes: `docs/BASES_SOURCE_NOTES.md`, `docs/TROOPS_METHODOLOGY.md` "Bases".

## 13. Energy track

An eighth data track: U.S. energy time series from the EIA (petroleum, the Strategic Petroleum Reserve, natural gas, electricity), plus a
hand-curated policy-actions timeline. Methodology: `docs/ENERGY_METHODOLOGY.md`; curation: `docs/ENERGY_ACTIONS_CURATION.md`; pre-flight
findings: `docs/ENERGY_PREFLIGHT.md`; schemas: `lib/energy-entities.ts`, `lib/energy-actions-entities.ts`. Joins to presidents and Congress through
**dates** (section 8), never `bioguide_id`.

| File | Grain | Key | Notes |
| --- | --- | --- | --- |
| `pipeline/output/energy_series.json` | one row per series (20) | `series_id` | Title, units, frequency, group, attribution `tier`, status rule, first/last observation, caveats. |
| `pipeline/output/energy_observations.json` | one row per (series, date), full history, source units | `series_id` + `date` | Monthly dates are the first of the month; weekly are week-ending. Each row has `status` `final`/`preliminary`. Missing values have no row. ~1.04 MB, one flat file. |
| `pipeline/output/energy_report.json` | run summary | — | Counts, last observations, preliminary counts, skipped missing markers. Deterministic. |
| `pipeline/output/energy_actions.json` | one row per curated action | `action_id` (`<date>-<slug>`) | From `pipeline/reference/energy-actions.json`; file-level `last_reviewed`; optional `links.eo_numbers` into `executive_orders.json`. |

Raw: `pipeline/raw/eia/<SERIES_ID>.json` (`pnpm fetch:eia`; needs `EIA_API_KEY` in `.env.local` / a repo secret; not in `fetch:all`). **Validation** (fails
`pnpm validate` / `pnpm transform`): row schemas, snapshot row counts equal the API's own total (it truncates at 5,000 rows without a warning), units unchanged,
known missing markers only, `(series_id, date)` unique, display-window coverage, flags reference real series and EOs and carry a primary source.

## 14. Supreme Court decisions track

A ninth data track: institutional counts of Supreme Court decisions from the Supreme Court Database (SCDB, case-centered by citation). Methodology: `docs/DECISIONS_METHODOLOGY.md`;
pre-flight: `docs/SCDB_PREFLIGHT.md`; schemas: `lib/decisions-entities.ts`. Separate from the Court track's Martin–Quinn data (section 6).

| File | Grain | Key | Notes |
| --- | --- | --- | --- |
| `pipeline/output/decisions_counts.json` | one row per `(term, issue area)` with at least one orally argued case | `term` + `issue_area_id` (**not** a `bioguide_id`, not a `justice_id`) | `n` and dissent-bucket counts `d0..d4` (`min(minVotes, 4)`). `issue_area_id` null = no SCDB issue area. Counts only, never percentages (shares are derived in `lib`). |
| `pipeline/output/decisions_cases.json` | one row per case in scope (8,251), oldest first, ~1.6 MB | `case_id` (SCDB `caseId`) | Term, ISO decision date, title-cased name, cite (U.S., else S. Ct., else L. Ed., else Lexis), `issue_area_id`, dissent `band`, `maj`/`min`. Feeds the page's case list only; a gate checks that aggregating it reproduces `decisions_counts.json` cell for cell. |
| `pipeline/output/decisions_landmarks.json` | the landmark cases on the page (339) | `case_id` | Title of the Wikipedia article, the list headings ("Criminal law › Fourth Amendment rights"), and `via` (how it joined SCDB). From `pipeline/raw/wikipedia-landmarks/list.wikitext` (`pnpm fetch:landmarks`; CC BY-SA 4.0; manual refresh). |
| `pipeline/output/decisions_meta.json` | one object | — | SCDB version, data-through term, exclusions, unclassified count, citation, licence, Chief Justice spans (with appointing president and party), the issue-area catalog. |
| `pipeline/output/decisions_report.json` | run summary | — | Totals by bucket, decade, issue area; gate results. Humans only. |

The charts read only `decisions_counts.json` and the meta file; the case list reads `decisions_cases.json` (served to the browser from `/data/decisions/cases`, fetched on demand). The raw SCDB CSV is committed (`pipeline/raw/scdb/`, with `manifest.json`: version, URL, sha256 of the zip and the CSV, row count; latin-1, though a few newer case names are UTF-8 inside it and are repaired).
The issue-area taxonomy lives behind `pipeline/reference/decision-issue-areas.json` so it can be swapped without touching the transform or the UI; Chief Justice to appointing president is `pipeline/reference/chief-justices.json`,
verified against `court/justices.json` and the presidents tables (no second president table). Raw: `pnpm fetch:scdb` (manual refresh, not in `fetch:all`); freshness: `.github/workflows/scdb-freshness.yml` (monthly, warns when the host is down).
Gates are build-failing (see the methodology doc).


## 15. Laws track

A tenth data track: every public law from the 93rd Congress (1973) on. Methodology: `docs/LAWS_METHODOLOGY.md`; measured source behaviour: `docs/LAWS_PREFLIGHT.md`; schemas: `lib/laws-entities.ts`. Separate from Decisions (section 14) but built the same way. The key is the law (`law_id` = `<congress>-pub-<number>`), **not** a `bioguide_id`: the sponsor is a column (`sponsor_bioguide_id`, joined to `legislators.json`), and cosponsors are kept in a separate file.

| File | Grain | Key | Notes |
| --- | --- | --- | --- |
| `pipeline/output/laws.json` | one row per public law (a bill that became two laws is two rows) | `law_id` | Signing `date` (earliest `BecameLaw` action), title, bill, origin chamber, sponsor, `area_id`, `veto_override`, the two chambers' final passage `house` / `senate` (`[kind, yea, nay, roll]`), `band` (0 none recorded … 4 at least 90% yes), `override_votes`, `major` (Mayhew's list: true / false / null for a Congress with no list) and `summary` (the CRS first sentence, absent when there is none). The signing president is **derived** from the date (`lib/laws-derive.ts`), never stored. |
| `pipeline/output/laws_counts.json` | one row per `(congress, area_id)` with a law | `congress` + `area_id` | `n`, `bands` (laws per support band, adding up to `n`) and `major`. Shares, topic groups and president attribution are derived in `lib`. |
| `pipeline/output/laws_cosponsors.json` | law id -> current cosponsor ids | `law_id` | Withdrawn cosponsors dropped. |
| `pipeline/output/laws_committees.json` | `laws`: law id -> `[committee_id, subcommittee_ids, steps]`; `committees`: id -> name, chamber, parent, `page` | `law_id` | The committees and subcommittees a bill went through, with the steps recorded for the committee itself ("referred to", "reported by"). Ids join to `committees.json` / `subcommittees.json` (`hsif00` -> `HSIF`, `hsif14` -> `HSIF14`). `page` is true only for committees in the current-Congress data; older and renamed committees keep a name and no link. "Reported by" is the better sign of which committee handled a bill; a referral is not authorship. |
| `pipeline/output/law_details/<congress>.json` | one shard per Congress (27), one record per public law | `law_id` | `summary` (the CRS summary as plain paragraphs, HTML stripped; `cut: true` when the fetchers' 3,000-character cap stopped it short) and `actions` (`[date, type code, text, roll calls?]`, oldest first, the source's doubled entries merged, Congressional Record references cut). Only what no other file holds: the sponsor, cosponsors, committees, passage votes and signer are joined from `laws.json`, `laws_cosponsors.json`, `laws_committees.json` and (signer, from the date) `administrations.json` when a law page is built. Schemas `lib/law-details-entities.ts`; built by `transform/law-details-run.ts` (logic `law-details.ts`) after `laws-run.ts`. **Gate: the shards' law ids equal `laws.json`'s exactly.** One law per line. |
| `pipeline/output/laws_meta.json` | one object | — | Data-through date, partial Congresses, sources, the policy-area catalog (with topic group) and the groups. |
| `pipeline/output/laws_report.json` | run summary | — | Humans only. |

Each law has its own page, `/congress/laws/<law_id>/<title-slug>` (`lib/law-details-data.ts` joins the files above; see "Law pages" in `docs/LAWS_METHODOLOGY.md`). The list the Laws page shows is not a file in `pipeline/output`: `getLawsList()` in `lib/laws-data.ts` joins `laws.json` to `legislators.json` and `terms.json` (the sponsor's name and party-state in that Congress) and `administrations.json` (the signer) at build time and serves compact tuples as `/data/laws/list`. Sponsor and signer are derived, never stored on the law.

- **Two raw sources, one shape.** GovInfo Bill Status XML (108th on) and the Congress.gov API (93rd-107th, plus the 108th as an overlap check) are both reduced by the fetchers to the same slim record; the transform checks that they agree wherever both cover a law. Raw files are committed, one law per line.
- **The law list is not trusted.** The API's law list repeats rows and omits laws, so a Congress's laws are checked as numbers 1..N and compared with `pipeline/reference/law-counts-independent.json` (Statutes at Large / GovInfo PLAW). A Congress with no entry there is in progress (partial).
- **Policy areas.** Each law keeps its CRS area exactly as the source names it, except commemorative laws: CRS used "Commemorations" in only 1985–88 and 1997–2008, so a law whose title matches the rules in `transform/laws-commemorative.ts` is counted there in every year (`area_id` = `commemorations`) and its CRS area is kept as `crs_area_id`. The 32 current areas plus "Commemorations" are the catalog, and an unknown name stops the build. A 1973–78 law CRS gave no current area (legacy subject term or none) gets an InsideGov-assigned area from `pipeline/reference/law-areas-assigned.json` (its `crs_area_id` stays `not-classified`); only a law in a Congress still in progress can remain "Not classified". The page shows **topic groups** (`group` in `pipeline/reference/law-policy-areas.json`); regrouping needs a transform run, not a fetch.
- **Dates.** A law may be dated up to 20 January after its Congress ends. A numbered law in the Congress in progress with no enactment action yet is held out and listed in the report.
- **Source typos** the fetcher repairs (a law number citing the wrong Congress) are recorded in the raw file's `corrections` and echoed in the report.
- Raw: `pnpm fetch:billstatus` (keyless) and `pnpm fetch:laws` (`CONGRESS_API_KEY`); neither is in `fetch:all`. Freshness: weekly `laws-freshness.yml` (Bill Status), `voteview-freshness.yml` (roll calls), `laws-major-review.yml` (Mayhew coverage issue).
- **Provisional major flag: not shipped.** Session 3b back-tested four rules against Mayhew over the 113th–118th and none came near the 70% precision / 80% recall bar (`docs/LAWS_METHODOLOGY.md`). The inputs are `pnpm fetch:wikipedia-laws` -> `pipeline/raw/wikipedia-laws/acts.json` (not in `fetch:all`, not read by the transform) and a cached model run (`model-rule.json`); the script is `pipeline/preflight/laws/14-provisional-backtest.mjs`.

- **Passage votes.** The tally is the action text's; Voteview's roll-call file (`pnpm fetch:voteview-rollcalls` -> `pipeline/raw/voteview/rollcalls_93on.json`, 93rd Congress on, with `rollcalls_manifest.json` recording its last date per chamber) is the check and fills in a missing count. A disagreement with Voteview that the clerk's roll number proves, or a tally above the chamber's seats, stops the build until `pipeline/reference/law-vote-exceptions.json` records the right tally. Override votes are kept apart and never set the band. Rules and numbers: `docs/LAWS_METHODOLOGY.md`.
- **Major laws.** `pipeline/reference/mayhew-major-laws.json` is David Mayhew's lists of important enactments (93rd–118th), hand-extracted: one row per entry with a verbatim quote, his marks, and the law ids a person matched (his lists never give law numbers). The transform fails if a named law is missing or belongs to another Congress, if an entry that is not a treaty names no law, or if a Congress up to the last covered has no entry; `major` is null for later Congresses ("not yet assessed"). `laws_major.json` maps each major law to its entries. Credit: `docs/CREDITS.md`.
- **Page payload (Session 4).** `buildLawsPayload` adds `majorBands` (major laws by support band, from `laws.json`), `control` (the party holding each chamber for most days of each Congress, from `congress-control.json`) and `presidents` (tenures clamped to the page's years, for the slider band). The five topic groups with a colour, "Other topics" and "Not classified" are `seriesOf`.
- **Summaries.** `summary` is one finished first sentence of the CRS summary, never model-written; a law whose summary has no clean first sentence of 40–300 characters has none.

## 16. Committee legislation track

An eleventh data track: every bill and joint resolution of the Congress in progress, as each committee it was referred to holds it. Methodology: `docs/COMMITTEE_BILLS_METHODOLOGY.md`; schemas: `lib/committee-bills-entities.ts`. Built from the same GovInfo Bill Status ZIPs as the Laws track (section 15). The key is the committee (`committee_id`, the THOMAS id `HSJU`, joining `committees.json`; subcommittees join `subcommittees.json`); the bill is a row inside it, with the sponsor as a column. Not a `bioguide_id` or `law_id` track.

| File | Grain | Key | Notes |
| --- | --- | --- | --- |
| `pipeline/raw/govinfo-bills/<congress>.json` | one digest per bill and joint resolution, current Congress only | type + number | Committee referrals with dated steps, sponsor, cosponsor party counts, policy area, the few actions the stage logic reads, public law numbers. One bill per line. Written by `pnpm fetch:billstatus`. |
| `pipeline/output/committee_bills/<COMMITTEE_ID>.json` | one row per (bill, committee); one file per committee with bills | `b` + `n` within the shard | Terse keys (see `lib/committee-bills-entities.ts`): dated steps `r` referred, `h` hearing, `m` markup, `p` reported, `d` discharged, `k` calendar; `g` first passage per chamber; `l` / `w` public law and signing date; the shard carries the sponsor, policy-area and subcommittee tables the rows index. **The stage is derived** (`lib/committee-bills-derive.ts`), never stored. |
| `pipeline/output/committee_bills_meta.json` | one object | — | Congress, data-through date, bill and row counts, rows per committee. |
| `pipeline/output/committee_bills_report.json` | run summary | — | Humans only: unmapped committees and subcommittees, unparsed sponsor names, rows per committee. |

- **One gate ties it to the Laws track:** the bills' public laws (bill has a law number *and* a "became law" action) equal `laws.json` for the Congress, exactly.
- A bill appears once per committee it was referred to. The page never sums across committees.
- The card's rows are not read at page build: `getCommitteeBillsPayload()` in `lib/committee-bills-data.ts` joins the shard to the current-member index for sponsor names and links and serves it as `/data/committees/<id>/bills`.

