import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Page not found",
  robots: { index: false },
};

export default function NotFound() {
  return (
    <main className="mx-auto flex w-full max-w-[42rem] flex-1 flex-col justify-center gap-5 px-6 py-24">
      <p className="font-mono text-[0.72rem] uppercase tracking-[0.14em] text-accent">
        404
      </p>
      <h1 className="font-serif text-4xl font-semibold leading-tight tracking-tight">
        This page doesn&rsquo;t exist
      </h1>
      <p className="text-[1.02rem] leading-relaxed text-ink-muted">
        The link may be stale, or point to a former senator — only current
        senators have profile pages so far.
      </p>
      <Link
        href="/"
        className="font-mono text-[0.8rem] uppercase tracking-[0.1em] text-accent hover:underline"
      >
        ← InsideGov
      </Link>
    </main>
  );
}
