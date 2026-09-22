import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { RAW_DIR } from "../fetch/lib";
import {
  committee as committeeEntity,
  committeeMembership as committeeMembershipEntity,
  idCrosswalkEntry,
  ideologyScore,
  legislator as legislatorEntity,
  subcommittee as subcommitteeEntity,
  subcommitteeMembership as subcommitteeMembershipEntity,
  term as termEntity,
} from "../../lib/entities";
import { buildIdCrosswalk } from "./crosswalk";
import { buildLegislators } from "./legislators";
import { buildTerms } from "./terms";
import { buildIdeologyScores, KNOWN_UNRESOLVABLE } from "./scores";
import { buildCommittees, buildSubcommittees } from "./committees";
import { buildReport, printReport } from "./report";
import {
  readLegislators,
  readRawCommittees,
  readRawCommitteeMembership,
  readVoteviewMembers,
  writeEntities,
  writeJson,
} from "./io";

/**
 * Transform: raw/ -> normalized, bioguide_id-keyed JSON in output/.
 *
 * Emits id_crosswalk.json, legislators.json, terms.json, ideology_scores.json
 * (each row validated against its schema in lib/entities.ts) plus _report.json.
 * Fatal on a crosswalk conflict, a crosswalk/Voteview bioguide mismatch, or an
 * unresolvable Voteview row that is not in the KNOWN_UNRESOLVABLE allowlist.
 */

class FatalError extends Error {}

async function digest(path: string) {
  const buf = await readFile(path);
  return {
    path,
    bytes: buf.byteLength,
    sha256: createHash("sha256").update(buf).digest("hex"),
  };
}

async function main() {
  console.log("transform");

  const [members, legislators] = await Promise.all([
    readVoteviewMembers(),
    readLegislators(),
  ]);

  const capCongress = Math.max(
    ...members.filter((m) => m.chamber !== "President").map((m) => m.congress),
  );
  console.log(
    `  source: ${members.length} member rows, ${legislators.length} legislators, cap Congress ${capCongress}`,
  );

  // --- id_crosswalk ------------------------------------------------------
  const crosswalk = buildIdCrosswalk(legislators, members);

  if (crosswalk.conflicts.length > 0) {
    const sample = crosswalk.conflicts
      .slice(0, 10)
      .map((c) => `  icpsr ${c.icpsr} -> ${c.bioguides.join(", ")}`)
      .join("\n");
    throw new FatalError(
      `crosswalk: ${crosswalk.conflicts.length} icpsr(s) map to multiple bioguide ids\n${sample}`,
    );
  }

  const unexpected = crosswalk.unresolved.filter(
    (u) => !(u.icpsr in KNOWN_UNRESOLVABLE),
  );
  if (unexpected.length > 0) {
    const sample = unexpected
      .slice(0, 20)
      .map((u) => `  icpsr ${u.icpsr} "${u.bioname}" (Congress ${u.congress})`)
      .join("\n");
    throw new FatalError(
      `crosswalk: ${unexpected.length} Voteview icpsr(s) resolve to no bioguide and are not in scores.ts KNOWN_UNRESOLVABLE:\n${sample}`,
    );
  }
  for (const u of crosswalk.unresolved) {
    console.warn(`  note: dropping icpsr ${u.icpsr} — ${KNOWN_UNRESOLVABLE[u.icpsr]}`);
  }
  await writeEntities("id_crosswalk", idCrosswalkEntry, crosswalk.entries);

  // --- legislators -----------------------------------------------------
  const legislatorEntities = buildLegislators(legislators);
  await writeEntities("legislators", legislatorEntity, legislatorEntities);

  // --- terms ---------------------------------------------------------- -
  const { terms, collisions } = buildTerms(legislators, capCongress);
  await writeEntities("terms", termEntity, terms);

  // --- ideology_scores ---------------------------------------------- -
  const scoresResult = buildIdeologyScores(members, crosswalk);
  if (scoresResult.mismatches.length > 0) {
    const sample = scoresResult.mismatches
      .slice(0, 10)
      .map(
        (m) =>
          `  icpsr ${m.icpsr} "${m.bioname}": crosswalk ${m.crosswalk} vs Voteview ${m.voteview}`,
      )
      .join("\n");
    throw new FatalError(
      `ideology_scores: ${scoresResult.mismatches.length} crosswalk/Voteview bioguide mismatch(es)\n${sample}`,
    );
  }
  await writeEntities("ideology_scores", ideologyScore, scoresResult.scores);

  // --- committees ----------------------------------------------------- -
  const rawCommittees = await readRawCommittees();
  const rawMembership = await readRawCommitteeMembership();
  const committeesResult = buildCommittees(rawCommittees, rawMembership);
  await writeEntities("committees", committeeEntity, committeesResult.committees);
  await writeEntities(
    "committee_memberships",
    committeeMembershipEntity,
    committeesResult.memberships,
  );
  for (const key of committeesResult.duplicateSeats) {
    console.warn(`  note: committee seat listed twice, kept the senior role — ${key}`);
  }
  for (const id of committeesResult.committeesWithoutRoster) {
    console.warn(`  note: committee ${id} has no roster in committee-membership-current.yaml`);
  }

  // --- subcommittees ---------------------------------------------------- -
  const subcommitteesResult = buildSubcommittees(rawCommittees, rawMembership);
  if (subcommitteesResult.unrecognizedRosterKeys.length > 0) {
    const sample = subcommitteesResult.unrecognizedRosterKeys.slice(0, 10).join(", ");
    throw new FatalError(
      `subcommittees: ${subcommitteesResult.unrecognizedRosterKeys.length} committee-membership key(s) match neither a committee nor a known subcommittee\n  ${sample}`,
    );
  }
  await writeEntities("subcommittees", subcommitteeEntity, subcommitteesResult.subcommittees);
  await writeEntities(
    "subcommittee_memberships",
    subcommitteeMembershipEntity,
    subcommitteesResult.memberships,
  );
  for (const key of subcommitteesResult.duplicateSeats) {
    console.warn(`  note: subcommittee seat listed twice, kept the senior role — ${key}`);
  }
  for (const id of subcommitteesResult.subcommitteesWithoutRoster) {
    console.warn(`  note: subcommittee ${id} has no roster in committee-membership-current.yaml`);
  }

  // --- report -------------------------------------------------------- -
  const report = buildReport({
    legislators: legislatorEntities,
    crosswalk,
    terms,
    termCollisions: collisions.length,
    scoresResult,
  });

  await writeJson("_report.json", {
    sources: await Promise.all(
      [
        `${RAW_DIR}/voteview/HSall_members.csv`,
        `${RAW_DIR}/voteview/HSall_parties.csv`,
        `${RAW_DIR}/congress-legislators/legislators-current.yaml`,
        `${RAW_DIR}/congress-legislators/legislators-historical.yaml`,
        `${RAW_DIR}/congress-legislators/committees-current.yaml`,
        `${RAW_DIR}/congress-legislators/committee-membership-current.yaml`,
      ].map(digest),
    ),
    capCongress,
    report,
    committees: {
      total: committeesResult.committees.length,
      byChamber: {
        house: committeesResult.committees.filter((c) => c.chamber === "house").length,
        senate: committeesResult.committees.filter((c) => c.chamber === "senate").length,
        joint: committeesResult.committees.filter((c) => c.chamber === "joint").length,
      },
      membershipRows: committeesResult.memberships.length,
      duplicateSeats: committeesResult.duplicateSeats.length,
      committeesWithoutRoster: committeesResult.committeesWithoutRoster,
    },
    subcommittees: {
      total: subcommitteesResult.subcommittees.length,
      membershipRows: subcommitteesResult.memberships.length,
      duplicateSeats: subcommitteesResult.duplicateSeats.length,
      subcommitteesWithoutRoster: subcommitteesResult.subcommitteesWithoutRoster,
    },
    knownUnresolvable: KNOWN_UNRESOLVABLE,
    droppedUnresolvableRows: scoresResult.unresolvable,
  });

  printReport(report);
  console.log(
    `  committees: ${committeesResult.committees.length}, committee_memberships: ${committeesResult.memberships.length}`,
  );
  console.log(
    `  subcommittees: ${subcommitteesResult.subcommittees.length}, subcommittee_memberships: ${subcommitteesResult.memberships.length}`,
  );
  console.log(
    "  wrote id_crosswalk.json, legislators.json, terms.json, ideology_scores.json, committees.json, committee_memberships.json, subcommittees.json, subcommittee_memberships.json, _report.json",
  );
}

main().catch((err: unknown) => {
  console.error("\ntransform FAILED");
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
