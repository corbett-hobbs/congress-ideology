import { getTradeCountry, getTradeCountryRefs } from "@/lib/trade-data";

/**
 * `/data/trade/countries/<country_code>` — one country's monthly goods trade and
 * calculated duties, every year, prerendered to static JSON at build. The trade
 * page fetches it when a country is selected (precedent: `/data/[chamber]`).
 */
export const dynamic = "force-static";
export const dynamicParams = false;

export function generateStaticParams() {
  return getTradeCountryRefs().map((c) => ({ country_code: c.code }));
}

export async function GET(_request: Request, { params }: { params: Promise<{ country_code: string }> }) {
  const { country_code } = await params;
  const body = getTradeCountry(country_code);
  if (!body) return new Response("Not found", { status: 404 });
  return Response.json(body, { headers: { "cache-control": "public, max-age=3600, s-maxage=86400" } });
}
