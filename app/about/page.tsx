import type { Metadata } from "next";
import Link from "next/link";
import { PageHeader } from "@/components/PageHeader";
import { siteInfo } from "@/lib/site-info";
import { site, ogDefaults, twitterDefaults } from "@/lib/site";

const DESCRIPTION =
  "InsideGov puts public government records into charts you can explore: the presidency, Congress and the Supreme Court, without reading the raw files.";

export const metadata: Metadata = {
  title: "About",
  description: DESCRIPTION,
  alternates: { canonical: "/about" },
  openGraph: {
    ...ogDefaults,
    title: `About · ${site.name}`,
    description: DESCRIPTION,
    url: "/about",
  },
  twitter: twitterDefaults,
};

const QUESTIONS = [
  "How many executive orders has each president signed, and on what topics?",
  "How divided is Congress, and does my state’s delegation vote as a bloc?",
  "How have prices, jobs, trade and energy moved from one administration to the next?",
  "Where do U.S. troops and foreign aid go, and how has that changed?",
  "How has the Supreme Court’s middle moved over time?",
];

const LINK =
  "text-accent underline underline-offset-2 hover:decoration-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent";

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-2">
      <h2 className="m-0 font-serif text-[1.3rem] font-medium leading-tight">{title}</h2>
      {children}
    </section>
  );
}

export default function AboutPage() {
  const { fundingStatement, builderName, githubUrl } = siteInfo;
  return (
    <main className="mx-auto flex w-full max-w-[1180px] flex-1 flex-col gap-8 px-4 pb-16 pt-10 sm:px-6 sm:pt-14">
      <PageHeader title="About InsideGov">
        <p>
          InsideGov puts public government records into charts you can explore, so you can see what the data shows about
          the presidency, Congress and the Supreme Court without reading the raw files.
        </p>
      </PageHeader>

      <div className="flex flex-col gap-7 text-[0.95rem] leading-[1.65] [&_p]:m-0">
        <Section title="Why I built this">
          <p>
            Almost everything the federal government does leaves a public record: roll-call votes, executive orders,
            financial disclosures, trade statistics, court decisions, troop counts. Very little of it is easy to read.
            It is spread across dozens of agencies and published in formats meant for specialists. InsideGov does the
            work of lining it up once, in the open, so anyone can see what the records show.
          </p>
          <p>
            I studied international politics at Georgetown’s School of Foreign Service and worked in the press office of
            U.S. Senator Charles Schumer. That showed me how much of politics is an argument about framing. What drew
            me was the layer underneath: what actually happened, and what the numbers say.
          </p>
          <p>
            In 2013 I joined FindTheBest, later renamed Graphiq, which turned large public datasets into charts anyone
            could browse or embed. There I launched the original InsideGov.com, which reached 5.1 million visitors a
            month in its first year. On election night 2016 we sent live-updating results charts to publishers
            including Reuters, Fox News and Yahoo, and drew 2.3 million people to Graphiq’s site, a company record.
            After Amazon acquired Graphiq in 2017, I ran the politics vertical for Alexa.
          </p>
          <p>
            I started this version in August 2026. I decide which questions are worth asking, which sources to trust
            and what the editorial rules are, and Claude writes much of the code. That lets one person build and
            maintain what once took a team.
          </p>
        </Section>

        <Section title="Questions it helps answer">
          <ul className="m-0 flex list-disc flex-col gap-1.5 pl-5">
            {QUESTIONS.map((q) => (
              <li key={q}>{q}</li>
            ))}
          </ul>
        </Section>

        <Section title="How it’s made and how to read it">
          <p>
            Every number comes from a named public source through an automated, checked pipeline, and the code and data
            are open on <a href={githubUrl} className={LINK}>GitHub</a>. Each chart has Data notes saying what it
            measures and what to be careful about. The charts describe what the records show; they don’t claim that a
            president or party caused it. <Link href="/methodology" className={LINK}>Methodology and sources</Link>{" "}
            has the detail.
          </p>
        </Section>

        <Section title="Independence">
          <p>
            InsideGov is not affiliated with, endorsed by, or funded by any government agency, party, campaign or
            advocacy group. {fundingStatement}
          </p>
        </Section>

        <Section title="Who’s behind it">
          <p>
            InsideGov is built and maintained by {builderName}. Found a mistake or have an idea? Use the{" "}
            <Link href="/contact" className={LINK}>contact form</Link>; confirmed errors are fixed and significant ones
            noted.
          </p>
        </Section>
      </div>
    </main>
  );
}
