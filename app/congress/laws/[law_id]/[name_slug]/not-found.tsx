import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Law not found",
  robots: { index: false },
};

export default function LawNotFound() {
  return (
    <main className="mx-auto flex w-full max-w-[42rem] flex-1 flex-col justify-center gap-5 px-6 py-24">
      <p className="font-mono text-[0.72rem] uppercase tracking-[0.14em] text-accent">404 · law</p>
      <h1 className="font-serif text-4xl font-semibold leading-tight tracking-tight">No law with that ID</h1>
      <p className="text-[1.02rem] leading-relaxed text-ink-muted">
        Law pages cover every public law from the 93rd Congress (1973) on, at an address like /congress/laws/118-pub-90. A bill that did not become law, an
        earlier Congress, or a mistyped number lands here.
      </p>
      <Link href="/congress/laws" className="font-mono text-[0.8rem] uppercase tracking-[0.1em] text-accent hover:underline">
        ← Browse the laws
      </Link>
    </main>
  );
}
