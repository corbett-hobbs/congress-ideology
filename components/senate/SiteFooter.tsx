interface SiteFooterProps {
  children?: React.ReactNode;
}

/**
 * Site footer. Carries the Voteview citation required by docs/CREDITS.md now
 * that the data is surfaced in a page.
 */
export function SiteFooter({ children }: SiteFooterProps) {
  return (
    <footer className="flex flex-col items-start gap-[0.85rem] border-t border-line pt-6">
      {children}
      <p className="m-0 max-w-[46rem] text-[0.76rem] leading-[1.6] text-ink-faint">
        Ideology data: Lewis, Jeffrey B., Keith Poole, Howard Rosenthal, Adam
        Boche, Aaron Rudkin &amp; Luke Sonnet (2026),{" "}
        <a
          href="https://voteview.com/"
          className="text-ink-muted underline decoration-line-strong underline-offset-2 hover:decoration-accent"
        >
          <em>Voteview: Congressional Roll-Call Votes Database</em>
        </a>
        . Biographical data:{" "}
        <a
          href="https://github.com/unitedstates/congress-legislators"
          className="text-ink-muted underline decoration-line-strong underline-offset-2 hover:decoration-accent"
        >
          @unitedstates/congress-legislators
        </a>
        . Member photos:{" "}
        <a
          href="https://github.com/unitedstates/images"
          className="text-ink-muted underline decoration-line-strong underline-offset-2 hover:decoration-accent"
        >
          @unitedstates/images
        </a>{" "}
        (public-domain GPO portraits). DW‑NOMINATE scores estimate each
        member&rsquo;s revealed ideology from their voting record, not stated
        beliefs.
      </p>
    </footer>
  );
}
