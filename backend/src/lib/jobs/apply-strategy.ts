// §5.2 — apply pathway classification at ingest.
//
// Pure function. Decides which of the seven ApplyStrategy values a job should
// route to, in priority order:
//
//   1. ATS_API_* — the job came from a vendor we have partner write access
//      to. Gated per-vendor by an env flag so we don't claim API submission
//      until the partner program lands. The flags also let the founder roll
//      a vendor back if the integration starts misbehaving.
//
//   2. EMAIL_DRAFT — the job description carries a parseable apply email
//      (`mailto:`, `apply@`, `careers@`, `jobs@`, `recruitment@`). The
//      address is extracted into `applyEmailDetected` so the EMAIL_DRAFT
//      track (PR Q) can compose the outbound message without re-scraping.
//
//   3. OPERATOR_HANDOFF — the sourceUrl host is a known form-based ATS we
//      can drive with Anthropic Computer Use (Workday, Taleo, iCIMS,
//      Greenhouse/Lever boards we don't have API access to).
//
//   4. ASSISTED_REDIRECT — fallback: open in a new tab and track the
//      clickout.
//
// Lives in lib/jobs/ alongside normalize/dedup/freshness. No imports of
// Prisma or the DB layer — exercised by the ingest write-path and the
// backfill script.

import { ApplyStrategy } from "@prisma/client";

export interface ApplyStrategyInput {
  title?: string | null;
  description?: string | null;
  // Aggregator's `JobSource` value (see types.ts). Same shape as Job.jobSource
  // on the row, but we accept either a string or null so unit tests can drive
  // both partner and non-partner paths without setting up the full payload.
  jobSource?: string | null;
  // The vendor host we pulled the job from. Aggregator sources set this on
  // ingest (sources/{greenhouse,lever,workable,company-careers}.ts).
  sourceUrl?: string | null;
  applicationUrl?: string | null;
}

export interface ApplyStrategyResult {
  strategy: ApplyStrategy;
  applyEmailDetected?: string;
  applyFormDomain?: string;
}

// Per-vendor write-access gates. Default OFF — keeps Greenhouse/Lever/Ashby/
// Workable jobs flowing through OPERATOR_HANDOFF / ASSISTED_REDIRECT until
// the founder flips the flag once the partner program lands.
const ATS_API_FLAGS: Record<string, { jobSource: string; env: string }> = {
  ATS_API_GREENHOUSE: { jobSource: "GREENHOUSE", env: "APPLY_ATS_GREENHOUSE_ENABLED" },
  ATS_API_LEVER:      { jobSource: "LEVER",      env: "APPLY_ATS_LEVER_ENABLED" },
  ATS_API_ASHBY:      { jobSource: "ASHBY",      env: "APPLY_ATS_ASHBY_ENABLED" },
  ATS_API_WORKABLE:   { jobSource: "WORKABLE",   env: "APPLY_ATS_WORKABLE_ENABLED" },
};

// Hosts we can drive with Anthropic Computer Use (PR T). Each entry matches
// `host === entry` OR `host.endsWith("." + entry)` so subdomains route too.
const OPERATOR_SUITABLE_HOSTS: ReadonlyArray<string> = [
  "myworkdayjobs.com",
  "myworkdaysite.com",
  "wd1.myworkdayjobs.com",
  "wd5.myworkdayjobs.com",
  "boards.greenhouse.io",
  "jobs.lever.co",
  "jobs.ashbyhq.com",
  "apply.workable.com",
  "taleo.net",
  "icims.com",
  "smartrecruiters.com",
  "successfactors.com",
  "jobvite.com",
];

// Common apply-side email user names. Anything matching one of these on any
// domain → EMAIL_DRAFT.
const APPLY_EMAIL_LOCAL_PARTS: ReadonlyArray<string> = [
  "apply",
  "applications",
  "careers",
  "career",
  "jobs",
  "recruiting",
  "recruitment",
  "talent",
  "hr",
  "hiring",
];

// `mailto:` URI parser. Allows the optional `?subject=…` tail.
const MAILTO_RX = /mailto:([\w.+-]+@[\w.-]+\.[A-Za-z]{2,})(?:\?[^\s"'<>]*)?/i;

// Generic email RX, then we filter by APPLY_EMAIL_LOCAL_PARTS for the strict
// "apply-side" check. Captures the address for `applyEmailDetected`.
const EMAIL_RX = /([A-Za-z0-9._+-]+)@([A-Za-z0-9.-]+\.[A-Za-z]{2,})/g;

function isAtsApiEnabled(strategy: keyof typeof ATS_API_FLAGS): boolean {
  const flag = ATS_API_FLAGS[strategy];
  return process.env[flag.env] === "1" || process.env[flag.env] === "true";
}

function tryAtsApi(jobSource: string | null | undefined): ApplyStrategy | null {
  if (!jobSource) return null;
  for (const [strategy, cfg] of Object.entries(ATS_API_FLAGS) as Array<[keyof typeof ATS_API_FLAGS, typeof ATS_API_FLAGS[string]]>) {
    if (jobSource === cfg.jobSource && isAtsApiEnabled(strategy)) {
      return strategy as ApplyStrategy;
    }
  }
  return null;
}

function tryEmailDraft(description: string | null | undefined): string | null {
  if (!description) return null;

  const mailto = description.match(MAILTO_RX);
  if (mailto) return mailto[1].toLowerCase();

  // Reset lastIndex defensively — EMAIL_RX is global.
  EMAIL_RX.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = EMAIL_RX.exec(description)) !== null) {
    const local = match[1].toLowerCase();
    if (APPLY_EMAIL_LOCAL_PARTS.some((part) => local === part || local.startsWith(`${part}.`) || local.startsWith(`${part}-`))) {
      return `${match[1]}@${match[2]}`.toLowerCase();
    }
  }

  return null;
}

function hostnameOf(url: string | null | undefined): string | null {
  if (!url) return null;
  try {
    return new URL(url).hostname.toLowerCase();
  } catch {
    return null;
  }
}

function tryOperatorHandoff(sourceUrl: string | null | undefined, applicationUrl: string | null | undefined): string | null {
  for (const candidate of [applicationUrl, sourceUrl]) {
    const host = hostnameOf(candidate);
    if (!host) continue;
    if (OPERATOR_SUITABLE_HOSTS.some((known) => host === known || host.endsWith(`.${known}`))) {
      return host;
    }
  }
  return null;
}

export function classifyApplyStrategy(input: ApplyStrategyInput): ApplyStrategyResult {
  // 1. Partner ATS write access.
  const atsApi = tryAtsApi(input.jobSource);
  if (atsApi) return { strategy: atsApi };

  // 2. EMAIL_DRAFT — parseable apply email.
  const email = tryEmailDraft(input.description);
  if (email) {
    return { strategy: ApplyStrategy.EMAIL_DRAFT, applyEmailDetected: email };
  }

  // 3. OPERATOR_HANDOFF — known form-based ATS host.
  const formHost = tryOperatorHandoff(input.sourceUrl, input.applicationUrl);
  if (formHost) {
    return { strategy: ApplyStrategy.OPERATOR_HANDOFF, applyFormDomain: formHost };
  }

  // 4. Fallback.
  return { strategy: ApplyStrategy.ASSISTED_REDIRECT };
}
