"""Item 5: read the GovInfo Bill Status zips (108th, 118th; hr/s/hjres/sjres) and keep, per bill that
became a Public Law, the fields the transform would read. Scratch only."""
import zipfile, re, json, glob, os, xml.etree.ElementTree as ET
BASE = os.path.join(os.path.dirname(__file__), "../../raw/_scratch/laws/")
out = {}
stats = {}
for z in sorted(glob.glob(BASE + "bulk/BILLSTATUS-*.zip")):
    cong, typ = re.search(r"BILLSTATUS-(\d+)-(\w+)\.zip", z).groups()
    zf = zipfile.ZipFile(z)
    n = law = 0
    for name in zf.namelist():
        if not name.endswith(".xml"): continue
        n += 1
        raw = zf.read(name)
        if b"<type>Public Law</type>" not in raw: continue
        b = ET.fromstring(raw).find("bill")
        laws = [i.findtext("number") for i in b.findall("laws/item") if i.findtext("type") == "Public Law"]
        if not laws: continue
        law += 1
        acts = b.findall("actions/item")
        rv = []
        for a in acts:
            for r in a.findall("recordedVotes/recordedVote"):
                rv.append({"chamber": r.findtext("chamber"), "roll": r.findtext("rollNumber"), "date": (r.findtext("date") or "")[:10], "actionText": a.findtext("text")})
        became = [a.findtext("actionDate") for a in acts if a.findtext("type") == "BecameLaw"]
        sp = b.find("sponsors/item")
        sums = [(s.findtext("actionDesc"), re.sub(r"<[^>]+>", " ", s.findtext("cdata/text") or "")) for s in b.findall("summaries/summary")]
        out[f"{cong}{typ}{b.findtext('number')}"] = {
            "congress": int(cong), "type": b.findtext("type"), "number": b.findtext("number"), "laws": laws,
            "policyArea": b.findtext("policyArea/name"), "sponsor": sp.findtext("bioguideId") if sp is not None else None,
            "cosponsors": len(b.findall("cosponsors/item")), "latestAction": b.findtext("latestAction/actionDate"),
            "becameLaw": became, "nActions": len(acts), "recordedVotes": rv, "nSummaries": len(sums),
            "summaryTexts": [s[1].strip()[:400] for s in sums if s[0] and "Public Law" in s[0]] or [s[1].strip()[:400] for s in sums[-1:]],
            "originChamber": b.findtext("originChamber"), "title": b.findtext("title"),
        }
    stats[f"{cong}-{typ}"] = {"xml": n, "publicLawBills": law}
print(json.dumps(stats))
json.dump(out, open(BASE + "bulk-laws.json", "w"))
print(len(out), "bills that became law")
