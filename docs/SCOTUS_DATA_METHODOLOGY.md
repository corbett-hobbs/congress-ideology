# Supreme Court data: how the explorer uses it

What `/supreme-court` and the hub card do with the Court track
(`pipeline/output/court/`, see `DATA_CONVENTIONS.md` §6). The shaping code is
`lib/court-derive.ts` (pure) behind `lib/justice-data.ts` (build-time reader).

## The scores

Martin–Quinn scores are one-dimensional. **Negative is liberal, positive is
conservative.** They are not on the DW-NOMINATE scale and the numbers are not
comparable across the two. Real scores run from about −7.8 to +4.5; there is no
symmetric or unit-range domain anywhere. Zero is an arbitrary reference, not a
political centre, and is never drawn heavier than other reference marks.

- Score = `mq_score` (the posterior mean, `post_mn` upstream). Interval band =
  `mq_lo95`/`mq_hi95` (`post_025`/`post_975` upstream).
- **Career average** = the unweighted mean of a justice's per-term `mq_score`,
  computed at build time (`lib/court-derive.ts`), never in the client. Justices
  still serving are not final. It can hide large movers (Blackmun, Stevens,
  Souter); min-to-max whiskers are deliberately out of scope.

## Fixed score domain

One domain, derived at build time, identical in all three charts and on the hub
sparkline, and never rescaled while the term slider moves: the minimum and
maximum `mq_score` in the whole dataset, padded by 3% and rounded outward to the
nearest 0.5 (`fitDomain`). It is **asymmetric** (currently −8.5 to +5.0): a
symmetric domain sized to the most liberal score would waste the right-hand side
and squeeze today's Court into the middle. The 95% band can run past the domain
for early terms (Douglas); the band is clipped to the plot area instead of
widening the domain.

## Court median and split terms

Terms 1937, 1938, 1956 and 2005 have two court records (`segment` `a`/`b`)
because a justice was replaced mid-term. The explorer and the hub use the
**post-replacement (`b`) record** for the median line, the median justice and the
trajectory chart's Court-median line. Every other term has one record (`segment`
null), including 1958, 1961 and 1975, which seat ten justices on a single record.

"Median justice" is the `median_justice_id` from the court record (the most
likely median, with its probability in the tooltip), not derived from the dots,
so it works for even and odd counts alike.

## Mid-term turnover (hollow dots)

Drawn only where the data says who left or joined:

- **Split terms**: a justice present in the `a` median-probability record but not
  `b` left; present in `b` but not `a` joined. A justice in neither (Minton,
  1956) is decided by service dates inside the term window.
- **Single-record terms with more than nine scored justices** (1958, 1961, 1975):
  service dates inside the term window (1 October to 30 June of the following
  year) say who left and who joined.
- Every other term has no mid-term change. Derived: 1937 Sutherland left, Reed
  joined; 1938 Brandeis left, Douglas joined; 1956 Reed and Minton left,
  Whittaker joined; 1958 Burton left, Stewart joined; 1961 Whittaker left, White
  joined; 1975 Douglas left, Stevens joined; 2005 O'Connor left, Alito joined.
  `lib/court-derive.test.ts` pins these.

## Presidents

One row/entry per appointing **person** (Trump is one row), using the
appointment in effect at a justice's first scored term, as in the data (Hughes →
Hoover, Stone → Coolidge, Rehnquist → Nixon). Hughes's 1910 service is never
surfaced. Order is office order (`PRESIDENT_KEYS` in `lib/court-derive.ts`); a
president not listed there is appended by first service date with a last-name
label.

## Filters dim, never filter

"Appointed by" (party and president) only lowers the opacity of non-matching
dots and lines. The median, the stat callouts and every computed value always use
the full Court.
