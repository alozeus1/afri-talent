"use client";

import Link from "next/link";
import { FormEvent, useEffect, useRef, useState } from "react";
import { useAuth } from "@/lib/auth-context";
import { ApiError } from "@/lib/api";
import { MyTicket, SUPPORT_TOPICS, SupportTopic, support } from "@/lib/api/support";
import { localizePath, useLocale } from "@/lib/i18n/client";
import { useSupportT } from "@/lib/i18n/support-messages";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

const SUPPORT_EMAIL = "support@afritalent.com";
const MIN_MESSAGE = 20;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

type FieldErrors = Partial<Record<"name" | "email" | "message", string>>;

const fieldClass =
  "w-full rounded-xl border border-line bg-surface px-4 py-3 text-fg shadow-sm placeholder:text-fg-muted transition-colors focus:border-transparent focus:outline-none focus:ring-2 focus:ring-emerald-500 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100 dark:placeholder:text-zinc-400";
const labelClass = "mb-1 block text-sm font-medium text-fg dark:text-zinc-200";

function statusTone(status: MyTicket["status"]): string {
  if (status === "RESOLVED") return "bg-emerald-100 text-emerald-800 dark:bg-emerald-500/15 dark:text-emerald-300";
  if (status === "PENDING") return "bg-sky-100 text-sky-800 dark:bg-sky-500/15 dark:text-sky-300";
  return "bg-amber-100 text-amber-800 dark:bg-amber-500/15 dark:text-amber-300";
}

export default function ContactPage() {
  const t = useSupportT();
  const locale = useLocale();
  const { user } = useAuth();

  const startedAt = useRef<number>(Date.now());
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [topic, setTopic] = useState<SupportTopic>("GENERAL");
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [website, setWebsite] = useState(""); // honeypot
  const [errors, setErrors] = useState<FieldErrors>({});
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [sent, setSent] = useState<{ reference: string; email: string } | null>(null);
  const [myTickets, setMyTickets] = useState<MyTicket[]>([]);

  // Prefill from the signed-in account; topic from ?topic=.
  useEffect(() => {
    if (user) {
      setName((v) => v || user.name || "");
      setEmail((v) => v || user.email || "");
    }
  }, [user]);

  useEffect(() => {
    const requested = new URLSearchParams(window.location.search).get("topic")?.toUpperCase();
    if (requested && (SUPPORT_TOPICS as readonly string[]).includes(requested)) {
      setTopic(requested as SupportTopic);
    }
  }, []);

  useEffect(() => {
    if (!user) {
      setMyTickets([]);
      return;
    }
    let active = true;
    support
      .myTickets()
      .then((data) => {
        if (active) setMyTickets(data.tickets);
      })
      .catch(() => {
        if (active) setMyTickets([]);
      });
    return () => {
      active = false;
    };
  }, [user, sent]);

  function validate(): FieldErrors {
    const next: FieldErrors = {};
    if (name.trim().length < 2) next.name = t("contact.errorName");
    if (!EMAIL_RE.test(email.trim())) next.email = t("contact.errorEmail");
    if (message.trim().length < MIN_MESSAGE) next.message = t("contact.errorMessage");
    return next;
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setFormError(null);
    const nextErrors = validate();
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) return;

    setSubmitting(true);
    try {
      const result = await support.createTicket({
        name: name.trim(),
        email: email.trim(),
        topic,
        subject: subject.trim() || undefined,
        message: message.trim(),
        locale,
        pageUrl: typeof window !== "undefined" ? window.location.pathname : undefined,
        botShield: { website, startedAt: startedAt.current },
      });
      setSent({ reference: result.ticket.reference, email: email.trim() });
      setSubject("");
      setMessage("");
    } catch (error) {
      if (error instanceof ApiError && error.status === 429) setFormError(t("contact.errorRateLimited"));
      else setFormError(t("contact.errorGeneric"));
    } finally {
      setSubmitting(false);
    }
  }

  function resetForm() {
    setSent(null);
    setErrors({});
    setFormError(null);
    startedAt.current = Date.now();
  }

  const href = (path: string) => localizePath(path, locale);

  return (
    <div className="page-frame py-12 sm:py-16">
      <div className="mx-auto max-w-6xl">
        <header className="mb-10 max-w-2xl">
          <p className="text-sm font-semibold uppercase tracking-widest text-emerald-700 dark:text-emerald-400">
            {t("contact.eyebrow")}
          </p>
          <h1 className="mt-2 font-display text-4xl font-bold tracking-tight text-fg dark:text-zinc-50 sm:text-5xl">
            {t("contact.title")}
          </h1>
          <p className="mt-4 text-lg leading-8 text-fg-secondary dark:text-zinc-300">{t("contact.subtitle")}</p>
          <p className="mt-4 inline-flex items-center gap-2 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-sm font-medium text-emerald-800 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-300">
            <span aria-hidden="true" className="h-2 w-2 rounded-full bg-emerald-500" />
            {t("contact.responseTime")}
          </p>
        </header>

        <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_340px]">
          <section
            aria-labelledby="contact-form-title"
            className="rounded-2xl border border-line bg-surface p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-950 sm:p-8"
          >
            {sent ? (
              <div role="status" className="py-6 text-center">
                <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-emerald-100 dark:bg-emerald-500/15">
                  <svg className="h-7 w-7 text-primary-text dark:text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                </div>
                <h2 id="contact-form-title" className="text-2xl font-semibold text-fg dark:text-zinc-50">
                  {t("contact.successTitle")}
                </h2>
                <p className="mx-auto mt-3 max-w-md text-fg-secondary dark:text-zinc-300">
                  {t("contact.successBody", { email: sent.email, reference: sent.reference })}
                </p>
                <Button className="mt-6" variant="outline" onClick={resetForm}>
                  {t("contact.sendAnother")}
                </Button>
              </div>
            ) : (
              <form onSubmit={handleSubmit} noValidate className="space-y-5">
                <h2 id="contact-form-title" className="text-xl font-semibold text-fg dark:text-zinc-50">
                  {t("contact.formTitle")}
                </h2>

                {user && (
                  <p className="rounded-xl bg-surface-sunken px-4 py-3 text-sm text-fg-secondary dark:bg-zinc-900 dark:text-zinc-300">
                    {t("contact.signedInAs", { name: user.name || user.email })}
                  </p>
                )}

                <div className="grid gap-5 sm:grid-cols-2">
                  <Input
                    id="contact-name"
                    label={t("contact.name")}
                    autoComplete="name"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    error={errors.name}
                    maxLength={120}
                    required
                  />
                  <Input
                    id="contact-email"
                    type="email"
                    label={t("contact.email")}
                    autoComplete="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    error={errors.email}
                    maxLength={255}
                    required
                  />
                </div>

                <div className="grid gap-5 sm:grid-cols-2">
                  <div>
                    <label htmlFor="contact-topic" className={labelClass}>
                      {t("contact.topic")}
                    </label>
                    <select
                      id="contact-topic"
                      className={fieldClass}
                      value={topic}
                      onChange={(e) => setTopic(e.target.value as SupportTopic)}
                    >
                      {SUPPORT_TOPICS.map((value) => (
                        <option key={value} value={value}>
                          {t(`contact.topic.${value}`)}
                        </option>
                      ))}
                    </select>
                  </div>
                  <Input
                    id="contact-subject"
                    label={t("contact.subject")}
                    value={subject}
                    onChange={(e) => setSubject(e.target.value)}
                    maxLength={200}
                  />
                </div>

                <div>
                  <label htmlFor="contact-message" className={labelClass}>
                    {t("contact.message")}
                  </label>
                  <textarea
                    id="contact-message"
                    rows={7}
                    className={`${fieldClass} resize-y ${errors.message ? "border-red-500 dark:border-red-500" : ""}`}
                    placeholder={t("contact.messagePlaceholder")}
                    value={message}
                    onChange={(e) => setMessage(e.target.value)}
                    maxLength={5000}
                    aria-invalid={errors.message ? true : undefined}
                    aria-describedby="contact-message-hint"
                    required
                  />
                  <p
                    id="contact-message-hint"
                    className={`mt-1 text-sm ${errors.message ? "text-red-600 dark:text-red-400" : "text-fg-secondary dark:text-zinc-400"}`}
                  >
                    {errors.message ?? t("contact.messageHint")}
                  </p>
                </div>

                {/* Honeypot: hidden from people and assistive tech; bots fill it. */}
                <div aria-hidden="true" className="absolute -left-[10000px] h-px w-px overflow-hidden">
                  <label htmlFor="contact-website">Website</label>
                  <input
                    id="contact-website"
                    name="website"
                    tabIndex={-1}
                    autoComplete="off"
                    value={website}
                    onChange={(e) => setWebsite(e.target.value)}
                  />
                </div>

                {formError && (
                  <p role="alert" className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-300">
                    {formError}
                  </p>
                )}

                <div className="flex flex-col-reverse gap-4 sm:flex-row sm:items-center sm:justify-between">
                  <p className="text-sm text-fg-secondary dark:text-zinc-400">
                    {t("contact.privacyNote")}{" "}
                    <Link href="/privacy-policy" prefetch={false} className="font-medium text-emerald-700 underline-offset-2 hover:underline dark:text-emerald-400">
                      {t("contact.privacyLink")}
                    </Link>
                  </p>
                  <Button type="submit" disabled={submitting} isLoading={submitting} className="sm:min-w-44">
                    {submitting ? t("contact.sending") : t("contact.submit")}
                  </Button>
                </div>
              </form>
            )}
          </section>

          <aside aria-label={t("contact.channels.title")} className="space-y-4">
            <h2 className="text-sm font-semibold uppercase tracking-widest text-fg-secondary dark:text-zinc-400">
              {t("contact.channels.title")}
            </h2>
            <div className="rounded-2xl border border-line bg-surface p-5 dark:border-zinc-800 dark:bg-zinc-950">
              <h3 className="font-semibold text-fg dark:text-zinc-50">{t("contact.channels.trustTitle")}</h3>
              <p className="mt-1 text-sm leading-6 text-fg-secondary dark:text-zinc-300">{t("contact.channels.trustBody")}</p>
              <Link href={href("/trust/report")} prefetch={false} className="mt-3 inline-block text-sm font-semibold text-emerald-700 hover:underline dark:text-emerald-400">
                {t("contact.channels.trustCta")} →
              </Link>
            </div>
            <div className="rounded-2xl border border-line bg-surface p-5 dark:border-zinc-800 dark:bg-zinc-950">
              <h3 className="font-semibold text-fg dark:text-zinc-50">{t("contact.channels.resourcesTitle")}</h3>
              <p className="mt-1 text-sm leading-6 text-fg-secondary dark:text-zinc-300">{t("contact.channels.resourcesBody")}</p>
              <Link href={href("/resources")} prefetch={false} className="mt-3 inline-block text-sm font-semibold text-emerald-700 hover:underline dark:text-emerald-400">
                {t("contact.channels.resourcesCta")} →
              </Link>
            </div>
            <div className="rounded-2xl border border-line bg-surface p-5 dark:border-zinc-800 dark:bg-zinc-950">
              <h3 className="font-semibold text-fg dark:text-zinc-50">{t("contact.channels.emailTitle")}</h3>
              <p className="mt-1 text-sm leading-6 text-fg-secondary dark:text-zinc-300">
                {t("contact.channels.emailBody", { email: SUPPORT_EMAIL })}
              </p>
              <a href={`mailto:${SUPPORT_EMAIL}`} className="mt-3 inline-block text-sm font-semibold text-emerald-700 hover:underline dark:text-emerald-400">
                {SUPPORT_EMAIL}
              </a>
            </div>
          </aside>
        </div>

        {user && myTickets.length > 0 && (
          <section id="my-requests" aria-labelledby="my-requests-title" className="mt-12">
            <h2 id="my-requests-title" className="mb-4 text-xl font-semibold text-fg dark:text-zinc-50">
              {t("contact.myRequests")}
            </h2>
            <ul className="space-y-3">
              {myTickets.map((ticket) => (
                <li key={ticket.id} className="rounded-2xl border border-line bg-surface p-5 dark:border-zinc-800 dark:bg-zinc-950">
                  <div className="flex flex-wrap items-center gap-3">
                    <span className="font-mono text-sm font-semibold text-fg dark:text-zinc-100">{ticket.reference}</span>
                    <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${statusTone(ticket.status)}`}>
                      {t(`contact.status.${ticket.status}`)}
                    </span>
                    <span className="text-sm text-fg-secondary dark:text-zinc-400">{t(`contact.topic.${ticket.topic}`)}</span>
                    <time className="ms-auto text-xs text-fg-secondary dark:text-zinc-400" dateTime={ticket.createdAt}>
                      {new Date(ticket.createdAt).toLocaleDateString(locale)}
                    </time>
                  </div>
                  <p className="mt-2 line-clamp-3 text-sm text-fg-secondary dark:text-zinc-300">{ticket.subject || ticket.message}</p>
                  {ticket.replies.map((reply) => (
                    <div key={reply.id} className="mt-3 rounded-xl border-s-4 border-emerald-500 bg-emerald-50 px-4 py-3 dark:bg-emerald-500/10">
                      <p className="text-xs font-semibold text-emerald-800 dark:text-emerald-300">{t("contact.teamReply")}</p>
                      <p className="mt-1 whitespace-pre-line text-sm text-fg dark:text-zinc-200">{reply.body}</p>
                    </div>
                  ))}
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>
    </div>
  );
}
