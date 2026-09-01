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

---

## 2. Entity model (planned — not built yet)

The source layer in `pipeline/output/` is **normalized**: one fact lives in one
place. Page-shaped data is denormalized by joining these entities **at build
time**, never stored pre-joined.

| Entity                | Grain                              | Key(s)                                             | Notes |
| --------------------- | ---------------------------------- | ------------------------------------------------- | ----- |
| **Legislator**        | one row per person                 | `bioguide_id`                                      | Stable identity: name, birth/death, gender, links. Nothing that varies by Congress. |
| **Term**              | one row per legislator × Congress  | `bioguide_id` + `congress`                         | `chamber`, `state`, `party`, `district` (House) or `senate_class` (Senate). The unit of "who served when." |
| **FinancialDisclosure** | one row per legislator × year    | `bioguide_id` + `year`                             | Annual disclosure summary. |
| **CommitteeMembership** | one row per legislator × committee × Congress | `bioguide_id` + `committee_id` + `congress` | Includes role (chair, ranking member, member). |
| **Committee**         | one row per committee              | `committee_id`                                     | Name, chamber, parent (for subcommittees). |
| **IssueScore**        | one row per legislator × Congress × metric | `bioguide_id` + `congress` + `metric`     | DW-NOMINATE dimensions and any future interest-group scores. See §3. |

`congress` (the Congress number, e.g. `119`) is the canonical time axis, not
calendar year. Convert years → Congress at the edges.

When these get built (Session 2+), each is a separate JSON file (or directory of
files) under `pipeline/output/`, and each row validates against a Zod schema
before it is written.

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
  members with very few votes in a Congress. Handle missing values explicitly;
  do not coerce to `0` (which is the chamber center, a meaningful value).
- Store both in `IssueScore` rows with distinct `metric` values
  (e.g. `nominate_dim1`, `nokken_poole_dim1`). The static one is still stored
  per-Congress for a uniform grain; consumers that want "career score" read any
  one row.

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
