import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createHmac } from "node:crypto";
import express from "express";
import request from "supertest";
import prisma from "../../lib/prisma.js";
import router from "../../routes/webhooks.js";

const databaseUrl = process.env.DATABASE_URL ?? "";
const requested = process.env.RUN_DATABASE_INTEGRATION_TESTS === "1";
const safeDatabase = /^postgresql:\/\/[^@]+@(?:127\.0\.0\.1|localhost):\d+\/afritalent_resume_scanner_test_/i.test(databaseUrl);
if (requested && !safeDatabase) {
  throw new Error("resume scanner integration test requires a loopback afritalent_resume_scanner_test database");
}
const describeIntegration = requested ? describe : describe.skip;

const secret = "resume-scanner-postgres-synthetic-secret"; // secret-scan:allow synthetic test value
const userId = "00000000-0000-4000-8000-000000000711";
const app = express();
app.use(express.raw({ type: "application/json", limit: "100kb" }));
app.use("/api/webhooks", router);

function send(payload: Record<string, unknown>, deliveryId: string) {
  const raw = JSON.stringify(payload);
  const timestamp = Math.floor(Date.now() / 1000);
  const signature = createHmac("sha256", secret).update(`${timestamp}.`).update(raw).digest("hex");
  return request(app)
    .post("/api/webhooks/resume-scanner")
    .set("content-type", "application/json")
    .set("x-afritalent-scan-timestamp", String(timestamp))
    .set("x-afritalent-scan-delivery-id", deliveryId)
    .set("x-afritalent-scan-signature", `v1=${signature}`)
    .send(raw);
}

describeIntegration("resume scanner callback with PostgreSQL", () => {
  let resumeId = "";
  let jobId = "";
  let profileId = "";
  const payload = () => ({
    jobId,
    resumeId,
    bucket: "afritalent-resume-scanner-test-private",
    objectKey: `resumes/${userId}/resume.pdf`,
    objectVersion: "version-1",
    result: "CLEAN",
  });

  beforeAll(async () => {
    process.env.RESUME_SCANNER_WEBHOOK_SECRET = secret;
    await prisma.user.create({ data: { id: userId, email: "scanner.integration@example.test", password: "test-only", name: "Scanner Integration", role: "CANDIDATE" } });
    const profile = await prisma.candidateProfile.create({ data: { userId, skills: [], targetRoles: [], targetCountries: [] } });
    profileId = profile.id;
    const resume = await prisma.resume.create({ data: { profileId: profile.id, s3Key: `resumes/${userId}/resume.pdf`, fileName: "resume.pdf", isActive: false, securityStatus: "PENDING_SCAN" } });
    resumeId = resume.id;
    const job = await prisma.resumeScanJob.create({ data: { resumeId, bucket: "afritalent-resume-scanner-test-private", objectKey: resume.s3Key, objectVersion: "version-1" } });
    jobId = job.id;
  });

  afterAll(async () => {
    await prisma.user.delete({ where: { id: userId } });
    await prisma.$disconnect();
  });

  it("commits exactly one version-pinned CLEAN result and exact replay is idempotent", async () => {
    const first = await send(payload(), "scanner-delivery-1");
    expect(first.status).toBe(200);
    const [resume, job, deliveries, audits] = await Promise.all([
      prisma.resume.findUniqueOrThrow({ where: { id: resumeId } }),
      prisma.resumeScanJob.findUniqueOrThrow({ where: { id: jobId } }),
      prisma.resumeScanDelivery.count({ where: { jobId } }),
      prisma.auditLog.count({ where: { targetId: resumeId, targetType: "RESUME_SCAN" } }),
    ]);
    expect(resume).toMatchObject({ securityStatus: "CLEAN", isActive: true });
    expect(job).toMatchObject({ status: "COMPLETED", result: "CLEAN", resultDeliveryId: "scanner-delivery-1" });
    expect(deliveries).toBe(1);
    expect(audits).toBe(1);

    const replay = await send(payload(), "scanner-delivery-1");
    expect(replay.status).toBe(200);
    expect(replay.body).toEqual({ received: true, duplicate: true });
    expect(await prisma.resumeScanDelivery.count({ where: { jobId } })).toBe(1);
  });

  it("rejects a mismatched object version without adding a delivery or audit", async () => {
    const response = await send({ ...payload(), objectVersion: "version-2" }, "scanner-delivery-wrong-version");
    expect(response.status).toBe(409);
    expect(await prisma.resumeScanDelivery.count({ where: { jobId } })).toBe(1);
    expect(await prisma.auditLog.count({ where: { targetId: resumeId, targetType: "RESUME_SCAN" } })).toBe(1);
  });

  it("accepts a controlled concurrent exact delivery once and acknowledges its duplicate", async () => {
    const secondResume = await prisma.resume.create({ data: { profileId, s3Key: `resumes/${userId}/resume-two.pdf`, fileName: "resume-two.pdf", isActive: false, securityStatus: "PENDING_SCAN" } });
    const secondJob = await prisma.resumeScanJob.create({ data: { resumeId: secondResume.id, bucket: "afritalent-resume-scanner-test-private", objectKey: secondResume.s3Key, objectVersion: "version-2" } });
    const concurrentPayload = { jobId: secondJob.id, resumeId: secondResume.id, bucket: "afritalent-resume-scanner-test-private", objectKey: secondResume.s3Key, objectVersion: "version-2", result: "CLEAN" };

    const responses = await Promise.all([
      send(concurrentPayload, "scanner-delivery-concurrent"),
      send(concurrentPayload, "scanner-delivery-concurrent"),
    ]);
    expect(responses.map((response) => response.status).sort()).toEqual([200, 200]);
    expect(await prisma.resumeScanDelivery.count({ where: { jobId: secondJob.id } })).toBe(1);
    expect(await prisma.auditLog.count({ where: { targetId: secondResume.id, targetType: "RESUME_SCAN" } })).toBe(1);
    expect(await prisma.resume.findUniqueOrThrow({ where: { id: secondResume.id } })).toMatchObject({ securityStatus: "CLEAN", isActive: true });
  });
});
