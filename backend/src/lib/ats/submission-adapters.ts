// PR S — Track A (ATS_API_*) candidate-application submission adapters.
//
// One function per vendor, all sharing AtsSubmissionInput/Result. Callers
// (lib/apply/ats-submit.ts) resolve credentials from the employer's
// ATSConnection and the job's external id from Job.sourceId before calling.
//
// IMPORTANT — vendor contracts: request shapes follow each vendor's public
// API documentation as of this PR. Every strategy is gated behind a
// default-OFF env flag (APPLY_ATS_<VENDOR>_ENABLED); enable a vendor only
// after verifying field contracts against a real sandbox account:
//   Greenhouse: Job Board API  POST /v1/boards/{board}/jobs/{job_id}
//               Basic auth with a Job Board API key.
//   Lever:      Postings API   POST /v0/postings/{site}/{posting}?key=...
//   Workable:   SPI v3         POST /spi/v3/jobs/{shortcode}/candidates
//               Bearer access token.

import logger from "../logger.js";

export interface AtsSubmissionCandidate {
  firstName: string;
  lastName: string;
  email: string;
  phone?: string | null;
}

export interface AtsSubmissionResume {
  fileName: string;
  bytes: Buffer;
}

export interface AtsSubmissionInput {
  externalOrgId: string; // board token / site token / account slug
  externalJobId: string;
  accessToken: string | null;
  candidate: AtsSubmissionCandidate;
  coverLetter?: string | null;
  resume?: AtsSubmissionResume | null;
}

export interface AtsSubmissionResult {
  externalApplicationId: string;
  externalCandidateId?: string | null;
  raw?: unknown;
}

const SUBMIT_TIMEOUT_MS = 30_000;

class AtsSubmissionError extends Error {
  constructor(vendor: string, status: number, body: string) {
    super(`${vendor} application submission failed (${status}): ${body.slice(0, 300)}`);
    this.name = "AtsSubmissionError";
  }
}

async function readBody(response: Response): Promise<string> {
  return response.text().catch(() => "<unreadable body>");
}

function resumeBlob(resume: AtsSubmissionResume): Blob {
  return new Blob([new Uint8Array(resume.bytes)], { type: "application/octet-stream" });
}

export async function submitGreenhouseApplication(input: AtsSubmissionInput): Promise<AtsSubmissionResult> {
  if (!input.accessToken) {
    throw new Error("Greenhouse submission requires a Job Board API key on the ATS connection");
  }

  const form = new FormData();
  form.set("first_name", input.candidate.firstName);
  form.set("last_name", input.candidate.lastName);
  form.set("email", input.candidate.email);
  if (input.candidate.phone) form.set("phone", input.candidate.phone);
  if (input.coverLetter) form.set("cover_letter_text", input.coverLetter);
  if (input.resume) form.set("resume", resumeBlob(input.resume), input.resume.fileName);

  const response = await fetch(
    `https://boards-api.greenhouse.io/v1/boards/${encodeURIComponent(input.externalOrgId)}/jobs/${encodeURIComponent(input.externalJobId)}`,
    {
      method: "POST",
      headers: {
        Authorization: `Basic ${Buffer.from(`${input.accessToken}:`).toString("base64")}`,
      },
      body: form,
      signal: AbortSignal.timeout(SUBMIT_TIMEOUT_MS),
    },
  );

  if (!response.ok) {
    throw new AtsSubmissionError("Greenhouse", response.status, await readBody(response));
  }

  const payload = (await response.json().catch(() => ({}))) as { id?: number | string };
  const externalApplicationId = payload.id != null ? String(payload.id) : `gh-${Date.now()}`;
  logger.info({ vendor: "greenhouse", externalApplicationId }, "[ats-submit] application accepted");
  return { externalApplicationId, raw: payload };
}

export async function submitLeverApplication(input: AtsSubmissionInput): Promise<AtsSubmissionResult> {
  if (!input.accessToken) {
    throw new Error("Lever submission requires a Postings API key on the ATS connection");
  }

  const form = new FormData();
  form.set("name", `${input.candidate.firstName} ${input.candidate.lastName}`.trim());
  form.set("email", input.candidate.email);
  if (input.candidate.phone) form.set("phone", input.candidate.phone);
  if (input.coverLetter) form.set("comments", input.coverLetter);
  if (input.resume) form.set("resume", resumeBlob(input.resume), input.resume.fileName);

  const url = new URL(
    `https://api.lever.co/v0/postings/${encodeURIComponent(input.externalOrgId)}/${encodeURIComponent(input.externalJobId)}`,
  );
  url.searchParams.set("key", input.accessToken);

  const response = await fetch(url, {
    method: "POST",
    body: form,
    signal: AbortSignal.timeout(SUBMIT_TIMEOUT_MS),
  });

  if (!response.ok) {
    throw new AtsSubmissionError("Lever", response.status, await readBody(response));
  }

  const payload = (await response.json().catch(() => ({}))) as {
    applicationId?: string;
    candidateId?: string;
    id?: string;
  };
  const externalApplicationId = payload.applicationId ?? payload.id ?? `lever-${Date.now()}`;
  logger.info({ vendor: "lever", externalApplicationId }, "[ats-submit] application accepted");
  return {
    externalApplicationId,
    externalCandidateId: payload.candidateId ?? null,
    raw: payload,
  };
}

export async function submitWorkableApplication(input: AtsSubmissionInput): Promise<AtsSubmissionResult> {
  if (!input.accessToken) {
    throw new Error("Workable submission requires an access token on the ATS connection");
  }

  const body: Record<string, unknown> = {
    sourced: false,
    candidate: {
      name: `${input.candidate.firstName} ${input.candidate.lastName}`.trim(),
      firstname: input.candidate.firstName,
      lastname: input.candidate.lastName,
      email: input.candidate.email,
      ...(input.candidate.phone ? { phone: input.candidate.phone } : {}),
      ...(input.coverLetter ? { cover_letter: input.coverLetter } : {}),
      ...(input.resume
        ? {
            resume: {
              name: input.resume.fileName,
              data: input.resume.bytes.toString("base64"),
            },
          }
        : {}),
    },
  };

  const response = await fetch(
    `https://${encodeURIComponent(input.externalOrgId)}.workable.com/spi/v3/jobs/${encodeURIComponent(input.externalJobId)}/candidates`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${input.accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(SUBMIT_TIMEOUT_MS),
    },
  );

  if (!response.ok) {
    throw new AtsSubmissionError("Workable", response.status, await readBody(response));
  }

  const payload = (await response.json().catch(() => ({}))) as {
    candidate?: { id?: string };
    id?: string;
  };
  const externalCandidateId = payload.candidate?.id ?? payload.id ?? null;
  const externalApplicationId = externalCandidateId ?? `workable-${Date.now()}`;
  logger.info({ vendor: "workable", externalApplicationId }, "[ats-submit] application accepted");
  return { externalApplicationId, externalCandidateId, raw: payload };
}
