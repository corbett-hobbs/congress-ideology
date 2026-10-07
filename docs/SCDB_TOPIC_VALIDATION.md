# Topic labels vs. syllabus text — 200-case comparison

Run 2026-10-07. Follows [SCDB_TOPIC_RECLASSIFICATION_PILOT.md](SCDB_TOPIC_RECLASSIFICATION_PILOT.md). Question: how often do the metadata-only labels (case name + SCDB issue +
parties + agency) survive a re-label from the Court's own syllabus? Per-case results: [`scdb-text-preflight/validation-200.csv`](scdb-text-preflight/validation-200.csv).
Scripts: `11-syllabus-validation-set.py`, `12-compare-validation.py` (syllabus text itself stays in the scratch folder, not the repo).

## Method and its limit

- **Set:** 200 cases that have an official syllabus or headnote of 300+ characters: 163 from the earlier 198-case stratified sample plus 37 drawn so rule-labelled and
  judgement-labelled cases and every decade are covered (112 rule, 88 judgement; 16–26 per decade).
- **Blind relabel:** I read each case's name and syllabus (first ~1,100 characters) and picked one of the nine topics by main purpose, **without** the SCDB issue label or my earlier topic on screen.
  I flagged 17 as low-confidence.
- **Limit:** this is the same model that made the first labels, and I had labelled these cases earlier in this session, so it is not independent. It measures whether
  the metadata was *enough to reach the same answer as a fuller read*, not whether either answer is right. An independent reviewer is still needed.

## Result

**168 of 200 agree (84%).**

| Slice | Agree |
| --- | --- |
| Judgement-labelled (88) | **81 (92%)** |
| Rule-labelled (112) | **87 (78%)** |
| Syllabus pass confident (183) | 162 (89%) |
| Syllabus pass low-confidence (17) | 6 (35%) |
| By decade | 75–90%; weakest 1940s (75%) and 2010s (75%) |
| By SCDB issue area | 90%+ for criminal procedure, civil rights, First Amendment, privacy; **67–75% for due process (4), economic (8), judicial power (9) and federalism (10)** |

When the metadata pass said X, the syllabus pass agreed: Health & education 21/22, Civil rights 16/16, Immigration & justice 28/31, Economy 51/62, Energy 11/13,
National security 7/9, Judicial procedure 31/44. Looked at from the other side (of the cases the syllabus pass put in a topic, how many the metadata pass had in it):
Health & education 100%, Immigration & justice 90%, National security 88%, Economy 86%, Judicial procedure 78%, Civil rights 76%, **Energy 69%** (11 of 16).

## What the 32 disagreements are

- **Judicial procedure vs. the subject (the biggest source, about 15):** the syllabus says the case is about a labour, maritime, patent or tax dispute, but the rule had parked it in
  Judicial procedure because the SCDB code is procedural ("federal pre-emption of state court jurisdiction", "election of remedies", "standing to sue", "attorney's fees").
  Examples: *Slocum* (Railway Labor Act), *Youngdahl* (picketing), *Czaplicki* and *Rodriguez* and *Stewart v. Dutra* (maritime compensation), *Lexmark* and *Highmark* (Lanham/patent).
  The reverse also happens (*Boechler*, *Hatter*, *Rent-A-Center*: tax or contract cases whose syllabus is mainly about jurisdiction or deadlines). This is the main weakness of the rule layer.
- **Indigent-defendant and standing codes (3–4):** *McCrary*, *Doherty*, *Ashcroft v. Mattis* are criminal-justice cases the rule sent to Judicial procedure.
- **Energy vs. economy or land (about 6):** takings, navigable-water and land-ownership cases (*Rands*, *Kaiser Aetna*, *Tahoe-Sierra*, *Lassen*) and the Roundup preemption case. Reasonable people differ; this is why Energy recall is 69%.
- **Genuine judgement calls (about 8):** *Dennis* (contempt of Congress), *Propper* (enemy-alien property), *West v. Oklahoma Tax* (Indian estate), *Lee v. Weisman* (school prayer), *Texas v. US* (voting rights and schools), *Wolford* (guns), *Milner* (FOIA). Either answer is defensible.

## What it means

1. **The thin topics are not being distorted.** Where the metadata pass said Health & education, National security or Energy, the syllabus pass agreed 84–95% of the time. The errors are
   mostly *between* the large buckets (Judicial procedure vs. Economy), and a few cases the metadata pass missed for Energy and Civil rights.
2. **The rule layer needs a fix, not a full re-read.** Re-routing a handful of procedural codes (`election of remedies`, `federal pre-emption of state court jurisdiction`, `liability other than…`,
   `attorney's fees`, `standing to sue` when the parties are business or labour; the indigents codes when the party is a prisoner) to "look at the parties/agency first" would likely recover most of the 7 J→E errors.
   I did not change the pilot labels yet.
3. **Reading the syllabus matters most where the issue area is "procedural".** About 70% agreement for areas 4, 8, 9 and 10, 85–95% elsewhere. If you fetch syllabi only for part of the data, fetch them for
   those four issue areas (about 3,200 cases) rather than all 9,409.
4. **84% is a consistency check, not accuracy.** The true error rate against an independent reviewer could be higher or lower. I would not publish topic percentages by topic until that review is done, and
   Judicial procedure vs. Economy should be treated as a soft boundary.

## Next steps (your call)

1. Apply the rule fixes and re-run the pilot; check the same 200 again (cheap).
2. Independent review of the 32 disagreements plus the 78 low-confidence labels.
3. Fetch syllabi for issue areas 4, 8, 9, 10 and relabel those from text (about 3,200 cases).
