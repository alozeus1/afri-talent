import { beforeEach, describe, expect, it, vi } from "vitest";

const aws = vi.hoisted(() => { process.env.S3_UPLOADS_BUCKET = "test-private-uploads"; return { sign: vi.fn(), commands: [] as any[] }; });
vi.mock("@aws-sdk/client-s3", () => ({ S3Client: class {}, PutObjectCommand: class { input: any; constructor(input: any) { this.input = input; aws.commands.push(input); } } }));
vi.mock("@aws-sdk/s3-request-presigner", () => ({ getSignedUrl: aws.sign }));
vi.mock("../../middleware/account-standing.js", () => ({ requireAccountStanding: () => (_q: unknown, _s: unknown, next: () => void) => next() }));
vi.mock("../../lib/prisma.js", () => ({ default: {
  user: { findUnique: vi.fn() }, candidateProfile: { upsert: vi.fn(), findUnique: vi.fn(), update: vi.fn() },
  resume: { create: vi.fn(), updateMany: vi.fn(), findMany: vi.fn() }, $queryRaw: vi.fn().mockResolvedValue([]), $disconnect: vi.fn(),
} }));

import request from "supertest";
import app from "../../app.js";
import prisma from "../../lib/prisma.js";
import { Role } from "@prisma/client";
import { signToken } from "../../lib/jwt.js";

const ids = { candidateA: "candidate-a", candidateB: "candidate-b", employerA: "employer-a" };
const token = (id: string, role: Role) => signToken({ userId: id, role, email: `${id}@example.test` });
function current(id: string, role: Role, state = "ACTIVE") { (prisma.user.findUnique as any).mockImplementation((args: any) => args?.where?.id === id && args?.select?.deletedAt === true && args?.select?.accountRestrictionStatus === true ? Promise.resolve({ id, email: `${id}@example.test`, role, deletedAt: state === "DELETED" ? new Date() : null, accountRestrictionStatus: state }) : undefined); }
const valid = { scope: "resume", contentType: "application/pdf", fileName: "resume.pdf", fileSizeBytes: 1024 };

beforeEach(() => { vi.clearAllMocks(); aws.commands.length = 0; aws.sign.mockResolvedValue("https://signed.example.test/redacted"); });

describe("file presign authorization", () => {
  it("denies anonymous and invalid roles before constructing or signing S3 requests", async () => {
    const anonymous = await request(app).post("/api/files/presign").send(valid);
    expect(anonymous.status).toBe(401); expect(aws.sign).not.toHaveBeenCalled(); expect(aws.commands).toHaveLength(0);
    current(ids.employerA, Role.EMPLOYER);
    const employer = await request(app).post("/api/files/presign").set("Authorization", `Bearer ${token(ids.employerA, Role.EMPLOYER)}`).send(valid);
    expect(employer.status).toBe(403); expect(aws.sign).not.toHaveBeenCalled();
  });

  it("derives candidate prefixes server-side and keeps KMS/expiry independent of client fields", async () => {
    current(ids.candidateA, Role.CANDIDATE);
    const res = await request(app).post("/api/files/presign").set("Authorization", `Bearer ${token(ids.candidateA, Role.CANDIDATE)}`).send({ ...valid, userId: ids.candidateB, s3Key: `resumes/${ids.candidateB}/foreign.pdf`, fileName: "../candidate-b/resume.pdf" });
    expect(res.status).toBe(200); expect(res.body.s3Key).toMatch(new RegExp(`^resumes/${ids.candidateA}/[A-Za-z0-9_-]+\\.pdf$`)); expect(res.body.s3Key).not.toContain(ids.candidateB);
    expect(aws.sign).toHaveBeenCalledWith(expect.anything(), expect.anything(), expect.objectContaining({ expiresIn: 300 }));
    expect(aws.commands[0]).toEqual(expect.objectContaining({ Bucket: "test-private-uploads", Key: res.body.s3Key, ContentType: "application/pdf", ServerSideEncryption: "aws:kms" })); expect(aws.commands[0]).not.toHaveProperty("ACL");
  });

  it("enforces scope and declared file policy before signing", async () => {
    current(ids.candidateA, Role.CANDIDATE);
    for (const payload of [{ ...valid, scope: "employer-verification" }, { ...valid, contentType: "text/html" }, { ...valid, fileSizeBytes: 0 }, { ...valid, fileSizeBytes: 10 * 1024 * 1024 + 1 }, { ...valid, fileName: "" }]) {
      const res = await request(app).post("/api/files/presign").set("Authorization", `Bearer ${token(ids.candidateA, Role.CANDIDATE)}`).send(payload);
      expect([400, 403]).toContain(res.status);
    }
    expect(aws.sign).not.toHaveBeenCalled(); expect(aws.commands).toHaveLength(0);
  });

  it("rejects Candidate B and traversal keys before resume persistence", async () => {
    current(ids.candidateA, Role.CANDIDATE);
    const register = (s3Key: string) => request(app).post("/api/profile/resumes").set("Authorization", `Bearer ${token(ids.candidateA, Role.CANDIDATE)}`).send({ s3Key, fileName: "resume.pdf", setActive: true });
    for (const key of [`resumes/${ids.candidateB}/foreign.pdf`, `trust/candidates/${ids.candidateA}/x.pdf`, `resumes/${ids.candidateA}/../${ids.candidateB}/x.pdf`]) expect((await register(key)).status).toBe(400);
    expect(prisma.candidateProfile.upsert).not.toHaveBeenCalled(); expect(prisma.resume.create).not.toHaveBeenCalled();
  });
});
