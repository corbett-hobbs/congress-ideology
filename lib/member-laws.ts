import type { LawsArea, LawsList, MemberLaws } from "./laws-types";

/** The law id the list's tuple stands for (`118-pub-90`). */
export const lawIdOf = (r: LawsList["rows"][number]): string => `${r[0]}-pub-${r[1]}`;

/**
 * Who sponsored and cosponsored each law, by bioguide id, folded into one lookup: member -> law id -> role (1 sponsor,
 * 0 cosponsor). A member who is both on one law counts as its sponsor.
 */
export function indexMemberRoles(
  sponsors: Iterable<{ law_id: string; sponsor_bioguide_id: string | null }>,
  cosponsors: Record<string, readonly string[]>,
): Map<string, Map<string, 0 | 1>> {
  const out = new Map<string, Map<string, 0 | 1>>();
  const put = (id: string, law: string, role: 0 | 1) => {
    let m = out.get(id);
    if (!m) out.set(id, (m = new Map()));
    if (role === 1 || !m.has(law)) m.set(law, role);
  };
  for (const [law, ids] of Object.entries(cosponsors)) for (const id of ids) put(id, law, 0);
  for (const l of sponsors) if (l.sponsor_bioguide_id) put(l.sponsor_bioguide_id, l.law_id, 1);
  return out;
}

/** The full list cut down to one member's laws (newest first, as the list is), with its sponsor and signer tables re-indexed. */
export function buildMemberLaws(list: LawsList, areas: LawsArea[], roles: ReadonlyMap<string, 0 | 1> | undefined): MemberLaws {
  const sponsors: LawsList["sponsors"] = [];
  const signers: LawsList["signers"] = [];
  const sponsorMap = new Map<number, number>();
  const signerMap = new Map<number, number>();
  const rows: LawsList["rows"] = [];
  const outRoles: (0 | 1)[] = [];
  for (const r of list.rows) {
    const role = roles?.get(lawIdOf(r));
    if (role === undefined) continue;
    let si = -1;
    if (r[8] >= 0) {
      si = sponsorMap.get(r[8]) ?? sponsors.push(list.sponsors[r[8]]!) - 1;
      sponsorMap.set(r[8], si);
    }
    const gi = signerMap.get(r[13]) ?? signers.push(list.signers[r[13]]!) - 1;
    signerMap.set(r[13], gi);
    rows.push([...r.slice(0, 8), si, ...r.slice(9, 13), gi, r[14]] as unknown as LawsList["rows"][number]);
    outRoles.push(role);
  }
  return { rows, sponsors, signers, areas, roles: outRoles };
}
