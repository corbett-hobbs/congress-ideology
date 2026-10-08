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
  const { whyIBuiltIt, fundingStatement, builderName, githubUrl } = siteInfo;
  return (
    <main className="mx-auto flex w-full max-w-[1180px] flex-1 flex-col gap-8 px-4 pb-16 pt-10 sm:px-6 sm:pt-14">
      <PageHeader title="About InsideGov">
        <p>
          InsideGov puts public government records into charts you can explore, so you can see what the data shows about
          the presidency, Congress and the Supreme Court without reading the raw files.
        </p>
      </PageHeader>

      <div className="flex flex-col gap-7 text-[0.95rem] leading-[1.65] [&_p]:m-0">
        <Section title="Why it exists">
          <p>
            Government data is public, but it is scattered across agencies and published in formats built for
            specialists. InsideGov gathers it in one place, lines it up by date and by who was in office, and makes the
            patterns visible.
            {whyIBuiltIt ? ` ${whyIBuiltIt}` : ""}
          </p>
        </Section>

        <Section title="Questions it helps answer">
          <ul className="m-0 flex list-disc flex-col gap-1.5 pl-5">
            {QUESTIONS.map((q) => (
              <li key={q}>{q}</li>
            ))}
          </ul>
        </Section>

        <Section title="Who it’s for">
          <p>Voters, students, teachers, journalists and anyone curious. No account is needed.</p>
        </Section>

        <Section title="How to read it">
          <p>
            The charts describe what the records show. They don’t claim that a president or a party caused what
            happened. <Link href="/methodology" className={LINK}>Methodology and sources</Link> explains what each chart
            measures and where its numbers come from.
          </p>
        </Section>

        <Section title="How it’s made">
          <p>
            Data comes straight from the original publishers, is checked automatically, and updates when they publish new
            figures. The code and data pipeline are open on{" "}
            <a href={githubUrl} className={LINK}>GitHub</a>.
          </p>
        </Section>

        <Section title="Independence">
          <p>
            InsideGov is an independent project. It is not affiliated with, endorsed by, or funded by any government
            agency, political party, campaign or advocacy group.
            {fundingStatement ? ` ${fundingStatement}` : ""}
          </p>
        </Section>

        {builderName && (
          <Section title="Who’s behind it">
            <p>InsideGov is built and maintained by {builderName}.</p>
          </Section>
        )}

        <Section title="Contact">
          <p>
            Questions, ideas, or a number that looks wrong? Use the{" "}
            <Link href="/contact" className={LINK}>contact form</Link>. We fix confirmed errors and note significant
            ones.
          </p>
        </Section>
      </div>
    </main>
  );
}
