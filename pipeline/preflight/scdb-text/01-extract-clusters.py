#!/usr/bin/env python3
"""Throwaway pre-flight: pull SCOTUS clusters out of CourtListener's bulk
opinion-clusters + citations CSVs (public domain, no token) and join them to SCDB.

Usage: 01-extract-clusters.py <scratch_dir>
  <scratch_dir>/SCDB_2026_01_caseCentered_Citation.csv   (latin-1)
  <scratch_dir>/cl/citations-*.csv.bz2, opinion-clusters-*.csv.bz2
Writes <scratch_dir>/scotus_clusters.jsonl (not committed).
"""
# NOTE: CourtListener bulk CSVs are Postgres COPY output with backslash-escaped quotes; escapechar is required.
import bz2, csv, glob, json, re, sys, os

csv.field_size_limit(1 << 30)
S = sys.argv[1]
scdb = list(csv.DictReader(open(f"{S}/SCDB_2026_01_caseCentered_Citation.csv", encoding="latin-1")))

def parse_us(c):
    m = re.match(r"(\d+) U\.S\. (\d+)$", c.strip())
    return (m.group(1), m.group(2)) if m else None

scdb_ids = {r["caseId"] for r in scdb}
want = {}
for r in scdb:
    k = parse_us(r["usCite"])
    if k:
        want.setdefault(k, []).append(r["caseId"])
print("SCDB rows", len(scdb), "with U.S. cite", sum(len(v) for v in want.values()))

cl_by_cite = {}  # (vol,page) -> set(cluster_id)
cit_path = glob.glob(f"{S}/cl/citations-*.csv.bz2")[0]
with bz2.open(cit_path, "rt", encoding="utf-8", newline="") as f:
    for row in csv.DictReader(f, escapechar="\\"):
        if row["reporter"] == "U.S.":
            k = (row["volume"], row["page"])
            if k in want:
                cl_by_cite.setdefault(k, set()).add(row["cluster_id"])
cids = {c for v in cl_by_cite.values() for c in v}
print("citation keys matched", len(cl_by_cite), "clusters", len(cids))

clu_path = glob.glob(f"{S}/cl/opinion-clusters-*.csv.bz2")[0]
n = kept = 0
with bz2.open(clu_path, "rt", encoding="utf-8", newline="") as f, open(f"{S}/scotus_clusters.jsonl", "w") as out:
    for row in csv.DictReader(f, escapechar="\\"):
        n += 1
        row = {k: (v or '') for k, v in row.items() if k}
        if row["id"] in cids or row["scdb_id"] in scdb_ids:
            kept += 1
            out.write(json.dumps({
                "id": row["id"], "case_name": row["case_name"], "scdb_id": row["scdb_id"],
                "date_filed": row["date_filed"], "source": row["source"], "docket_id": row["docket_id"],
                "syllabus": row["syllabus"][:6000], "syllabus_len": len(row["syllabus"]),
                "headnotes_len": len(row["headnotes"]), "headmatter": row["headmatter"][:8000], "headnotes": row["headnotes"][:3000], "summary_len": len(row["summary"]),
                "headmatter_len": len(row["headmatter"]), "proc_len": len(row["procedural_history"]),
                "posture": row["posture"], "disposition": row["disposition"],
                "harvard_json": row["filepath_json_harvard"],
            }) + "\n")
        if n % 2_000_000 == 0:
            print(n, kept, flush=True)
print("clusters scanned", n, "kept", kept)
