# Where to get a paragraph or two per Supreme Court case

Run 2026-10-06 on the same 198-case stratified sample as [SCDB_CASE_TEXT_PREFLIGHT.md](SCDB_CASE_TEXT_PREFLIGHT.md). Script: `pipeline/preflight/scdb-text/10-official-syllabus.py`
(lengths and booleans only; no text stored).

## Short answer

| Source | Has a summary? | Coverage on the sample | Licence |
| --- | --- | --- | --- |
| SCDB | No (codes and case name only) | 0% | n/a |
| **Official syllabus / headnote** (govinfo U.S. Reports PDFs, supremecourt.gov slip opinions) | **Yes** | **158 / 198 (80%) with 300+ characters** | Government publication, public domain |
| Oyez facts / question / conclusion | Yes | 79 / 198 (40%); about 0–10% before 1990, 85–100% from 1990 | CC BY-NC 4.0 |
| Justia | Its own attorney-written summaries, plus the official syllabus | **Not measured** (blocked, see below) | **Terms not read** |
| Wikipedia | Notable cases only | Not tested | CC BY-SA |
| CourtListener / Harvard CAP | No (opinion text only) | n/a | Public domain / CC0 |

**Recommendation: use the official syllabus.** It is the only source that is complete, public domain and written by the Court's own reporter. Oyez stays an optional modern-era extra.

## Official syllabus test (govinfo + slip opinions)

How it works: `https://www.govinfo.gov/content/pkg/USREPORTS-<vol>/pdf/USREPORTS-<vol>-<first page>.pdf` returns a one-case PDF (volumes 2–586, through 2018) with
no token; `https://www.supremecourt.gov/opinions/slipopinion/<yy>` lists recent opinions and links each PDF (the page's table has docket number, link and a
one-line description). The per-case URL is predictable from the U.S. cite SCDB already has. Text comes out with `pdftotext`. Modern PDFs have a labelled
"Syllabus"; older volumes print an unlabelled headnote paragraph (and often the Reporter's "Statement of the case") right after the "Argued … Decided …" line.

| Decade | n | 300+ chars | short (1–299) | undetected | not fetched / no source |
| --- | --- | --- | --- | --- | --- |
| 1940s | 22 | 20 | 0 | 0 | 2 |
| 1950s | 22 | 16 | 3 | 1 | 2 |
| 1960s | 22 | 16 | 4 | 2 | 0 |
| 1970s | 22 | 20 | 1 | 0 | 1 |
| 1980s | 22 | 18 | 2 | 2 | 0 |
| 1990s | 22 | 20 | 0 | 0 | 2 |
| 2000s | 22 | 19 | 1 | 1 | 1 |
| 2010s | 22 | 13 | 2 | 0 | 7 |
| 2020s | 22 | 16 | 2 | 0 | 4 |
| **All** | **198** | **158 (80%)** | **15** | **6** | **19** |

What the misses are:

- **Short (15):** one-line dispositions such as "writ dismissed as improvidently granted" or "judgment vacated and remanded". For these the Court wrote no summary; the
  case name plus the SCDB issue label is all there is. They would need their own flag in a build.
- **Undetected (6):** the PDF had no syllabus block my parser could find (mostly 1960s–80s orders). A better parser would likely recover some; I did not tune further.
- **Not fetched (17) and no U.S. cite (2):** 8 are SCDB cites that point into the order lists (pages in the 800s–1000s), not a per-case granule. 9 are recent
  cases (2017–2021 terms, plus original-docket numbers like `22O143`) where my docket match found no slip opinion; I cannot tell whether the source lacks
  them or my matcher is wrong. Terms after 2018 come only from supremecourt.gov, so the build would need a proper slip-opinion index walk.
- When a syllabus exists it is not short: the five sanity cases are 0.4k (*Moore*) to 8.2k characters, so a build would trim to the first paragraphs.

## Justia (blocked, so not measured)

- `supreme.justia.com` and `law.justia.com` answer scripts with HTTP 403 and the browser pane with a "Performing security verification" bot check. I did not
  try to get past it, so **I have not read Justia's terms of service** and have not measured its coverage.
- From a web search (not Justia's own pages): its case summaries are short blurbs written by its staff attorneys, which means original, copyrighted text. I would not
  copy those without permission. The official syllabus Justia displays is the same public-domain text available from govinfo and supremecourt.gov, so Justia adds nothing we cannot get directly.
- If you still want Justia, the route is to ask them (or read the terms in your own browser) before any automated use.

## Suggested plan

1. Official syllabus for every case that has one (about 80% on the sample, more with a better parser and a real slip-opinion walk).
2. For the rest, keep the label as case name + SCDB issue (the pilot already does) and flag it as "no summary".
3. Oyez only for 1990+ and only after the BY-NC decision; model-written summaries only as a clearly labelled fallback, spot-checked like the topic labels.
