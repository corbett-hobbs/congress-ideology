# Laws: methodology (draft)

Draft written in Session 1 (data layer). Sessions 2 (passage votes and support bands), 3 (major laws, party control, summaries) and 6 (finalise) extend it. Scope and page spec: `docs/CONGRESS_LAWS_SCOPE.md`; plan: `docs/CONGRESS_LAWS_EXECUTION_PLAN.md`; measured source behaviour: `docs/LAWS_PREFLIGHT.md`. Schemas: `lib/laws-entities.ts`; conventions: `docs/DATA_CONVENTIONS.md` section 15.

## What the data is

Every **public law** from the 93rd Congress (1973) on, one row per law. Private laws (individual relief; hundreds a Congress in the 1970s, none now) are excluded. Joint resolutions that became public laws are in. The unit is the **law**, not the bill: a bill that became two laws (99th H.J.Res. 738) is two rows.

## Sources

| Congresses | Source | Why |
| --- | --- | --- |
| 108th (2003) on | GovInfo **Bill Status** bulk XML, `pnpm fetch:billstatus` | No key; rebuilt daily for the open Congress; carries the same fields as the API |
| 93rd–107th (1973–2002) | **Congress.gov API**, `pnpm fetch:laws` | The only source before 2003 |
| 108th (overlap) | both | A validation overlap: the transform fails if they disagree on the law set, bill, policy area, sponsor, introduced date, signing date, origin chamber or recorded-vote references |

Pre-flight measured the two sources against each other for every law of the 108th and 118th (772 laws): identical on all of those fields.

Both fetchers write the same slimmed record per law (`pipeline/raw/govinfo-billstatus/<congress>.json`, `pipeline/raw/congress-gov/<congress>.json`, one law per line): bill, origin chamber, title, sponsor and cosponsor ids, policy area as the source names it, the enacted CRS summary as HTML, every `BecameLaw` date, and the actions that can carry passage, conference, concurrence, veto or enactment, with their recorded-vote references. Session 2 reads the actions; nothing is fetched twice.

## Rules

- **Slot = Congress**, taken from the law number (`118-90`), never from the date.
- **Signing date** = the earliest `BecameLaw` action. The list endpoint's `latestAction` is not used: in 0.8% of sampled laws something later happened to the bill.
- **A law may be dated up to 20 January after its Congress ends** (3.2% of sampled laws are signed in the first days of the next January). Later is a failure.
- **The signing president is derived, never stored**: from the date through `HISTORICAL_ADMINISTRATIONS` and `administrations.json`. "Signed most" for a Congress is the administration with the most signings; a tie goes to the later one; the split is kept for the tooltip.
- **Veto override**: the actions show a veto and a passage "over veto". (Line-item-veto notes are not overrides.)
- **Cosponsors** are current (not withdrawn) cosponsors, kept in `laws_cosponsors.json` so the list payload stays small.
- **Committees** come from each bill's committee list (Bill Status `committees`, API `/committees`): the committee, its subcommittees and the dated steps. Committee pages exist only for the current Congress, so a law's committee links work where the committee still exists under the same code; the rest show as plain names.
- **Sponsor** is the bill's sponsor, often the member whose vehicle carried the text, not its author.

## Policy areas and topic groups

CRS assigns one policy area per law. The source field holds more than CRS's 32 current areas: the retired label **"Commemorations"** (used up to about 2009) and a few subject terms older laws carry. We keep each law's area exactly as the source names it:

- the 32 current areas and "Commemorations" are the catalog (`pipeline/reference/law-policy-areas.json`);
- legacy subject terms and laws with no area are **"Not classified"** — never mapped to an area by us;
- a name in neither list stops the build.

Thirty-three areas are too many for the page, so the page shows **topic groups** (about ten, to match the rest of InsideGov). The grouping is one field (`group`) in the same reference file; changing it needs a `pnpm transform`, not a re-fetch. "Commemorations" is its own group so the drop after 2009 stays visible.

## Gates (the transform throws)

1. Law numbers run 1..N with none missing or repeated. (The list endpoint repeats rows and omits laws, so its own `count` is not trusted.)
2. N equals the independent count in `pipeline/reference/law-counts-independent.json` (Statutes at Large; GovInfo PLAW for 104+), where there is one. A Congress with no entry is in progress and is flagged partial.
3. Every law is dated 3 January of its first year to 20 January after the Congress ends.
4. Every policy-area name is a catalog area or a listed legacy term.
5. Counts add back to the list, per Congress.
6. Where both sources cover a Congress they agree.

Reported, not fatal: sponsors missing from `legislators.json`, laws with no sponsor, laws with several `BecameLaw` dates.

## Not yet in the data

Passage votes and support bands (Session 2), Mayhew's major-law flag, party control back to 1973 and CRS summaries (Session 3). `laws_counts.json` carries `n` only for now.

## What the first full run found (Session 1)

12,619 public laws, 93rd–119th (the 119th has 119; law 119-120 is held out until Congress.gov records its enactment). Sources: Congress.gov API for the 93rd–107th, Bill Status for the 108th–119th; the 108th was fetched from both and agrees on all 498 laws across seven fields. Every finished Congress's laws are numbered 1..N and equal the independent count. Files: `laws.json` 4.2 MB, `laws_cosponsors.json` 3.0 MB, `laws_committees.json` 1.3 MB, `laws_counts.json` 47 KB (816 rows); raw `congress-gov/` 36 MB and `govinfo-billstatus/` 15 MB.

- **"Not classified" is a 1973–78 problem, and a bigger one than the pre-flight sample suggested.** 465 laws have no CRS area or a legacy subject term (160 distinct terms, listed in `law-policy-areas.json`): 164 of the 93rd's 651 (25%), 134 of the 94th's 588 (23%), 167 of the 95th's 633 (26%). From the 96th (1979) on every law has a current CRS area or "Commemorations". The pre-flight's sample of 40 per Congress had put it near 9%.
- **Source repairs.** Three Bill Status bills (110th S. 2499, 110th H.R. 6124, 109th H.R. 5441) also list the law under the wrong Congress; read as the bill's own. The API list repeated or omitted 22 laws in the 93rd–102nd (looked up by number). Ten 106th laws and two 99th laws carry two `BecameLaw` dates a day or two apart; the earliest is used.
- **Veto overrides:** 33 laws (93rd 5, 94th 8, 96th 2, 97th 2, 98th 2, 99th 2, 100th 3, 102nd 1, 104th 1, 105th 1, 110th 4, 114th 1, 116th 1). Each has a veto and an "over veto" passage. They have not been compared with the Senate Historical Office's list yet (Session 6). Line-item-veto notes on eleven 105th laws are correctly not counted.
- **Sponsors:** all 12,604 sponsor ids resolve in `legislators.json`; 15 laws have no sponsor in the source (96th 2, 97th 4, 98th 2, 99th 1, 100th 1, 101st 1, 108th 1, 109th 1, 110th 1, 111th 1, listed in `laws_report.json`).
- **Committees:** 12,150 laws carry at least one committee; 386 distinct committee and subcommittee ids, 156 of them with a page today. Of a decade's committee entries, the share that link to a page: 1970s 89%, 1980s 79%, 1990s 92%, 2000s–2020s 100%. The API maps old committees to their successors' codes (a 1979 Science and Technology bill carries `hssy00`), which is why the 1970s are not lower. Nine ids changed name over time; the most common name is kept.
