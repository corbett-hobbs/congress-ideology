"""Throwaway: direction review table. Usage: python3 -I review.py JOINED_JSON ISSUE_LABELS_JSON"""
import json, sys, html
R = json.load(open(sys.argv[1])); L = json.load(open(sys.argv[2]))
D = {'1': 'conservative', '2': 'liberal', '3': 'unspecifiable', '': 'blank'}
PW = {'0': 'respondent', '1': 'petitioner', '2': 'unclear', '': '-'}
want = ['Burwell v. Hobby Lobby', 'Employment Division', 'National Federation of Independent', 'Citizens United', 'Dobbs', 'Bush v. Gore', 'District of Columbia v. Heller', 'Obergefell', 'Kelo', 'Shelby County', 'Trump v. Hawaii', 'Roe v. Wade', 'Medina v. Planned', 'Gonzales v. Raich', 'Whalen', 'Planned Parenthood of Southeastern', 'Lawrence v. Texas', 'Masterpiece', 'Skinner', 'Korematsu', 'Brown v. Board', 'Miranda v. Arizona', 'Loving', 'West Virginia v. EPA', 'Massachusetts v. EPA', 'Zivotofsky', 'Gonzales v. Carhart', 'Rust v. Sullivan', 'Becerra v. Braidwood', 'Mahmoud', 'Skrmetti']
seen = set()
print('| Case | Year | SCDB direction | Issue | partyWinning | Topics |'); print('|---|---|---|---|---|---|')
for w in want:
    for x in R:
        if x['file'] == 'modern' and w.lower() in x['name'].lower() and x['path'] not in seen:
            seen.add(x['path']); ts = sorted({y['topic'] for y in R if y['path'] == x['path']})
            print(f"| {x['name']} | {x['scdbYear']} | {D[x['dir']]} | {x['issue']} {html.unescape(L.get(x['issue'], '?'))[:60]} | {PW[x['partyWinning']]} | {', '.join(ts)[:70]} |")
