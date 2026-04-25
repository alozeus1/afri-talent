import { describe, it, expect } from "vitest";
import { gradeAiOutput, formatReportLine } from "../quality-rubric.js";

describe("quality-rubric / empty input", () => {
  it("flags empty output as FAIL", () => {
    const r = gradeAiOutput({ text: "", kind: "resume" });
    expect(r.grade).toBe("FAIL");
    expect(r.score).toBe(0);
    expect(r.issues.some((i) => i.code === "EMPTY_OUTPUT")).toBe(true);
  });
});

describe("quality-rubric / banned phrases", () => {
  it("flags cliche phrases as errors", () => {
    const r = gradeAiOutput({
      text: "I am a hard-working team player and results-driven rockstar with 3 years of experience.",
      kind: "cover_letter",
    });
    expect(r.grade).toBe("FAIL");
    const codes = r.issues.map((i) => i.code);
    expect(codes).toContain("BANNED_PHRASE");
    expect(r.stats.bannedPhraseHits).toBeGreaterThan(0);
  });
});

describe("quality-rubric / placeholder leak", () => {
  it("flags leaked [insert company] style placeholders", () => {
    const r = gradeAiOutput({
      text: "Dear [insert hiring manager], I am excited to apply to {{job_title}}. Regards.",
      kind: "cover_letter",
    });
    expect(r.grade).toBe("FAIL");
    expect(r.issues.some((i) => i.code === "PLACEHOLDER_LEAK")).toBe(true);
  });
});

describe("quality-rubric / cover letter length", () => {
  it("warns when cover letter is too short", () => {
    const r = gradeAiOutput({
      text: "Quick hello. I like the job. I can help. Please call me.",
      kind: "cover_letter",
    });
    expect(r.issues.some((i) => i.code === "COVER_LETTER_TOO_SHORT")).toBe(true);
  });

  it("warns when cover letter is too long", () => {
    const longText = Array(60).fill("I have many years of relevant product experience.").join(" ");
    const r = gradeAiOutput({ text: longText, kind: "cover_letter" });
    expect(r.issues.some((i) => i.code === "COVER_LETTER_TOO_LONG")).toBe(true);
  });
});

describe("quality-rubric / resume quantification", () => {
  it("flags resumes with no metrics", () => {
    const prose = Array(80).fill("Worked on backend services and shipped features").join(". ") + ".";
    const r = gradeAiOutput({ text: prose, kind: "resume" });
    expect(r.issues.some((i) => i.code === "NO_QUANTIFICATION")).toBe(true);
  });

  it("does not flag a resume with clear numbers", () => {
    const prose =
      "Led a team of 6 engineers. Reduced checkout latency by 42%. Grew MRR from $2k to $48k over 12 months. Increased conversion from 1.8% to 3.4%. Shipped 15 production services." +
      " Built scalable platform for 50000 users. Reduced infra cost by 30%.";
    const r = gradeAiOutput({ text: prose + " ".repeat(50) + prose, kind: "resume" });
    expect(r.issues.some((i) => i.code === "NO_QUANTIFICATION")).toBe(false);
    expect(r.stats.quantifiedAchievements).toBeGreaterThan(0);
  });
});

describe("quality-rubric / match explanation length", () => {
  it("warns when match explanation is too short", () => {
    const r = gradeAiOutput({ text: "Good fit.", kind: "match_explanation" });
    expect(r.issues.some((i) => i.code === "EXPLANATION_TOO_SHORT")).toBe(true);
  });
});

describe("quality-rubric / filler density", () => {
  it("flags high filler density", () => {
    const text =
      "I am really very basically just actually very literally simply the best candidate you will kind of find.".repeat(
        3,
      );
    const r = gradeAiOutput({ text, kind: "generic" });
    expect(r.issues.some((i) => i.code === "HIGH_FILLER_DENSITY")).toBe(true);
  });
});

describe("quality-rubric / keyword coverage", () => {
  it("flags missing expected keywords", () => {
    const r = gradeAiOutput({
      text: "I write backend services in Node.js and Postgres.",
      kind: "resume",
      expectedKeywords: ["React", "TypeScript", "AWS"],
    });
    expect(r.issues.some((i) => i.code === "MISSING_KEYWORDS")).toBe(true);
  });

  it("passes when all expected keywords are present", () => {
    const r = gradeAiOutput({
      text:
        "Senior React engineer with 6 years of TypeScript and AWS experience. Led migration reducing costs by 35%. Shipped 12 production React apps over 3 years serving 200k users.",
      kind: "resume",
      expectedKeywords: ["React", "TypeScript", "AWS"],
    });
    expect(r.issues.some((i) => i.code === "MISSING_KEYWORDS")).toBe(false);
  });
});

describe("quality-rubric / overall grading", () => {
  it("returns PASS for high-quality cover letter", () => {
    const good =
      "I'm excited to apply for the Senior Product Engineer role at Acme. Over the past 5 years I have led cross-functional teams to ship six production systems serving 120k monthly users. Most recently I cut checkout latency by 38% and grew conversion from 2.1% to 3.9% by introducing server-side rendering and rigorous instrumentation. I'd bring this same focus on measurable outcomes to your platform team. Acme's mission to rewire African logistics resonates with my own work at LogPlus, where we reduced inter-city freight costs by 22%. I'd love to discuss how I can contribute.";
    const r = gradeAiOutput({ text: good, kind: "cover_letter" });
    expect(r.grade).toBe("PASS");
    expect(r.score).toBeGreaterThanOrEqual(80);
  });
});

describe("quality-rubric / formatReportLine", () => {
  it("produces a compact status line", () => {
    const r = gradeAiOutput({ text: "Good fit.", kind: "match_explanation" });
    const line = formatReportLine(r);
    expect(line).toMatch(/^\[(PASS|WARN|FAIL)\]/);
    expect(line).toContain("score=");
    expect(line).toContain("words=");
  });
});

describe("quality-rubric / job match explanation", () => {
  it("passes a specific, non-generic match explanation", () => {
    const r = gradeAiOutput({
      text: "This role aligns with your 5 years of AWS and Terraform experience. You are missing SOC 2 certification, but your DevSecOps background partially covers this gap.",
      kind: "cover_letter",
    });
    // A specific explanation should not fail on banned phrases or placeholders
    expect(r.issues.filter((i) => i.code === "BANNED_PHRASE")).toHaveLength(0);
    expect(r.issues.filter((i) => i.code === "PLACEHOLDER_LEAK")).toHaveLength(0);
  });

  it("fails a generic match explanation", () => {
    const r = gradeAiOutput({
      text: "You are a results-driven team player who is hard-working and passionate about technology.",
      kind: "cover_letter",
    });
    expect(r.grade).toBe("FAIL");
    expect(r.issues.some((i) => i.code === "BANNED_PHRASE")).toBe(true);
  });
});

describe("quality-rubric / hallucination guard", () => {
  it("flags placeholder leaks as potential hallucination", () => {
    // Uses patterns matched by PLACEHOLDER_PATTERNS: [insert ...] and {{...}}
    const r = gradeAiOutput({
      text: "I have worked at [insert company name] for {{years_of_experience}} and delivered results.",
      kind: "resume",
    });
    expect(r.issues.some((i) => i.code === "PLACEHOLDER_LEAK")).toBe(true);
  });

  it("does not flag real experience descriptions", () => {
    const r = gradeAiOutput({
      text: "Led migration of 3 microservices to AWS ECS Fargate, reducing deployment time by 40% and cutting infrastructure costs by $12k/month. Implemented CI/CD with GitHub Actions and Terraform for 8 engineers.",
      kind: "resume",
    });
    expect(r.issues.filter((i) => i.code === "PLACEHOLDER_LEAK")).toHaveLength(0);
  });
});
