import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { RAW_DIR } from "../fetch/lib";
import {
  idCrosswalkEntry,
  ideologyScore,
  legislator as legislatorEntity,
  term as termEntity,
} from "../../lib/entities";
import { buildIdCrosswalk } from "./crosswalk";
import { buildLegislators } from "./legislators";
import { buildTerms } from "./terms";
import { buildIdeologyScores, KNOWN_UNRESOLVABLE } from "./scores";
import { buildReport, printReport } from "./report";
import {
  readLegislators,
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
      ].map(digest),
    ),
    capCongress,
    report,
    knownUnresolvable: KNOWN_UNRESOLVABLE,
    droppedUnresolvableRows: scoresResult.unresolvable,
  });

  printReport(report);
  console.log(
    "  wrote id_crosswalk.json, legislators.json, terms.json, ideology_scores.json, _report.json",
  );
}

main().catch((err: unknown) => {
  console.error("\ntransform FAILED");
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
