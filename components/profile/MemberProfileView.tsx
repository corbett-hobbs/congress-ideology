import Link from "next/link";
import type {
  ChamberMember,
  MemberProfile,
  PartyMeanPoint,
} from "@/lib/congress-types";
import { SiteFooter } from "@/components/senate/SiteFooter";
import { ProfileHeader } from "./ProfileHeader";
import { MemberIdeologySection } from "./MemberIdeologySection";

interface MemberProfileViewProps {
  profile: MemberProfile;
  /** Plottable members of the latest Congress in this chamber (compass). */
  compassMembers: ChamberMember[];
  /** Every member of the latest Congress in this chamber (delegation). */
  delegationMembers: ChamberMember[];
  trend: PartyMeanPoint[];
}

/**
 * A member's profile page: a vertical-neutral identity header followed by one
 * section per content vertical (see lib/verticals.ts). Today that's just
 * ideology; a future vertical (e.g. wealth) is added by dropping its own
 * `<Member…Section>` in below, as a sibling — the existing sections and this
 * shell don't change.
 */
export function MemberProfileView({
  profile,
  compassMembers,
  delegationMembers,
  trend,
}: MemberProfileViewProps) {
  const explorerHref =
    profile.chamber === "house" ? "/?chamber=house" : "/";

  return (
    <main className="mx-auto flex w-full max-w-[1180px] flex-col gap-7 px-6 pb-16 pt-11">
      <div>
        <Link
          href={explorerHref}
          className="font-mono text-[0.72rem] uppercase tracking-[0.1em] text-accent hover:underline"
        >
          ← Congressional Ideology
        </Link>
      </div>

      <ProfileHeader profile={profile} />

      <MemberIdeologySection
        profile={profile}
        compassMembers={compassMembers}
        delegationMembers={delegationMembers}
        trend={trend}
      />

      {/* Future verticals stack here as sibling sections, e.g.
          <MemberWealthSection profile={profile} … /> */}

      <SiteFooter />
    </main>
  );
}
