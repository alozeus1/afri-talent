// §5.9 — apply caps + employer opt-out unit tests.
//
// Uses an in-memory prisma stub so the cap + opt-out decisions are exercised
// without the actual DB. The route-level enforcement is tested via the
// existing jobs-api integration tests (which mock prisma the same way).

import { describe, expect, it } from "vitest";
import {
  APPLY_CAP_PER_JOB_DAYS,
  APPLY_CAP_PER_EMPLOYER_DAYS,
  APPLY_CAP_PER_EMPLOYER_DISTINCT_JOBS,
  checkApplyCaps,
  defaultOptOutExpiry,
  emailDomainOf,
  isEmployerOptedOut,
  resolveEffectiveApplyStrategy,
} from "../lib/apply/caps.js";

const CANDIDATE_ID = "candidate-1";
const JOB_ID = "job-1";
const EMPLOYER_ID = "employer-1";

interface FakeApplication {
  id: string;
  candidateId: string;
  jobId: string;
  createdAt: Date;
}

interface FakeJob {
  id: string;
  employerId: string | null;
}

interface FakeOptOut {
  domain: string;
  expiresAt: Date;
}

function buildPrisma(opts: {
  jobs?: FakeJob[];
  applications?: FakeApplication[];
  optOuts?: FakeOptOut[];
}) {
  const jobs = opts.jobs ?? [{ id: JOB_ID, employerId: EMPLOYER_ID }];
  const applications = opts.applications ?? [];
  const optOuts = opts.optOuts ?? [];
  return {
    job: {
      findUnique: async ({ where }: { where: { id: string } }) =>
        jobs.find((j) => j.id === where.id) ?? null,
    },
    application: {
      findFirst: async ({ where }: { where: Record<string, unknown> }) => {
        const since = (where.createdAt as { gte?: Date } | undefined)?.gte;
        return (
          applications.find(
            (a) =>
              a.candidateId === (where.candidateId as string) &&
              a.jobId === (where.jobId as string) &&
              (!since || a.createdAt.getTime() >= since.getTime()),
          ) ?? null
        );
      },
      findMany: async ({ where, select: _select, distinct: _distinct }: { where: Record<string, unknown>; select?: unknown; distinct?: unknown }) => {
        const since = (where.createdAt as { gte?: Date } | undefined)?.gte;
        const employerFilter = (where.job as { employerId?: string } | undefined)?.employerId;
        const candidateId = where.candidateId as string;
        const matching = applications.filter(
          (a) =>
            a.candidateId === candidateId &&
            (!since || a.createdAt.getTime() >= since.getTime()) &&
            (!employerFilter ||
              jobs.find((j) => j.id === a.jobId)?.employerId === employerFilter),
        );
        // honour distinct: ["jobId"] by collapsing.
        const seen = new Set<string>();
        return matching
          .filter((a) => {
            if (seen.has(a.jobId)) return false;
            seen.add(a.jobId);
            return true;
          })
          .map((a) => ({ jobId: a.jobId }));
      },
    },
    employerApplyOptOut: {
      findUnique: async ({ where }: { where: { domain: string } }) =>
        optOuts.find((o) => o.domain === where.domain) ?? null,
    },
  };
}

describe("§5.9 — checkApplyCaps", () => {
  it("returns ok when the candidate has never applied", async () => {
    const prisma = buildPrisma({});
    const r = await checkApplyCaps(prisma as never, CANDIDATE_ID, JOB_ID);
    expect(r.ok).toBe(true);
  });

  it("rejects with PER_JOB_CAP when the candidate already applied to the same job inside 60 days", async () => {
    const prisma = buildPrisma({
      applications: [
        { id: "a1", candidateId: CANDIDATE_ID, jobId: JOB_ID, createdAt: new Date(Date.now() - 5 * 86_400_000) },
      ],
    });
    const r = await checkApplyCaps(prisma as never, CANDIDATE_ID, JOB_ID);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe("PER_JOB_CAP");
  });

  it("allows a re-apply to the same job after 60 days", async () => {
    const prisma = buildPrisma({
      applications: [
        { id: "a1", candidateId: CANDIDATE_ID, jobId: JOB_ID, createdAt: new Date(Date.now() - (APPLY_CAP_PER_JOB_DAYS + 1) * 86_400_000) },
      ],
    });
    const r = await checkApplyCaps(prisma as never, CANDIDATE_ID, JOB_ID);
    expect(r.ok).toBe(true);
  });

  it("rejects with PER_EMPLOYER_CAP at 3+ distinct jobs for one employer in 30 days", async () => {
    const allJobs = ["j1", "j2", "j3", "j-new"].map((id) => ({ id, employerId: EMPLOYER_ID }));
    const recent = new Date(Date.now() - 10 * 86_400_000);
    const prisma = buildPrisma({
      jobs: allJobs,
      applications: ["j1", "j2", "j3"].map((jobId) => ({
        id: jobId,
        candidateId: CANDIDATE_ID,
        jobId,
        createdAt: recent,
      })),
    });
    const r = await checkApplyCaps(prisma as never, CANDIDATE_ID, "j-new");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe("PER_EMPLOYER_CAP");
  });

  it("permits when the 3 prior employer applications are older than 30 days", async () => {
    const allJobs = ["j1", "j2", "j3", "j-new"].map((id) => ({ id, employerId: EMPLOYER_ID }));
    const old = new Date(Date.now() - (APPLY_CAP_PER_EMPLOYER_DAYS + 1) * 86_400_000);
    const prisma = buildPrisma({
      jobs: allJobs,
      applications: ["j1", "j2", "j3"].map((jobId) => ({ id: jobId, candidateId: CANDIDATE_ID, jobId, createdAt: old })),
    });
    const r = await checkApplyCaps(prisma as never, CANDIDATE_ID, "j-new");
    expect(r.ok).toBe(true);
  });

  it("ignores employer cap for aggregated jobs with no employerId", async () => {
    const prisma = buildPrisma({
      jobs: [{ id: JOB_ID, employerId: null }],
      applications: [],
    });
    const r = await checkApplyCaps(prisma as never, CANDIDATE_ID, JOB_ID);
    expect(r.ok).toBe(true);
  });

  it("exposes the constants the spec calls out", () => {
    expect(APPLY_CAP_PER_JOB_DAYS).toBe(60);
    expect(APPLY_CAP_PER_EMPLOYER_DAYS).toBe(30);
    expect(APPLY_CAP_PER_EMPLOYER_DISTINCT_JOBS).toBe(3);
  });
});

describe("§5.9 — emailDomainOf + isEmployerOptedOut", () => {
  it("extracts a lowercased domain", () => {
    expect(emailDomainOf("Careers@AcmeCorp.com")).toBe("acmecorp.com");
  });

  it("returns null for malformed inputs", () => {
    expect(emailDomainOf(null)).toBeNull();
    expect(emailDomainOf("no-at-sign")).toBeNull();
    expect(emailDomainOf("trailing@")).toBeNull();
  });

  it("returns true when the domain matches an unexpired opt-out", async () => {
    const prisma = buildPrisma({
      optOuts: [{ domain: "acme.com", expiresAt: new Date(Date.now() + 365 * 86_400_000) }],
    });
    expect(await isEmployerOptedOut(prisma as never, "acme.com")).toBe(true);
  });

  it("returns false when the opt-out has expired", async () => {
    const prisma = buildPrisma({
      optOuts: [{ domain: "acme.com", expiresAt: new Date(Date.now() - 1) }],
    });
    expect(await isEmployerOptedOut(prisma as never, "acme.com")).toBe(false);
  });

  it("returns false when no row exists", async () => {
    const prisma = buildPrisma({});
    expect(await isEmployerOptedOut(prisma as never, "unknown.com")).toBe(false);
  });
});

describe("§5.9 — resolveEffectiveApplyStrategy", () => {
  it("passes through non-EMAIL_DRAFT strategies untouched", async () => {
    const prisma = buildPrisma({});
    for (const strategy of ["ATS_API_GREENHOUSE", "OPERATOR_HANDOFF", "ASSISTED_REDIRECT"] as const) {
      const r = await resolveEffectiveApplyStrategy(prisma as never, {
        applyStrategy: strategy,
        applyEmailDetected: "anyone@anywhere.com",
      });
      expect(r.effective).toBe(strategy);
      expect(r.downgradedFromEmailDraft).toBe(false);
    }
  });

  it("downgrades EMAIL_DRAFT → ASSISTED_REDIRECT when the domain is opted out", async () => {
    const prisma = buildPrisma({
      optOuts: [{ domain: "boring.co", expiresAt: new Date(Date.now() + 365 * 86_400_000) }],
    });
    const r = await resolveEffectiveApplyStrategy(prisma as never, {
      applyStrategy: "EMAIL_DRAFT",
      applyEmailDetected: "careers@boring.co",
    });
    expect(r.effective).toBe("ASSISTED_REDIRECT");
    expect(r.downgradedFromEmailDraft).toBe(true);
  });

  it("keeps EMAIL_DRAFT for domains not on the opt-out list", async () => {
    const prisma = buildPrisma({});
    const r = await resolveEffectiveApplyStrategy(prisma as never, {
      applyStrategy: "EMAIL_DRAFT",
      applyEmailDetected: "careers@fresh.co",
    });
    expect(r.effective).toBe("EMAIL_DRAFT");
    expect(r.downgradedFromEmailDraft).toBe(false);
  });
});

describe("§5.9 — defaultOptOutExpiry", () => {
  it("returns a date roughly 12 months in the future", () => {
    const now = new Date("2026-05-13T00:00:00Z");
    const expires = defaultOptOutExpiry(now);
    expect(expires.getFullYear()).toBe(2027);
    expect(expires.getMonth()).toBe(now.getMonth());
  });
});
