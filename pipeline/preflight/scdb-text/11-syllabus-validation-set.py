#!/usr/bin/env python3
"""Throwaway validation: build ~200 cases with an official syllabus/headnote (>=300 chars) for a BLIND relabel.
Set = the 198-case sample cases that have a syllabus + extra cases drawn from the pilot population (stratified by label method
and decade) until 200. Writes (scratch only, NOT committed):
  <S>/val_syllabi.jsonl   caseId, name, syllabus text (<=1800 chars)
  <S>/val_blind.txt       caseId | name | syllabus excerpt   (no SCDB issue label, no prior topic)
Usage: 11-syllabus-validation-set.py <scratch_dir> <topic_pilot_csv>"""
import csv, json, random, re, subprocess, sys, tempfile, time, collections, os

S, PILOT = sys.argv[1], sys.argv[2]
# reuse fetch/extract helpers from 10-official-syllabus.py (everything before its main loop)
src = open(os.path.join(os.path.dirname(os.path.abspath(__file__)), "10-official-syllabus.py")).read().split("out = {}")[0]
src = src.replace("S = sys.argv[1]\nd = json.load(open(f\"{S}/sample.json\"))\ncases = d[\"sample\"] + d[\"sanity\"]", "")
exec(src)

rows = {r["caseId"]: r for r in csv.DictReader(open(f"{S}/SCDB_2026_01_caseCentered_Citation.csv", encoding="latin-1"))}
pilot = {r["caseId"]: r for r in csv.DictReader(open(PILOT))}
sample = json.load(open(f"{S}/sample.json"))
cov = json.load(open(f"{S}/syllabus_cov.json"))

def syllabus_text(txt):
    m = re.search(r"\bSyllabus\b|\bSYLLABUS\b", txt)
    if m:
        rest = txt[m.end():]
        e = re.search(r"(delivered the opinion|announced the judgment|PER CURIAM|Opinion of the Court|opinion of the Court\.?\n)", rest)
        blk = rest[: e.start()] if e else rest[:6000]
    else:
        m = re.search(r"Decided[^\n]{0,60}\d{4}[^\n]*\n", txt)
        if not m: return ""
        rest = txt[m.end():]; e = COUNSEL.search(rest); blk = rest[: e.start()] if e else rest[:3000]
    blk = re.sub(r"-\n\s*", "", blk); blk = re.sub(r"\s+", " ", blk).strip()
    return blk[:1800]

def get_text(r):
    cid = r["caseId"]; m = re.match(r"(\d+) U\.S\. (\d+)$", r["usCite"].strip())
    tmp = tempfile.mkdtemp()
    if m and int(m.group(1)) <= 586:
        path = f"{tmp}/x.pdf"
        if fetch(f"https://www.govinfo.gov/content/pkg/USREPORTS-{m.group(1)}/pdf/USREPORTS-{m.group(1)}-{m.group(2)}.pdf", path):
            return text_of(path)
    elif int(r["term"]) >= 2018:
        dk = r["docket"].replace("No. ", "").strip()
        hit = [l for l in slip_for(r["term"]) if dk and dk in [x.strip() for x in l[1].split(",")]]
        if hit:
            path = f"{tmp}/x.pdf"
            if fetch("https://www.supremecourt.gov" + hit[0][0], path):
                return text_of(path, 3)
    return ""

chosen, have = [], {}
def try_add(cid):
    if cid in have or len(have) >= 200: return
    t = syllabus_text(get_text(rows[cid]))
    if len(t) >= 300:
        have[cid] = t; time.sleep(0.2)

for r in sample["sample"] + sample["sanity"]:
    if (cov[r["caseId"]].get("syl") or 0) >= 300: try_add(r["caseId"])
print("from sample:", len(have))

rnd = random.Random(20261007)
pool = [c for c in pilot if c not in have and c not in {r["caseId"] for r in sample["sample"]}
        and (re.match(r"(\d+) U\.S\.", rows[c]["usCite"]) and int(re.match(r"(\d+)", rows[c]["usCite"]).group(1)) <= 586 or int(rows[c]["term"]) >= 2018)]
by = collections.defaultdict(list)
for c in pool: by[(pilot[c]["method"], rows[c]["term"][:3])].append(c)
for k in by: rnd.shuffle(by[k])
keys = sorted(by); i = 0
while len(have) < 200 and any(by.values()):
    k = keys[i % len(keys)]; i += 1
    if by[k]: try_add(by[k].pop())
print("total:", len(have))

with open(f"{S}/val_syllabi.jsonl", "w") as f, open(f"{S}/val_blind.txt", "w") as g:
    for cid in sorted(have):
        nm = re.sub(r"\s+", " ", rows[cid]["caseName"]).title()[:80]
        f.write(json.dumps({"caseId": cid, "name": nm, "syllabus": have[cid]}) + "\n")
        g.write(f"{cid} | {nm} | {have[cid][:1100]}\n")
print(collections.Counter(pilot[c]["method"] for c in have), collections.Counter(rows[c]["term"][:3] + "0s" for c in have))
