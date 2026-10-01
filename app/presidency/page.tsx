import type { Metadata } from "next";
import { getExecutiveOrdersData } from "@/lib/executive-orders-data";
import { ExecutiveOrdersPageClient } from "@/components/executive-orders/ExecutiveOrdersPageClient";
import { site } from "@/lib/site";

/** /presidency — the Presidency branch's one section. */
export const metadata: Metadata = {
  title: "Executive orders by year and topic",
  description:
    "Executive orders signed each year since 1994, stacked by primary topic, with presidential terms marked. From the Federal Register.",
  alternates: { canonical: "/presidency" },
  openGraph: {
    title: `Executive orders by year and topic · ${site.name}`,
    description: "Executive orders signed each year since 1994, by primary topic. From the Federal Register.",
    url: "/presidency",
  },
};

export default function ExecutiveOrdersPage() {
  return <ExecutiveOrdersPageClient data={getExecutiveOrdersData()} />;
}
