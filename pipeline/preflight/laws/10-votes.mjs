// Item 4: final-passage votes from the action history of the sampled laws, joined to Voteview's roll-call file.
import fs from "node:fs";
import { CACHE } from "./lib.mjs";
const S = JSON.parse(fs.readFileSync(CACHE + "sample-detail.json"));
// --- Voteview roll calls
const csv = fs.readFileSync(CACHE + "voteview/HSall_rollcalls.csv", "utf8").split("\n");
const parse = (l) => { const o = []; let cur = "", q = false; for (let i = 0; i < l.length; i++) { const ch = l[i]; if (q) { if (ch === '"' && l[i + 1] === '"') { cur += '"'; i++; } else if (ch === '"') q = false; else cur += ch; } else if (ch === '"') q = true; else if (ch === ",") { o.push(cur); cur = ""; } else cur += ch; } o.push(cur); return o; };
const hdr = parse(csv[0]); const ix = Object.fromEntries(hdr.map((h, i) => [h, i]));
const VV = [];
for (const l of csv.slice(1)) { if (!l) continue; const f = parse(l); if (+f[ix.congress] < 93) continue; VV.push({ congress: +f[ix.congress], chamber: f[ix.chamber], roll: +f[ix.rollnumber], date: f[ix.date], session: f[ix.session], clerk: f[ix.clerk_rollnumber], yea: +f[ix.yea_count], nay: +f[ix.nay_count], bill: f[ix.bill_number], q: f[ix.vote_question], desc: f[ix.vote_desc] }); }
const byDate = new Map(), byClerk = new Map(), byRoll = new Map(), sess1 = new Map();
for (const v of VV) { byRoll.set(`${v.congress}|${v.chamber}|${v.roll}`, v); if (v.date.slice(0, 4) === String(1789 + 2 * (v.congress - 1))) sess1.set(`${v.congress}|${v.chamber}`, Math.max(sess1.get(`${v.congress}|${v.chamber}`) ?? 0, v.roll)); }
const addDays = (d, n) => new Date(Date.parse(d) + n * 864e5).toISOString().slice(0, 10);
for (const v of VV) { const k = `${v.congress}|${v.chamber}|${v.date}`; (byDate.get(k) ?? byDate.set(k, []).get(k)).push(v); if (v.clerk) byClerk.set(`${v.congress}|${v.chamber}|${v.session}|${v.clerk}`, v); }
// --- final passage events
const PASS = /^(Passed\/agreed to in (House|Senate)|Conference report agreed to in (House|Senate)|Resolving differences -- (House|Senate) actions)/i;
const dec = (c) => Math.floor((1789 + 2 * (c - 1)) / 10) * 10 + "s";
const rows = [], prefixes = {};
for (const r of S) {
  const loc = r.actions.filter((a) => a.sourceSystem?.code === 9 && (a.type === "Floor" || a.type === "ResolvingDifferences"));
  for (const a of loc) { const p = a.text.split(":")[0].replace(/\d+/g, "N").slice(0, 70); prefixes[p] = (prefixes[p] ?? 0) + 1; }
  const per = {};
  // actions are newest first: first match per chamber = final passage in that chamber
  for (const a of r.actions) {
    if (a.sourceSystem?.code !== 9) continue;
    const m = a.text.match(PASS); if (!m) continue;
    const ch = (m[2] ?? m[3] ?? m[4]); if (per[ch]) continue;
    // find the matching non-LoC action (same date, same chamber) for recordedVotes
    const twin = r.actions.filter((x) => x.actionDate === a.actionDate && x.recordedVotes?.length).find((x) => x.recordedVotes.some((v) => v.chamber === ch));
    const rv = (a.recordedVotes ?? twin?.recordedVotes ?? []).filter((v) => v.chamber === ch)[0];
    const body = a.text.replace(/^[^:]*:\s*/, "").replace(/\((consideration|text)[^)]*\)?\.?/gi, "").trim();
    const tm = body.match(/(?:Yea-Nay Vote[.:]?|Yeas and Nays:?|Vote:|roll call #\d+ \(|\bthe affirmative:?|:)\s*\(?(\d+)\s*-\s*(\d+)/i) ?? body.match(/\((\d+)\s*-\s*(\d+)\)/);
    const kind = rv || /roll call #|Record Vote|Roll no|Yea-Nay|Yeas and Nays/i.test(body) || tm ? "roll" : /voice vote/i.test(body) ? "voice" : /unanimous consent|without objection/i.test(body) ? "consent" : "unstated";
    per[ch] = { kind, date: a.actionDate, text: body, rv, textTally: tm ? [+tm[1], +tm[2]] : null, rollText: (body.match(/(?:roll call #|Record Vote No:? ?|Roll no\.? ?)(\d+)/i) ?? [])[1] };
  }
  rows.push({ congress: r.congress, id: `${r.congress}-${r.lawNo}`, bill: r.type + r.number, per, originChamber: r.bill?.originChamber });
}
// --- join to Voteview
const joined = [];
for (const r of rows) for (const [ch, e] of Object.entries(r.per)) {
  const o = { congress: r.congress, id: r.id, chamber: ch, kind: e.kind, hasRv: !!e.rv, hasTextTally: !!e.textTally, vv: null, how: null, agree: null };
  if (e.kind === "roll") {
    let v = null;
    if (e.rv) { v = byClerk.get(`${r.congress}|${ch}|${e.rv.sessionNumber}|${e.rv.rollNumber}`); if (v) o.how = "clerk"; }
    if (!v && e.rv && !e.rv.sessionNumber) { }
    if (!v && e.rv && false) { // (disabled: offset join mismatched tallies): Voteview numbers rolls continuously across a Congress's two sessions
      const off = e.rv.sessionNumber === 2 ? (sess1.get(`${r.congress}|${ch}`) ?? 0) : 0;
      const cand = byRoll.get(`${r.congress}|${ch}|${off + e.rv.rollNumber}`);
      if (cand && Math.abs(Date.parse(cand.date) - Date.parse(e.rv.date.slice(0, 10))) <= 2 * 864e5) { v = cand; o.how = "session-offset"; }
    }
    if (!v) { // date + bill, then tally
      const day = e.rv?.date?.slice(0, 10) ?? e.date;
      const c = [0, -1, 1].flatMap((n) => byDate.get(`${r.congress}|${ch}|${addDays(day, n)}`) ?? []);
      const billKey = r.bill.toUpperCase();
      let cand = c.filter((x) => x.bill === billKey);
      if (cand.length > 1 && e.textTally) cand = cand.filter((x) => (x.yea === e.textTally[0] && x.nay === e.textTally[1]));
      if (cand.length === 0 && e.textTally) cand = c.filter((x) => x.yea === e.textTally[0] && x.nay === e.textTally[1]);
      if (cand.length === 1) { v = cand[0]; o.how = "date+bill/tally"; } else o.how = cand.length > 1 ? "ambiguous" : "none";
    }
    if (!v && e.rv) { // fallback: session offset, accepted only if the date is within 2 days and the tally (when we have one) agrees
      const off = e.rv.sessionNumber === 2 ? (sess1.get(`${r.congress}|${ch}`) ?? 0) : 0;
      const cand = byRoll.get(`${r.congress}|${ch}|${off + e.rv.rollNumber}`);
      if (cand && Math.abs(Date.parse(cand.date) - Date.parse(e.rv.date.slice(0, 10))) <= 2 * 864e5 && (!e.textTally || (cand.yea === e.textTally[0] && cand.nay === e.textTally[1]))) { v = cand; o.how = "session-offset(validated)"; }
    }
    if (v) { o.vv = [v.yea, v.nay]; if (e.textTally) o.agree = v.yea === e.textTally[0] && v.nay === e.textTally[1]; }
  }
  joined.push(o);
}
// does Voteview hold a vote on the same bill, chamber and day for events we called voice/consent/unstated?
const noVoteCheck = {};
for (const r of rows) for (const [ch, e] of Object.entries(r.per)) if (e.kind !== "roll") {
  const d = dec(r.congress); const o = (noVoteCheck[d] ??= { nonRollEvents: 0, voteviewHasSameBillSameDay: 0 }); o.nonRollEvents++;
  const c = [0, -1, 1].flatMap((n) => byDate.get(`${r.congress}|${ch}|${addDays(e.date, n)}`) ?? []);
  if (c.some((x) => x.bill === r.bill.toUpperCase())) o.voteviewHasSameBillSameDay++;
}
console.log("non-roll events vs Voteview:", JSON.stringify(noVoteCheck));
const pct = (a, b) => (b ? Math.round(100 * a / b) + "%" : "-");
// per decade, per law-level outcomes
const lawLevel = {};
for (const r of rows) { const d = dec(r.congress); const o = (lawLevel[d] ??= { laws: 0, noPassage: 0, anyRoll: 0, anyRollJoined: 0, allVoiceOrConsent: 0, someUnstated: 0, bothChambersFound: 0 }); o.laws++;
  const es = Object.values(r.per); if (!es.length) { o.noPassage++; continue; } if (es.length === 2) o.bothChambersFound++;
  const js = joined.filter((j) => j.id === r.id && j.kind === "roll"); if (js.length) { o.anyRoll++; if (js.every((j) => j.vv)) o.anyRollJoined++; }
  if (es.every((e) => e.kind === "voice" || e.kind === "consent")) o.allVoiceOrConsent++;
  if (es.some((e) => e.kind === "unstated")) o.someUnstated++; }
console.table(Object.entries(lawLevel).map(([d, o]) => ({ decade: d, ...o })));
const ev = {};
for (const j of joined) { const d = dec(j.congress); const o = (ev[d] ??= { events: 0, roll: 0, voice: 0, consent: 0, unstated: 0, rollWithStructuredRv: 0, rollJoined: 0, rollJoinedByClerk: 0, rollBothTallies: 0, tallyAgree: 0 }); o.events++; o[j.kind]++; if (j.kind === "roll") { if (j.hasRv) o.rollWithStructuredRv++; if (j.vv) o.rollJoined++; if (j.how === "clerk") o.rollJoinedByClerk++; if (j.vv && j.hasTextTally) { o.rollBothTallies++; if (j.agree) o.tallyAgree++; } } }
console.table(Object.entries(ev).map(([d, o]) => ({ decade: d, ...o, joinRate: pct(o.rollJoined, o.roll), tallyAgreeRate: pct(o.tallyAgree, o.rollBothTallies) })));
const bad = joined.filter((j) => j.kind === "roll" && !j.vv);
console.log("roll events not joined:", bad.length, JSON.stringify(bad.slice(0, 12).map((b) => [b.id, b.chamber, b.how, b.hasRv, b.hasTextTally])));
const dis = joined.filter((j) => j.agree === false); console.log("tally disagreements:", dis.length, JSON.stringify(dis.slice(0, 10)));
console.log(Object.entries(prefixes).sort((a, b) => b[1] - a[1]).slice(0, 40).map(([k, v]) => v + " " + k).join("\n"));
fs.writeFileSync(CACHE + "votes-analysis.json", JSON.stringify({ lawLevel, ev, rows, joined }));
