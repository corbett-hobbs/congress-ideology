import Link from "next/link";

/**
 * Slim wordmark bar at the very top of every page. The explorer's own sticky
 * toolbar (chamber / state / play / slider) lives below it — see
 * components/senate/ExplorerToolbar.tsx.
 */
export function SiteHeader() {
  return (
    <header className="border-b border-line bg-surface">
      <div className="mx-auto flex h-12 w-full max-w-[1180px] items-center px-4 sm:px-6">
        <Link
          href="/"
          className="font-serif text-[1rem] font-semibold tracking-tight text-ink sm:text-[1.1rem]"
        >
          Congressional Ideology
        </Link>
      </div>
    </header>
  );
}
