/**
 * AfriTalent Orchestrator API client
 *
 * Usage
 * ─────
 * import { runOrchestrator } from "@/lib/api/orchestratorClient";
 * import type { OrchestratorRunPayload } from "@/lib/api/orchestratorTypes";
 *
 * const payload: OrchestratorRunPayload = {
 *   run_type: "apply_pack",
 *   resume_text: "Alice Engineer …",
 *   jobs: [{ raw_text: "We are looking for …", source: "linkedin" }],
 *   limits: { max_tailored_jobs: 3 },
 * };
 *
 * try {
 *   const result = await runOrchestrator(payload);
 *   console.log(result.ranked_jobs);
 * } catch (err) {
 *   if (err instanceof OrchestratorError) {
 *     // err.httpStatus — HTTP status code (400, 429, 503, …)
 *     // err.response   — full parsed response envelope (may be null)
 *     console.error(err.message, err.httpStatus);
 *   }
 * }
 */

import type {
  OrchestratorRunPayload,
  OrchestratorRunResponse,
} from "./orchestratorTypes";

// ---------------------------------------------------------------------------
// Base URL
// ---------------------------------------------------------------------------

/**
 * Resolved at module initialisation from the Next.js public env var.
 * Set NEXT_PUBLIC_BACKEND_URL in .env.local (dev) or the deployment
 * environment (staging/prod). Falls back to NEXT_PUBLIC_API_URL for
 * backwards compatibility with existing deployments.
 *
 * Never hardcode a URL here — use the env var.
 */
const BACKEND_URL =
  process.env.NEXT_PUBLIC_BACKEND_URL ??
  process.env.NEXT_PUBLIC_API_URL ??
  "http://localhost:4000";

const ORCHESTRATOR_ENDPOINT = `${BACKEND_URL}/api/orchestrator/run`;

// ---------------------------------------------------------------------------
// Error type
// ---------------------------------------------------------------------------

/**
 * Thrown by `runOrchestrator` when the server returns a non-2xx response
 * or when a network error occurs.
 *
 * @property httpStatus  HTTP status code, or 0 for network errors.
 * @property response    Parsed response envelope when the server returned
 *                       a JSON body; null on network/parse failures.
 */
export class OrchestratorError extends Error {
  readonly httpStatus: number;
  readonly response: OrchestratorRunResponse | null;

  constructor(
    message: string,
    httpStatus: number,
    response: OrchestratorRunResponse | null = null
  ) {
    super(message);
    this.name = "OrchestratorError";
    this.httpStatus = httpStatus;
    this.response = response;
  }
}

// ---------------------------------------------------------------------------
// Friendly error messages keyed by HTTP status
// ---------------------------------------------------------------------------

const STATUS_MESSAGES: Record<number, string> = {
  400: "The request was invalid. Please check your resume text and job inputs.",
  401: "You must be logged in to use the AI assistant.",
  403: "This feature is only available to candidates.",
  429: "You have reached the AI usage limit. Please wait a moment and try again.",
  503: "The AI service is temporarily unavailable. Please try again shortly.",
};

function friendlyMessage(httpStatus: number, serverMessage?: string): string {
  return STATUS_MESSAGES[httpStatus] ?? serverMessage ?? "Something went wrong. Please try again.";
}

// ---------------------------------------------------------------------------
// Client
// ---------------------------------------------------------------------------

/**
 * Call POST /api/orchestrator/run and return the parsed response.
 *
 * - Authenticates via the HttpOnly `auth_token` cookie (`credentials: "include"`).
 * - Throws `OrchestratorError` on any non-2xx response or network failure.
 *
 * @param payload  The orchestrator run configuration.
 * @returns        The orchestrator output envelope.
 * @throws         `OrchestratorError`
 */
export async function runOrchestrator(
  payload: OrchestratorRunPayload
): Promise<OrchestratorRunResponse> {
  let response: Response;

  try {
    response = await fetch(ORCHESTRATOR_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include", // send HttpOnly auth_token cookie
      body: JSON.stringify(payload),
    });
  } catch (networkErr) {
    throw new OrchestratorError(
      "Unable to reach the server. Check your internet connection.",
      0,
      null
    );
  }

  // Always attempt to parse the body — even error responses carry an envelope.
  let body: OrchestratorRunResponse | null = null;
  try {
    body = (await response.json()) as OrchestratorRunResponse;
  } catch {
    // Body is not JSON (e.g. an unexpected HTML error page from a proxy).
    if (!response.ok) {
      throw new OrchestratorError(
        friendlyMessage(response.status),
        response.status,
        null
      );
    }
  }

  if (!response.ok) {
    throw new OrchestratorError(
      friendlyMessage(response.status, body?.error),
      response.status,
      body
    );
  }

  // Narrow: body must be non-null for a 2xx response.
  if (body === null) {
    throw new OrchestratorError("Server returned an empty response.", response.status, null);
  }

  return body;
}

// ---------------------------------------------------------------------------
// Run History & Job Search
// ---------------------------------------------------------------------------

import type { AiRunHistory, SearchJobResult } from "./orchestratorTypes";

const RUNS_ENDPOINT = `${BACKEND_URL}/api/orchestrator/runs`;
const JOB_SEARCH_ENDPOINT = `${BACKEND_URL}/api/jobs/ai-search`;

/**
 * Fetch the candidate's last N orchestrator runs.
 */
export async function getRunHistory(limit = 10): Promise<AiRunHistory[]> {
  const res = await fetch(`${RUNS_ENDPOINT}?limit=${limit}`, {
    credentials: "include",
  });
  if (!res.ok) return [];
  const data = (await res.json()) as { runs: AiRunHistory[] };
  return data.runs ?? [];
}

/**
 * Search published jobs for the AI job picker.
 */
export async function searchJobs(
  query: string,
  limit = 10
): Promise<SearchJobResult[]> {
  const params = new URLSearchParams({ limit: String(limit) });
  if (query) params.set("query", query);
  const res = await fetch(`${JOB_SEARCH_ENDPOINT}?${params}`, {
    credentials: "include",
  });
  if (!res.ok) return [];
  const data = (await res.json()) as { jobs: SearchJobResult[] };
  return data.jobs ?? [];
}
