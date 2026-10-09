/**
 * Copy for the Methodology and sources page. One entry per chart family; the page
 * renders it, nothing is hardcoded in JSX. Credits follow docs/CREDITS.md, which is
 * authoritative; change a credit there first.
 *
 * `docPath` is set only where a docs/*_METHODOLOGY.md write-up exists. `url` is
 * left off a source with no confirmed link, which then renders as plain text.
 * In `credit`, text between asterisks is rendered in italics.
 */
export interface MethodSource {
  name: string;
  url?: string;
  note?: string;
}

export interface MethodEntry {
  id: string;
  vertical: "presidency" | "congress" | "court" | "shared";
  title: string;
  description: string;
  sources: MethodSource[];
  /** Required attribution or notice, shown in muted text under the source line. */
  credit?: string;
  /** How often the data is refreshed. */
  updates: string;
  /** Path in the repo to the full write-up, when one exists. */
  docPath?: string;
}

export interface MethodGroup {
  id: "presidency" | "congress" | "court" | "shared";
  title: string;
  entries: MethodEntry[];
}

export const HOW_TO_READ: { lead: string; text: string }[] = [
  {
    lead: "Descriptive, not causal.",
    text: "A chart placed under a president shows conditions during that term. It does not claim the president caused them.",
  },
  {
    lead: "One definition per chart.",
    text: "We don’t add figures across agencies or definitions. When a source changes its counting rules, the chart marks the change.",
  },
  {
    lead: "Estimates are labeled.",
    text: "Preliminary, partial and estimated values are hatched or flagged.",
  },
  {
    lead: "Updates.",
    text: "Most sources are checked every week or month, and new data is published only after it passes validation. A few are refreshed by hand. Each entry below says which.",
  },
];

const VOTEVIEW_CITATION =
  "Lewis, Jeffrey B., Keith Poole, Howard Rosenthal, Adam Boche, Aaron Rudkin, and Luke Sonnet (2026). *Voteview: Congressional Roll-Call Votes Database.* https://voteview.com/";

export const METHODOLOGY: MethodGroup[] = [
  {
    id: "presidency",
    title: "Presidency",
    entries: [
      {
        id: "executive-orders",
        vertical: "presidency",
        title: "Executive orders",
        description:
          "Every executive order in the Federal Register since 1994, counted by signing year and assigned one of nine topics.",
        sources: [
          { name: "Federal Register", url: "https://www.federalregister.gov/presidential-documents/executive-orders" },
        ],
        updates: "Checked weekly.",
      },
      {
        id: "economy",
        vertical: "presidency",
        title: "Economy",
        description:
          "Prices, jobs, rates and federal finances on one shared time axis. Jobs added and inflation are calculated from raw levels: jobs added is the monthly change in nonfarm payrolls, and inflation is the 12-month change in consumer prices. The misery index is the unemployment rate plus that inflation rate for the same month.",
        sources: [
          { name: "FRED", url: "https://fred.stlouisfed.org/", note: "Federal Reserve Bank of St. Louis" },
          { name: "U.S. Bureau of Labor Statistics" },
          { name: "U.S. Energy Information Administration", url: "https://www.eia.gov/" },
          { name: "U.S. Census Bureau" },
          { name: "U.S. Office of Management and Budget" },
          { name: "Freddie Mac, Primary Mortgage Market Survey®" },
        ],
        credit:
          "This product uses the FRED® API but is not endorsed or certified by the Federal Reserve Bank of St. Louis.",
        updates: "Checked weekly.",
        docPath: "docs/INDICATORS_METHODOLOGY.md",
      },
      {
        id: "energy",
        vertical: "presidency",
        title: "Energy",
        description:
          "Weekly and monthly petroleum, Strategic Petroleum Reserve, natural gas and electricity series, in the source’s own units. Policy flags come from a hand-kept list of dated actions, each naming the authority behind it.",
        sources: [{ name: "U.S. Energy Information Administration", url: "https://www.eia.gov/" }],
        updates: "Checked weekly.",
        docPath: "docs/ENERGY_METHODOLOGY.md",
      },
      {
        id: "immigration",
        vertical: "presidency",
        title: "Immigration",
        description:
          "ICE removals by fiscal year (FY2003 to FY2025) and by country of citizenship (FY2014 to FY2024). Country tables are checked against their printed totals and the national series.",
        sources: [
          { name: "U.S. Immigration and Customs Enforcement", url: "https://www.ice.gov/statistics" },
        ],
        credit: "U.S. Immigration and Customs Enforcement, Enforcement and Removal Operations.",
        updates: "Refreshed by hand after ICE publishes a fiscal year’s figures.",
        docPath: "docs/IMMIGRATION_ENFORCEMENT_METHODOLOGY.md",
      },
      {
        id: "trade",
        vertical: "presidency",
        title: "Trade",
        description:
          "Goods trade by country and month, with national totals. The tariff chart shows calculated duties divided by imports for consumption, monthly from 1993, with tariff actions flagged from a hand-kept list.",
        sources: [
          { name: "U.S. Census Bureau", url: "https://www.census.gov/foreign-trade/index.html", note: "trade, and duties from 2010" },
          { name: "USITC DataWeb", url: "https://dataweb.usitc.gov/", note: "duties, 1993 to 2009" },
        ],
        credit:
          "This product uses the Census Bureau Data API but is not endorsed or certified by the Census Bureau.",
        updates: "Checked weekly.",
        docPath: "docs/TRADE_METHODOLOGY.md",
      },
      {
        id: "foreign-aid",
        vertical: "presidency",
        title: "Foreign aid",
        description:
          "Disbursements by recipient and sector since FY2001. Military share is the portion of a recipient’s total the source classes as military assistance.",
        sources: [{ name: "ForeignAssistance.gov", url: "https://foreignassistance.gov/" }],
        updates: "Checked weekly.",
        docPath: "docs/FOREIGN_AID_METHODOLOGY.md",
      },
      {
        id: "national-security",
        vertical: "presidency",
        title: "National security",
        description:
          "Active-duty personnel by country, from the Defense Manpower Data Center for 2008 onward and from historical tables before that. An optional layer marks known overseas installations, from a single snapshot with no headcounts.",
        sources: [
          { name: "Defense Manpower Data Center", url: "https://dwp.dmdc.osd.mil/dwp/app/dod-data-reports/workforce-reports", note: "2008 onward" },
          { name: "troopdata", url: "https://github.com/meflynn/troopdata", note: "and DMDC historical tables, earlier years; David Vine’s base lists, through 2018" },
        ],
        credit:
          "troopdata is used under the GPL-3.0 license; the license text is included in the project repository. Allen, Flynn and Martinez Machain (2022), “Global U.S. military deployment data: 1950-2020,” *Conflict Management and Peace Science* 39(3): 351-370.",
        updates: "Checked weekly for new quarterly reports.",
        docPath: "docs/TROOPS_METHODOLOGY.md",
      },
    ],
  },
  {
    id: "congress",
    title: "Congress",
    entries: [
      {
        id: "ideology",
        vertical: "congress",
        title: "Ideology scores",
        description:
          "DW-NOMINATE scores built from every recorded vote a member has cast. The horizontal axis is economic left-right. The vertical axis has meant different things in different eras, and the chart says which.",
        sources: [
          { name: "Voteview", url: "https://voteview.com/data", note: "scores" },
          { name: "congress-legislators", url: "https://github.com/unitedstates/congress-legislators", note: "biographies, terms, party, leadership" },
        ],
        credit: VOTEVIEW_CITATION,
        updates: "Checked weekly.",
      },
      {
        id: "committees",
        vertical: "congress",
        title: "Committees",
        description:
          "A committee’s position is the unweighted average of its members’ scores. Its spread is the gap between its most liberal and most conservative member. Each committee page also lists the bills referred to it this Congress and how far each got: a hearing, a markup, a report or discharge, passage, law. A step the Library of Congress never logged is shown as not recorded, not guessed.",
        sources: [
          { name: "congress-legislators", url: "https://github.com/unitedstates/congress-legislators", note: "rosters" },
          { name: "Voteview", url: "https://voteview.com/data", note: "scores, as above" },
          { name: "GovInfo Bill Status", url: "https://www.govinfo.gov/bulkdata/BILLSTATUS", note: "bills and their committee steps" },
        ],
        credit: "Bills, sponsors, cosponsors and committee steps: GovInfo Bill Status (U.S. Government Publishing Office, with the Library of Congress and the Congressional Research Service).",
        updates: "Rosters checked daily, scores weekly, bills weekly.",
        docPath: "docs/COMMITTEE_BILLS_METHODOLOGY.md",
      },
      {
        id: "laws",
        vertical: "congress",
        title: "Laws",
        description:
          "Every public law since 1973, counted by the Congress that enacted it and its Congress.gov policy area, with the closest recorded final-passage vote in either chamber. Major laws are David Mayhew’s lists of important enactments, through the 118th Congress. The sentence under a law is the first sentence of the Congressional Research Service summary, never written by us.",
        sources: [
          { name: "Congress.gov", url: "https://www.congress.gov/", note: "laws, policy areas, sponsors, summaries, 1973–2002" },
          { name: "GovInfo Bill Status", url: "https://www.govinfo.gov/bulkdata/BILLSTATUS", note: "the same fields, 2003 on" },
          { name: "Voteview", url: "https://voteview.com/data", note: "roll calls, to check passage tallies" },
          { name: "David Mayhew", url: "https://campuspress.yale.edu/davidmayhew/datasets-divided-we-govern/", note: "important enactments" },
          { name: "Senate Historical Office", url: "https://www.senate.gov/history/partydiv.htm", note: "party control" },
        ],
        credit:
          VOTEVIEW_CITATION +
          " Mayhew, David R. *Divided We Govern: Party Control, Lawmaking, and Investigations, 1946–2002*, 2nd ed. (Yale University Press, 2005), and his lists of important laws enacted for later Congresses. Laws, policy areas and summaries: Congress.gov (Library of Congress) and GovInfo (U.S. Government Publishing Office); summaries by the Congressional Research Service.",
        updates: "Checked weekly; the major-law lists are updated by hand when Mayhew publishes a new one.",
        docPath: "docs/LAWS_METHODOLOGY.md",
      },
      {
        id: "demographics",
        vertical: "congress",
        title: "Demographics",
        description:
          "Age, women and years served for every voting member who held a seat in each Congress since 1933, with ages counted on the day the Congress convened.",
        sources: [
          { name: "congress-legislators", url: "https://github.com/unitedstates/congress-legislators", note: "birthdates, gender, terms" },
        ],
        updates: "Checked daily.",
        docPath: "docs/DEMOGRAPHICS_METHODOLOGY.md",
      },
      {
        id: "net-worth",
        vertical: "congress",
        title: "Net worth",
        description:
          "Disclosures report assets and debts in ranges. We take each range’s midpoint, subtract debts from assets, and show the full range as a band.",
        sources: [
          { name: "House Clerk", url: "https://disclosures-clerk.house.gov/FinancialDisclosure", note: "financial disclosures" },
          { name: "Senate", url: "https://efdsearch.senate.gov/search/home/", note: "electronic financial disclosures" },
        ],
        updates: "Refreshed by hand after new filings are published.",
        docPath: "docs/NET_WORTH_METHODOLOGY.md",
      },
    ],
  },
  {
    id: "court",
    title: "Supreme Court",
    entries: [
      {
        id: "court-ideology",
        vertical: "court",
        title: "Supreme Court ideology",
        description:
          "Martin-Quinn scores estimate each justice’s position by term from their votes, with an uncertainty interval. The Court’s middle is the justice most likely to cast the deciding vote.",
        sources: [
          { name: "Martin-Quinn scores", url: "https://mqscores.wustl.edu/measures.php" },
          { name: "Supreme Court Database", url: "http://scdb.wustl.edu/data.php", note: "identifiers" },
          { name: "Federal Judicial Center", url: "https://www.fjc.gov/history/judges", note: "biographies" },
        ],
        credit:
          "Martin, Andrew D. and Kevin M. Quinn. 2002. “Dynamic Ideal Point Estimation via Markov Chain Monte Carlo for the U.S. Supreme Court, 1953–1999.” *Political Analysis* 10:134–153.",
        updates: "Checked monthly for a new release.",
        docPath: "docs/SCOTUS_DATA_METHODOLOGY.md",
      },
      {
        id: "decisions",
        vertical: "court",
        title: "Supreme Court decisions",
        description:
          "Orally argued cases counted by term, issue area and how many justices dissented. The one-sentence ruling under a linked case is Wikipedia’s own opening sentence or, where that does not state the ruling, one written by Claude from it and held to the article’s words.",
        sources: [
          { name: "Supreme Court Database", url: "http://scdb.wustl.edu/data.php", note: "counts" },
          { name: "Wikipedia", url: "https://en.wikipedia.org/wiki/List_of_landmark_court_decisions_in_the_United_States", note: "landmark list, case articles" },
        ],
        credit:
          "Harold J. Spaeth, Lee Epstein, Andrew D. Martin, Jeffrey A. Segal, Theodore J. Ruger, Sara C. Benesh, and Michael J. Nelson. 2026 Supreme Court Database, Version 2026 Release 01. URL: http://supremecourtdatabase.org. Licensed CC BY-NC 3.0 US. Wikipedia text is available under CC BY-SA 4.0.",
        updates: "Database checked monthly; Wikipedia links checked weekly.",
        docPath: "docs/DECISIONS_METHODOLOGY.md",
      },
    ],
  },
  {
    id: "shared",
    title: "Shared sources",
    entries: [
      {
        id: "recessions",
        vertical: "shared",
        title: "Recession dates",
        description: "Shaded on the Economy, Energy and Trade time charts.",
        sources: [
          { name: "National Bureau of Economic Research", url: "https://www.nber.org/research/data/us-business-cycle-expansions-and-contractions", note: "via FRED" },
        ],
        updates: "Checked weekly with the Economy data.",
      },
      {
        id: "maps",
        vertical: "shared",
        title: "Maps",
        description:
          "World outlines on the trade, foreign aid, immigration and national security maps.",
        sources: [{ name: "Natural Earth", url: "https://www.naturalearthdata.com/" }],
        credit: "Made with Natural Earth.",
        updates: "Fixed snapshot.",
      },
      {
        id: "biographies",
        vertical: "shared",
        title: "Biographies and photos",
        description:
          "Short biographies on member and justice pages, and portraits of current members and of justices whose picture is public domain.",
        sources: [
          { name: "Wikipedia", url: "https://www.wikipedia.org/" },
          { name: "@unitedstates/images", url: "https://github.com/unitedstates/images", note: "member portraits from the Government Publishing Office" },
        ],
        credit: "Wikipedia text is available under the Creative Commons Attribution-ShareAlike 4.0 license.",
        updates: "Checked weekly.",
      },
    ],
  },
];
