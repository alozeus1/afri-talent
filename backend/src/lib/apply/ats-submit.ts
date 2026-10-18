// PR S — Track A (ATS_API_*) submission orchestration.
//
// Resolves everything a vendor adapter needs (employer ATSConnection
// credentials, the job's external id from Job.sourceId, candidate identity,
// active resume bytes from S3), calls the adapter, and records the result on
// ATSApplicationLink. Mirrors lib/apply/email-draft.ts:
//   - dispatch.ts inline path: submitApplicationToAts() returns the proof
//   - workers/apply-ats-worker.ts queue path: settle/fail helpers own the
//     Application row update because the HTTP request has already returned.

import {
  ApplyStrategy,
  ATSApplicationLinkStatus,
  ATSConnectionStatus,
  ATSProvider,
  SubmissionProofKind,
  SubmissionStatus,
} from "@prisma/client";
import { GetObjectCommand, S3Client } from "@aws-sdk/client-s3";
import prisma from "../prisma.js";
import logger from "../logger.js";
import { decryptString } from "../secure-string.js";
import {
  submitGreenhouseApplication,
  submitLeverApplication,
  submitWorkableApplication,
  type AtsSubmissionInput,
  type AtsSubmissionResult,
} from "../ats/submission-adapters.js";

const BUCKET = process.env.S3_UPLOADS_BUCKET;
const REGION = process.env.AWS_REGION || "us-east-1";

let s3Client: S3Client | null = null;
function getS3Client(): S3Client {
  if (!s3Client) {
    s3Client = new S3Client({ region: REGION });
  }
  return s3Client;
}

export const PROVIDER_FOR_STRATEGY: Partial<Record<ApplyStrategy, ATSProvider>> = {
  [ApplyStrategy.ATS_API_GREENHOUSE]: ATSProvider.GREENHOUSE,
  [ApplyStrategy.ATS_API_LEVER]: ATSProvider.LEVER,
  [ApplyStrategy.ATS_API_WORKABLE]: ATSProvider.WORKABLE,
  // ATS_API_ASHBY intentionally absent: ATSProvider has no ASHBY member yet,
  // so no connection/credential source exists. The dispatcher keeps the
  // strategy stub-failed until Ashby connection support ships.
};

const ADAPTERS: Record<ATSProvider, (input: AtsSubmissionInput) => Promise<AtsSubmissionResult>> = {
  [ATSProvider.GREENHOUSE]: submitGreenhouseApplication,
  [ATSProvider.LEVER]: submitLeverApplication,
  [ATSProvider.WORKABLE]: submitWorkableApplication,
};

function parseExternalJobId(sourceId: string | null | undefined, provider: string): string | null {
  if (!sourceId) return null;
  const prefix = `${provider.toLowerCase()}-`;
  if (!sourceId.startsWith(prefix)) return sourceId;
  return sourceId.slice(prefix.length) || null;
}

function splitName(full: string | null | undefined): { firstName: string; lastName: string } {
  const trimmed = (full ?? "").trim();
  if (!trimmed) return { firstName: "Candidate", lastName: "AfriTalent" };
  const spaceIdx = trimmed.indexOf(" ");
  if (spaceIdx === -1) return { firstName: trimmed, lastName: trimmed };
  return { firstName: trimmed.slice(0, spaceIdx), lastName: trimmed.slice(spaceIdx + 1) };
}

async function loadActiveResume(userId: string): Promise<{ fileName: string; bytes: Buffer } | null> {
  const resume = await prisma.resume.findFirst({
    where: { profile: { userId }, isActive: true, securityStatus: "CLEAN" },
    orderBy: { uploadedAt: "desc" },
    select: { s3Key: true, fileName: true },
  });
  if (!resume?.s3Key || !BUCKET) {
    return null;
  }

  try {
    const response = await getS3Client().send(
      new GetObjectCommand({ Bucket: BUCKET, Key: resume.s3Key }),
    );
    const bytes = await response.Body?.transformToByteArray();
    if (!bytes) return null;
    return { fileName: resume.fileName || "resume.pdf", bytes: Buffer.from(bytes) };
  } catch (error) {
    // Resume attachment is best-effort: a submission without the file is
    // still a real submission (cover letter + contact details land).
    logger.warn(
      { userId: userId.slice(0, 8), err: (error as Error).message },
      "[ats-submit] resume download failed; submitting without attachment",
    );
    return null;
  }
}

export async function submitApplicationToAts(
  applicationId: string,
  strategy: ApplyStrategy,
): Promise<AtsSubmissionResult & { provider: ATSProvider }> {
  const provider = PROVIDER_FOR_STRATEGY[strategy];
  if (!provider) {
    throw new Error(`No ATS provider mapping for strategy ${strategy}`);
  }

  const application = await prisma.application.findUnique({
    where: { id: applicationId },
    include: {
      candidate: { select: { id: true, name: true, email: true, phoneNumber: true } },
      job: { select: { id: true, title: true, sourceId: true, employerId: true } },
    },
  });
  if (!application) {
    throw new Error(`Application ${applicationId} not found`);
  }
  if (!application.job.employerId) {
    throw new Error("Job has no employer; ATS submission requires an employer ATS connection");
  }

  const connection = await prisma.aTSConnection.findFirst({
    where: {
      employerId: application.job.employerId,
      provider,
      status: ATSConnectionStatus.ACTIVE,
    },
  });
  if (!connection) {
    throw new Error(`Employer has no active ${provider} connection for ATS submission`);
  }

  const externalJobId = parseExternalJobId(application.job.sourceId, provider);
  if (!externalJobId) {
    throw new Error(`Job ${application.job.id} has no external ${provider} job id (sourceId missing)`);
  }

  const { firstName, lastName } = splitName(application.candidate.name);
  const resume = await loadActiveResume(application.candidate.id);

  const result = await ADAPTERS[provider]({
    externalOrgId: connection.externalOrgId,
    externalJobId,
    accessToken: decryptString(connection.encryptedAccessToken),
    candidate: {
      firstName,
      lastName,
      email: application.candidate.email,
      phone: application.candidate.phoneNumber,
    },
    coverLetter: application.coverLetter,
    resume,
  });

  await prisma.aTSApplicationLink.upsert({
    where: { applicationId },
    create: {
      connectionId: connection.id,
      applicationId,
      externalJobId,
      externalApplicationId: result.externalApplicationId,
      externalCandidateId: result.externalCandidateId ?? null,
      status: ATSApplicationLinkStatus.SYNCED,
      lastOutboundSyncAt: new Date(),
      metadata: { provider, jobTitle: application.job.title, submittedVia: "apply_dispatch" },
    },
    update: {
      connectionId: connection.id,
      externalJobId,
      externalApplicationId: result.externalApplicationId,
      externalCandidateId: result.externalCandidateId ?? null,
      status: ATSApplicationLinkStatus.SYNCED,
      lastOutboundSyncAt: new Date(),
      lastSyncError: null,
    },
  });

  return { ...result, provider };
}

// Queue-path settle/fail (mirrors email-draft.ts).
export async function settleAtsApplication(
  applicationId: string,
  strategy: ApplyStrategy,
): Promise<AtsSubmissionResult & { provider: ATSProvider }> {
  const result = await submitApplicationToAts(applicationId, strategy);

  await prisma.application.update({
    where: { id: applicationId },
    data: {
      submissionStatus: SubmissionStatus.SUBMITTED,
      submittedAt: new Date(),
      submissionProofKind: SubmissionProofKind.ATS_ID,
      submissionProofRef: result.externalApplicationId,
      submissionProvider: result.provider.toLowerCase(),
      submissionProviderApplicationId: result.externalApplicationId,
      lastSubmissionError: null,
    },
  });

  return result;
}

export async function failAtsApplication(applicationId: string, error: unknown): Promise<void> {
  const message = error instanceof Error ? error.message : "ATS submission failed";
  await prisma.application
    .update({
      where: { id: applicationId },
      data: {
        submissionStatus: SubmissionStatus.FAILED,
        lastSubmissionError: message.slice(0, 500),
      },
    })
    .catch((updateError) => {
      logger.error(
        { applicationId, err: (updateError as Error).message },
        "[ats-submit] failed to mark application FAILED",
      );
    });
}
