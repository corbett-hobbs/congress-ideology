import type { JusticeProfile } from "@/lib/justice-types";
import { partyLabel } from "@/lib/court-types";

const partyVar = (p: "D" | "R") => (p === "D" ? "var(--dem)" : "var(--rep)");

/**
 * A justice's identity block at the top of their profile page: portrait,
 * eyebrow + serif name + three short lines, and a Wikipedia bio. Same
 * structural pattern as `profile/ProfileHeader` (and, like `CommitteeHeader`,
 * it drops the photo slot and reclaims the width when there is no usable
 * portrait). A sibling rather than a generalisation: the lines are justice
 * facts (appointing president, Senate vote), not seat/party/Congress counts.
 *
 * The bio never makes the row taller than the portrait/details: at lg it is an
 * absolutely positioned, clamped column inside a stretched cell; below lg it
 * stacks under the row, unclamped.
 */
export function JusticeHeader({ profile }: { profile: JusticeProfile }) {
  const { justice, identity, bio, photoSrc } = profile;
  const { appointedBy } = identity;

  return (
    <header className="flex flex-col gap-4 lg:flex-row lg:items-stretch lg:gap-0">
      <div className="flex flex-row items-start gap-4 sm:gap-6 lg:flex-none">
        {photoSrc && (
          // A pre-sized static asset from public/ — next/image would add an
          // optimizer this fully-static site deliberately doesn't run.
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={photoSrc}
            alt=""
            width={112}
            height={140}
            className="h-[90px] w-[72px] flex-none rounded-md border border-line-strong bg-surface-raised object-cover object-top sm:h-[140px] sm:w-28"
          />
        )}
        <div className="min-w-0 lg:pr-8">
          <p className="mb-1.5 font-mono text-[0.72rem] uppercase tracking-[0.12em] text-ink-faint">
            Supreme Court · {identity.role}
          </p>
          <h1 className="mb-2 font-serif text-[30px] font-semibold leading-[1.05] tracking-[-0.01em] sm:text-[40px]">
            {justice.name}
          </h1>
          <p className="text-[1rem] text-ink-muted">
            <span
              aria-hidden
              className="mr-1.5 inline-block size-[0.55rem] rounded-full align-middle"
              style={{ background: partyVar(appointedBy.party) }}
            />
            <span className="sr-only">{partyLabel(appointedBy.party)} appointee: </span>
            Appointed by {appointedBy.president} ({appointedBy.party})
          </p>
          <p className="mt-1 text-[0.9rem] text-ink-muted">{identity.served}</p>
          <p className="mt-1 text-[0.9rem] text-ink-muted">{identity.confirmed}</p>
          {identity.elevated && (
            <p className="mt-1 text-[0.9rem] text-ink-muted">{identity.elevated}</p>
          )}
        </div>
      </div>

      {bio && (
        <section
          aria-label="Biography"
          className="border-t border-line pt-4 lg:relative lg:min-w-0 lg:flex-1 lg:border-l lg:border-t-0 lg:pl-8 lg:pt-0"
        >
          <div className="flex flex-col gap-1.5 lg:absolute lg:inset-0 lg:overflow-hidden">
            <p className="flex-none font-mono text-[0.72rem] uppercase tracking-[0.12em] text-ink-faint">
              Biography
            </p>
            <p className="font-serif text-[1.0625rem] leading-[1.35] text-ink lg:line-clamp-4 lg:min-h-0 lg:text-base">
              {bio.extract}
            </p>
            <p className="flex-none text-xs leading-[1.4] text-ink-muted lg:whitespace-nowrap">
              Source:{" "}
              <a
                href={bio.url}
                rel="noopener"
                className="text-accent underline underline-offset-2"
              >
                Wikipedia
              </a>
              ,{" "}
              <a
                href="https://creativecommons.org/licenses/by-sa/4.0/"
                rel="noopener"
                className="text-accent underline underline-offset-2"
              >
                CC BY-SA 4.0
              </a>
            </p>
          </div>
        </section>
      )}
    </header>
  );
}
