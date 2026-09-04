import Link from "next/link";
import type {
  CommitteeProfile,
  CommitteeSummary,
} from "@/lib/committee-types";
import { SiteFooter } from "@/components/senate/SiteFooter";
import { CommitteeHeader } from "./CommitteeHeader";
import { CommitteeCompassCard } from "./CommitteeCompassCard";
import { CommitteeRosterCard } from "./CommitteeRosterCard";

/**
 * A committee's page: the same shape as a member profile
 * (`components/profile/MemberProfileView`) minus the trajectory chart — an
 * identity header, then the compass (committees among committees, this one
 * ringed) and the roster spread side by side.
 */
export function CommitteeProfileView({
  committee,
  compassPool,
  compassBackdrop,
}: {
  committee: CommitteeProfile;
  compassPool: CommitteeSummary[];
  compassBackdrop: { dim1: number | null; dim2: number | null }[];
}) {
  const backHref =
    committee.chamber === "house"
      ? "/?chamber=house&show=committees"
      : committee.chamber === "senate"
        ? "/?chamber=senate&show=committees"
        : "/?show=committees";

  return (
    <main className="mx-auto flex w-full max-w-[1180px] flex-col gap-7 px-6 pb-16 pt-11">
      <div>
        <Link
          href={backHref}
          className="font-mono text-[0.72rem] uppercase tracking-[0.1em] text-accent hover:underline"
        >
          ← InsideGov
        </Link>
      </div>

      <CommitteeHeader committee={committee} />

      <section
        aria-label="Ideology"
        className="grid grid-cols-1 items-start gap-5 lg:grid-cols-2 lg:items-stretch"
      >
        <CommitteeCompassCard
          committee={committee}
          pool={compassPool}
          backdrop={compassBackdrop}
        />
        <CommitteeRosterCard committee={committee} />
      </section>

      <SiteFooter />
    </main>
  );
}
