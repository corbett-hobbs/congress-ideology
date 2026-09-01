import { dim2Context } from "@/lib/dim2-context";

/**
 * Methodological note under the compass: what dimension 2 represents for the
 * Congress currently shown. Always visible (this is real context, not an
 * aside), and switches era based on the Congress shown. Used under both the
 * explorer compass and the profile-page compass (see lib/dim2-context.ts).
 */
export function Dim2Footnote({ congress }: { congress: number }) {
  const ctx = dim2Context(congress);

  return (
    <div className="mt-4 border-t border-line pt-3">
      <span className="mb-1 block font-mono text-[0.66rem] uppercase tracking-[0.06em] text-accent">
        {ctx.tag}
      </span>
      <p className="m-0 max-w-[46rem] text-[0.8rem] leading-[1.6] text-ink">
        {ctx.body}
      </p>
      <p className="m-0 mt-1 text-[0.75rem] text-ink-muted">
        Source:{" "}
        <a
          href={ctx.sourceHref}
          target="_blank"
          rel="noopener noreferrer"
          className="underline decoration-line-strong underline-offset-2 hover:decoration-accent"
        >
          {ctx.sourceLabel}
        </a>
      </p>
    </div>
  );
}
