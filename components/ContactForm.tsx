"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { useSearchParams } from "next/navigation";
import { DEFAULT_TOPIC, LIMITS, parsePagePath, parseTopic, TOPICS, TOPIC_COPY, type Topic } from "@/lib/contact";

const FIELD =
  "w-full rounded-md border border-line-strong bg-surface px-3 py-2 text-[0.92rem] text-ink focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-accent";
const LABEL = "text-[0.85rem] font-medium text-ink";
const HINT = "font-normal text-ink-muted";

/** The message form on /contact. Prefills `topic` and `page` from the query string. */
export function ContactForm() {
  const params = useSearchParams();
  const [topic, setTopic] = useState<Topic>(() => parseTopic(params.get("topic") ?? DEFAULT_TOPIC));
  const [page, setPage] = useState(() => parsePagePath(params.get("page")));
  const [message, setMessage] = useState("");
  const [expected, setExpected] = useState("");
  const [email, setEmail] = useState("");
  const [website, setWebsite] = useState("");
  const [sending, setSending] = useState(false);
  const [fieldError, setFieldError] = useState("");
  const [sendError, setSendError] = useState("");
  const [doneTopic, setDoneTopic] = useState<Topic | null>(null);
  const messageRef = useRef<HTMLTextAreaElement>(null);
  const doneRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (doneTopic) doneRef.current?.focus();
  }, [doneTopic]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setSendError("");
    if (!message.trim()) {
      setFieldError("Please enter a message.");
      messageRef.current?.focus();
      return;
    }
    setFieldError("");
    setSending(true);
    try {
      const res = await fetch("/api/contact", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ topic, page, message, expected, email, website }),
      });
      if (res.ok) setDoneTopic(topic);
      else setSendError("Couldn’t send your message. Try again in a minute.");
    } catch {
      setSendError("Couldn’t send your message. Try again in a minute.");
    } finally {
      setSending(false);
    }
  }

  if (doneTopic) {
    return (
      <div
        ref={doneRef}
        role="status"
        tabIndex={-1}
        className="flex max-w-[40rem] flex-col gap-2 rounded-lg border border-line bg-surface p-5 text-[0.95rem] leading-[1.6] outline-none focus-visible:outline-2 focus-visible:outline-accent [&_p]:m-0"
      >
        <p>
          <strong>Thanks, your message was sent.</strong>
        </p>
        <p className="text-ink-muted">{TOPIC_COPY[doneTopic].done}</p>
      </div>
    );
  }

  const copy = TOPIC_COPY[topic];
  return (
    <form onSubmit={onSubmit} noValidate className="flex max-w-[40rem] flex-col gap-4" aria-label="Contact form">
      <div className="flex flex-col gap-1.5">
        <label htmlFor="contact-topic" className={LABEL}>
          What is this about?
        </label>
        <select id="contact-topic" value={topic} onChange={(e) => setTopic(parseTopic(e.target.value))} className={FIELD}>
          {TOPICS.map((t) => (
            <option key={t} value={t}>
              {TOPIC_COPY[t].option}
            </option>
          ))}
        </select>
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="contact-page" className={LABEL}>
          Page or chart <span className={HINT}>(optional)</span>
        </label>
        <input
          id="contact-page"
          type="text"
          value={page}
          maxLength={LIMITS.page}
          onChange={(e) => setPage(e.target.value)}
          autoComplete="off"
          className={FIELD}
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="contact-message" className={LABEL}>
          {copy.messageLabel}
        </label>
        <textarea
          id="contact-message"
          ref={messageRef}
          rows={6}
          value={message}
          maxLength={LIMITS.message}
          onChange={(e) => {
            setMessage(e.target.value);
            if (fieldError) setFieldError("");
          }}
          required
          aria-required="true"
          aria-invalid={fieldError ? true : undefined}
          aria-describedby={fieldError ? "contact-message-error" : undefined}
          className={`${FIELD} ${fieldError ? "border-rep" : ""}`}
        />
        {fieldError && (
          <p id="contact-message-error" role="alert" className="m-0 text-[0.82rem] text-rep">
            {fieldError}
          </p>
        )}
      </div>

      {copy.showExpected && (
        <div className="flex flex-col gap-1.5">
          <label htmlFor="contact-expected" className={LABEL}>
            What should it be, and where did you find it?{" "}
            <span className={HINT}>(optional, a source link helps most)</span>
          </label>
          <input
            id="contact-expected"
            type="text"
            value={expected}
            maxLength={LIMITS.expected}
            onChange={(e) => setExpected(e.target.value)}
            autoComplete="off"
            className={FIELD}
          />
        </div>
      )}

      <div className="flex flex-col gap-1.5">
        <label htmlFor="contact-email" className={LABEL}>
          Email <span className={HINT}>(optional, only used to reply)</span>
        </label>
        <input
          id="contact-email"
          type="email"
          value={email}
          maxLength={LIMITS.email}
          onChange={(e) => setEmail(e.target.value)}
          autoComplete="email"
          className={FIELD}
        />
      </div>

      {/* Honeypot: hidden from people and assistive tech; bots fill it. */}
      <div aria-hidden="true" className="absolute -left-[9999px] h-0 w-0 overflow-hidden">
        <label>
          Leave this empty
          <input type="text" tabIndex={-1} autoComplete="off" value={website} onChange={(e) => setWebsite(e.target.value)} />
        </label>
      </div>

      {sendError && (
        <p role="alert" className="m-0 text-[0.88rem] text-rep">
          {sendError}
        </p>
      )}

      <div>
        <button
          type="submit"
          disabled={sending}
          className="rounded-md bg-accent px-4 py-2 text-[0.9rem] font-medium text-accent-ink hover:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:cursor-not-allowed disabled:opacity-60"
        >
          {sending ? "Sending…" : "Send message"}
        </button>
      </div>
    </form>
  );
}
