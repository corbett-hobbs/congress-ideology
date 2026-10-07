#!/usr/bin/env python3
"""Compare blind syllabus-based labels (valabels/V*.txt) with the metadata-based pilot labels (topic-pilot.csv).
Usage: 12-compare-validation.py <scratch_dir> <topic_pilot_csv> <out_csv>"""
import csv, glob, re, sys, collections, json

S, PILOT, OUT = sys.argv[1:4]
TOP = {"J": "judicial_procedure", "E": "economy_labor", "T": "trade", "N": "energy_environment", "H": "health_education",
       "I": "immigration_justice", "F": "foreign_policy", "S": "national_security", "C": "civil_rights_civic"}
rows = {r["caseId"]: r for r in csv.DictReader(open(f"{S}/SCDB_2026_01_caseCentered_Citation.csv", encoding="latin-1"))}
pilot = {r["caseId"]: r for r in csv.DictReader(open(PILOT))}
iss = json.load(open(f"{S}/issue_labels.json"))
blind = {}
for f in sorted(glob.glob(f"{S}/valabels/V0*.txt")):
    for cid, code, q in re.findall(r"(\d{4}-\d{3})([JETNHISCF])(\?)?", open(f).read()):
        blind[cid] = (TOP[code], bool(q))

out, tot = [], collections.Counter()
by = collections.defaultdict(collections.Counter)
conf = collections.Counter()
for cid, (bt, bq) in sorted(blind.items()):
    p = pilot[cid]; agree = bt == p["topic"]
    area = rows[cid]["issueArea"] or "blank"
    for key in (("method", p["method"]), ("area", area), ("decade", rows[cid]["term"][:3] + "0s"), ("pilot_conf", p["confidence"]), ("blind_conf", "low" if bq else "normal")):
        by[key]["n"] += 1; by[key]["agree"] += agree
    tot["n"] += 1; tot["agree"] += agree
    if not agree: conf[(p["topic"], bt)] += 1
    out.append([cid, rows[cid]["term"], re.sub(r"\s+", " ", rows[cid]["caseName"]).title()[:60], iss.get(rows[cid]["issue"], "")[:50],
                p["method"], p["topic"], bt, "low" if bq else "", "yes" if agree else "NO"])
with open(OUT, "w", newline="") as f:
    w = csv.writer(f); w.writerow(["caseId", "term", "caseName", "scdb_issue", "pilot_method", "pilot_topic", "syllabus_topic", "syllabus_conf_low", "agree"]); w.writerows(out)

print(f"OVERALL agreement {tot['agree']}/{tot['n']} = {tot['agree']/tot['n']:.1%}")
for kind in ("method", "pilot_conf", "blind_conf", "decade", "area"):
    print(f"\nby {kind}")
    for (k, v), c in sorted(by.items()):
        if k == kind: print(f"  {v:10s} {c['agree']:3d}/{c['n']:3d} = {c['agree']/c['n']:5.0%}")
print("\nmost common disagreements (pilot -> syllabus):")
for (a, b), n in conf.most_common(14): print(f"  {n:2d}  {a} -> {b}")
# per pilot topic: precision (when pilot says X, share the syllabus pass agrees)
print("\nwhen the pilot said X, the syllabus pass agreed:")
pt = collections.defaultdict(lambda: [0, 0])
for cid, (bt, _) in blind.items():
    t = pilot[cid]["topic"]; pt[t][1] += 1; pt[t][0] += bt == t
for t, (a, n) in sorted(pt.items(), key=lambda x: -x[1][1]): print(f"  {t:20s} {a}/{n}")
