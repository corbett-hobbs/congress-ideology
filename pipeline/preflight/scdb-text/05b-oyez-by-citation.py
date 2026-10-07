#!/usr/bin/env python3
"""Throwaway pre-flight (Q7, redo): 05 looked Oyez cases up by term/docket, which returns an unrelated listing when
Oyez's docket string differs (e.g. old terms). This version pulls Oyez's per-term case listing and matches the
sample by U.S. citation (volume+page), falling back to docket, then fetches the case record. Stores lengths only.
Usage: 05b-oyez-by-citation.py <scratch_dir>  -> <scratch_dir>/oyez_cov2.json
"""
import json, re, subprocess, sys, time, collections

S = sys.argv[1]
d = json.load(open(f"{S}/sample.json"))
cases = d["sample"] + d["sanity"]

def get(url):
    for i in range(3):
        p = subprocess.run(["curl", "-s", "-A", "Mozilla/5.0 (research preflight)", "-w", "\n%{http_code}", url], capture_output=True, text=True)
        body, _, code = p.stdout.rpartition("\n")
        if code == "200":
            try:
                return json.loads(body)
            except Exception:
                return None
        if code == "404":
            return None
        time.sleep(2)
    return None

terms = sorted({r["term"] for r in cases})
listing = {}
for t in terms:
    # per_page=0 returns the whole term in one response on the public API
    listing[t] = get(f"https://api.oyez.org/cases?per_page=0&filter=term:{t}") or []
    time.sleep(0.25)
print("terms fetched", len(listing), "cases listed", sum(len(v) for v in listing.values()))

out = {}
for r in cases:
    m = re.match(r"(\d+) U\.S\. (\d+)$", r["usCite"].strip())
    cand = None
    for c in listing.get(r["term"], []):
        cit = c.get("citation") or {}
        if m and cit.get("volume") == m.group(1) and cit.get("page") == m.group(2):
            cand = c; break
    how = "cite"
    if not cand:
        for c in listing.get(r["term"], []):
            if (c.get("docket_number") or "").strip() == r["docket"].strip():
                cand = c; how = "docket"; break
    rec = {"matched": bool(cand), "how": how if cand else None}
    if cand:
        full = get(cand["href"])
        if isinstance(full, dict):
            for k in ("facts_of_the_case", "question", "conclusion"):
                rec[k] = len((full.get(k) or "").strip())
        time.sleep(0.25)
    out[r["caseId"]] = rec
json.dump(out, open(f"{S}/oyez_cov2.json", "w"))
print("done", len(out), collections.Counter((v["matched"]) for v in out.values()))
