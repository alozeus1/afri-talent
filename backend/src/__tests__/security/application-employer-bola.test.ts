import { beforeEach, describe, expect, it, vi } from "vitest";

const notifications = vi.hoisted(() => ({ dispatch: vi.fn() }));
vi.mock("../../lib/notifications/dispatcher.js", () => ({ dispatch: notifications.dispatch }));
vi.mock("../../middleware/account-standing.js", () => ({
  requireAccountStanding: () => (_req: unknown, _res: unknown, next: () => void) => next(),
}));
vi.mock("../../lib/ats/service.js", () => ({ syncApplicationStatusToAts: vi.fn() }));
vi.mock("../../lib/prisma.js", () => ({ default: {
  user: { findUnique: vi.fn() }, employer: { findUnique: vi.fn() },
  application: { findUnique: vi.fn(), findMany: vi.fn(), update: vi.fn() },
  job: { findFirst: vi.fn() }, subscription: { findUnique: vi.fn() },
  $queryRaw: vi.fn().mockResolvedValue([]), $disconnect: vi.fn(),
} }));

import request from "supertest";
import app from "../../app.js";
import prisma from "../../lib/prisma.js";
import { ApplicationStatus, Role } from "@prisma/client";
import { signToken } from "../../lib/jwt.js";

const ids = { candA: "candidate-a", candB: "candidate-b", empA: "employer-user-a", empB: "employer-user-b", employerA: "employer-a", employerB: "employer-b", jobA: "job-a", jobB: "job-b", appA: "application-a", appB: "application-b" };
const token = (userId: string, role: Role) => signToken({ userId, role, email: `${userId}@example.test` });
const appFor = (id: string, candidateId: string, employerId: string) => ({ id, candidateId, jobId: employerId === ids.employerA ? ids.jobA : ids.jobB, status: ApplicationStatus.PENDING, cvUrl: `https://private.example/${candidateId}.pdf`, coverLetter: "private", job: { id: employerId === ids.employerA ? ids.jobA : ids.jobB, title: "Role", employerId, employer: { id: employerId, companyName: "Company" } }, candidate: { id: candidateId, name: "Private candidate", email: `${candidateId}@example.test` } });

function currentAccount(userId: string, role: Role) {
  (prisma.user.findUnique as any).mockImplementation((args: any) => {
    if (args?.where?.id === userId && args?.select?.deletedAt === true && args?.select?.accountRestrictionStatus === true) return Promise.resolve({ id: userId, email: `${userId}@example.test`, role, deletedAt: null, accountRestrictionStatus: "ACTIVE" } as never);
    return undefined as never;
  });
}
function asEmployer(userId: string, employerId: string) { (prisma.employer.findUnique as any).mockImplementation((args: any) => args?.where?.userId === userId ? Promise.resolve({ id: employerId } as never) : undefined as never); }

beforeEach(() => { vi.clearAllMocks(); notifications.dispatch.mockResolvedValue(undefined); });

describe("application and employer BOLA", () => {
  it("allows the owning candidate and employer to read Application A", async () => {
    vi.mocked(prisma.application.findUnique).mockResolvedValue(appFor(ids.appA, ids.candA, ids.employerA) as never);
    currentAccount(ids.candA, Role.CANDIDATE);
    const candidate = await request(app).get(`/api/applications/${ids.appA}`).set("Authorization", `Bearer ${token(ids.candA, Role.CANDIDATE)}`);
    expect(candidate.status).toBe(200); expect(candidate.body.id).toBe(ids.appA);
    vi.clearAllMocks(); currentAccount(ids.empA, Role.EMPLOYER); asEmployer(ids.empA, ids.employerA);
    vi.mocked(prisma.application.findUnique).mockResolvedValue(appFor(ids.appA, ids.candA, ids.employerA) as never);
    const employer = await request(app).get(`/api/applications/${ids.appA}`).set("Authorization", `Bearer ${token(ids.empA, Role.EMPLOYER)}`);
    expect(employer.status).toBe(200); expect(employer.body.id).toBe(ids.appA);
  });

  it("conceals Candidate B's application and CV from Candidate A", async () => {
    currentAccount(ids.candA, Role.CANDIDATE);
    vi.mocked(prisma.application.findUnique).mockResolvedValue(appFor(ids.appB, ids.candB, ids.employerB) as never);
    const res = await request(app).get(`/api/applications/${ids.appB}`).set("Authorization", `Bearer ${token(ids.candA, Role.CANDIDATE)}`);
    expect(res.status).toBe(403); expect(res.body).not.toHaveProperty("cvUrl"); expect(res.body).not.toHaveProperty("candidate"); expect(notifications.dispatch).not.toHaveBeenCalled();
  });

  it("denies Employer B's foreign application read without returning Candidate A contact data", async () => {
    currentAccount(ids.empB, Role.EMPLOYER); asEmployer(ids.empB, ids.employerB);
    vi.mocked(prisma.application.findUnique).mockResolvedValue(appFor(ids.appA, ids.candA, ids.employerA) as never);
    const res = await request(app).get(`/api/applications/${ids.appA}`).set("Authorization", `Bearer ${token(ids.empB, Role.EMPLOYER)}`);
    expect(res.status).toBe(403); expect(res.body).not.toHaveProperty("candidate"); expect(res.body).not.toHaveProperty("cvUrl");
  });

  it("rejects foreign application status mutations before update or notification", async () => {
    currentAccount(ids.empB, Role.EMPLOYER); asEmployer(ids.empB, ids.employerB);
    vi.mocked(prisma.application.findUnique).mockResolvedValue(appFor(ids.appA, ids.candA, ids.employerA) as never);
    const res = await request(app).put(`/api/applications/${ids.appA}/status`).set("Authorization", `Bearer ${token(ids.empB, Role.EMPLOYER)}`).send({ status: "SHORTLISTED", employerId: ids.employerB, jobId: ids.jobB });
    expect(res.status).toBe(404); expect(prisma.application.update).not.toHaveBeenCalled(); expect(notifications.dispatch).not.toHaveBeenCalled();
  });

  it("denies cross-company applicant lists before candidate data is queried", async () => {
    currentAccount(ids.empB, Role.EMPLOYER); asEmployer(ids.empB, ids.employerB);
    vi.mocked(prisma.job.findFirst).mockResolvedValue(null as never);
    const res = await request(app).get(`/api/applications/job/${ids.jobA}?companyId=company-b&page=999`).set("Authorization", `Bearer ${token(ids.empB, Role.EMPLOYER)}`);
    expect(res.status).toBe(404); expect(prisma.application.findMany).not.toHaveBeenCalled(); expect(prisma.subscription.findUnique).not.toHaveBeenCalled();
  });

  it("uses the database role, not a stale JWT employer claim", async () => {
    currentAccount(ids.candA, Role.CANDIDATE);
    const res = await request(app).get(`/api/applications/job/${ids.jobA}`).set("Authorization", `Bearer ${token(ids.candA, Role.EMPLOYER)}`);
    expect(res.status).toBe(403); expect(prisma.employer.findUnique).not.toHaveBeenCalled();
  });
});
