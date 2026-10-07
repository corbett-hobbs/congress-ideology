"""Throwaway: extract topic, case name, year, Justia path from saved Justia topic pages.
Keeps ONLY those fields (no summaries/authors/intro). Usage: python3 -I extract_lists.py HTML_DIR OUT_CSV"""
import re, sys, csv, os, html
d, out = sys.argv[1], sys.argv[2]
rows = []
for f in sorted(os.listdir(d)):
    if not f.endswith('.html'): continue
    topic = f.split(' Supreme Court Cases')[0].replace(' _ ', ' / ')
    h = open(os.path.join(d, f), encoding='utf-8', errors='replace').read()
    for m in re.finditer(r'<strong>\s*<a href="(?:https://supreme\.justia\.com)?(/cases/[^"]+)">\s*([^<]*?)\s*</a>\s*(?:\([^)<]*\))?\s*</strong>\s*\((\d{4})\)', h, re.S):
        rows.append((topic, html.unescape(re.sub(r'\s+', ' ', m.group(2))), m.group(3), m.group(1)))
os.makedirs(os.path.dirname(out), exist_ok=True)
with open(out, 'w', newline='') as o:
    w = csv.writer(o); w.writerow(['topic', 'name', 'year', 'path']); w.writerows(rows)
import collections
c = collections.Counter(r[0] for r in rows); print(len(rows), 'rows,', len(c), 'topics')
for t, n in sorted(c.items()): print(f'  {n:3d} {t}')
print('path kinds:', collections.Counter(re.sub(r'\d+', 'N', r[3]) for r in rows).most_common(8))
