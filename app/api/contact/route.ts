import { buildBody, buildSubject, createRateLimiter, LIMITS, parseContactBody } from "@/lib/contact";

// Per serverless instance, so weak. Real protection is a Vercel Firewall rate-limit
// rule (dashboard config, not code).
const allow = createRateLimiter(5, 10 * 60 * 1000);

function json(body: Record<string, unknown>, status = 200) {
  return Response.json(body, { status });
}

export async function POST(request: Request) {
  const declared = Number(request.headers.get("content-length") ?? 0);
  if (declared > LIMITS.body) return json({ ok: false, error: "Message too large." }, 413);

  const ip = (request.headers.get("x-forwarded-for") ?? "").split(",")[0].trim() || "unknown";
  if (!allow(ip)) return json({ ok: false, error: "Too many messages. Try again later." }, 429);

  let text: string;
  try {
    text = await request.text();
  } catch {
    return json({ ok: false, error: "Invalid request." }, 400);
  }
  if (text.length > LIMITS.body) return json({ ok: false, error: "Message too large." }, 413);

  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return json({ ok: false, error: "Invalid request." }, 400);
  }

  const parsed = parseContactBody(raw);
  if (parsed.kind === "honeypot") return json({ ok: true });
  if (parsed.kind === "invalid") return json({ ok: false, error: parsed.error }, 400);

  const to = process.env.CONTACT_TO_EMAIL;
  const key = process.env.RESEND_API_KEY;
  if (!to || !key) {
    const missing = [!to && "CONTACT_TO_EMAIL", !key && "RESEND_API_KEY"].filter(Boolean).join(", ");
    console.error(`contact: missing environment variable(s): ${missing}`);
    return json({ ok: false, error: "Couldn't send your message." }, 500);
  }

  const { input } = parsed;
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: "InsideGov <onboarding@resend.dev>",
        to: [to],
        subject: buildSubject(input),
        text: buildBody(input),
        ...(input.email ? { reply_to: input.email } : {}),
      }),
    });
    if (!res.ok) {
      console.error(`contact: email provider returned status ${res.status}`);
      return json({ ok: false, error: "Couldn't send your message." }, 502);
    }
  } catch {
    console.error("contact: email provider request failed");
    return json({ ok: false, error: "Couldn't send your message." }, 502);
  }
  return json({ ok: true });
}
