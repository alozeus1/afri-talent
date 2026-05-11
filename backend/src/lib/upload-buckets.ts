// §2.11 — upload-bucket routing.
//
// Trust artefacts (KYC docs uploaded under `trust/candidates/…` and
// `trust/employers/…`) are migrating to a dedicated S3 bucket so a leak in
// the resumes/exports bucket cannot reach them and vice versa. During the
// migration window TRUST_S3_BUCKET may be unset; the helper falls back to
// the main uploads bucket so existing flows keep working.

export type UploadScope =
  | "resume"
  | "candidate-verification"
  | "employer-verification";

function nonEmpty(value: string | undefined): string | undefined {
  return value && value.length > 0 ? value : undefined;
}

export function bucketForScope(scope: UploadScope): string | undefined {
  const main = nonEmpty(process.env.S3_UPLOADS_BUCKET);
  const trust = nonEmpty(process.env.TRUST_S3_BUCKET);
  if (scope === "resume") return main;
  return trust || main;
}
