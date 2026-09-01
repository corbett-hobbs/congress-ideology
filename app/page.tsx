export default function Home() {
  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col justify-center gap-6 px-6 py-24">
      <p className="font-mono text-xs uppercase tracking-[0.14em] text-accent">
        Foundation stage
      </p>
      <h1 className="font-serif text-4xl font-semibold leading-tight tracking-tight text-balance sm:text-5xl">
        congress-ideology
      </h1>
      <p className="max-w-prose text-lg leading-relaxed text-ink-muted text-pretty">
        A data-driven directory of every member of the U.S. Congress — profile
        pages, filters, and visualizations built on their voting record. The
        scaffold, data pipeline, and conventions are in place; feature pages come
        next.
      </p>
      <p className="max-w-prose leading-relaxed text-ink-faint">
        Ideology scores from{" "}
        <a
          className="text-ink underline decoration-line-strong underline-offset-4 hover:decoration-accent"
          href="https://voteview.com"
        >
          Voteview
        </a>
        . See <code className="font-mono text-[0.9em]">docs/</code> for data
        conventions and attribution.
      </p>
    </main>
  );
}
