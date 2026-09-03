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

### Planned — schema in `lib/types.ts`, no data source integrated yet

| Entity                  | Grain                                          | Notes |
| ----------------------- | ---------------------------------------------- | ----- |
| **FinancialDisclosure** | one row per legislator × year                  | Source undecided (OpenSecrets, House Clerk). |
| **Committee**           | one row per committee                          | Name, chamber, parent. |
| **CommitteeMembership** | one row per legislator × committee × Congress  | Includes role. |
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
