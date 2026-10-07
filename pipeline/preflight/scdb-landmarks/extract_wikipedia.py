"""Throwaway: extract (section, case, year, citation) from Wikipedia's landmark-decisions list wikitext.
Writes the same CSV shape as extract_lists.py (path is synthetic /cases/federal/us/V/P/) so join_scdb.py/report.py can be reused.
Usage: python3 -I extract_wikipedia.py LANDMARK_JSON OUT_CSV"""
import json, re, sys, csv, collections
w = json.load(open(sys.argv[1]))['parse']['wikitext']
w = w.split('== See also ==')[0]
sec2 = sec3 = ''; rows = []; bullets = 0; nonus = []
for line in w.split('\n'):
    m = re.match(r'(={2,3})\s*(.*?)\s*\1\s*$', line)
    if m:
        if len(m[1]) == 2: sec2, sec3 = m[2], ''
        else: sec3 = m[2]
        continue
    if not line.startswith('*') or line.startswith('**'): continue
    bullets += 1
    name = re.match(r"\*\s*''\[\[([^\]|]+)(?:\|([^\]]+))?\]\]", line)
    u = re.search(r'\{\{ussc\|(\d+)\|(\d+|___)\|(\d{4})', line, re.I)
    if not u:
        n = re.search(r'\{\{ussc\|([^}]*)\}\}', line, re.I)
        kv = dict(re.findall(r'(\w+)\s*=\s*([^|}]*)', n[1])) if n else {}
        y = re.search(r'\d{4}', kv.get('year', '') + kv.get('date', ''))
        if kv.get('volume', '').strip().isdigit() and kv.get('page', '').strip().isdigit() and y:
            u = (None, kv['volume'].strip(), kv['page'].strip(), y[0])
    nm = (name[2] or name[1]) if name else line[:60]
    if u and u[2].isdigit():
        rows.append((f'{sec2} / {sec3}' if sec3 else sec2, nm, u[3], f'/cases/federal/us/{u[1]}/{u[2]}/'))
    else: nonus.append((sec2, sec3, nm))
with open(sys.argv[2], 'w', newline='') as o:
    wr = csv.writer(o); wr.writerow(['topic', 'name', 'year', 'path']); wr.writerows(rows)
print('bullets', bullets, 'with U.S. cite', len(rows), 'other', len(nonus), 'unique cites', len({r[3] for r in rows}))
print('other examples:', nonus[:8])
print('top sections:', collections.Counter(r[0].split(' / ')[0] for r in rows))
