#!/usr/bin/env python3
"""Throwaway pre-flight: how many sample cases have an extractable OFFICIAL syllabus?
 - U.S. Reports volumes <= 586 via govinfo per-case PDF granules  (.../content/pkg/USREPORTS-<vol>/pdf/USREPORTS-<vol>-<page>.pdf)
 - later cases via supremecourt.gov slip opinions (index https://www.supremecourt.gov/opinions/slipopinion/<yy>, match on docket number)
Records only lengths/booleans (no text stored).  Usage: 10-official-syllabus.py <scratch_dir>  -> <scratch_dir>/syllabus_cov.json
Needs `pdftotext` (poppler)."""
import json, re, subprocess, sys, time, os, collections, tempfile

S = sys.argv[1]
d = json.load(open(f"{S}/sample.json"))
cases = d["sample"] + d["sanity"]
UA = "Mozilla/5.0 (research preflight)"

def fetch(url, path):
    for i in range(3):
        p = subprocess.run(["curl", "-sL", "-A", UA, "-o", path, "-w", "%{http_code} %{content_type}", url], capture_output=True, text=True)
        code, _, ctype = p.stdout.partition(" ")
        if code == "200" and "pdf" in ctype:
            return True
        if code in ("404", "403"):
            return False
        time.sleep(2)
    return False

def text_of(path, last=4):
    p = subprocess.run(["pdftotext", "-l", str(last), "-layout", path, "-"], capture_output=True, text=True)
    return p.stdout

COUNSEL = re.compile(r"(argued the cause|filed a brief|on the brief|for petitioners?|for appellants?|for respondents?|for appellees?|Solicitor General|Attorney General|amicus curiae|appointed by the Court|pro se)", re.I)
def syllabus_len(txt):
    """Length of the official headnote/syllabus block. Modern slip opinions and U.S. Reports carry a 'Syllabus' heading; older
    volumes print an unlabelled headnote paragraph right after the 'Argued ... Decided ...' line. Both end where counsel lines or the opinion begin."""
    m = re.search(r"\bSyllabus\b|\bSYLLABUS\b", txt)
    if m:
        rest = txt[m.end():]
        e = re.search(r"(delivered the opinion|announced the judgment|PER CURIAM|Opinion of the Court|opinion of the Court\.?\n)", rest)
        return len(rest[: e.start()]) if e else len(rest[:6000])
    m = re.search(r"Decided[^\n]{0,60}\d{4}[^\n]*\n", txt)
    if not m:
        return None
    rest = txt[m.end():]
    e = COUNSEL.search(rest)
    blk = rest[: e.start()] if e else rest[:3000]
    blk = re.sub(r"\*?\d+\s+OCTOBER TERM.*|.*U\. ?S\.\s*$", "", blk)
    return len(blk.strip())

slip_index = {}
def slip_for(term):
    yy = str(int(term) + 0)[2:]  # OT term -> /slipopinion/<yy> (OT2024 -> 24)
    if yy not in slip_index:
        p = subprocess.run(["curl", "-sL", "-A", UA, f"https://www.supremecourt.gov/opinions/slipopinion/{yy}"], capture_output=True, text=True)
        rows = re.findall(r"<td[^>]*>\s*([0-9]{1,2}-[0-9A-Za-z]+(?:\s*,\s*[0-9]{1,2}-[0-9A-Za-z]+)*|\d+O\d+|\d+, Orig\.)\s*</td>\s*<td><a href='(/opinions/\d\dpdf/[^']+\.pdf)'", p.stdout)
        slip_index[yy] = [(u, dk) for dk, u in rows]
    return slip_index[yy]

out = {}
tmp = tempfile.mkdtemp()
for r in cases:
    cid = r["caseId"]; rec = {"src": None}
    m = re.match(r"(\d+) U\.S\. (\d+)$", r["usCite"].strip())
    if m and int(m.group(1)) <= 586:
        vol, page = m.groups()
        path = f"{tmp}/{vol}-{page}.pdf"
        ok = fetch(f"https://www.govinfo.gov/content/pkg/USREPORTS-{vol}/pdf/USREPORTS-{vol}-{page}.pdf", path)
        rec["src"] = "govinfo"; rec["fetched"] = ok
        if ok:
            t = text_of(path)
            rec["syl"] = syllabus_len(t); rec["pdf_text_chars"] = len(t)
        time.sleep(0.2)
    elif int(r["term"]) >= 2018:
        links = slip_for(r["term"]); rec["src"] = "slip"
        dk = r["docket"].replace("No. ", "").strip()
        hit = [l for l in links if dk and dk in [x.strip() for x in l[1].split(",")]]
        rec["listed"] = bool(hit)
        if hit:
            url = "https://www.supremecourt.gov" + hit[0][0]
            path = f"{tmp}/{cid}.pdf"; ok = fetch(url, path); rec["fetched"] = ok
            if ok:
                t = text_of(path, 3); rec["syl"] = syllabus_len(t); rec["pdf_text_chars"] = len(t)
        time.sleep(0.3)
    out[cid] = rec
json.dump(out, open(f"{S}/syllabus_cov.json", "w"))
print(collections.Counter((v["src"], v.get("fetched"), (v.get("syl") or 0) >= 300) for v in out.values()))
