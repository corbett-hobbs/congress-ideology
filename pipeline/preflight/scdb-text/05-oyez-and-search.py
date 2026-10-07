#!/usr/bin/env python3
"""Throwaway pre-flight (Q2 join key via anonymous CourtListener search, Q7 Oyez coverage).

Usage: 05-oyez-and-search.py <scratch_dir>   (needs sample.json from 04-sample.py)
Writes <scratch_dir>/oyez_cov.json and <scratch_dir>/search_join.json. Stores ONLY booleans / lengths
for Oyez (no Oyez text is persisted). No token used: both endpoints answered anonymously when tried.
"""
import json, sys, time, urllib.request, urllib.parse

S = sys.argv[1]
d = json.load(open(f"{S}/sample.json"))
UA = {"User-Agent": "Mozilla/5.0 (research preflight; contact corby.hobbs@gmail.com)"}

def get(url):
    for i in range(3):
        try:
            with urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=30) as r:
                return r.status, json.loads(r.read())
        except urllib.error.HTTPError as e:
            if e.code == 404:
                return 404, None
            time.sleep(2 * (i + 1))
        except Exception:
            time.sleep(2 * (i + 1))
    return 0, None

# ---- Oyez coverage (undocumented public JSON API behind oyez.org) ----
oy = {}
cases = d["sample"] + d["sanity"]
for r in cases:
    st, j = get(f"https://api.oyez.org/cases/{r['term']}/{urllib.parse.quote(r['docket'])}")
    rec = {"status": st}
    if isinstance(j, list):  # ambiguous docket (e.g. several "No. 1"): follow the first hit
        rec["ambiguous"] = len(j)
        st, j = get(j[0]["href"]) if j else (404, None)
        rec["status"] = st
    if isinstance(j, dict):
        for k in ("facts_of_the_case", "question", "conclusion"):
            rec[k] = len((j.get(k) or "").strip())
        rec["name"] = j.get("name")
    oy[r["caseId"]] = rec
    time.sleep(0.25)
json.dump(oy, open(f"{S}/oyez_cov.json", "w"))
print("oyez done", len(oy))

# ---- CourtListener anonymous search: does the index expose scdb_id / citation lookup? ----
sj = {}
byid = {r["caseId"]: r for r in cases}
for cid in d["join30"]:
    r = byid[cid]
    if "U.S." not in r["usCite"]:
        sj[cid] = {"skip": "no U.S. cite"}; continue
    q = urllib.parse.urlencode({"type": "o", "court": "scotus", "citation": r["usCite"], "highlight": "off",
                                "fields": "cluster_id,scdb_id,caseName,citation,dateFiled,syllabus"})
    st, j = get(f"https://www.courtlistener.com/api/rest/v4/search/?{q}")
    sj[cid] = {"status": st, "count": (j or {}).get("count"), "results": [
        {k: x.get(k) for k in ("cluster_id", "scdb_id", "caseName", "dateFiled")} | {"syllabus_len": len(x.get("syllabus") or "")}
        for x in (j or {}).get("results", [])[:3]]}
    time.sleep(2)  # anonymous: be gentle
json.dump(sj, open(f"{S}/search_join.json", "w"), indent=1)
print("search done", len(sj))
