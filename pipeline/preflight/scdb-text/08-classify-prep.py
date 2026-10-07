#!/usr/bin/env python3
"""Throwaway pilot: reclassify SCDB cases into the nine EO-page topics (Judicial procedure replaces Government operations),
using the EO page's logic: one primary topic by the case's MAIN PURPOSE, no "other", rule where the input already names a
subject (EO "parent-inherit" analogue = issue-rule), judgement labels for the rest (EO "model" method), confidence flag.

Usage: 08-classify-prep.py <scratch_dir>
 -> <scratch_dir>/queue.txt   one line per case needing a judgement label
 -> <scratch_dir>/rule_labels.json  caseId -> {topic, method, reason}
Topic codes: J judicial_procedure, E economy_labor, T trade, N energy_environment, H health_education,
             I immigration_justice, F foreign_policy, S national_security, C civil_rights_civic
"""
import csv, json, re, sys, collections

S = sys.argv[1]
rows = list(csv.DictReader(open(f"{S}/SCDB_2026_01_caseCentered_Citation.csv", encoding="latin-1")))
iss = json.load(open(f"{S}/issue_labels.json"))

# party codebook (same parser as 02-party-codes.py)
txt = open(f"{S}/petitioner.txt").read(); txt = txt[txt.index("Values:") + 7:].split("Identification Variables")[0]
marks, last = [], 0
for m in re.finditer(r"(?:(?<=\s)|^)(\d{1,3}) (?=[A-Za-z])", txt):
    n = int(m.group(1))
    if last < n <= last + 12 or n in (100, 301, 501, 600) and n > last:
        marks.append((m.start(), n, m.end())); last = n
party = {n: txt[e:(marks[i + 1][0] if i + 1 < len(marks) else len(txt))].strip() for i, (st, n, e) in enumerate(marks)}
short = lambda s: re.sub(r"\s*\(.*?\)|, or .*|,? including.*|\. If employer.*", "", s)[:42]

def rng(a, b):
    return {str(x) for x in range(a, b + 1)}

# ---- Layer 1: the issue label itself names the subject -> fixed topic (method issue-rule) ----
R = {}
def setr(codes, topic):
    for c in codes: R[str(c)] = topic
for c in iss:
    a = int(c) // 10000 if len(c) == 5 else int(c) // 10000
    if 10010 <= int(c) <= 10600: R[c] = "I"                       # criminal procedure/law, courts, prisons
setr(range(20010, 20100, 10), "C"); setr([20090, 20080, 20040, 20060, 20070, 20130, 20140, 20150, 20160, 20170, 20200, 20210, 20220, 20400, 20410], "C")
setr([20050], "H")                                                # school desegregation
setr([20110, 20120, 20260, 20270, 20280, 20290, 20300, 20310], "I")  # deportation / immigration
setr([20100, 20180, 20190], "E")                                  # debtors, poverty law
setr([20230, 20240, 20250], "S")                                  # military personnel
setr(range(20320, 20400, 10), "J")                                # indigent litigants' procedural protections
setr([30010, 30150, 30160, 30170, 30190, 30200, 30030, 30040, 30140], "C")
setr(range(30050, 30140, 10), "S"); setr([30130], "S")           # internal security, loyalty, security risks, COs
setr([30020], "E"); setr([30180], "H")
setr([40040], "I"); setr([40060], "J"); setr([40070], "E")       # prisoners' rights, jurisdiction, takings
setr([50020, 50030], "H"); setr([50010], "C")
setr(range(60010, 60050, 10), "J")
setr(range(70010, 70220, 10), "E")
setr([80010, 80020, 80030, 80090, 80100, 80110, 80120, 80160, 80170, 80180, 80190, 80200, 80210, 80220, 80230, 80240, 80250, 80260, 80340, 80350, 80150, 80140], "E")
setr([80130, 80270, 80280, 80290, 80300, 80310, 100080, 100090], "N")
setr([80320, 80330], "E")
setr([80040, 80050, 80070, 80080, 100020], "J")
setr(range(90010, 90530, 10), "J"); setr([90010 + i for i in range(0, 9)], "J")
R["90120"] = None                                                 # agency review: needs party/agency or judgement
setr([110010], "N")                                               # boundary disputes between states (rivers, lands)
setr([120010, 120020, 120030, 120040], "E")

# ---- Review triggers: the rule may be wrong for this case, so a judgement label overrides it ----
AGENCY_THIN = {  # federal-agency codes pointing at a thin topic
    "N": {302, 310, 325, 326, 333, 342, 344, 352, 385, 409, 410},
    "H": {340, 362, 363, 330, 397, 399},
    "S": {303, 306, 314, 322, 324, 377, 386, 407},
    "F": {328}, "T": {316, 321},
}
THIN_PARTY = {"N": {150, 194, 198, 148, 132, 187, 243, 157, 209, 219}, "H": {2, 21, 26, 232, 239, 224, 165, 167, 206, 143, 144, 181, 204, 140, 180, 199},
              "S": {186, 142, 244}, "F": {24, 159, 600, 193}, "I": {106, 215, 217, 126, 100}}
def parties(r):
    ids = set()
    for k in ("petitioner", "respondent"):
        if r[k]: ids.add(int(r[k]))
    if r["adminAction"] and int(r["adminAction"]) < 100: ids.add(300 + int(r["adminAction"]))
    return ids

queue, rule = [], {}
for r in rows:
    cid, code = r["caseId"], r["issue"]
    ids = parties(r)
    default = R.get(code, None) if code else None
    trig = {t for t, s in AGENCY_THIN.items() if ids & s} | {t for t, s in THIN_PARTY.items() if ids & s}
    # a trigger only matters when it disagrees with the default
    review = default is None or (trig and trig != {default})
    if review:
        queue.append(r)
    else:
        rule[cid] = {"topic": default, "method": "issue-rule", "reason": code}
json.dump(rule, open(f"{S}/rule_labels.json", "w"))

def line(r):
    pl = lambda c: short(party.get(int(c), "?")) if c else "-"
    ag = []
    if r["adminAction"] and int(r["adminAction"]) < 100: ag.append(short(party.get(300 + int(r["adminAction"]), "")))
    nm = re.sub(r"\s+", " ", r["caseName"]).title()[:70]
    return f"{r['caseId']}|{nm}|{iss.get(r['issue'], '(blank)')[:60]}|{pl(r['petitioner'])} v {pl(r['respondent'])}|{';'.join(ag)}"
open(f"{S}/queue.txt", "w").write("\n".join(line(r) for r in queue) + "\n")
print("rule-labelled:", len(rule), " judgement queue:", len(queue), "of", len(rows))
print("rule topic counts:", collections.Counter(v["topic"] for v in rule.values()))
print("queue by area:", collections.Counter(r["issueArea"] for r in queue))
