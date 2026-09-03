# pipeline/financial/

Parses U.S. **House** Financial Disclosure filings into net-worth estimates.
The one Python component of the pipeline (everything else is TypeScript) —
because the tool it was originally meant to wrap, `disclosure-extractor`, is
Python, and because PDF geometry work is easier there.

> **Status: validation sample only.** This session validated the approach on
> 8 current members × 2 years. Scaling to all ~435 current House members is a
> separate follow-up. See `docs/HOUSE_DISCLOSURE_EXTRACTOR_EVAL.md` for the full
> write-up, including why `disclosure-extractor` was evaluated and rejected.

## Setup

No system Python 3.11+ here, so use `uv`:

```bash
cd pipeline/financial
uv venv --python 3.12 .venv
source .venv/bin/activate
uv pip install --only-binary=:all: cryptography   # dodge an sdist Rust build
uv pip install -r requirements.txt
```

## Run

```bash
python build.py --years 2023 2024 --sample
# or a custom set (surnames as they appear in the Clerk index "Last" field):
python build.py --years 2024 --last Pelosi McCaul Khanna
```

Writes `pipeline/output/financial_disclosures.json` (one row per member × year,
one row per line) and `financial_disclosures_report.json` (run summary).

## How it works

| File | Role |
| --- | --- |
| `bands.py` | EIGA dollar-range bands → `[low, high]`. Open-ended top band ("Over $50,000,000") keeps `low` only — **no fabricated midpoint**. Midpoint = mean of the two bounds. |
| `parse_house.py` | Parses a Clerk **electronic** PDF. Geometry-based: clusters words into visual lines, derives column x-boundaries from each schedule's own header row, buckets words, stitches wrapped rows. Handles the Clerk's NUL-byte "letter-spacing" and the `⇒` name-continuation arrow. Detects scanned/paper PDFs (`looks_scanned` → no text). |
| `resolve.py` | `("Pelosi", "CA11")` → `bioguide_id`, via `output/terms.json` + `output/legislators.json` (current Congress, House). Unresolved = surfaced error, never a null key. |
| `adapter.py` | Parse → `FinancialDisclosure` shape (`lib/types.ts`). Net worth = Σ asset midpoints − Σ liability midpoints. Sets `parse_confidence` / `needs_review` / `review_notes`. |
| `build.py` | Orchestrator: Clerk `<YEAR>FD.zip` index → pick each member's Annual Report → download PDF into `../raw/house-financial-disclosures/` → parse → adapt → JSON. |
| `probe_disclosure_extractor.py` | Evaluation artifact — runs every `disclosure-extractor` entry point against a House PDF and records the outcome. |

## Confidence flags

| `parse_confidence` | Meaning |
| --- | --- |
| `high` | Schedule A parsed, every value band recognised, no wrap/merge artifacts. Midpoint net worth is usable. |
| `low` | Parsed but flagged — see `review_notes` (merge artifacts, open-ended band, >40% unvalued rows, sparse filing). Treat net worth as order-of-magnitude. |
| `none` | Scanned/paper filing, no extractable text. `net_worth_estimate` is `null`; excluded from confident aggregates. |

## Data source

House Clerk, Office of the Legislative Resource Center —
`https://disclosures-clerk.house.gov/`. Filings and the bulk index are public
records / U.S. Government works. Credited in `docs/CREDITS.md`.
