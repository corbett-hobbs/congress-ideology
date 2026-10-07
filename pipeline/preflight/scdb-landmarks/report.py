"""Throwaway: stats over joined.json. Usage: python3 -I report.py JOINED_JSON"""
import json, sys, collections
R = json.load(open(sys.argv[1]))
D = {'1': 'cons', '2': 'lib', '3': 'unspec', '': 'blank'}
modern = [x for x in R if int(x['year']) >= 1946]
def pct(a, b): return f'{100*a/b:.1f}%' if b else '-'
print('## 1946+ rows (topic-memberships):', len(modern), ' unique:', len({x['path'] for x in modern}))
um = [x for x in R if not x['file']]; print('unmatched (any year):', [(x['topic'], x['name'], x['year'], x['path']) for x in um])
print('1946+ matched in legacy file instead of modern:', sorted({(x['name'], x['year']) for x in modern if x['file'] == 'legacy'}))
print('fuzzy (name+year):', sorted({(x['name'], x['year'], x['scdbName'], x['scdbYear']) for x in R if x['how'] == 'name+year'}))
print('\n## per topic: n(1946+) | matched | cons/lib/unspec/blank | specifiable | pre-1946 n/matched')
T = collections.defaultdict(list); P = collections.defaultdict(list)
for x in R: (T if int(x['year']) >= 1946 else P)[x['topic']].append(x)
for t in sorted(set(T) | set(P)):
    m = T[t]; mm = [x for x in m if x['file']]; c = collections.Counter(D[x['dir']] for x in mm)
    spec = c['cons'] + c['lib']
    print(f'| {t} | {len(m)} | {len(mm)} ({pct(len(mm),len(m))}) | {c["cons"]}/{c["lib"]}/{c["unspec"]}/{c["blank"]} | {spec} ({pct(spec,len(mm))}) | {len(P[t])}/{sum(1 for x in P[t] if x["file"])} |' + (' THIN' if spec < 15 else ''))
a = [x for x in modern if x['file']]; c = collections.Counter(D[x['dir']] for x in a)
print('overall 1946+ direction:', dict(c), 'specifiable', pct(c['cons'] + c['lib'], len(a)))
u = {x['path']: x for x in a}.values(); cu = collections.Counter(D[x['dir']] for x in u)
print('unique 1946+ cases direction:', dict(cu), 'specifiable', pct(cu['cons'] + cu['lib'], len(u)))
print('\n## match by decade (1946+ topic rows): n, matched')
for d in sorted({int(x['year']) // 10 * 10 for x in modern}):
    m = [x for x in modern if int(x['year']) // 10 * 10 == d]; print(d, len(m), pct(sum(1 for x in m if x['file']), len(m)))
print('\n## pre-1946 (legacy) direction:', dict(collections.Counter(D[x['dir']] for x in R if int(x['year']) < 1946 and x['file'])), 'of', sum(1 for x in R if int(x['year']) < 1946))
print('\n## date mismatches (Justia year != SCDB dateDecision year)')
mm = sorted({(x['name'], x['year'], x['scdbYear'], x['scdbDate']) for x in R if x['file'] and str(x['scdbYear']) != x['year']}); print(len(mm)); [print(' ', m) for m in mm]
print('\n## overlap')
pc = collections.Counter(x['path'] for x in R); print('topics per case:', dict(sorted(collections.Counter(pc.values()).items())), 'max:', pc.most_common(4))
print('\n## per-topic gaps >=15y (1946+)')
for t in sorted(T):
    ys = sorted(int(x['year']) for x in T[t]); pts = [1946] + ys + [2025]
    print(f'  {t}: n={len(ys)} gaps={[(p, q) for p, q in zip(pts, pts[1:]) if q - p >= 15]}')
print('\n## busiest topic/year/direction cells (>=3)')
cell = collections.Counter((x['topic'], x['year'], D[x['dir']]) for x in a if x['dir'] in ('1', '2')); print([(k, v) for k, v in cell.most_common(12) if v >= 3])
print('all-topics dedup year/dir cells:', collections.Counter((x['year'], D[x['dir']]) for x in u if x['dir'] in ('1', '2')).most_common(8))
