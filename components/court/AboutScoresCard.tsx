/**
 * "About these scores": the two-paragraph note at the bottom of every justice
 * page. ONE shared component — never hand-copied per page (the `Dim2Footnote`
 * lesson in ARCHITECTURE_MAP.md). Wording is the session-approved starting copy;
 * the citation matches docs/CREDITS.md and the Court explorer's footer.
 */
export function AboutScoresCard() {
  return (
    <section
      aria-label="About these scores"
      className="rounded-[10px] border border-line bg-surface p-[1.1rem_1.25rem_1.25rem]"
    >
      <h2 className="mb-2 font-serif text-[1.05rem] font-medium">About these scores</h2>
      <div className="flex max-w-[60rem] flex-col gap-2.5 text-[0.85rem] leading-[1.6] text-ink-muted">
        <p>
          Martin&ndash;Quinn scores place each justice on a single
          liberal&ndash;conservative dimension, estimated from their votes
          across terms, with scores allowed to shift from one term to the next.
          Higher is more conservative. The shaded band is the credible interval:
          wider when the record is thin, especially in a justice&rsquo;s first
          terms, and narrower as votes accumulate.
        </p>
        <p>
          These scores are not on the same scale as Congress&rsquo;s
          DW-NOMINATE and should not be compared with it directly. Dot color
          shows the party of the appointing president, not the justice. Source:
          Martin, Andrew D. and Kevin M. Quinn. 2002. &ldquo;Dynamic Ideal Point
          Estimation via Markov Chain Monte Carlo for the U.S. Supreme Court,
          1953&ndash;1999.&rdquo; Political Analysis 10:134&ndash;153. Scores
          from{" "}
          <a
            href="https://mqscores.wustl.edu/"
            rel="noopener"
            className="text-accent underline underline-offset-2"
          >
            mqscores.wustl.edu
          </a>
          .
        </p>
      </div>
    </section>
  );
}
