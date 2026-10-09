export function HowToReadNotes() {
  return (
    <div className="mt-2 flex flex-col gap-3">
      <p>
        <strong className="font-medium text-ink">
          What&apos;s in a filing.
        </strong>{" "}
        Each year, members report the previous year&apos;s assets (stocks,
        funds, real estate other than a personal residence, retirement
        accounts, business interests, bank accounts) and liabilities. A
        spouse&apos;s or dependent child&apos;s holdings are included; a
        member&apos;s home, vehicles and household goods generally are not.
      </p>
      <p>
        <strong className="font-medium text-ink">Why ranges.</strong>{" "}
        Each item is reported within a set band, not as an exact amount, and
        the bands widen as values grow. The top band is open-ended
        (&ldquo;over $X&rdquo;), so a very large holding is shown with a
        floor, not an estimate.
      </p>
      <p>
        <strong className="font-medium text-ink">
          How we estimate.
        </strong>{" "}
        Net worth is the sum of asset midpoints minus the sum of liability
        midpoints, so the true figure could sit well above or below ours.
        Filings we couldn&apos;t read with confidence are flagged, and some
        years are missing.
      </p>
      <p>
        <strong className="font-medium text-ink">
          What it can and can&apos;t tell you.
        </strong>{" "}
        Comparing a member to themselves over time is more reliable than
        comparing two members. A year-to-year jump can be an asset crossing
        into the next band.
      </p>
    </div>
  );
}
