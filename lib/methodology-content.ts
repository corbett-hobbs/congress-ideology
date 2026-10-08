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
  /** The "worth knowing" line. */
  caveats: string;
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
        caveats:
          "Topics are our grouping, assigned by a language model from each order’s title and agencies. A person checked a random sample of 100 and agreed with every one, so counts by topic are classifier-assisted, not audited. A transition year counts orders under both presidents.",
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
        caveats:
          "Recent months are often revised. Household income and the deficit are annual figures that arrive a year or more late.",
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
        caveats:
          "The newest months are preliminary and marked as such. Flags for actions whose effects arrive years later say “enabled, not caused.”",
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
        caveats:
          "ICE only. Removals carried out by Border Patrol itself and Title 42 expulsions are excluded, so these are not DHS-wide totals. Returns are counted from FY2007 on. Counting rules changed over time, and the chart marks each change.",
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
        caveats:
          "The duty source changes in 2010, marked on the chart. The national line is seasonally adjusted; country lines are not.",
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
        caveats:
          "Foreign assistance only: most arms sales are not in the source. Dollars are nominal, not adjusted for inflation. The default year is the latest complete one.",
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
        caveats:
          "The series changes meaning in December 2017 (permanent assignment only), and 2006 and 2007 are estimates, so we never calculate a change across those breaks. Afghanistan, Iraq and Syria are “not reported,” not zero, from December 2017 to September 2021. Territories and ships at sea are not counted as hosts. Newer, classified and unacknowledged installations are missing from the base layer.",
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
        caveats:
          "Scores describe voting relative to colleagues, not beliefs. A member who served in both chambers in one Congress appears once for each.",
      },
      {
        id: "committees",
        vertical: "congress",
        title: "Committees",
        description:
          "A committee’s position is the unweighted average of its members’ scores. Its spread is the gap between its most liberal and most conservative member.",
        sources: [
          { name: "congress-legislators", url: "https://github.com/unitedstates/congress-legislators", note: "rosters" },
          { name: "Voteview", url: "https://voteview.com/data", note: "scores, as above" },
        ],
        updates: "Rosters checked daily, scores weekly.",
        caveats: "Current Congress only. The source has no historical rosters.",
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
        caveats:
          "A member replaced mid-term and the replacement both count, so a Congress has more members than seats. Delegates and resident commissioners are left out. A few members have no birthdate and are left out of the age figures.",
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
        caveats:
          "Figures are read from scanned and PDF filings and can contain errors, so each year carries a confidence flag and only high-confidence filings count toward totals. The top range has no upper limit, so very large estimates are floors.",
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
        caveats:
          "Scores are not on the same scale as congressional DW-NOMINATE scores. Intervals can overlap. Terms with a mid-term change in membership are split into two parts.",
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
        caveats:
          "Summary dispositions decided without argument are excluded. Dissent bands count dissents, not the full tally, so a 5–3 decision falls in the 6–3 band. Not every case has a Wikipedia article.",
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
        caveats:
          "Dates are announced after the fact, so the most recent months may not be shaded yet.",
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
        caveats: "Simplified for the web, so small borders are approximate.",
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
        caveats:
          "Biographies are trimmed to whole sentences, never rewritten, and each excerpt links to its source article.",
      },
    ],
  },
];
