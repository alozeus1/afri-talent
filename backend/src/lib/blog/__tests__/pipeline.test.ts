/**
 * Blog Pipeline — unit tests
 *
 * All external I/O (Prisma, Anthropic, fetch) is mocked so these tests run
 * without any network or database access.
 */

import { vi, describe, it, expect, beforeEach } from "vitest";

// ── Prisma mock ───────────────────────────────────────────────────────────────

function makeMockResource() {
  return {
    id: "res-001",
    title: "Weekly Remote Jobs Digest — May 5, 2025",
    slug: "weekly-remote-jobs-may-5-2025-abc123",
    excerpt: "Top trends in global remote hiring for African tech professionals.",
    content: "## Introduction\nTest content.",
    category: "Weekly Hiring Trends",
    coverImage: null,
    published: false,
    publishedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

const fixtures = vi.hoisted(() => {
  const rawContent = [
    {
      title: "Remote work surges across Africa",
      url: "https://techcabal.com/remote-work-africa",
      excerpt: "African developers are increasingly sought by global companies.",
      sourceName: "TechCabal",
      sourceDomain: "techcabal.com",
      publishedAt: new Date().toISOString(),
      relevanceScore: 80,
    },
  ];

  return {
    mockAdminReview: { id: "review-001", status: "PENDING" },
    mockAdmin: { id: "admin-001" },
    rawContentFixture: rawContent,
    verifiedContentFixture: rawContent.map((item) => ({
      ...item,
      credibilityScore: 75,
      verificationNotes:
        "Well-sourced article from a reputable African tech publication.",
      keyFacts: ["70% of African developers work remotely at least part-time"],
    })),
    draftPostFixture: {
      title: "Weekly Remote Jobs Digest — May 5, 2025",
      slug: "weekly-remote-jobs-may-5-2025-abc123",
      excerpt: "Top trends in global remote hiring for African tech professionals.",
      content: "## Introduction\nTest content.",
      category: "Weekly Hiring Trends",
      sources: [{ name: "TechCabal", url: "https://techcabal.com" }],
      topicKeywords: ["Africa remote work", "tech hiring"],
      estimatedReadMinutes: 4,
    },
  };
});

vi.mock("../../prisma.js", () => ({
  default: {
    resource: {
      create: vi.fn().mockResolvedValue(makeMockResource()),
    },
    adminReview: {
      create: vi.fn().mockResolvedValue(fixtures.mockAdminReview),
    },
    user: {
      findFirst: vi.fn().mockResolvedValue(fixtures.mockAdmin),
    },
    job: {
      findMany: vi.fn().mockResolvedValue([]),
    },
  },
}));

// ── Ops/resilience mocks ──────────────────────────────────────────────────────

vi.mock("../../ops/resilience.js", () => ({
  withRetry: vi.fn().mockImplementation((fn: () => unknown) => fn()),
  pushDeadLetter: vi.fn().mockResolvedValue(undefined),
  recordWorkerState: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("../../ops/events.js", () => ({
  recordOpsEvent: vi.fn(),
}));

// ── Logger mock ───────────────────────────────────────────────────────────────

vi.mock("../../logger.js", () => ({
  default: {
    child: () => ({
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      debug: vi.fn(),
    }),
  },
}));

// ── Agent mocks ───────────────────────────────────────────────────────────────

vi.mock("../agents/content-source-agent.js", () => ({
  ContentSourceAgent: vi.fn().mockResolvedValue(fixtures.rawContentFixture),
}));

vi.mock("../agents/fact-check-agent.js", () => ({
  FactCheckAgent: vi.fn().mockResolvedValue(fixtures.verifiedContentFixture),
}));

vi.mock("../agents/blog-writer-agent.js", () => ({
  BlogWriterAgent: vi.fn().mockResolvedValue(fixtures.draftPostFixture),
}));

vi.mock("../agents/image-sourcer.js", () => ({
  ImageSourcerAgent: vi.fn().mockResolvedValue(null),
}));

// ── SES mock (for notification email) ────────────────────────────────────────

vi.mock("@aws-sdk/client-ses", () => ({
  SESClient: vi.fn().mockReturnValue({ send: vi.fn().mockResolvedValue({}) }),
  SendEmailCommand: vi.fn(),
}));

// ── Tests ─────────────────────────────────────────────────────────────────────

import { runBlogPipeline } from "../pipeline.js";
import prisma from "../../prisma.js";

const mockResource = makeMockResource();

describe("runBlogPipeline", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Re-apply default resolved values after clear
    (prisma.resource.create as ReturnType<typeof vi.fn>).mockResolvedValue(makeMockResource());
    (prisma.adminReview.create as ReturnType<typeof vi.fn>).mockResolvedValue(fixtures.mockAdminReview);
    (prisma.user.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(fixtures.mockAdmin);
  });

  it("returns success and creates Resource + AdminReview on happy path", async () => {
    const result = await runBlogPipeline();

    expect(result.success).toBe(true);
    expect(result.resourceId).toBe("res-001");
    expect(result.rawContentCount).toBe(1);
    expect(result.verifiedContentCount).toBe(1);
    expect(result.error).toBeUndefined();

    expect(prisma.resource.create).toHaveBeenCalledOnce();
    expect(prisma.resource.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          published: false,
          category: "Weekly Hiring Trends",
        }),
      })
    );

    expect(prisma.adminReview.create).toHaveBeenCalledOnce();
    expect(prisma.adminReview.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: "PENDING",
          targetType: "RESOURCE",
          targetResourceId: "res-001",
        }),
      })
    );
  });

  it("returns skipped when ContentSourceAgent returns empty array", async () => {
    const { ContentSourceAgent } = await import("../agents/content-source-agent.js");
    (ContentSourceAgent as ReturnType<typeof vi.fn>).mockResolvedValueOnce([]);

    const result = await runBlogPipeline();

    expect(result.success).toBe(false);
    expect(result.skippedReason).toBeDefined();
    expect(result.rawContentCount).toBe(0);
    expect(prisma.resource.create).not.toHaveBeenCalled();
  });

  it("returns skipped when FactCheckAgent filters all items", async () => {
    const { FactCheckAgent } = await import("../agents/fact-check-agent.js");
    (FactCheckAgent as ReturnType<typeof vi.fn>).mockResolvedValueOnce([]);

    const result = await runBlogPipeline();

    expect(result.success).toBe(false);
    expect(result.skippedReason).toBeDefined();
    expect(result.verifiedContentCount).toBe(0);
    expect(prisma.resource.create).not.toHaveBeenCalled();
  });

  it("returns error when BlogWriterAgent throws", async () => {
    const { BlogWriterAgent } = await import("../agents/blog-writer-agent.js");
    (BlogWriterAgent as ReturnType<typeof vi.fn>).mockRejectedValueOnce(
      new Error("Claude API unavailable")
    );

    const result = await runBlogPipeline();

    expect(result.success).toBe(false);
    expect(result.error).toContain("Claude API unavailable");
    expect(prisma.resource.create).not.toHaveBeenCalled();
  });

  it("still creates Resource when no admin user exists (no review assignment)", async () => {
    (prisma.user.findFirst as ReturnType<typeof vi.fn>).mockResolvedValueOnce(null);

    const result = await runBlogPipeline();

    expect(result.success).toBe(true);
    expect(prisma.resource.create).toHaveBeenCalledOnce();
    // AdminReview should NOT be created when no admin user exists
    expect(prisma.adminReview.create).not.toHaveBeenCalled();
  });
});
