#!/usr/bin/env python3
"""Throwaway pre-flight: draw the stratified sample (deterministic) used by Q2/Q3/Q7.

~22 cases per decade bucket (1946-49, 1950s ... 2020s) = 200, round-robin over SCDB issueArea inside each
bucket so every area shows up. Also marks the first 30 (spread across buckets) as the "join-key" subsample
and always adds the five sanity cases.
Usage: 04-sample.py <scratch_dir>  ->  <scratch_dir>/sample.json
"""
import csv, json, random, sys, collections

S = sys.argv[1]
rows = list(csv.DictReader(open(f"{S}/SCDB_2026_01_caseCentered_Citation.csv", encoding="latin-1")))
rnd = random.Random(20261006)
buckets = collections.defaultdict(list)
for r in rows:
    buckets[r["term"][:3] + "0s"].append(r)
PER = 22
sample = []
for b in sorted(buckets):
    byarea = collections.defaultdict(list)
    for r in buckets[b]:
        byarea[r["issueArea"]].append(r)
    for a in byarea:
        rnd.shuffle(byarea[a])
    picked, areas = [], sorted(byarea)
    while len(picked) < PER and any(byarea.values()):
        for a in areas:
            if byarea[a] and len(picked) < PER:
                picked.append(byarea[a].pop())
    sample += picked
SANITY = ["2005-086", "1980-136", "1966-113", "1990-020", "1970-086"]  # Hamdan, Rostker, Udall, Mobil Oil, Moore v. Charlotte-Mecklenburg
sanity = [r for r in rows if r["caseId"] in SANITY]
ids = {r["caseId"] for r in sample}
extra = [r for r in sanity if r["caseId"] not in ids]
keep = ["caseId", "usCite", "lexisCite", "docket", "term", "issue", "issueArea", "decisionDirection", "caseName", "petitioner", "respondent", "lawType"]
out = {"sample": [{k: r[k] for k in keep} for r in sample],
       "sanity": [{k: r[k] for k in keep} for r in sanity]}
# join-key subsample: every ~7th of the sample so all decades appear
out["join30"] = [r["caseId"] for r in sample[:: max(1, len(sample) // 30)]][:30]
json.dump(out, open(f"{S}/sample.json", "w"), indent=1)
print(len(sample), "sample;", len(sanity), "sanity;", len(out["join30"]), "join30")
print(collections.Counter(r["term"][:3] + "0s" for r in sample))
print([ (r["caseId"], r["caseName"][:40]) for r in sanity])
