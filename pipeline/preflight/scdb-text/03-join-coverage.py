#!/usr/bin/env python3
"""Throwaway pre-flight (Q2/Q3): join SCDB cases to CourtListener clusters and measure
cluster-level coverage (match method, syllabus, headnotes) by decade.

Usage: 03-join-coverage.py <scratch_dir>   (needs scotus_clusters.jsonl from 01-extract-clusters.py)
Writes <scratch_dir>/join.json (per-SCDB-case match) and prints tables.
"""
import csv, json, re, sys, collections, difflib, html

S = sys.argv[1]
scdb = list(csv.DictReader(open(f"{S}/SCDB_2026_01_caseCentered_Citation.csv", encoding="latin-1")))
clusters = [json.loads(l) for l in open(f"{S}/scotus_clusters.jsonl")]
by_id = {c["id"]: c for c in clusters}
by_scdb = collections.defaultdict(list)
for c in clusters:
    if c["scdb_id"]:
        by_scdb[c["scdb_id"]].append(c)

# U.S. cite -> clusters, via the citations file again (cheap: re-read)
import bz2, glob
csv.field_size_limit(1 << 30)
want = {}
for r in scdb:
    m = re.match(r"(\d+) U\.S\. (\d+)$", r["usCite"].strip())
    if m:
        want[(m.group(1), m.group(2))] = 1
by_cite = collections.defaultdict(set)
with bz2.open(glob.glob(f"{S}/cl/citations-*.csv.bz2")[0], "rt", encoding="utf-8", newline="") as f:
    for row in csv.DictReader(f, escapechar="\\"):
        if row["reporter"] == "U.S." and (row["volume"], row["page"]) in want:
            by_cite[(row["volume"], row["page"])].add(row["cluster_id"])

def norm(s):
    return re.sub(r"[^a-z0-9 ]", "", html.unescape(s).lower())

out, method = {}, collections.Counter()
for r in scdb:
    cid = r["caseId"]
    cand, how = by_scdb.get(cid, []), "scdb_id"
    if not cand:
        m = re.match(r"(\d+) U\.S\. (\d+)$", r["usCite"].strip())
        if m:
            cand = [by_id[c] for c in by_cite.get((m.group(1), m.group(2)), ()) if c in by_id]
            how = "usCite"
    if not cand:
        out[cid] = None; method["none"] += 1; continue
    if len(cand) > 1:  # several clusters share a page (companion cases, cert-order dockets): pick by name + year
        yr = r["term"]
        cand.sort(key=lambda c: -difflib.SequenceMatcher(None, norm(c["case_name"]), norm(r["caseName"])).ratio())
        how += "+multi"
    out[cid] = {"cluster_id": cand[0]["id"], "how": how, "n_cand": len(cand)}
    method[how] += 1
print("match method:", dict(method))
json.dump(out, open(f"{S}/join.json", "w"))

def dec(t):
    return f"{t[:3]}0s"

tab = collections.defaultdict(lambda: collections.Counter())
for r in scdb:
    d = dec(r["term"]); j = out[r["caseId"]]; tab[d]["n"] += 1
    if not j: continue
    c = by_id[j["cluster_id"]]
    tab[d]["matched"] += 1
    if c["syllabus_len"] >= 500: tab[d]["syl500"] += 1
    if c["syllabus_len"] > 0: tab[d]["syl>0"] += 1
    if c["headnotes_len"] >= 500: tab[d]["head500"] += 1
    if c["summary_len"] >= 500: tab[d]["sum500"] += 1
    if c["headmatter_len"] >= 500: tab[d]["hm500"] += 1
    if c["syllabus_len"] >= 500 or c["headnotes_len"] >= 500 or c["summary_len"] >= 500: tab[d]["anysyn500"] += 1
print("\ndecade     n  matched  syl>0  syl>=500  head>=500  sum>=500  headmatter>=500  any-synopsis>=500")
T = collections.Counter()
for d in sorted(tab):
    t = tab[d]; T.update(t)
    print(f"{d}  {t['n']:5d} {t['matched']:6d} {t['syl>0']:6d} {t['syl500']:8d} {t['head500']:9d} {t['sum500']:9d} {t['hm500']:14d} {t['anysyn500']:14d}")
t = T
print(f"ALL    {t['n']:5d} {t['matched']:6d} {t['syl>0']:6d} {t['syl500']:8d} {t['head500']:9d} {t['sum500']:9d} {t['hm500']:14d} {t['anysyn500']:14d}")
print("\ncluster `source` codes among matched:", collections.Counter(by_id[j['cluster_id']]['source'] for j in out.values() if j).most_common())
