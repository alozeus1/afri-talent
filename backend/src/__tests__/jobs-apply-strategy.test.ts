// §5.2 — apply pathway classifier unit tests.

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { classifyApplyStrategy } from "../lib/jobs/apply-strategy.js";

const originalEnv = { ...process.env };

beforeEach(() => {
  process.env = { ...originalEnv };
  delete process.env.APPLY_ATS_GREENHOUSE_ENABLED;
  delete process.env.APPLY_ATS_LEVER_ENABLED;
  delete process.env.APPLY_ATS_ASHBY_ENABLED;
  delete process.env.APPLY_ATS_WORKABLE_ENABLED;
  delete process.env.APPLY_OPERATOR_HANDOFF_ENABLED;
});

afterEach(() => {
  process.env = { ...originalEnv };
});

describe("§5.2 — ATS_API_* gated by per-vendor env flag", () => {
  it("routes Greenhouse jobs to ATS_API_GREENHOUSE when the flag is on", () => {
    process.env.APPLY_ATS_GREENHOUSE_ENABLED = "1";
    expect(
      classifyApplyStrategy({ jobSource: "GREENHOUSE", sourceUrl: "https://boards.greenhouse.io/x/jobs/1" }),
    ).toEqual({ strategy: "ATS_API_GREENHOUSE" });
  });

  it("degrades to ASSISTED_REDIRECT when the Greenhouse flag is off (operator handoff also off)", () => {
    expect(
      classifyApplyStrategy({ jobSource: "GREENHOUSE", sourceUrl: "https://boards.greenhouse.io/x/jobs/1" }),
    ).toEqual({ strategy: "ASSISTED_REDIRECT" });
  });

  it("routes to OPERATOR_HANDOFF for a known ATS host only when that flag is on", () => {
    process.env.APPLY_OPERATOR_HANDOFF_ENABLED = "1";
    expect(
      classifyApplyStrategy({ jobSource: "GREENHOUSE", sourceUrl: "https://boards.greenhouse.io/x/jobs/1" }),
    ).toEqual({ strategy: "OPERATOR_HANDOFF", applyFormDomain: "boards.greenhouse.io" });
  });

  it("routes Lever jobs to ATS_API_LEVER when the flag is on", () => {
    process.env.APPLY_ATS_LEVER_ENABLED = "true";
    expect(classifyApplyStrategy({ jobSource: "LEVER", sourceUrl: "https://jobs.lever.co/x/2" }))
      .toEqual({ strategy: "ATS_API_LEVER" });
  });

  it("routes Workable jobs to ATS_API_WORKABLE when the flag is on", () => {
    process.env.APPLY_ATS_WORKABLE_ENABLED = "1";
    expect(classifyApplyStrategy({ jobSource: "WORKABLE", sourceUrl: "https://apply.workable.com/co/j/3" }))
      .toEqual({ strategy: "ATS_API_WORKABLE" });
  });

  it("does not unlock other vendors when a different flag is on", () => {
    process.env.APPLY_ATS_GREENHOUSE_ENABLED = "1";
    // LEVER has no API flag on and operator handoff is off → clickout fallback.
    expect(classifyApplyStrategy({ jobSource: "LEVER", sourceUrl: "https://jobs.lever.co/x/2" }))
      .toEqual({ strategy: "ASSISTED_REDIRECT" });
  });
});

describe("§5.2 — EMAIL_DRAFT — parseable apply email in description", () => {
  it("extracts a mailto: URI", () => {
    const result = classifyApplyStrategy({
      jobSource: "REMOTEOK",
      description: "Send your CV to <a href=\"mailto:careers@acme.io\">careers@acme.io</a>.",
    });
    expect(result.strategy).toBe("EMAIL_DRAFT");
    expect(result.applyEmailDetected).toBe("careers@acme.io");
  });

  it("extracts careers@ on any domain", () => {
    const result = classifyApplyStrategy({
      jobSource: "REMOTEOK",
      description: "Apply by email: careers@globex-international.co.uk",
    });
    expect(result.strategy).toBe("EMAIL_DRAFT");
    expect(result.applyEmailDetected).toBe("careers@globex-international.co.uk");
  });

  it("extracts apply@ on any domain", () => {
    const result = classifyApplyStrategy({
      jobSource: "JOBBERMAN",
      description: "Drop a line at apply@startup.ng with your portfolio",
    });
    expect(result.applyEmailDetected).toBe("apply@startup.ng");
    expect(result.strategy).toBe("EMAIL_DRAFT");
  });

  it("matches jobs@, recruitment@, hr@ as apply-side users", () => {
    for (const addr of ["jobs@x.com", "recruitment@y.io", "hr@z.org", "hiring@a.co"]) {
      const result = classifyApplyStrategy({ jobSource: "REMOTEOK", description: `email: ${addr}` });
      expect(result.strategy).toBe("EMAIL_DRAFT");
      expect(result.applyEmailDetected).toBe(addr);
    }
  });

  it("matches dotted/dashed prefixes like apply.ny@ or careers-eu@", () => {
    const result = classifyApplyStrategy({
      jobSource: "REMOTEOK",
      description: "Send to careers-eu@bigco.com",
    });
    expect(result.applyEmailDetected).toBe("careers-eu@bigco.com");
  });

  it("ignores non-apply emails like founder@ or john.doe@", () => {
    const result = classifyApplyStrategy({
      jobSource: "REMOTEOK",
      description: "Questions? Ask the founder john.doe@startup.com",
      sourceUrl: "https://startup.com/careers/123",
    });
    expect(result.strategy).toBe("ASSISTED_REDIRECT");
    expect(result.applyEmailDetected).toBeUndefined();
  });
});

describe("§5.2 — OPERATOR_HANDOFF — known form-based ATS hosts", () => {
  // Operator handoff is flag-gated OFF by default; enable it for this block so
  // the host-matching behaviour is covered independent of the default.
  beforeEach(() => {
    process.env.APPLY_OPERATOR_HANDOFF_ENABLED = "1";
  });

  it("degrades to ASSISTED_REDIRECT for a known host when the flag is off", () => {
    delete process.env.APPLY_OPERATOR_HANDOFF_ENABLED;
    expect(
      classifyApplyStrategy({ jobSource: "INDEED_US", sourceUrl: "https://example.wd5.myworkdayjobs.com/foo/job/123" }),
    ).toEqual({ strategy: "ASSISTED_REDIRECT" });
  });

  it("matches Workday (myworkdayjobs.com)", () => {
    expect(
      classifyApplyStrategy({ jobSource: "INDEED_US", sourceUrl: "https://example.wd5.myworkdayjobs.com/foo/job/123" }),
    ).toEqual({ strategy: "OPERATOR_HANDOFF", applyFormDomain: "example.wd5.myworkdayjobs.com" });
  });

  it("matches Taleo", () => {
    expect(
      classifyApplyStrategy({ jobSource: "INDEED_US", sourceUrl: "https://employer.taleo.net/careersection/123" })
        .strategy,
    ).toBe("OPERATOR_HANDOFF");
  });

  it("matches iCIMS subdomain", () => {
    expect(
      classifyApplyStrategy({ jobSource: "ANGELLIST", sourceUrl: "https://careers-acme.icims.com/jobs/1234" })
        .strategy,
    ).toBe("OPERATOR_HANDOFF");
  });

  it("matches Greenhouse boards (no API access)", () => {
    expect(
      classifyApplyStrategy({ jobSource: "INDEED_US", sourceUrl: "https://boards.greenhouse.io/x/jobs/1" })
        .applyFormDomain,
    ).toBe("boards.greenhouse.io");
  });

  it("prefers applicationUrl over sourceUrl when present", () => {
    const result = classifyApplyStrategy({
      jobSource: "INDEED_US",
      sourceUrl: "https://example.com/job/1",
      applicationUrl: "https://example.icims.com/apply",
    });
    expect(result.strategy).toBe("OPERATOR_HANDOFF");
    expect(result.applyFormDomain).toBe("example.icims.com");
  });
});

describe("§5.2 — ASSISTED_REDIRECT fallback", () => {
  it("uses ASSISTED_REDIRECT when nothing else matches", () => {
    const result = classifyApplyStrategy({
      jobSource: "REMOTEOK",
      sourceUrl: "https://remoteok.com/remote-jobs/12345",
      description: "Apply on our website",
    });
    expect(result).toEqual({ strategy: "ASSISTED_REDIRECT" });
  });

  it("uses ASSISTED_REDIRECT when sourceUrl is missing entirely", () => {
    const result = classifyApplyStrategy({ jobSource: "REMOTEOK" });
    expect(result.strategy).toBe("ASSISTED_REDIRECT");
  });
});

describe("§5.2 — priority order", () => {
  it("ATS_API beats EMAIL_DRAFT when both could match", () => {
    process.env.APPLY_ATS_GREENHOUSE_ENABLED = "1";
    const result = classifyApplyStrategy({
      jobSource: "GREENHOUSE",
      sourceUrl: "https://boards.greenhouse.io/x/jobs/1",
      description: "You can also email careers@x.com",
    });
    expect(result.strategy).toBe("ATS_API_GREENHOUSE");
  });

  it("EMAIL_DRAFT beats OPERATOR_HANDOFF when both could match", () => {
    const result = classifyApplyStrategy({
      jobSource: "INDEED_US",
      sourceUrl: "https://boards.greenhouse.io/x/jobs/1",
      description: "Email careers@x.com — Greenhouse is just our applicant tracker.",
    });
    expect(result.strategy).toBe("EMAIL_DRAFT");
    expect(result.applyEmailDetected).toBe("careers@x.com");
  });
});
