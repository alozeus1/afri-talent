/**
 * Friendly-error mapper.
 *
 * Converts raw fetch / API errors into UX-safe copy that:
 *  - Never leaks internals (stack traces, upstream error ids, sql fragments).
 *  - Always gives the user a next step ("retry", "check inputs", "come back
 *    in a minute", etc).
 *  - Special-cases rate limits (429), auth (401/403), validation (400),
 *    consent (CONSENT_REQUIRED) and upstream provider failures.
 */

export interface FriendlyError {
  /** Short, user-safe title (≤ 60 chars). */
  title: string;
  /** One-sentence explanation + actionable nudge. */
  description: string;
  /** If the server sent a Retry-After hint, seconds until retry is allowed. */
  retryAfterSeconds?: number;
  /** Severity used by the UI to pick a color. */
  tone: "info" | "warning" | "error";
}

interface ApiLikeError {
  status?: number;
  code?: string;
  message?: string;
  retryAfter?: number | string;
}

const KNOWN_CODES: Record<string, FriendlyError> = {
  CONSENT_REQUIRED: {
    title: "One more step",
    description:
      "Please confirm you have reviewed this AI-assembled application before we submit it.",
    tone: "info",
  },
  NOT_ELIGIBLE: {
    title: "Not eligible to apply yet",
    description:
      "Complete your profile and upload an active resume before applying through AfriTalent.",
    tone: "info",
  },
  QUOTA_EXCEEDED: {
    title: "You have hit your plan limit",
    description:
      "Upgrade your plan or wait until tomorrow — your daily allowance resets at 00:00 UTC.",
    tone: "warning",
  },
  DUPLICATE_APPLICATION: {
    title: "Already applied",
    description: "You have already submitted an application to this role.",
    tone: "info",
  },
};

/**
 * Humanise an error from `fetch` / our API wrapper into a stable UI shape.
 * Accepts: Error, Response, plain object, or string.
 */
export function toFriendlyError(err: unknown): FriendlyError {
  const extracted = extractApiError(err);

  if (extracted.code && KNOWN_CODES[extracted.code]) {
    return { ...KNOWN_CODES[extracted.code], retryAfterSeconds: coerceRetry(extracted.retryAfter) };
  }

  if (extracted.status === 429) {
    const retry = coerceRetry(extracted.retryAfter);
    return {
      title: "You are moving fast",
      description: retry
        ? `Please wait ${formatSeconds(retry)} before trying again. AfriTalent limits bursts to keep responses fast for everyone.`
        : "Please wait a minute before trying again. AfriTalent limits bursts to keep responses fast for everyone.",
      retryAfterSeconds: retry,
      tone: "warning",
    };
  }

  if (extracted.status === 401) {
    return {
      title: "Please sign in again",
      description: "Your session has expired. Sign in to continue where you left off.",
      tone: "info",
    };
  }

  if (extracted.status === 403) {
    return {
      title: "You do not have access",
      description:
        "Your account does not have permission for this action. If this is unexpected, contact support.",
      tone: "warning",
    };
  }

  if (extracted.status === 400) {
    return {
      title: "We could not process that",
      description:
        extracted.message && isSafeMessage(extracted.message)
          ? extracted.message
          : "Please review the inputs and try again.",
      tone: "warning",
    };
  }

  if (extracted.status === 404) {
    return {
      title: "Not found",
      description:
        "The item you are looking for is no longer available. Refresh the list or try another search.",
      tone: "info",
    };
  }

  if (extracted.status && extracted.status >= 500) {
    return {
      title: "Something went wrong on our side",
      description:
        "This is a temporary issue. Please try again in a moment — if it keeps happening, contact support.",
      tone: "error",
    };
  }

  if (isNetworkError(err)) {
    return {
      title: "No internet connection",
      description:
        "Check your network and try again. Your drafts are saved locally until the connection returns.",
      tone: "warning",
    };
  }

  return {
    title: "Something went wrong",
    description:
      extracted.message && isSafeMessage(extracted.message)
        ? extracted.message
        : "Please try again. If the issue persists, contact support.",
    tone: "error",
  };
}

function extractApiError(err: unknown): ApiLikeError {
  if (err instanceof Error) {
    // ApiError from the API client carries status/code — use them so 401/403
    // map to actionable messages instead of the generic fallback.
    const withMeta = err as Error & { status?: unknown; code?: unknown };
    return {
      message: err.message,
      status: typeof withMeta.status === "number" ? withMeta.status : undefined,
      code: typeof withMeta.code === "string" ? withMeta.code : undefined,
    };
  }
  if (typeof err === "string") {
    return { message: err };
  }
  if (err && typeof err === "object") {
    const obj = err as Record<string, unknown>;
    return {
      status: typeof obj.status === "number" ? obj.status : undefined,
      code: typeof obj.code === "string" ? obj.code : undefined,
      message: typeof obj.message === "string" ? obj.message : undefined,
      retryAfter:
        typeof obj.retryAfter === "number" || typeof obj.retryAfter === "string"
          ? (obj.retryAfter as number | string)
          : undefined,
    };
  }
  return {};
}

function coerceRetry(retry: number | string | undefined): number | undefined {
  if (retry == null) return undefined;
  if (typeof retry === "number" && Number.isFinite(retry) && retry >= 0) return Math.ceil(retry);
  const n = Number(retry);
  return Number.isFinite(n) && n >= 0 ? Math.ceil(n) : undefined;
}

function formatSeconds(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  const mins = Math.ceil(seconds / 60);
  return mins === 1 ? "1 minute" : `${mins} minutes`;
}

function isSafeMessage(msg: string): boolean {
  const lower = msg.toLowerCase();
  // Filter clearly-internal wording.
  const bannedTokens = [
    "stack",
    "prisma",
    "sql",
    "enoent",
    "econnrefused",
    "undefined is not",
    "null is not",
    "cannot read prop",
    "typeerror",
    "syntaxerror",
  ];
  if (bannedTokens.some((t) => lower.includes(t))) return false;
  if (msg.length > 240) return false;
  return true;
}

function isNetworkError(err: unknown): boolean {
  if (err instanceof TypeError) {
    return /fetch|network|failed/i.test(err.message);
  }
  return false;
}
