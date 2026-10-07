#!/usr/bin/env python3
"""Throwaway pre-flight (Q8): can SCDB petitioner/respondent codes name the agency or
organization in issue-90120 ("judicial review of agency action") cases?

Usage: 02-party-codes.py <scratch_dir>
Needs <scratch_dir>/SCDB_2026_01_caseCentered_Citation.csv and <scratch_dir>/petitioner.txt
(plain text of https://scdb.la.psu.edu/online-codebook/petitioner/ ; codes are the same for respondent).
"""
import csv, re, sys, collections

S = sys.argv[1]
txt = open(f"{S}/petitioner.txt").read()
txt = txt[txt.index("Values:") + 7:]
# Codes are ascending integers (with gaps): accept the next number that is within 12 of the last one (or the start of a 100/300/500 block).
txt = txt.split("Identification Variables")[0]
marks, last = [], 0
for m in re.finditer(r"(?:(?<=\s)|^)(\d{1,3}) (?=[A-Za-z])", txt):
    n = int(m.group(1))
    if last < n <= last + 12 or n in (100, 301, 501, 600) and n > last:
        marks.append((m.start(), n, m.end())); last = n
codes = {}
for i, (st, n, e) in enumerate(marks):
    nxt = marks[i + 1][0] if i + 1 < len(marks) else len(txt)
    codes[n] = txt[e:nxt].strip()
print("parsed codes:", len(codes), "max", max(codes))

rows = list(csv.DictReader(open(f"{S}/SCDB_2026_01_caseCentered_Citation.csv", encoding="latin-1")))
sel = [r for r in rows if r["issue"] == "90120"]
print("issue 90120 cases:", len(sel))

def lab(c):
    return codes.get(int(c), f"?{c}") if c else ""

# Agency/organisation-type codes: 300-390 = named federal agencies/departments, 8 = governmental employee,
# 21/22 = school board/district, 150 = environmental org, etc. "named" = either party is a code >= 300.
named = [r for r in sel if (r["petitioner"] and int(r["petitioner"]) >= 300) or (r["respondent"] and int(r["respondent"]) >= 300)]
print("with a named federal agency (code>=300) on either side:", len(named), f"({len(named)/len(sel):.0%})")
cnt = collections.Counter()
for r in sel:
    for k in ("petitioner", "respondent"):
        if r[k] and int(r[k]) >= 300:
            cnt[lab(r[k])] += 1
print("\nTop agency labels in 90120 cases:")
for k, v in cnt.most_common(40):
    print(f"  {v:3d}  {k}")
# the generic bucket
gen = collections.Counter(lab(r[k]) for r in sel for k in ("petitioner", "respondent") if r[k] and int(r[k]) < 300)
print("\nTop non-agency labels:")
for k, v in gen.most_common(15):
    print(f"  {v:3d}  {k}")
print("\nlawType distribution (90120):", collections.Counter(r["lawType"] for r in sel).most_common())
print("lawSupp distribution (90120) top 12:", collections.Counter(r["lawSupp"] for r in sel).most_common(12))
print("adminAction filled:", sum(1 for r in sel if r["adminAction"]), "of", len(sel))

# Which 90120 cases name an agency in ANY of petitioner / respondent / adminAction?
# adminAction has its own code list, but for federal agencies it is the party code minus 300 (44 = FERC = party 344,
# 52 = FPC = party 352 ...; verified on the codebook pages), so adminAction+300 puts both on one scale.
def agency_ids(r):
    out = set()
    for k in ("petitioner", "respondent"):
        if r[k] and 300 <= int(r[k]) < 500:
            out.add(int(r[k]))
    if r["adminAction"] and int(r["adminAction"]) < 100:
        out.add(300 + int(r["adminAction"]))
    return out
any_named = [r for r in sel if agency_ids(r)]
print(f"\nnamed agency in petitioner|respondent|adminAction: {len(any_named)} of {len(sel)} ({len(any_named)/len(sel):.0%})")
FAMILY = {  # coarse agency -> likely topic, for sizing only (not a crosswalk)
    "energy_env": {302, 310, 325, 326, 333, 342, 344, 352, 385, 409, 410, 194},
    "health_edu": {340, 362, 363, 330, 397, 399, 406},
    "national_security": {303, 306, 314, 322, 324, 377, 386, 407},
    "labor_econ": {311, 331, 347, 371, 374, 382, 383, 384, 391, 392, 393, 401, 402},
    "trade_foreign": {316, 321, 328, 349, 348},
    "immigration_justice": {307, 323, 327, 335, 336, 368, 411, 413, 422},
}
fam = collections.Counter()
for r in sel:
    ids = agency_ids(r); hit = [f for f, s in FAMILY.items() if ids & s]
    fam[hit[0] if hit else ("other_agency" if ids else "no_agency")] += 1
print("coarse family of 90120 cases:", dict(fam))
