import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Representative not found",
  robots: { index: false },
};

export default function RepresentativeNotFound() {
  return (
    <main className="mx-auto flex w-full max-w-[42rem] flex-1 flex-col justify-center gap-5 px-6 py-24">
      <p className="font-mono text-[0.72rem] uppercase tracking-[0.14em] text-accent">
        404 · representative
      </p>
      <h1 className="font-serif text-4xl font-semibold leading-tight tracking-tight">
        No representative with that ID
      </h1>
      <p className="text-[1.02rem] leading-relaxed text-ink-muted">
        Profile pages exist for the current (119th) House of Representatives. A
        former member, a senator, or a mistyped ID lands here.
      </p>
      <Link
        href="/?chamber=house"
        className="font-mono text-[0.8rem] uppercase tracking-[0.1em] text-accent hover:underline"
      >
        ← Browse the House
      </Link>
    </main>
  );
}
