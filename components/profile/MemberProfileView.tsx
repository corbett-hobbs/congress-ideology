import type {
  ChamberMember,
  MemberProfile,
  PartyMeanPoint,
} from "@/lib/congress-types";
import type { MemberCommitteeMembership } from "@/lib/committee-types";
import { SiteFooter } from "@/components/senate/SiteFooter";
import { SetBackLink } from "@/components/BackLinkContext";
import { ProfileHeader } from "./ProfileHeader";
import { MemberIdeologySection } from "./MemberIdeologySection";
import { CommitteeMembershipsCard } from "./CommitteeMembershipsCard";

interface MemberProfileViewProps {
  profile: MemberProfile;
  /** Plottable members of the latest Congress in this chamber (compass). */
  compassMembers: ChamberMember[];
  /** Every member of the latest Congress in this chamber (delegation). */
  delegationMembers: ChamberMember[];
  trend: PartyMeanPoint[];
  /** This member's current committee assignments — empty for the small
   *  share of current members with no current committee seat. */
  committeeMemberships: MemberCommitteeMembership[];
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
  committeeMemberships,
}: MemberProfileViewProps) {
  const explorerHref =
    profile.chamber === "house" ? "/?chamber=house" : "/";

  return (
    <main className="mx-auto flex w-full max-w-[1180px] flex-col gap-7 px-6 pb-16 pt-11">
      <SetBackLink href={explorerHref} />

      <ProfileHeader profile={profile} />

      <MemberIdeologySection
        profile={profile}
        compassMembers={compassMembers}
        delegationMembers={delegationMembers}
        trend={trend}
      />

      <CommitteeMembershipsCard
        profile={profile}
        memberships={committeeMemberships}
      />

      {/* Future verticals stack here as sibling sections, e.g.
          <MemberWealthSection profile={profile} … /> */}

      <SiteFooter />
    </main>
  );
}
