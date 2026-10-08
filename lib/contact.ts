/**
 * Pure helpers for the contact form: shared by the client form (prefill, labels)
 * and the API route (validation, subject/body building, rate limiting). Nothing
 * here touches the network, so it is all unit-testable.
 */

export const TOPICS = ["correction", "question", "idea"] as const;
export type Topic = (typeof TOPICS)[number];
export const DEFAULT_TOPIC: Topic = "correction";

export const TOPIC_COPY: Record<
  Topic,
  { option: string; messageLabel: string; showExpected: boolean; done: string }
> = {
  correction: {
    option: "Report a correction",
    messageLabel: "What looks wrong?",
    showExpected: true,
    done: "We check reported numbers against their source, fix confirmed errors, and note significant ones.",
  },
  question: {
    option: "Ask a question",
    messageLabel: "What would you like to know?",
    showExpected: false,
    done: "If you left an email, you will get a reply there.",
  },
  idea: {
    option: "Share an idea or feedback",
    messageLabel: "What is your idea or feedback?",
    showExpected: false,
    done: "If you left an email, you may get a reply there.",
  },
};

export const LIMITS = {
  body: 20_000,
  message: 5000,
  page: 200,
  expected: 1000,
  email: 200,
} as const;

export function parseTopic(value: unknown): Topic {
  return (TOPICS as readonly string[]).includes(value as string) ? (value as Topic) : DEFAULT_TOPIC;
}

/** A page path from the query string or form: must start with "/", at most 200 chars, else "". */
export function parsePagePath(value: unknown): string {
  if (typeof value !== "string") return "";
  const v = value.trim();
  return v.startsWith("/") && v.length <= LIMITS.page ? v : "";
}

/** Strips CR/LF and every other control character (blocks header injection). */
export function stripControl(value: string): string {
  return value.replace(/[\u0000-\u001f\u007f-\u009f\u2028\u2029]+/g, " ").replace(/\s+/g, " ").trim();
}

const EMAIL_RE = /^[^\s@<>"',;:()[\]\\]+@[^\s@<>"',;:()[\]\\]+\.[^\s@<>"',;:()[\]\\]{2,}$/;

export function validEmail(value: unknown): string {
  if (typeof value !== "string") return "";
  const v = value.trim();
  return v.length <= LIMITS.email && EMAIL_RE.test(v) ? v : "";
}

export interface ContactInput {
  topic: Topic;
  message: string;
  page: string;
  expected: string;
  email: string;
}

export type ParseResult =
  | { kind: "ok"; input: ContactInput }
  | { kind: "honeypot" }
  | { kind: "invalid"; error: string };

function str(v: unknown): string {
  return typeof v === "string" ? v : "";
}

/** Server-side validation of a parsed JSON body. The honeypot field is `website`. */
export function parseContactBody(raw: unknown): ParseResult {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return { kind: "invalid", error: "Invalid request." };
  const b = raw as Record<string, unknown>;
  if (str(b.website).trim() !== "") return { kind: "honeypot" };
  const message = str(b.message).trim();
  if (!message) return { kind: "invalid", error: "Please enter a message." };
  if (message.length > LIMITS.message) return { kind: "invalid", error: "That message is too long." };
  return {
    kind: "ok",
    input: {
      topic: parseTopic(b.topic),
      message,
      page: stripControl(str(b.page)).slice(0, LIMITS.page),
      expected: str(b.expected).trim().slice(0, LIMITS.expected),
      email: validEmail(b.email),
    },
  };
}

export function buildSubject(input: ContactInput): string {
  const base = `InsideGov: ${TOPIC_COPY[input.topic].option}`;
  return input.page ? `${base} (${stripControl(input.page)})` : base;
}

/** Plain text only. */
export function buildBody(input: ContactInput): string {
  const lines = [`Topic: ${TOPIC_COPY[input.topic].option}`, `Page: ${input.page || "(none)"}`, ""];
  lines.push(`${TOPIC_COPY[input.topic].messageLabel}`, input.message, "");
  if (input.topic === "correction" && input.expected) {
    lines.push("What it should be, and where it was found:", input.expected, "");
  }
  lines.push(`Reply email: ${input.email || "(none given)"}`);
  return lines.join("\n");
}

/**
 * Best-effort in-memory limiter. State lives in one serverless instance, so it is weak:
 * the real protection is a Vercel Firewall rate-limit rule (dashboard config).
 */
export function createRateLimiter(max: number, windowMs: number) {
  const hits = new Map<string, number[]>();
  return function allow(key: string, now: number = Date.now()): boolean {
    const recent = (hits.get(key) ?? []).filter((t) => now - t < windowMs);
    if (recent.length >= max) {
      hits.set(key, recent);
      return false;
    }
    recent.push(now);
    hits.set(key, recent);
    if (hits.size > 5000) {
      for (const [k, v] of hits) if (v.every((t) => now - t >= windowMs)) hits.delete(k);
    }
    return true;
  };
}
