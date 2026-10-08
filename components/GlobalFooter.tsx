import Link from "next/link";
import { siteInfo } from "@/lib/site-info";

const LINK =
  "text-ink-muted underline-offset-2 hover:text-ink hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent";

/**
 * The site-wide footer, rendered once by the root layout: a wrapping row of links,
 * a hairline, then the disclaimer and the Voteview citation (docs/CREDITS.md).
 * Page-specific source lines (e.g. `senate/SiteFooter`) stay on their pages.
 * Only links to routes that exist belong here.
 */
export function GlobalFooter() {
  return (
    <footer className="border-t border-line bg-surface">
      <div className="mx-auto w-full max-w-[1180px] px-4 sm:px-6">
        <nav aria-label="About InsideGov and project" className="pb-4 pt-5">
          <ul className="m-0 flex list-none flex-wrap gap-x-[22px] gap-y-1.5 p-0 text-[0.88rem]">
            <li><Link href="/about" className={LINK}>About</Link></li>
            <li><Link href="/methodology" className={LINK}>Methodology and sources</Link></li>
            <li><Link href="/contact" className={LINK}>Contact and corrections</Link></li>
            <li><a href={siteInfo.githubUrl} className={LINK}>GitHub</a></li>
            <li><a href="/sitemap.xml" className={LINK}>Sitemap</a></li>
          </ul>
        </nav>
        <div className="flex flex-col gap-1.5 border-t border-line pb-6 pt-4 text-[0.78rem] leading-[1.6] text-ink-muted">
          <p className="m-0">
            InsideGov is an independent project and is not affiliated with any government agency or political party.
          </p>
          <p className="m-0">
            Ideology data: Lewis, Poole, Rosenthal, Boche, Rudkin &amp; Sonnet,{" "}
            <a href="https://voteview.com/" className="underline decoration-line-strong underline-offset-2 hover:decoration-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent">
              <em>Voteview: Congressional Roll-Call Votes Database</em>
            </a>
            . Full credits on{" "}
            <Link href="/methodology" className="underline decoration-line-strong underline-offset-2 hover:decoration-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent">
              Methodology and sources
            </Link>
            .
          </p>
        </div>
      </div>
    </footer>
  );
}
