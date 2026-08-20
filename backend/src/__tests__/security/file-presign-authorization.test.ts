import { beforeEach, describe, expect, it, vi } from "vitest";

const aws = vi.hoisted(() => { process.env.S3_UPLOADS_BUCKET = "test-private-uploads"; return { sign: vi.fn(), head: vi.fn(), get: vi.fn(), commands: [] as any[] }; });
vi.mock("@aws-sdk/client-s3", () => ({ S3Client: class { send(command: any) { return command.kind === "get" ? aws.get(command) : aws.head(command); } }, PutObjectCommand: class { input: any; constructor(input: any) { this.input = input; aws.commands.push(input); } }, HeadObjectCommand: class { kind = "head"; input: any; constructor(input: any) { this.input = input; aws.commands.push(input); } }, GetObjectCommand: class { kind = "get"; input: any; constructor(input: any) { this.input = input; aws.commands.push(input); } } }));
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

const content = (bytes: number[]) => ({ Body: { async *[Symbol.asyncIterator]() { yield new Uint8Array(bytes); } } });
beforeEach(() => { vi.clearAllMocks(); aws.commands.length = 0; aws.sign.mockResolvedValue("https://signed.example.test/redacted"); aws.head.mockResolvedValue({ ContentLength: 1024, ContentType: "application/pdf", ServerSideEncryption: "aws:kms" }); aws.get.mockResolvedValue(content([0x25, 0x50, 0x44, 0x46, 0x2d])); });

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

  it("persists only after HeadObject verifies the exact candidate-owned object", async () => {
    current(ids.candidateA, Role.CANDIDATE);
    vi.mocked(prisma.candidateProfile.upsert).mockResolvedValue({ id: "profile-a" } as never);
    vi.mocked(prisma.resume.create).mockResolvedValue({ id: "resume-a" } as never);
    vi.mocked(prisma.candidateProfile.findUnique).mockResolvedValue(null as never);
    const res = await request(app).post("/api/profile/resumes").set("Authorization", `Bearer ${token(ids.candidateA, Role.CANDIDATE)}`).send({ s3Key: `resumes/${ids.candidateA}/valid.pdf`, fileName: "valid.pdf", setActive: true });
    expect(res.status).toBe(201); expect(aws.head).toHaveBeenCalledOnce(); expect(aws.get).toHaveBeenCalledOnce(); expect(aws.commands[1]).toEqual(expect.objectContaining({ Bucket: "test-private-uploads", Key: `resumes/${ids.candidateA}/valid.pdf`, Range: "bytes=0-15" })); expect(prisma.resume.create).toHaveBeenCalledOnce();
    expect(prisma.resume.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ isActive: false, securityStatus: "PENDING_SCAN" }) }));
    expect(prisma.resume.updateMany).not.toHaveBeenCalled();
  });

  it("rejects type-confused, empty, truncated, oversized, and failed signature reads before persistence", async () => {
    const register = (s3Key = `resumes/${ids.candidateA}/valid.pdf`) => request(app).post("/api/profile/resumes").set("Authorization", `Bearer ${token(ids.candidateA, Role.CANDIDATE)}`).send({ s3Key, fileName: "valid.pdf" });
    const invalidPdfBodies = [[], [0x3c, 0x68, 0x74, 0x6d, 0x6c], [0x3c, 0x73, 0x76, 0x67], [0x4d, 0x5a], [0x50, 0x4b, 0x03, 0x04], [0x25, 0x50, 0x44]];
    for (const bytes of invalidPdfBodies) {
      vi.clearAllMocks(); current(ids.candidateA, Role.CANDIDATE); aws.get.mockResolvedValue(content(bytes));
      expect((await register()).status).toBe(400); expect(prisma.resume.create).not.toHaveBeenCalled(); expect(prisma.candidateProfile.upsert).not.toHaveBeenCalled();
    }
    for (const bytes of [[0x50, 0x4b, 0x03, 0x04], [0x25, 0x50, 0x44, 0x46, 0x2d], [0x3c, 0x68, 0x74, 0x6d, 0x6c], [0x4d, 0x5a], []]) {
      vi.clearAllMocks(); current(ids.candidateA, Role.CANDIDATE); aws.head.mockResolvedValue({ ContentLength: 1024, ContentType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", ServerSideEncryption: "aws:kms" }); aws.get.mockResolvedValue(content(bytes));
      const expected = bytes[0] === 0x50 ? 201 : 400;
      if (expected === 201) { vi.mocked(prisma.candidateProfile.upsert).mockResolvedValue({ id: "profile-a" } as never); vi.mocked(prisma.resume.create).mockResolvedValue({ id: "resume-a" } as never); }
      expect((await register(`resumes/${ids.candidateA}/valid.docx`)).status).toBe(expected); if (expected === 400) expect(prisma.resume.create).not.toHaveBeenCalled();
    }
    for (const body of [content(Array.from({ length: 17 }, () => 0x25)), { Body: { async *[Symbol.asyncIterator]() { yield new Uint8Array(); throw new Error("read failed"); } } }]) {
      vi.clearAllMocks(); current(ids.candidateA, Role.CANDIDATE); aws.head.mockResolvedValue({ ContentLength: 1024, ContentType: "application/pdf", ServerSideEncryption: "aws:kms" }); aws.get.mockResolvedValue(body);
      expect((await register()).status).toBe(422); expect(prisma.resume.create).not.toHaveBeenCalled(); expect(prisma.candidateProfile.upsert).not.toHaveBeenCalled();
    }
  });

  it("fails closed for missing objects, provider failures, and every invalid stored metadata variant", async () => {
    const register = (key = `resumes/${ids.candidateA}/valid.pdf`) => request(app).post("/api/profile/resumes").set("Authorization", `Bearer ${token(ids.candidateA, Role.CANDIDATE)}`).send({ s3Key: key, fileName: "valid.pdf" });
    current(ids.candidateA, Role.CANDIDATE);
    const failures = [
      new Error("NoSuchKey bucket=test-private-uploads request=secret"), new Error("AccessDenied kms=secret"), new Error("timeout"),
      { ContentLength: 0, ContentType: "application/pdf", ServerSideEncryption: "aws:kms" },
      { ContentLength: 10 * 1024 * 1024 + 1, ContentType: "application/pdf", ServerSideEncryption: "aws:kms" },
      { ContentLength: undefined, ContentType: "application/pdf", ServerSideEncryption: "aws:kms" },
      { ContentLength: 1, ContentType: "text/html", ServerSideEncryption: "aws:kms" },
      { ContentLength: 1, ContentType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", ServerSideEncryption: "aws:kms" },
      { ContentLength: 1, ContentType: "application/pdf", ServerSideEncryption: "AES256" },
      { ContentLength: 1, ContentType: "application/pdf" },
    ];
    for (const result of failures) {
      vi.clearAllMocks(); aws.head.mockImplementationOnce(() => result instanceof Error ? Promise.reject(result) : Promise.resolve(result));
      const res = await register();
      expect([400, 422]).toContain(res.status); expect(res.text).not.toContain("test-private-uploads"); expect(res.text).not.toContain("secret");
      expect(prisma.resume.create).not.toHaveBeenCalled(); expect(prisma.candidateProfile.upsert).not.toHaveBeenCalled();
    }
  });

  it("accepts only positive stored sizes through the inclusive 10 MiB boundary", async () => {
    const register = () => request(app).post("/api/profile/resumes").set("Authorization", `Bearer ${token(ids.candidateA, Role.CANDIDATE)}`).send({ s3Key: `resumes/${ids.candidateA}/valid.pdf`, fileName: "valid.pdf" });
    for (const size of [10 * 1024 * 1024 - 1, 10 * 1024 * 1024]) {
      vi.clearAllMocks(); current(ids.candidateA, Role.CANDIDATE);
      aws.head.mockResolvedValue({ ContentLength: size, ContentType: "application/pdf", ServerSideEncryption: "aws:kms" });
      vi.mocked(prisma.candidateProfile.upsert).mockResolvedValue({ id: "profile-a" } as never);
      vi.mocked(prisma.resume.create).mockResolvedValue({ id: "resume-a" } as never);
      expect((await register()).status).toBe(201); expect(prisma.resume.create).toHaveBeenCalledOnce();
    }
    for (const size of [-1, Number.NaN, Number.POSITIVE_INFINITY]) {
      vi.clearAllMocks(); current(ids.candidateA, Role.CANDIDATE);
      aws.head.mockResolvedValue({ ContentLength: size, ContentType: "application/pdf", ServerSideEncryption: "aws:kms" });
      expect((await register()).status).toBe(400); expect(prisma.resume.create).not.toHaveBeenCalled(); expect(prisma.candidateProfile.upsert).not.toHaveBeenCalled();
    }
  });

  it("rejects every unsupported stored type and both extension/type mismatches", async () => {
    const register = (s3Key = `resumes/${ids.candidateA}/valid.pdf`) => request(app).post("/api/profile/resumes").set("Authorization", `Bearer ${token(ids.candidateA, Role.CANDIDATE)}`).send({ s3Key, fileName: "valid.pdf" });
    for (const contentType of ["text/html", "image/svg+xml", "application/javascript", "application/octet-stream", "application/x-msdownload"]) {
      vi.clearAllMocks(); current(ids.candidateA, Role.CANDIDATE);
      aws.head.mockResolvedValue({ ContentLength: 1, ContentType: contentType, ServerSideEncryption: "aws:kms" });
      expect((await register()).status).toBe(400); expect(prisma.resume.create).not.toHaveBeenCalled();
    }
    for (const [key, contentType] of [[`resumes/${ids.candidateA}/valid.pdf`, "application/vnd.openxmlformats-officedocument.wordprocessingml.document"], [`resumes/${ids.candidateA}/valid.docx`, "application/pdf"]]) {
      vi.clearAllMocks(); current(ids.candidateA, Role.CANDIDATE);
      aws.head.mockResolvedValue({ ContentLength: 1, ContentType: contentType, ServerSideEncryption: "aws:kms" });
      expect((await register(key)).status).toBe(400); expect(prisma.resume.create).not.toHaveBeenCalled();
    }
  });

  it("rejects unsupported, encoded traversal, foreign, and inactive-account keys before HeadObject", async () => {
    const register = (key: string) => request(app).post("/api/profile/resumes").set("Authorization", `Bearer ${token(ids.candidateA, Role.CANDIDATE)}`).send({ s3Key: key, fileName: "x.pdf" });
    current(ids.candidateA, Role.CANDIDATE);
    for (const key of [`resumes/${ids.candidateA}/x.exe`, `resumes/${ids.candidateA}/x.html`, `resumes/${ids.candidateA}/x.svg`, `resumes/${ids.candidateA}/x.zip`, `resumes/${ids.candidateA}/x.pdf.exe`, `resumes/${ids.candidateA}/%2e%2e/${ids.candidateB}/x.pdf`, `resumes/${ids.candidateA}/./x.pdf`, `resumes/${ids.candidateA}/x.pdf\r\nvalue`, `resumes/${ids.candidateA}/x.pdf\u0000`, `resumes/${ids.candidateB}/x.pdf`, `trust/candidates/${ids.candidateA}/x.pdf`, `trust/employers/${ids.candidateA}/x.pdf`]) {
      const res = await register(key); expect(res.status, key).toBe(400); expect(aws.head).not.toHaveBeenCalled();
    }
    vi.clearAllMocks(); current(ids.candidateA, Role.CANDIDATE, "DELETED");
    const inactive = await register(`resumes/${ids.candidateA}/valid.pdf`); expect(inactive.status).toBe(401); expect(aws.head).not.toHaveBeenCalled(); expect(prisma.resume.create).not.toHaveBeenCalled();
  });

  it("does not report success when persistence fails after verification", async () => {
    current(ids.candidateA, Role.CANDIDATE); aws.head.mockResolvedValue({ ContentLength: 1, ContentType: "application/pdf", ServerSideEncryption: "aws:kms" });
    vi.mocked(prisma.candidateProfile.upsert).mockRejectedValue(new Error("database detail"));
    const res = await request(app).post("/api/profile/resumes").set("Authorization", `Bearer ${token(ids.candidateA, Role.CANDIDATE)}`).send({ s3Key: `resumes/${ids.candidateA}/valid.pdf`, fileName: "valid.pdf" });
    expect(res.status).toBe(500); expect(res.text).not.toContain("database detail"); expect(prisma.resume.create).not.toHaveBeenCalled();
  });
});
