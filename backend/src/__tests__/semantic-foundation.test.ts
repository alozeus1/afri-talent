import { describe, expect, it } from "vitest";
import { buildJobSemanticContent } from "../lib/rag/job-documents.js";
import { generateHashEmbedding, semanticTextScore } from "../lib/rag/embedding.js";

describe("semantic retrieval foundation", () => {
  it("creates deterministic embeddings with fixed dimensionality", () => {
    const first = generateHashEmbedding("Senior backend engineer with Node.js and Prisma");
    const second = generateHashEmbedding("Senior backend engineer with Node.js and Prisma");

    expect(first).toHaveLength(256);
    expect(second).toHaveLength(256);
    expect(first).toEqual(second);
  });

  it("scores related text higher than unrelated text", () => {
    const relevant = semanticTextScore(
      "backend engineer node prisma postgres",
      "Senior backend engineer working with Node.js, Prisma, and PostgreSQL in production systems.",
    );
    const unrelated = semanticTextScore(
      "backend engineer node prisma postgres",
      "Creative social media manager building brand campaigns for fashion retail.",
    );

    expect(relevant).toBeGreaterThan(unrelated);
    expect(relevant).toBeGreaterThan(0.15);
  });

  it("builds rich job indexing content for search and retrieval", () => {
    const content = buildJobSemanticContent({
      id: "job_123",
      title: "Senior Platform Engineer",
      description: "Build resilient APIs, improve observability, and own incident response.",
      location: "Remote - Nigeria",
      type: "FULL_TIME",
      jobField: "Technology",
      workplaceType: "REMOTE",
      seniority: "SENIOR",
      salaryMin: 80000,
      salaryMax: 120000,
      currency: "USD",
      tags: ["node.js", "terraform", "aws"],
      visaSponsorship: "YES",
      relocationAssistance: true,
      eligibleCountries: ["NG", "GH", "KE"],
      status: "PUBLISHED",
      isExpired: false,
      employerId: "emp_123",
      sourceName: "AfriTalent",
      updatedAt: new Date("2026-04-03T12:00:00.000Z"),
      publishedAt: new Date("2026-04-03T11:00:00.000Z"),
    });

    expect(content).toContain("Senior Platform Engineer");
    expect(content).toContain("terraform");
    expect(content).toContain("Visa sponsorship available");
    expect(content).toContain("Eligible countries: NG, GH, KE");
  });
});
