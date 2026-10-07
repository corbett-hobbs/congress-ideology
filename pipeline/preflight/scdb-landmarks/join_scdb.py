"""Throwaway: join Justia lists to SCDB. Usage: python3 -I join_scdb.py LISTS_CSV MODERN_CSV LEGACY_CSV OUT_JSON"""
import csv, re, sys, json, collections, datetime
lists = list(csv.DictReader(open(sys.argv[1])))
def load(p): return list(csv.DictReader(open(p, encoding='latin-1', newline='')))
mod, leg = load(sys.argv[2]), load(sys.argv[3])
def yr(s):
    try: return datetime.datetime.strptime(s, '%m/%d/%Y').year
    except ValueError: return None
def norm(s): return re.sub(r'[^a-z0-9]', '', s.lower().replace(' v. ', ' v ').replace('&', 'and'))
def idx(rows):
    cite, dock, name = {}, collections.defaultdict(list), collections.defaultdict(list)
    for r in rows:
        m = re.match(r'(\d+) U\.?S\.? (\d+)', r['usCite'].strip())
        if m: cite.setdefault((m[1], m[2]), []).append(r)
        if r['docket'].strip(): dock[r['docket'].strip().upper()].append(r)
        name[(norm(r['caseName']), yr(r['dateDecision']))].append(r)
    return cite, dock, name
I = {'modern': idx(mod), 'legacy': idx(leg)}
def parse(path):
    m = re.match(r'/cases/federal/us/(\d+)/([^/]+)/', path)
    if not m: return None, None, None
    v, p = m[1], m[2]
    return (v, p, None) if p.isdigit() else ((v, None, p) if re.match(r'^\d+(-|[aA])\d+', p) else (v, re.sub(r'\D', '', p) or None, None))
def match(item):
    y = int(item['year']); v, p, dk = parse(item['path'])
    for which in (('modern', 'legacy') if y >= 1946 else ('legacy', 'modern')):
        cite, dock, name = I[which]
        if p and (v, p) in cite: return which, 'cite', cite[(v, p)][0]
        if dk and dk.upper() in dock:
            cands = dock[dk.upper()]
            c = [r for r in cands if abs((yr(r['dateDecision']) or 0) - y) <= 1] or (cands if len(cands) == 1 else [])
            if c: return which, 'docket', c[0]
        n = name.get((norm(item['name']), y)) or name.get((norm(item['name']), y - 1)) or name.get((norm(item['name']), y + 1))
        if n: return which, 'name+year', n[0]
    return None, None, None
seen, res = {}, []
for it in lists:
    k = it['path']
    if k not in seen:
        w, how, r = match(it); seen[k] = (w, how, r)
    w, how, r = seen[k]
    res.append({**it, 'file': w, 'how': how, 'caseId': r['caseId'] if r else '', 'dir': r['decisionDirection'] if r else '',
                'issue': r['issue'] if r else '', 'partyWinning': r['partyWinning'] if r else '', 'scdbName': r['caseName'] if r else '',
                'scdbYear': yr(r['dateDecision']) if r else '', 'scdbDate': r['dateDecision'] if r else '', 'splitVote': r['splitVote'] if r else '',
                'majVotes': r['majVotes'] if r else '', 'minVotes': r['minVotes'] if r else ''})
json.dump(res, open(sys.argv[4], 'w'))
print('rows', len(res), 'unique cases', len(seen))
print('how', collections.Counter((x['file'], x['how']) for x in res))
