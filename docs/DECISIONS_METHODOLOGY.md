# Supreme Court decisions methodology (SCDB counts)

How `pipeline/fetch/scdb.ts` and `pipeline/transform/decisions{,-run}.ts` turn the Supreme Court Database into
`pipeline/output/decisions_counts.json`, `decisions_meta.json` and `decisions_report.json`. Schemas: `lib/decisions-entities.ts`.
Pre-flight evidence: `docs/SCDB_PREFLIGHT.md`. Page: `/supreme-court/decisions`.

## Source

Supreme Court Database (Washington University in St. Louis), **case-centered by citation**, CSV, latin-1. The pinned release is in
`pipeline/raw/scdb/manifest.json` (currently Version 2026 Release 01, terms 1946–2025, 9,409 rows). Licence CC BY-NC 3.0 US. Citation
(also in `decisions_meta.json`, printed in the page's Source line):

> Harold J. Spaeth, Lee Epstein, Andrew D. Martin, Jeffrey A. Segal, Theodore J. Ruger, Sara C. Benesh, and Michael J. Nelson. 2026 Supreme Court Database, Version 2026 Release 01. URL: http://supremecourtdatabase.org

## Unit of analysis

A **case** is one row of the case-centered file with `decisionType` in {1, 5, 6, 7} (orally argued: opinion of the Court, equally divided, per curiam, judgment of the Court)
and `voteUnclear` not 1. For 2026_01 that is **8,251 cases**: 9,409 rows minus 1,010 summary dispositions (type 2) minus 66 decrees (type 4) minus 82 unclear votes.

- **Type 2 is excluded** (summary per curiams, decided without argument). Including them inflates the 1960s–70s docket and muddies the shrinking-docket story. The docket here is cases *decided after argument*, not filed or granted.
- A case counts once, in its **decision term** (`term`). Consolidated cases are one row in the case-centered file.
- Terms are labelled by their starting year. A term runs October to June, so "2025" is October 2025 to June 2026.

## Dissent buckets

`bucket = min(minVotes, 4)`: 0 unanimous (9–0), 1 = 8–1, 2 = 7–2, 3 = 6–3, 4 = 5–4 (which includes 4–4 ties). Buckets count **dissents, not the full tally**, so with fewer than nine
justices a 5–3 decision lands in "6–3" territory by dissent count (3 dissents) and a 4–3 in the 3-dissent bucket too. This is the eight-justice caveat shown on the page (for example 2016 after Scalia's death).
Some cases are decided by fewer than nine justices (vacancies, recusals); the page says so rather than adjusting.

## Issue areas

SCDB's own 14 `issueArea` categories, behind the catalog `pipeline/reference/decision-issue-areas.json` (`id`, `scdb_code`, `label`). The transform maps code to `id` through that file only and fails on an
unknown code; the UI reads labels from `decisions_meta.json`. Cases with no `issueArea` (67 in 2026_01) are kept with `issue_area_id: null`, count in "All issue areas", and appear in no issue-area row.
Swapping the taxonomy later = a new catalog and `issueAreaId` mapping, no UI change.

## Chief Justices

`chief_spans` in `decisions_meta.json`: the modal SCDB `chief` of each term's cases merged into runs (Vinson 1946–52, Warren 1953–68, Burger 1969–85, Rehnquist 1986–2004, Roberts 2005–). Appointing president and party
come from the hand-maintained `pipeline/reference/chief-justices.json` (Rehnquist is Reagan's appointee *as Chief*), which the transform checks against `court/justices.json` (`chief_justice_appointment`) and the presidents tables.
An unknown `chief` name fails the build; add a row when a new Chief takes the chair.

## Output

- `decisions_counts.json`: one row per `(term, issue_area_id)` that has at least one case, with `n` and `d0..d4`. Counts only, never percentages. Every term 1946–last has rows. `issue_area_id` is `null` for unclassified. ~77 KB.
- `decisions_cases.json`: one row per case in scope, oldest first (~1.6 MB): `case_id`, `term`, `date`, `name`, `cite`, `issue_area_id`, `band`, `maj`, `min`. Names are SCDB's capitals re-cased for reading by `pipeline/transform/case-names.ts` (a word that already has lower-case letters is left as written; a curated acronym lookup of agencies, unions/organisations and company forms; dotted initials, Roman numerals and vowel-less tokens like "CSX" stay capitals unless listed as abbreviations like "Ltd"; small words lower-case; a few newer UTF-8 names repaired). To fix a name, add the acronym to `ACRONYMS` (or `ABBREVIATIONS`) there; the tests list real examples and fail if a listed acronym is ever title-cased in the data; `cite` is the U.S. Reports cite, else Supreme Court Reporter, else Lawyers' Edition, else Lexis.
- `decisions_meta.json`: version, data-through term, exclusions, unclassified count, citation, licence, chief spans, issue-area catalog.
- `decisions_report.json`: totals by bucket, decade and issue area, gate results (humans only).

## Gates (the transform exits non-zero)

The case list aggregates back to the counts exactly (same cases, same cells, unique ids). Output total equals an independent positional recount straight from the CSV (and the raw row count after exclusions); per-term bucket sums and per-term 5–4 counts equal the recount; terms gap-free from 1946;
every row's buckets sum to `n`; unclassified and exclusion counts equal the recount; stable anchors (1946 = 142, 1972 = 156, 2015 five-four = 4) and release anchors (2026_01: total 8,251, 2024 = 61, 2025 = 57); chief spans contiguous and covering all terms.
When a new release legitimately changes an anchor, update `ANCHORS` / `ANCHORS_BY_VERSION` in `pipeline/transform/decisions.ts` in the same PR.

## Landmark cases

The page's "Landmark cases" checkbox uses Wikipedia's [List of landmark court decisions in the United States](https://en.wikipedia.org/wiki/List_of_landmark_court_decisions_in_the_United_States): one request to the MediaWiki API (`pnpm fetch:landmarks`, identified User-Agent), saved as `pipeline/raw/wikipedia-landmarks/list.wikitext` with a manifest (revision id, timestamp, sha256, licence CC BY-SA 4.0). The list is grouped under topical headings, and each case carries a `{{ussc|volume|page|year}}` template (some recent ones use named parameters or a docket number).

- **Join to SCDB**, in order: U.S. Reports cite; docket number (when the list gives one); case name plus decision year (the first significant word on each side of "v."). Every name match is listed in `decisions_report.json` for review.
- **What does not join, and why** (all listed by title in the report): cases decided before SCDB's modern file (1945 term and earlier: 133 entries); cases SCDB holds but the page leaves out because they were not orally argued or the vote is unclear (7, e.g. *Dusky v. United States*); and three entries with no SCDB row: *One, Inc. v. Olesen* (listed twice; a one-line per curiam SCDB does not hold) and *Lucas v. South Carolina Coastal Council*, which the list cites as 503 U.S. 1003 where SCDB has 505 U.S. 1003 (a typo on Wikipedia; not corrected here).
- **Result at the 2026 revision:** 485 list entries, 339 cases on the page (300 by cite, 5 by docket, 34 by name and year).
- **Gate:** every entry is accounted for exactly once; at least 300 matched; no more than 3% of the post-SCDB entries unmatched.
- **Stored:** only which cases it names, the article title (a link back) and the headings, never the list's prose. A case under several headings keeps all of them; the page shows up to two.
- **A judgement call, not a ruling:** "landmark" is Wikipedia editors' classification, not the Court's or SCDB's. It is recent-heavy (the list keeps adding new decisions) and its 339 cases are about four a term, so landmark-only shares are rough; the page says so.

## Case-name links to Wikipedia

Every case name in the list links to its Wikipedia article when Wikipedia's own indexes tie the case to one. `pnpm fetch:wikipedia-cases` reads "List of United States Supreme Court cases, volume N" (volumes 329 onward) and "<year> term opinions of the Supreme Court of the United States" (2010 onward, for decisions too new for a volume) through the MediaWiki parse API (identified User-Agent, 150 ms apart, ~300 requests; refreshed weekly by `wikipedia-cases-freshness.yml`, which opens a gated pull request only when a row, link or redirect changed) plus the redirect map for every linked title, into `pipeline/raw/wikipedia-cases/articles.json`. Each list row carries the article it links (a red link means no article), the U.S. Reports volume and page or the docket, and the year.

- **Join to SCDB**, most certain first; a case takes the first rung that yields exactly one article: (1) U.S. Reports volume and page, (2) volume and docket number, or, for the newest decisions where SCDB has no U.S. cite yet, the docket number and decision year alone (the names only veto, so "FEC" and "Federal Election Commission" do not matter), (3) normalised parties plus decision year, from an entry with no usable cite (a decision too new for a page number). A name alone never joins, and a cite match is not vetoed by abbreviations ("N.Y.C. & St. L.R. Co." is the same case as "New York, Chicago & St. Louis Railroad Co."). Companion cases that share a cite are told apart by name; a redirect and its target count as one article; a title with the decision year in brackets breaks a tie between "X v. Y" and "X v. Y (2021)".
- **Rejected links:** a row that links the volume list itself, or a topic page unrelated to the case's name ("Fifth Amendment to the United States Constitution"), is not the case's article.
- **No article:** a case the lists show as a red link, or a printed U.S. Reports cite that no list carries (an order), has `title: null` and is not linked. Only cases on no list (the newest decisions, cited by S. Ct.) fall back to a Wikipedia search.
- **Landmarks** keep the landmark list's own link, which wins.
- **Gate:** one row per case, no unknown case ids, at least 30% of cases matched. The report (`decisions_report.json` > `case_articles`) lists the counts by rung, every name-and-year match and every conflict.
- **Result:** about 3,400 of 8,251 cases link to an article, 4,850 are red links on the lists (Wikipedia has no article), about 40 fall back to search.
- **Stored:** article titles only (links back). Wikipedia's lists are CC BY-SA 4.0. (The one-sentence summaries, next, are the one place Wikipedia's prose is kept.)

## One-sentence case summaries

Under a case name the list shows one sentence on how the Court ruled, for the cases that have an article (about 2,000 of the 3,400). It is Wikipedia's wording, not ours: `pnpm fetch:wikipedia-case-leads` saves the first 1,000 characters of each linked article's lead (`pipeline/raw/wikipedia-cases/leads.json`, 20 articles a request, incremental), and `transform/wikipedia-case-summaries.ts` picks the sentence.

- **Pick:** the first of the lead's first three sentences that states a ruling (held that, ruled, decided, struck down, upheld, reversed, ...). A later sentence counts only if the Court is its subject and it does not point back at a sentence we are not showing ("such officials", "this case").
- **Trim:** a case article opens "Name, 558 U.S. 100 (2009), is a United States Supreme Court case in which the Court held that ...". The name and cite are already in the row, so the head is cut; a bare verb ("held that ...") gets "The Court" put back. Footnote marks go.
- **Keep only if clean:** one finished sentence of 40-300 characters with balanced brackets and quotes. An article whose first sentence is not a case head (a redirect into a term list or a section) gets none.
- **Where the picker finds nothing:** `pnpm summarize:cases` sends the lead to the Claude API (Sonnet), which must say whether the text states a ruling, quote the words that state it, and write one sentence. The sentence is kept only if the quote is verbatim in the lead and names a ruling, and at least 70% of the sentence's words are in the lead. The check is there because an unguarded first trial wrote rulings from memory and got one backwards. Answers are cached by article title in `pipeline/classification/case_summaries.json` (null = no ruling in the lead), so each article is asked once; the weekly workflow asks for new ones. These rows are tagged "AI-written" on the page.
- **Result:** about 2,600 of the 3,400 linked cases: 2.0k Wikipedia's own sentence, 0.6k model-written; the rest have openings with no ruling and show none rather than a guessed one.
- **Gate:** one row per case, every case id real, 40-300 characters, at least half of the linked cases summarised. The report (`decisions_report.json` > `case_summaries`) counts articles, leads and which sentence each came from.
- **Caveats:** companion cases that share an article share its sentence; the sentence is the article's first account, which can be vaguer than the opinion ("The Court held that the New York state rule applied."). The card's Data notes say it is Wikipedia's text (CC BY-SA 4.0) and to check the article.

## Outcome direction (Liberal / Conservative tag)

Each case in the list can carry a small "Liberal" or "Conservative" tag beside its name, and the list has Outcome buttons (All outcomes / Liberal outcome / Conservative outcome) above it. It is SCDB's `decisionDirection` field, read as is (`transform/decisions.ts` `buildCaseRows` -> `direction` on `decisions_cases.json`; `pipeline/output/decisions_report.json` > `outcome_direction` counts the three states).

- **What it is:** the direction of the *outcome*, who prevailed, coded by the database from a fixed rule for each issue area (codebook, "Decision Direction"). In criminal procedure a ruling for the person accused is liberal and one for the government conservative; in economic activity a ruling for the consumer, worker or government against business is liberal; in federalism a ruling for federal power is liberal; in federal taxation a ruling for the United States is liberal. It is not a measure of the justices' views, of the reasoning or of a case's importance, and it is a convention that some cases fit poorly (a free-speech ruling against campaign-spending limits is coded conservative, one that upholds limits liberal).
- **Not coded:** SCDB's "unspecifiable" (code 3: every Interstate relations case, disputes between states, real property, wills, ties) and blank are the same to us: no tag, never a "neutral" tag. About 160 of 8,251 cases.
- **The words on the page:** the tag says only "Liberal" or "Conservative"; the filter buttons say "Liberal outcome" and "Conservative outcome"; the card's lede and Data notes say it codes who prevailed and is not a rating. Hovering a tag (a tap on a phone) opens what that side means in the case's issue area, with no repeated caveat (the card's header carries that once): `lib/decisions-direction.ts` holds a liberal and a conservative sentence for each of the 14 areas, paraphrasing the codebook. When the codebook changes, update that file; the codebook is the authority.
- **Colours:** teal and violet (`--outcome-lib`, `--outcome-con`), not red and blue, so a direction is not read as a party.
- **Why it was built after all:** it was first listed as out of scope to avoid a partisan reading of the Court. It is shown per case with its rule beside it, and there is no chart or share of "liberal decisions over time" (see below).

## Not in scope

A chart or share of liberal versus conservative outcomes over time or by Chief Justice (the per-case tag is built; an aggregate invites reading the Court's politics into a coding convention that differs by issue area), per-justice votes, landmark-case curation, case summaries written by us (the one sentence under a case is Wikipedia's, above). The page is institutional counts plus a plain list of the cases behind them (name, cite, date, issue area, vote).
