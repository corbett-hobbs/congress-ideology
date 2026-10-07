#!/usr/bin/env python3
"""Throwaway pre-flight (Q3 / Q11): text coverage of the sample in the Harvard Caselaw Access Project static
bulk (static.case.law/us/<vol>/...), which is public and needs no token. Records lengths only.

Usage: 06-cap-coverage.py <scratch_dir>   (needs sample.json; join.json + scotus_clusters.jsonl optional)
Writes <scratch_dir>/cap_cov.json.
"""
import json, re, subprocess, sys, time, collections

S = sys.argv[1]
d = json.load(open(f"{S}/sample.json"))
cases = d["sample"] + d["sanity"]

def curl(url):
    for i in range(3):
        p = subprocess.run(["curl", "-s", "-A", "Mozilla/5.0", "-w", "\n%{http_code}", url], capture_output=True, text=True)
        body, _, code = p.stdout.rpartition("\n")
        if code == "200":
            return json.loads(body)
        if code == "404":
            return None
        time.sleep(2)
    return None

meta = {}
out = {}
for r in cases:
    m = re.match(r"(\d+) U\.S\. (\d+)$", r["usCite"].strip())
    if not m:
        out[r["caseId"]] = {"reason": "no U.S. cite"}; continue
    vol, page = m.groups()
    if vol not in meta:
        meta[vol] = curl(f"https://static.case.law/us/{vol}/CasesMetadata.json")
    if not meta[vol]:
        out[r["caseId"]] = {"reason": f"volume {vol} not in CAP"}; continue
    hits = [c for c in meta[vol] if c["first_page"] == page]
    pick = None
    for c in hits:
        if any(x["cite"] == f"SCDB {r['caseId']}" or x["cite"].startswith("SCDB " + r["caseId"]) for x in c.get("citations", [])):
            pick = c; break
    how = "scdb-vendor-cite"
    if not pick and hits:
        pick, how = hits[0], "first_page"
    if not pick:
        out[r["caseId"]] = {"reason": "no case at page"}; continue
    full = curl(f"https://static.case.law/us/{vol}/cases/{pick['file_name']}.json")
    if not full:
        out[r["caseId"]] = {"reason": "case json 404"}; continue
    cb = full["casebody"]
    hm = cb.get("head_matter") or ""
    ops = cb.get("opinions", [])
    out[r["caseId"]] = {"how": how, "n_hits": len(hits), "head_matter_len": len(hm),
                        "has_syllabus_word": bool(re.search(r"syllabus", hm, re.I)),
                        "opinion_chars": sum(len(o["text"]) for o in ops), "n_opinions": len(ops),
                        "first_opinion_chars": len(ops[0]["text"]) if ops else 0,
                        "source": full.get("provenance", {}).get("source"), "ocr": (full.get("analysis") or {}).get("ocr_confidence")}
    time.sleep(0.1)
json.dump(out, open(f"{S}/cap_cov.json", "w"))
print("done", len(out), collections.Counter(v.get("reason", "ok") for v in out.values()))
