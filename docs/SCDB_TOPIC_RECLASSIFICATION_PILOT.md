# Supreme Court topics — reclassification pilot (EO-page logic)

Run 2026-10-06, after the [case-text pre-flight](SCDB_CASE_TEXT_PREFLIGHT.md). A pilot only: nothing under `pipeline/output/`, no schema, page, nav or
`ARCHITECTURE_MAP.md` was touched. Output: [`docs/scdb-text-preflight/topic-pilot.csv`](scdb-text-preflight/topic-pilot.csv) (all 9,409 SCDB cases:
`caseId, term, topic, method, confidence`), the hand labels in `docs/scdb-text-preflight/judgement-labels/`, and the scripts `08-classify-prep.py` and
`09-merge-topics.py` in `pipeline/preflight/scdb-text/`.

## What this is, and one correction

**No per-case summaries were used.** The pre-flight measured text availability on a 198-case sample and stored nothing per case, so there is no
summary or excerpt for most cases. Every label below comes from **case name + SCDB issue label + petitioner/respondent labels + the named federal
agency (party code or `adminAction`)**. That is the same kind of input the EO page uses (title + agencies), and it is enough for most cases, but it is
weaker than reading the opinion. A text-based pass is still the way to settle the low-confidence cases.

## The logic carried over from the Executive Orders page

From `pipeline/classify/executive-orders*.ts` and `lib/executive-orders-entities.ts`:

- **One primary topic per case, by main purpose** (not every agency or party it touches), nine topics, **no "other"**.
- **Rule first, judgement second** — the EO flow inherits a parent's topic when the input already says it (`parent-inherit`), and records everything else as
  `model` (hand-run labels, flagged `needs_review` when unsure). Here: `issue-rule` and `judgement`, with `?` = low confidence.
- The nine definitions are the EO ones, with **Government operations replaced by Judicial procedure** (jurisdiction, standing, mootness, venue, civil
  procedure, attorney's fees, remedies, "no merits" dispositions, federal–state court relations, evidence rules). Revoking/amending has no analogue.
- Layer 1 (7,030 cases): where the SCDB issue label itself names a subject, the topic is fixed (criminal procedure → Immigration & justice; voting, race, sex
  and disability discrimination, religion/speech → Civil rights & civic; labour, antitrust, securities, bankruptcy, tax, patents → Economy & labour;
  environmental and energy-utility codes → Energy & environment; abortion/right to die → Health & education; school desegregation and parochiaid → Health &
  education; military personnel, loyalty/internal-security codes → National security; court-administration codes → Judicial procedure).
- **Review triggers** (the part the issue code gets wrong): a case also goes to judgement if a party or agency points at a different thin topic than the rule —
  e.g. Defense/Army/Navy/CIA/Selective Service, Interior/FPC/FERC/EPA/NRC, HHS/FDA/Education, a school board or university, an oil/coal/nuclear/electric party,
  a foreign state. Every generic code (agency review 90120, federalism, interstate relations, miscellaneous) is always judged.
- Layer 2 (2,379 cases): I read name, issue, parties and agency and picked the topic, one case at a time. 78 are marked low-confidence.

## Result (all 9,409 cases)

| Topic | Cases | Share | by rule / by judgement |
| --- | --- | --- | --- |
| Immigration & justice | 2,744 | 29.2% | 2,292 / 452 |
| Economy & labour | 2,377 | 25.3% | 1,795 / 582 |
| Judicial procedure | 1,630 | 17.3% | 1,288 / 342 |
| Civil rights & civic | 1,374 | 14.6% | 1,091 / 283 |
| Energy & environment | 494 | 5.3% | 231 / 263 |
| Health & education | 443 | 4.7% | 149 / 294 |
| National security | 273 | 2.9% | 184 / 89 |
| Foreign policy | 65 | 0.7% | 0 / 65 |
| Trade | 9 | 0.1% | 0 / 9 |

- The four big topics still hold **86%** of cases (the draft crosswalk had about 90%). Judgement moved cases into the thin topics, but they stay thin:
  **Trade (9) and Foreign policy (65) are too small to chart** on their own; National security (273) and Health & education (443) are usable but small.
  This now looks like a property of the Court's docket and of SCDB's coding, not only of the crosswalk.
- **Issue 90120 (agency review, 193 cases):** Economy & labour 128, Energy & environment 22, Health & education 19, Judicial procedure 10, Civil rights 5,
  Immigration & justice 3, National security 2, Foreign policy 2, Trade 2. So most agency-review cases are regulators of business (NLRB, ICC, FTC, FCC, SEC),
  not hidden energy or health cases.
- **Sanity cases:** *Hamdan* → National security; *Rostker v. Goldberg* → National security; *Udall v. FPC* → Energy & environment; *Mobil Oil v. United
  Distribution* → Energy & environment; *Moore v. Charlotte-Mecklenburg* → Health & education. All five match what a human would pick. *Moore* was first
  mis-filed by the rule as Judicial procedure (its SCDB issue is 90210, "standing to sue"), because my school-board trigger used the wrong party code (22 =
  U.S. Senate; the school-district code is 21). I fixed the trigger and judged the 101 newly flagged cases, which is why the second batch of 101 judgement labels exists.
- **By decade** the shares drift the way you would expect: Economy & labour falls from 39% (1940s) to about 19–24% (2000s on), Immigration & justice rises
  from 20% to 31–38%, Civil rights jumps in the 1960s (6% → 18%).

## How good is it?

- **Rule layer spot-check:** I re-read 60 random rule-labelled cases. About **5 (8%)** I would relabel: mootness/jurisdiction cases that actually concern a labour
  or unemployment order (*NLRB v. Jones & Laughlin*, *Indiana Employment Security v. Burney*), a quiet-title case (*Block v. North Dakota*), a Speech-or-Debate
  bribery case coded as "governmental corruption" (*U.S. v. Helstoski*), and a tender-offer case SCDB coded as an environmental issue (*Schreiber v. Burlington
  Northern*). That is my own judgement checking my own rule, not an independent audit.
- **Judgement layer:** consistent but not independent. I applied a few conventions you may want to overrule: school-speech cases go to Civil rights & civic,
  school administration to Health & education; Indian-treaty fishing/land to Civil rights & civic (the EO page puts tribal orders there); loyalty/internal-
  security cases to National security; passport/travel cases to Civil rights & civic; foreign sovereign-immunity and Act-of-State cases to Foreign policy;
  federal-employee personnel cases to Economy & labour (there is no Government operations topic any more).
- The EO page's own review step (an independent reviewer marking agree/disagree, as in `docs/eo-topic-audit.csv`) has **not** been done for this pilot.

## What I would do next (your call)

1. Have someone review a sample the way the EO audit does (all 78 low-confidence cases plus about 100 random ones) before any page uses these labels.
2. Decide what to do with the two near-empty topics: fold **Trade + Foreign policy into National security** (347 cases, 3.7%) as one "Foreign affairs & security" topic, or drop
   them from the Court section.
3. Optionally add the opinion-opening text for the 78 low-confidence and the 12 agency-review cases with no named agency, using the bulk route from the pre-flight.
4. Direction (liberal share) is attached for the roughly 9,200 cases SCDB codes as liberal/conservative; the pilot CSV does not include it (join on `caseId`). Rough
   shares by topic: Civil rights 58%, Economy 56%, Health & education 52%, Energy 52%, National security 51%, Foreign policy 49%, Judicial procedure 49%,
   Immigration & justice 44% (Trade n = 9, not meaningful).

## Reproduce

```bash
S=/path/to/scratch   # SCDB csv, issue_labels.json (parsed from the codebook's issue page), petitioner.txt, labels/L*.txt
python3 pipeline/preflight/scdb-text/08-classify-prep.py $S    # rule labels + judgement queue
# judgement labels: docs/scdb-text-preflight/judgement-labels/L0*.txt  (copy into $S/labels/)
python3 pipeline/preflight/scdb-text/09-merge-topics.py $S docs/scdb-text-preflight/topic-pilot.csv
```

Note: 77 cases in the first judgement queue stopped being queued after the party-code fix; their hand labels stay and override the rule label.
