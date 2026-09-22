# Architecture: Congressional financial disclosures data layer

**Status:** design finalized before implementation begins. Phase 1 (House,
digital filings) is the first thing built against this schema — but the
schema itself is meant to hold for Phase 2 (House, OCR) and Phase 3 (Senate)
without changes. If a later phase needs a schema change, that's a signal this
doc was wrong about something and should be corrected in that session, per
project convention — not a reason to bolt on a parallel structure.

## 1. The one thing that makes this work: bioguide_id

Every member — House or Senate, current or historical — already has a
`bioguide_id` in `legislators-current.yaml` / `legislators-historical.yaml`
(the same congress-legislators source `id_crosswalk.json` and `terms.json`
already crosswalk through for the ideology pipeline). Both chambers carry it
in the identical `id.bioguide` field.

**Consequence:** the financial disclosures layer never needs its own member
identifier, and never needs a separate "how do House and Senate members link
up" mechanism. A House record and a Senate record for the same person are
already the same row-key (`bioguide_id`) in the same way an ideology-score
record and a term record already are. Treat this as an invariant to protect,
not something to re-derive per source.

## 2. Schema: separate the value payload from the provenance payload

The mistake to avoid: adding chamber-specific or method-specific fields
directly onto the record (e.g. `house_doc_id`, `senate_report_id`,
`ocr_confidence`) as each new source gets built. That's exactly the kind of
schema growth that forces a backfill/migration later. Instead:

```json
{
  "bioguide_id": "B001257",
  "year": 2024,
  "chamber": "house",

  "assets_total": 1234567.5,
  "liabilities_total": 200000.5,
  "net_worth": 1034567.0,
  "has_open_ended_asset": false,
  "asset_line_count": 12,
  "liability_line_count": 2,
  "asset_band_counts": { "...": "raw band->count breakdown, for auditability" },
  "liability_band_counts": { "...": "same" },

  "source_system": "house_clerk",
  "source_doc_id": "10078132",
  "filing_type": "O",
  "filing_date": "2025-05-14",
  "extraction_method": "digital_text",
  "parse_confidence": "high",
  "needs_review": false
}
```

If a genuinely new *kind* of fact ever needs capturing (e.g. Senate filings
disclose something House filings structurally don't), that's a new optional
field with a clear name — not a rename or repurposing of an existing one.

## 3. Extension points, and what each phase actually changes

| Phase | Chamber | `source_system` | `extraction_method` | What's new |
|---|---|---|---|---|
| 1 (build now) | House | `house_clerk` | `digital_text` | The parser itself |
| 2 (later) | House | `house_clerk` | `ocr` | An OCR text-extraction step feeding the *same* band-counting logic; `source_doc_id`/`filing_type`/`filing_date` come from the same House Clerk index either way |
| 3 (later) | Senate | `senate_efd` | `digital_text` (or `manual`, tbd) | A new fetch/index step (Senate has no bulk index — see below), but the same band tables and the same output schema |

Phase 2 is the smaller lift: it's a new *text-extraction* path (OCR instead
of embedded-text) feeding the same column-position + band-counting logic
already built in Phase 1. The value-payload code should not need to know
whether its input text came from `pdfplumber`'s text layer or an OCR pass —
design the band-counting step to take a plain string in, regardless of
source, so Phase 2 is "swap the text-extraction function," not "write a
second parser."

Phase 3 (Senate) is a bigger lift because the *fetch* side differs
completely — no bulk zip index, a click-through legal gate, and (per a prior
session's investigation) no confirmed open-source parser to build from. But
once Senate filing text is in hand, it should flow through the same
band-literal-counting step and land in the same schema, chamber set to
`"senate"`, `source_system` set to `"senate_efd"`.

**Do not build Phase 3's fetch mechanism speculatively in this session** —
just make sure nothing in the Phase 1 schema or code assumes House-only
concepts (e.g. don't name a field `house_doc_id`; call it `source_doc_id`
and let `source_system` disambiguate).

## 4. Where this lives / joins

- File: `pipeline/output/financial_disclosures.json`, one row per
  `(bioguide_id, year)` — matching the grain already established in
  `congress-ideology-requirements.md` §3 and `ARCHITECTURE_MAP.md` §2.
- Joins to `legislators.json`/`terms.json`/`ideology_scores.json` via
  `bioguide_id`, exactly like every other data file in this project. No new
  join logic needed on the ideology side — a member profile page can pull
  ideology and wealth data for the same `bioguide_id` independently and
  combine them at render time, per the project's existing
  "normalize the source layer, denormalize the serving layer" convention.
- `chamber` on each record is informational/for filtering — it should agree
  with what `terms.json` says for that member in that year, but don't derive
  one from the other at query time; store it directly so a financial
  disclosures record is self-describing without a join.

## 5. Known gaps to carry forward, not solve here

- **No-filing-found member-years** (a real gap in Phase 1 — expect ~3-5%):
  record explicitly (e.g. a row with `parse_confidence: "no_filing_found"`
  and null value fields) rather than a silent absence, so a future session
  can tell "we know this doesn't exist" from "we haven't checked yet."
- **Senate's fetch mechanism** is unsolved by this doc on purpose — it's a
  future session's problem.
