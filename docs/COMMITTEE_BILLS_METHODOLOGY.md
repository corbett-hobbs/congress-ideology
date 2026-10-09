# Committee legislation: methodology

How the "Legislation in this committee" section at the bottom of every committee page (`/congress/committees/<id>/<slug>`) is built and what its numbers mean. Schemas: `lib/committee-bills-entities.ts`; conventions: `docs/DATA_CONVENTIONS.md` section 16; the page's own conventions: `ARCHITECTURE_MAP.md` "Committee page shell".

The unit is a **bill in a committee**: one row per (bill or joint resolution, committee it was referred to) in the Congress in progress. A bill referred to three committees is three rows, one on each committee's page. Simple and concurrent resolutions (`hres`, `hconres`, `sres`, `sconres`) are not included: they cannot become law and the Bill Status ZIPs for them are not downloaded.

## Source

GovInfo **Bill Status** bulk XML (https://www.govinfo.gov/bulkdata/BILLSTATUS), the same ZIPs the Laws track reads: one per bill type per Congress, one XML file per bill. Keyless; rebuilt daily for the open Congress. `pnpm fetch:billstatus` reads the ZIPs (it already did, to keep the public laws) and, for the Congress in progress only, also writes a digest of **every** bill to `pipeline/raw/govinfo-bills/<congress>.json`, one bill per line (about 12 MB, 1.3 MB gzipped). Committee pages exist for the current Congress only (`committees.json` is current-Congress only), so earlier Congresses are not digested.

What a digest keeps per bill: type, number, title, introduced date, origin chamber, sponsor (bioguide id and the name as the source prints it), current cosponsors counted by the party the source gives each (`[D, R, other]`), policy area, the committee list with every dated step (`Referred To`, `Hearings By`, `Markup By`, `Reported By`, `Discharged From`, subcommittees nested), public law numbers, committee report citations, the number of CBO estimates, the latest action, and **only the actions the stage logic reads**: a committee action whose text says mark-up or "ordered to be reported" (text kept, for the vote), calendar placements, passage in a chamber (`Passed/agreed to in House`), vetoes, and the signing.

## Rules

- **A bill's stage is derived, not stored** (`lib/committee-bills-derive.ts`). From the furthest to the least: **6 became law** (the bill has a public law number *and* a "became law" action, as in the Laws track: a number assigned before the signing does not count), **5 passed this committee's chamber** (a House committee reads the House passage, a Senate committee the Senate's; a joint committee either), **4 out of committee** (reported or discharged), **3 markup** (a `Markup By` step, or an action naming a mark-up or "ordered to be reported"), **2 hearing** (a `Hearings By` step), **1 referred** only. A step the source never logged is not inferred: a bill marked up with no hearing recorded is stage 3 and shows the hearing as "not recorded".
- **Stages 1-4 belong to the committee, 5-6 to the bill.** A bill can pass the House having been handled by another committee; on this committee's page it is stage 5 and badged "Floor, no report" when this committee neither reported nor was discharged.
- **Dates.** Referral = the committee's earliest `Referred To` step (the introduction date if none). Hearing, markup, report and discharge = the earliest such step in the committee or any of its subcommittees. A calendar placement is kept only on a bill the committee reported or was discharged from. Passage dates are the first passage action of each chamber.
- **Committee vote.** When the committee's "ordered to be reported" action gives a tally ("Yeas and Nays: 24 - 11") the row keeps it; otherwise "voice vote" or "unanimous consent" where the text says so. The Senate rarely states a method, so most Senate rows have none.
- **Sponsor and cosponsors.** The sponsor is the bill's sponsor in the source. A sponsor links to a profile only for a member of the current Congress (the only members with a page); a former member shows as a name. A bill is **bipartisan** when it has a cosponsor from the other party than its sponsor (an independent sponsor: cosponsors from both parties). Withdrawn cosponsors are not counted.
- **Subcommittees.** Subcommittee referral is logged for only some committees' bills (about a quarter of Natural Resources', none of Judiciary's), so the subcommittee chart is partial and says how many bills it covers. Names come from `subcommittees.json`.

## Output

`pipeline/output/committee_bills/<COMMITTEE_ID>.json` (one shard per committee with at least one bill, one bill per line), `committee_bills_meta.json` (Congress, data-through date, counts per committee) and `committee_bills_report.json`. Row keys are documented in `lib/committee-bills-entities.ts`. The card fetches its committee's shard at `/data/committees/<id>/bills` (prerendered static JSON, `?v=` a hash of the rows) when it mounts, so the page itself stays small; a committee with no bills has no card.

## Gates (the transform fails on any)

- **Laws agree.** The public laws among the bills equal the laws in `laws.json` for the same Congress, exactly. Both read the same Bill Status ZIPs, so a difference means one raw file is stale or a parser changed.
- **Schemas.** The raw file and every shard parse; every index in a row lies inside its shard's tables; no event is dated after the raw file was fetched.
- Reported, not failed: committee codes in the raw data that are not in `committees.json` (retired, select), subcommittees whose parent differs, sponsor names the parser could not split, referral dates before introduction.

## Known limits

- "No recorded action" is not "nothing happened": hearings and markups appear only where the Library of Congress logged them, and committees can act on a bill's text through another vehicle.
- A bill's later fate after it leaves committee is the bill's, not the committee's: a bill can pass the chamber with this committee's report, without it, or be folded into another bill that carries the law.
- The latest month of referrals is still filling in (hatched in the month chart, left out of the peak and low labels).
- Not in the data, deliberately: hearing titles, witnesses and meeting times (the Congress.gov `committee-meeting` endpoint carries them; a future fetch), and individual members' committee votes (no structured source).

## Refresh

`laws-freshness.yml` (weekly) runs `pnpm fetch:billstatus`, which re-reads a Congress when one of its four ZIPs changed; the digest and the Laws raw file are written in the same pass, so the laws gate holds. The workflow re-runs the Laws and committee-legislation transforms and opens one gated PR for both.
