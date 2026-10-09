import type { Metadata } from "next";
import { PageHeader } from "@/components/PageHeader";
import { HOW_TO_READ, METHODOLOGY, type MethodEntry, type MethodSource } from "@/lib/methodology-content";
import { docUrl } from "@/lib/site-info";
import { site, ogDefaults, twitterDefaults } from "@/lib/site";

const DESCRIPTION =
  "What each InsideGov chart measures, where its numbers come from, how often they update, and what to keep in mind when reading them.";

export const metadata: Metadata = {
  title: "Methodology and sources",
  description: DESCRIPTION,
  alternates: { canonical: "/methodology" },
  openGraph: {
    ...ogDefaults,
    title: `Methodology and sources · ${site.name}`,
    description: DESCRIPTION,
    url: "/methodology",
  },
  twitter: twitterDefaults,
};

const FOCUS = "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent";
const LINK = `text-accent underline underline-offset-2 hover:decoration-2 ${FOCUS}`;

/** `*text*` renders in italics. */
function Rich({ text }: { text: string }) {
  return (
    <>
      {text.split("*").map((part, i) => (i % 2 ? <em key={i}>{part}</em> : part))}
    </>
  );
}

function SourceList({ sources }: { sources: MethodSource[] }) {
  return (
    <>
      {sources.map((s, i) => (
        <span key={s.name}>
          {i > 0 && "; "}
          {s.url ? (
            <a href={s.url} className={LINK}>{s.name}</a>
          ) : (
            s.name
          )}
          {s.note && ` (${s.note})`}
        </span>
      ))}
    </>
  );
}

function Entry({ entry }: { entry: MethodEntry }) {
  return (
    <div
      id={entry.id}
      className="grid scroll-mt-4 gap-1 border-b border-line py-4 first:border-t md:grid-cols-[13rem_minmax(0,1fr)] md:gap-x-7"
    >
      <h3 className="m-0 text-[0.95rem] font-semibold leading-snug">
        {entry.docPath ? (
          <a href={docUrl(entry.docPath)} className={`hover:underline ${FOCUS}`}>{entry.title}</a>
        ) : (
          entry.title
        )}
      </h3>
      <div className="flex min-w-0 flex-col gap-2 text-[0.95rem] leading-[1.65] [&_p]:m-0">
        <p>{entry.description}</p>
        <div>
          <p className="text-[0.88rem] text-ink-muted">
            Source: <SourceList sources={entry.sources} />
          </p>
          {entry.credit && (
            <p className="mt-1 text-[0.8rem] text-ink-muted"><Rich text={entry.credit} /></p>
          )}
        </div>
        <p className="text-[0.88rem] text-ink-muted">
          <span className="font-medium text-ink">Updates:</span> {entry.updates}
        </p>
      </div>
    </div>
  );
}

export default function MethodologyPage() {
  return (
    <main className="mx-auto flex w-full max-w-[1180px] flex-1 flex-col gap-8 px-4 pb-16 pt-10 sm:px-6 sm:pt-14">
      <PageHeader title="Methodology and sources">
        <p>
          What each chart measures, where its numbers come from, and what to keep in mind when reading it. A title links
          to the full write-up where one exists.
        </p>
      </PageHeader>

      <section className="flex flex-col gap-2">
        <h2 className="m-0 font-serif text-[1.3rem] font-medium leading-tight">How to read it</h2>
        <ul className="m-0 flex list-disc flex-col gap-1.5 pl-5 text-[0.95rem] leading-[1.65]">
          {HOW_TO_READ.map((p) => (
            <li key={p.lead}>
              <strong className="font-semibold">{p.lead}</strong> {p.text}
            </li>
          ))}
        </ul>
        <nav aria-label="On this page" className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {METHODOLOGY.map((g) => (
            <a
              key={g.id}
              href={`#${g.id}`}
              className={`flex flex-col gap-1 rounded-xl border border-line bg-surface p-4 transition-colors hover:border-accent ${FOCUS}`}
            >
              <span className="font-serif text-[1.15rem] font-medium leading-tight text-ink">{g.title}</span>
              <span className="text-[0.85rem] leading-snug text-ink-muted">
                {g.entries.map((e) => e.title).join(", ")}
              </span>
            </a>
          ))}
        </nav>
      </section>

      {METHODOLOGY.map((g) => (
        <section key={g.id} aria-labelledby={g.id} className="flex flex-col">
          <h2 id={g.id} className="m-0 mb-3 scroll-mt-4 font-serif text-[1.3rem] font-medium leading-tight">
            {g.title}
          </h2>
          {g.entries.map((e) => (
            <Entry key={e.id} entry={e} />
          ))}
        </section>
      ))}
    </main>
  );
}
