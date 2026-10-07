#!/usr/bin/env python3
"""Throwaway pre-flight: combine join / CourtListener cluster / CAP / Oyez results for the stratified sample
and print the by-decade tables used in docs/SCDB_CASE_TEXT_PREFLIGHT.md.   Usage: 07-report.py <scratch_dir>"""
import json, sys, collections, statistics, re

S = sys.argv[1]
d = json.load(open(f"{S}/sample.json")); join = json.load(open(f"{S}/join.json"))
cap = json.load(open(f"{S}/cap_cov.json")); oy = json.load(open(f"{S}/oyez_cov2.json"))
cl = {c["id"]: c for c in map(json.loads, open(f"{S}/scotus_clusters.jsonl"))}
dec = lambda t: t[:3] + "0s"

def med(xs):
    return int(statistics.median(xs)) if xs else 0

tab = collections.defaultdict(collections.Counter); lens = collections.defaultdict(list)
for r in d["sample"]:
    b = dec(r["term"]); t = tab[b]; t["n"] += 1
    j = join.get(r["caseId"])
    if j:
        t["joined"] += 1
        c = cl[j["cluster_id"]]
        if c["headmatter_len"] >= 500: t["cl_head500"] += 1
        lens[b + "cl"].append(c["headmatter_len"])
    k = cap[r["caseId"]]
    if "reason" not in k:
        t["cap"] += 1
        if k["head_matter_len"] >= 500: t["cap_head500"] += 1
        if k["opinion_chars"] >= 500: t["cap_op500"] += 1
        lens[b + "cap"].append(k["opinion_chars"])
    o = oy[r["caseId"]]
    if o["matched"]:
        t["oyez_any"] += 1
        if all(o.get(x, 0) > 0 for x in ("facts_of_the_case", "question", "conclusion")): t["oyez_all3"] += 1
    # best-available text: CL headmatter or CAP full text
    if (j and cl[j["cluster_id"]]["headmatter_len"] >= 500) or ("reason" not in k and k["opinion_chars"] >= 500): t["any_text500"] += 1
print("decade   n joined cl_head>=500 cap_found cap_head>=500 cap_op>=500 any_text>=500 oyez_listed oyez_all3 | median CL headmatter / CAP opinion chars")
T = collections.Counter()
for b in sorted(tab):
    t = tab[b]; T.update(t)
    print(f"{b} {t['n']:3d} {t['joined']:5d} {t['cl_head500']:9d} {t['cap']:9d} {t['cap_head500']:12d} {t['cap_op500']:10d} {t['any_text500']:12d} {t['oyez_any']:8d} {t['oyez_all3']:8d} | {med(lens[b+'cl'])} / {med(lens[b+'cap'])}")
t = T
print(f"ALL  {t['n']:3d} {t['joined']:5d} {t['cl_head500']:9d} {t['cap']:9d} {t['cap_head500']:12d} {t['cap_op500']:10d} {t['any_text500']:12d} {t['oyez_any']:8d} {t['oyez_all3']:8d}")
print("\nCAP failure reasons by decade:")
for r in d["sample"]:
    k = cap[r["caseId"]]
    if "reason" in k: print(" ", r["caseId"], r["term"], k["reason"])
sj = json.load(open(f"{S}/search_join.json"))
ok = sum(1 for v in sj.values() if v.get("count") and any(x["cluster_id"] for x in v["results"]))
withid = sum(1 for v in sj.values() if any(x.get("scdb_id") for x in v.get("results", [])))
print(f"\nanonymous /search/ by citation: {ok}/{len(sj)} returned >=1 cluster; {withid} exposed a non-empty scdb_id")
print("skipped (no U.S. cite):", sum(1 for v in sj.values() if "skip" in v))
