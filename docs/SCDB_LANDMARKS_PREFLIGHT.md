# SCDB landmarks preflight — status: PARTIAL — SCDB measured; Justia blocked by Cloudflare

Session 0 was started on 2026-10-07 and stopped at the first step.

## Status

Session 0 ran on 2026-10-07. After the environment's allow-list was widened, SCDB (`scdb.la.psu.edu`) and Wikipedia became reachable. Justia did not: both `www.justia.com` and `supreme.justia.com` answer scripted requests with a Cloudflare challenge (`HTTP 403`, `cf-mitigated: challenge`). That is the bot protection the plan says not to circumvent, so nothing was fetched from Justia. The terms (item 2) were therefore **not read**, and items 3–5, 6, 9 and 10 are not done.

## Item 1 — SCDB files (done)

Raw files are in a scratch directory and not committed. All fetched 2026-10-07 from links read off the release pages. The download is a zip holding a latin-1 CSV.

| File | Download name | zip sha256 | Rows |
|---|---|---|---|
| Modern, case-centered by citation, 2026 Release 01 | `SCDB_2026_01_caseCentered_Citation.csv_.zip` | `4d8f34d56363f8c140917bb556c530ee120aaaed6ed564a27866c0e5155e73f7` | 9,409 |
| Modern, justice-centered by citation | `SCDB_2026_01_justiceCentered_Citation.csv` (zip) | `c2298a2672068ad6edefe0132224e85378d2b35b0729781004bedb14186d8c12` | 84,256 |
| Legacy 07, case-centered by citation | `SCDB_Legacy_07_caseCentered_Citation.csv_.zip` | `ee7759bc96253992d3749f6ba144d00810f63f424b43bf096f9d0b55551da420` | 19,861 |

Release pages: https://scdb.la.psu.edu/data/2026-release-01/ and https://scdb.la.psu.edu/data/scdb-legacy-07/ (the `/data/` page also links Legacy 01–06; I used the latest). The hashed download URLs change, so read them off the pages.

Modern file: decisions run 1946–2026 (term 2025). `usCite` is blank for 533 cases and `docket` for 8, so joins on recent cases need `docket`. `dateDecision` is `m/d/yyyy`.

## Item 7 — Legacy file (partly done; no landmark match possible without the lists)

Decision direction coding (1 = conservative, 2 = liberal, 3 = unspecifiable):

| | Rows | Conservative | Liberal | Unspecifiable | Blank |
|---|---|---|---|---|---|
| Modern (1946+) | 9,409 | 4,503 | 4,697 | 164 (1.7%) | 45 |
| Legacy (1791–1945) | 19,861 | 7,631 | 8,503 | 3,672 (18.5%) | 55 |

Legacy `docket` is blank for 4,894 rows (25%), so docket joins will be weak there; `usCite` is blank for only 1. The legacy unspecifiable share is highest in the early decades (about 40% in the 1800s–1820s) and drops to about 3% by the 1940s. Legacy has a usable direction field, but the codebook warns that legacy issue coding is stretched, and the direction for e.g. 19th-century property or admiralty cases is a weak signal. My view, to be confirmed after seeing which landmarks fall there: **v1 should start at 1946**, with pre-1946 as a later opt-in. How many pre-1946 landmarks would match is not known until the lists exist.

## Item 8 — Per-case detail (feasibility: yes)

- The justice-centered file is 84,256 rows × 61 columns, about 30 MB as CSV (about 2 MB zipped). It has `justiceName`, `vote`, `opinion`, `direction` and `majority`. It is a build-time input only; the site would ship a small per-landmark extract.
- Case-centered file: `splitVote`, `majVotes` and `minVotes` are populated for every row. `majOpinWriter` is blank for 1,775 modern rows (19%), mostly per curiam and unsigned decisions, so "who wrote the majority" needs a fallback for those. The justice-centered `opinion` field is the place to check that.
- Not yet verified for specific landmarks, since there is no list.

## Items still open

| Item | Blocker |
|---|---|
| 2 Terms and access | Justia pages return a Cloudflare challenge. `docs/justia-permission-request.md` is drafted, not sent. |
| 3 Extract lists, 4 join, 5 direction by topic, 6 dates, 10 design inputs | Need the Justia lists. |
| 9 Wikipedia fallback | Reachable but not evaluated. |

## Recommendation (interim)

Not a go/no-go yet. Sending the permission request, or hand-copying citations from a normal browser, is what unblocks the Justia route. The SCDB side looks sound: direction is specifiable for about 98% of modern cases, and vote split is complete.

## To unblock the lists

1. You copy each topic's citations (topic, U.S. citation or docket, year, Justia path only) into a local file, or
2. Justia gives permission or an export, or
3. We evaluate Wikipedia's landmark lists as the substitute (item 9).
