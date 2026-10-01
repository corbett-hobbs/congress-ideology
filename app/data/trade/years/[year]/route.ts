import { getTradeYear, getTradeYears } from "@/lib/trade-data";

/**
 * `/data/trade/years/<year>` — every partner's goods trade and calculated duties
 * for one year, prerendered to static JSON. The year slider fetches it on demand.
 */
export const dynamic = "force-static";
export const dynamicParams = false;

export function generateStaticParams() {
  return getTradeYears().map((y) => ({ year: String(y) }));
}

export async function GET(_request: Request, { params }: { params: Promise<{ year: string }> }) {
  const { year } = await params;
  const body = /^\d{4}$/.test(year) ? getTradeYear(Number(year)) : null;
  if (!body) return new Response("Not found", { status: 404 });
  return Response.json(body, { headers: { "cache-control": "public, max-age=3600, s-maxage=86400" } });
}
