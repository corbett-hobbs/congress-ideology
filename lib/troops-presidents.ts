import type { Administration } from "./executive-orders-entities";
import { BUSH_41 } from "./economy-presidents";

/**
 * Presidents before the administrations table starts (it begins in 1993 because the Federal Register EO data does):
 * Roosevelt (for the demographics page, 1933) and Truman through George H. W. Bush, same shape and the same `term_id` convention (the date they took office), so
 * the troops page can carry its 1950-2007 history. Kennedy/Johnson and Nixon/Ford are separate terms (Nov 22, 1963
 * and Aug 9, 1974). Page-local on purpose: `administrations.json` belongs to the executive-orders pipeline.
 */
const t = (term_id: string, president: string, slug: string, party: "Democratic" | "Republican", end: string): Administration => ({ term_id, president, president_slug: slug, party, start: term_id, end });

export const HISTORICAL_ADMINISTRATIONS: readonly Administration[] = [
  // Roosevelt's four terms are one tenure (one `term_id`); he is here for the demographics page, which starts in 1933.
  t("1933-03-04", "Franklin D. Roosevelt", "franklin-d-roosevelt", "Democratic", "1945-04-11"),
  t("1945-04-12", "Harry S. Truman", "harry-s-truman", "Democratic", "1953-01-19"),
  t("1953-01-20", "Dwight D. Eisenhower", "dwight-d-eisenhower", "Republican", "1961-01-19"),
  t("1961-01-20", "John F. Kennedy", "john-f-kennedy", "Democratic", "1963-11-21"),
  t("1963-11-22", "Lyndon B. Johnson", "lyndon-b-johnson", "Democratic", "1969-01-19"),
  t("1969-01-20", "Richard Nixon", "richard-nixon", "Republican", "1974-08-08"),
  t("1974-08-09", "Gerald Ford", "gerald-ford", "Republican", "1977-01-19"),
  t("1977-01-20", "Jimmy Carter", "jimmy-carter", "Democratic", "1981-01-19"),
  t("1981-01-20", "Ronald Reagan", "ronald-reagan", "Republican", "1989-01-19"),
  BUSH_41,
];
