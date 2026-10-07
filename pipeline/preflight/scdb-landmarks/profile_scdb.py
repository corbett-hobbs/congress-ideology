"""Throwaway SCDB profile for the landmarks preflight. Usage: python3 -I profile_scdb.py CASE_CSV LEGACY_CSV JUSTICE_CSV"""
import csv, sys, collections, datetime
def load(p): return list(csv.DictReader(open(p, encoding='latin-1', newline='')))
def yr(s):
    try: return datetime.datetime.strptime(s, '%m/%d/%Y').year
    except ValueError: return None
for label, path in (('modern', sys.argv[1]), ('legacy', sys.argv[2])):
    r = load(path)
    ys = [y for y in (yr(x['dateDecision']) for x in r) if y]
    print(f'== {label}: rows={len(r)} years={min(ys)}-{max(ys)} blank usCite={sum(not x["usCite"].strip() for x in r)} blank docket={sum(not x["docket"].strip() for x in r)}')
    print('   decisionDirection:', dict(sorted(collections.Counter(x['decisionDirection'] or 'blank' for x in r).items())))
    print('   splitVote/majVotes/majOpinWriter blank:', sum(not x['splitVote'] for x in r), sum(not x['majVotes'] for x in r), sum(not x['majOpinWriter'] for x in r))
    byd = collections.defaultdict(collections.Counter)
    for x in r:
        y = yr(x['dateDecision'])
        if y: byd[y//10*10][x['decisionDirection'] or 'blank'] += 1
    for d in sorted(byd): print('  ', d, dict(sorted(byd[d].items())))
j = load(sys.argv[3])
print(f'== justice-centered: rows={len(j)} cols={len(j[0])} vote values:', dict(collections.Counter(x['vote'] for x in j)))
print('   has justiceName/vote/opinion/majority:', [c for c in ('justiceName','vote','opinion','direction','majority') if c in j[0]])
