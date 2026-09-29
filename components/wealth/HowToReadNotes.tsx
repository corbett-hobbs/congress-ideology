export function HowToReadNotes() {
  return (
    <div className="mt-2 flex flex-col gap-3">
      <p>
        <strong className="font-medium text-ink">
          What&apos;s in a filing.
        </strong>{" "}
        Each year, members report the previous year&apos;s assets
        (stocks, funds, real estate other than a personal residence,
        retirement accounts, business interests, bank accounts) and
        liabilities (loans, credit lines, and mortgages on property
        other than a personal residence). Holdings of a spouse or
        dependent child are included; a member&apos;s home, personal
        vehicles, and household goods generally are not.
      </p>
      <p>
        <strong className="font-medium text-ink">Why ranges.</strong>{" "}
        Disclosure rules require reporting each item within a set band,
        not an exact amount. The bands widen as values grow, from a few
        thousand dollars at the low end to millions at the top, so the
        biggest holdings are the least precisely known. The highest
        band is open-ended: &ldquo;over $X&rdquo; has no ceiling, so a
        member with a very large holding is shown with a floor, not an
        estimate.
      </p>
      <p>
        <strong className="font-medium text-ink">
          How we estimate.
        </strong>{" "}
        Net worth is the sum of asset midpoints minus the sum of
        liability midpoints. Because each item can sit anywhere in its
        band, the true figure could be well above or below ours, and
        the gap grows with the number of large holdings. Each filing is
        also parsed from a PDF or report, so filings we couldn&apos;t
        read with confidence are flagged, and some years are missing.
      </p>
      <p>
        <strong className="font-medium text-ink">
          What it can and can&apos;t tell you.
        </strong>{" "}
        Comparing a member to themselves over time is more reliable than
        comparing two members, since the same reporting quirks apply
        each year. A jump from one year to the next can reflect a real
        change or just an asset crossing into the next band.
      </p>
    </div>
  );
}
