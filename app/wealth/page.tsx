import type { Metadata } from "next";
import Link from "next/link";

// Placeholder landing for the Wealth vertical. The nav slot and route exist so
// future sessions can build this out in place; there is no net-worth data or
// feature yet. Kept out of the index until it's real.
export const metadata: Metadata = {
  title: "Wealth",
  description: "Congressional net worth — coming soon.",
  robots: { index: false },
  alternates: { canonical: "/wealth" },
};

export default function WealthPage() {
  return (
    <main className="mx-auto flex w-full max-w-[42rem] flex-1 flex-col justify-center gap-5 px-6 py-24">
      <p className="font-mono text-[0.72rem] uppercase tracking-[0.14em] text-accent">
        Wealth · coming soon
      </p>
      <h1 className="font-serif text-4xl font-semibold leading-tight tracking-tight">
        Congressional net worth
      </h1>
      <p className="text-[1.02rem] leading-relaxed text-ink-muted">
        A second vertical, alongside ideology: how much members of Congress are
        worth, and how that has changed. Not built yet — this page is a
        placeholder so the section has a home.
      </p>
      <Link
        href="/"
        className="font-mono text-[0.8rem] uppercase tracking-[0.1em] text-accent hover:underline"
      >
        ← Ideology explorer
      </Link>
    </main>
  );
}
