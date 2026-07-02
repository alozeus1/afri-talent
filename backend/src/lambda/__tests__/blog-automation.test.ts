/**
 * Lambda blog-automation — unit tests
 *
 * Covers three handler paths:
 *   1. Flag off  → no pipeline call, returns triggered:false.
 *   2. Flag on + pipeline success → returns triggered:true with pipeline result.
 *   3. Flag on + pipeline hard-error → handler throws (EventBridge retry).
 *
 * The pipeline module is fully mocked so no DB / network / Anthropic calls occur.
 */

import { vi, describe, it, expect, beforeEach, afterEach } from "vitest";
import type { Context } from "aws-lambda";

const { runBlogPipelineMock } = vi.hoisted(() => ({
  runBlogPipelineMock: vi.fn(),
}));

vi.mock("../../lib/blog/pipeline.js", () => ({
  runBlogPipeline: runBlogPipelineMock,
  persistDraft: vi.fn(),
  notifyAdmin: vi.fn(),
}));

// LangGraph flags are unset in tests → the direct pipeline path is exercised.
// Mock the adapter so importing the handler never pulls in the graph layer.
vi.mock("../../lib/ai/langgraph/integration/blogAutomationAdapter.js", () => ({
  isBlogGraphActive: () => false,
  runBlogPipelineViaGraph: vi.fn(),
  resumeBlogApprovalViaGraph: vi.fn(),
}));

// Stable Context stub for handler invocation.
function makeContext(): Context {
  return {
    awsRequestId: "test-request-id",
    callbackWaitsForEmptyEventLoop: false,
    functionName: "afritalent-dev-blog-automation",
    functionVersion: "$LATEST",
    invokedFunctionArn:
      "arn:aws:lambda:us-east-1:108188564905:function:afritalent-dev-blog-automation",
    memoryLimitInMB: "1024",
    logGroupName: "/aws/lambda/afritalent-dev-blog-automation",
    logStreamName: "2026/05/15/[$LATEST]abc",
    identity: undefined,
    clientContext: undefined,
    getRemainingTimeInMillis: () => 900_000,
    done: () => undefined,
    fail: () => undefined,
    succeed: () => undefined,
  };
}

describe("lambda blog-automation handler", () => {
  const originalFlag = process.env.BLOG_AUTOMATION_ENABLED;

  beforeEach(() => {
    runBlogPipelineMock.mockReset();
    delete process.env.BLOG_AUTOMATION_ENABLED;
  });

  afterEach(() => {
    if (originalFlag === undefined) {
      delete process.env.BLOG_AUTOMATION_ENABLED;
    } else {
      process.env.BLOG_AUTOMATION_ENABLED = originalFlag;
    }
  });

  it("flag off → does not call the pipeline and returns triggered:false", async () => {
    process.env.BLOG_AUTOMATION_ENABLED = "0";
    const { handler } = await import("../blog-automation.js");

    const res = await handler({}, makeContext());

    expect(runBlogPipelineMock).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(200);
    expect(res.body.triggered).toBe(false);
    expect(res.body.flagEnabled).toBe(false);
  });

  it("flag unset → treated as off, pipeline not called", async () => {
    const { handler } = await import("../blog-automation.js");

    const res = await handler({}, makeContext());

    expect(runBlogPipelineMock).not.toHaveBeenCalled();
    expect(res.body.triggered).toBe(false);
  });

  it("flag on + pipeline success → returns triggered:true with pipeline result", async () => {
    process.env.BLOG_AUTOMATION_ENABLED = "1";
    runBlogPipelineMock.mockResolvedValueOnce({
      success: true,
      resourceId: "res-123",
      title: "Weekly Hiring Trends Digest",
      rawContentCount: 4,
      verifiedContentCount: 3,
      durationMs: 12_345,
    });

    const { handler } = await import("../blog-automation.js");
    const res = await handler({}, makeContext());

    expect(runBlogPipelineMock).toHaveBeenCalledTimes(1);
    expect(res.statusCode).toBe(200);
    expect(res.body).toMatchObject({
      triggered: true,
      flagEnabled: true,
      success: true,
      resourceId: "res-123",
      title: "Weekly Hiring Trends Digest",
      rawContentCount: 4,
      verifiedContentCount: 3,
    });
  });

  it("flag 'true' (string) → treated as enabled", async () => {
    process.env.BLOG_AUTOMATION_ENABLED = "true";
    runBlogPipelineMock.mockResolvedValueOnce({
      success: false,
      skippedReason: "No relevant content found from any source",
      rawContentCount: 0,
      verifiedContentCount: 0,
      durationMs: 200,
    });

    const { handler } = await import("../blog-automation.js");
    const res = await handler({}, makeContext());

    expect(runBlogPipelineMock).toHaveBeenCalledTimes(1);
    expect(res.body.triggered).toBe(true);
    expect(res.body.success).toBe(false);
    expect(res.body.skippedReason).toMatch(/No relevant content/);
  });

  it("flag on + pipeline hard-error result → handler throws so EventBridge retries", async () => {
    process.env.BLOG_AUTOMATION_ENABLED = "1";
    runBlogPipelineMock.mockResolvedValueOnce({
      success: false,
      error: "ContentSourceAgent fetch timeout",
      rawContentCount: 0,
      verifiedContentCount: 0,
      durationMs: 30_000,
    });

    const { handler } = await import("../blog-automation.js");

    await expect(handler({}, makeContext())).rejects.toThrow(
      /blog pipeline failed: ContentSourceAgent fetch timeout/,
    );
  });

  it("flag on + pipeline throws → handler bubbles the throw", async () => {
    process.env.BLOG_AUTOMATION_ENABLED = "1";
    runBlogPipelineMock.mockRejectedValueOnce(new Error("Prisma client unavailable"));

    const { handler } = await import("../blog-automation.js");

    await expect(handler({}, makeContext())).rejects.toThrow(/Prisma client unavailable/);
  });
});
