import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Justice not found",
  robots: { index: false },
};

export default function JusticeNotFound() {
  return (
    <main className="mx-auto flex w-full max-w-[42rem] flex-1 flex-col justify-center gap-5 px-6 py-24">
      <p className="font-mono text-[0.72rem] uppercase tracking-[0.14em] text-accent">
        404 · justice
      </p>
      <h1 className="font-serif text-4xl font-semibold leading-tight tracking-tight">
        No justice with that ID
      </h1>
      <p className="text-[1.02rem] leading-relaxed text-ink-muted">
        Profile pages exist for every justice with Martin&ndash;Quinn scores, from
        the 1937 term on. A justice who left the Court earlier, or a mistyped ID,
        lands here.
      </p>
      <Link
        href="/supreme-court/ideology"
        className="font-mono text-[0.8rem] uppercase tracking-[0.1em] text-accent hover:underline"
      >
        ← Browse the Court
      </Link>
    </main>
  );
}
