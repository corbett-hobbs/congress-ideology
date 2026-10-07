#!/usr/bin/env python3
"""Throwaway pilot: merge rule labels (08) with hand-run judgement labels (labels/L*.txt) into one topic per SCDB case,
print distribution tables, and write docs/scdb-text-preflight/topic-pilot.csv.
Usage: 09-merge-topics.py <scratch_dir> <out_csv>
Judgement files hold whitespace-separated tokens <caseId><code>[?]; '?' = low confidence (needs_review), as in the EO flow."""
import csv, glob, json, re, sys, collections

S, OUT = sys.argv[1], sys.argv[2]
TOP = {"J": "judicial_procedure", "E": "economy_labor", "T": "trade", "N": "energy_environment", "H": "health_education",
       "I": "immigration_justice", "F": "foreign_policy", "S": "national_security", "C": "civil_rights_civic"}
rows = {r["caseId"]: r for r in csv.DictReader(open(f"{S}/SCDB_2026_01_caseCentered_Citation.csv", encoding="latin-1"))}
rule = json.load(open(f"{S}/rule_labels.json"))
judged = {}
for f in sorted(glob.glob(f"{S}/labels/L*.txt")):
    for cid, code, q in re.findall(r"(\d{4}-\d{3})([JETNHISCF])(\?)?", open(f).read()):
        judged[cid] = (TOP[code], bool(q))
assert set(rule) | set(judged) == set(rows), "coverage mismatch"  # a judgement label overrides a rule label

out = []
for cid, r in rows.items():
    if cid in judged:
        t, q = judged[cid]; out.append((cid, r["term"], t, "judgement", "low" if q else "normal"))
    else:
        out.append((cid, r["term"], TOP[rule[cid]["topic"]], "issue-rule", "normal"))
with open(OUT, "w", newline="") as f:
    w = csv.writer(f); w.writerow(["caseId", "term", "topic", "method", "confidence"]); w.writerows(out)

n = len(out)
cnt = collections.Counter(o[2] for o in out)
print("TOPIC               cases   share   (rule / judgement)")
for t in TOP.values():
    a = sum(1 for o in out if o[2] == t and o[3] == "issue-rule"); b = cnt[t] - a
    print(f"{t:20s}{cnt[t]:6d}  {cnt[t]/n:6.1%}   ({a} / {b})")
print("judgement:", len(judged), " low-confidence:", sum(1 for _, q in judged.values() if q))
# what the rule alone (before judgement) would have said for the queued cases, to show how much judgement changed
dec = lambda t: t[:3] + "0s"
print("\nBY DECADE (share of that decade's cases)")
tops = list(TOP.values())
print("decade   n   " + " ".join(t[:6] for t in tops))
for d in sorted({dec(o[1]) for o in out}):
    sub = [o for o in out if dec(o[1]) == d]; c = collections.Counter(o[2] for o in sub)
    print(f"{d} {len(sub):5d} " + " ".join(f"{c[t]/len(sub):6.0%}" for t in tops))
# five sanity cases
for k in ["2005-086", "1980-136", "1966-113", "1990-020", "1970-086"]:
    o = [x for x in out if x[0] == k][0]; print(k, rows[k]["caseName"][:40], "->", o[2], f"({o[3]}, {o[4]})")
# issue 90120
a = collections.Counter(o[2] for o in out if rows[o[0]]["issue"] == "90120")
print("\nissue 90120 (193):", dict(a))
# liberal-direction share by topic (decisionDirection 2 = liberal, 1 = conservative; 3 = unspecifiable)
print("\ntopic              n_directional  %liberal   (cases coded 1/2 only)")
for t in tops:
    ds = [rows[o[0]]["decisionDirection"] for o in out if o[2] == t and rows[o[0]]["decisionDirection"] in ("1", "2")]
    if ds: print(f"{t:20s}{len(ds):6d}   {sum(1 for x in ds if x=='2')/len(ds):6.1%}")
