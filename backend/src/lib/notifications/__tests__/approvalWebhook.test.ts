import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  signBody,
  verifyBodySignature,
  mintDecisionToken,
  verifyDecisionToken,
  gateMetaFor,
  emitApprovalRequested,
} from "../approvalWebhook.js";

const SECRET = "test-secret-at-least-32-bytes-long-xxxxxx";
const NOW = 1_752_000_000; // fixed unix seconds; module never calls Date.now itself

describe("approvalWebhook — body signature", () => {
  it("round-trips a valid signature", () => {
    const body = JSON.stringify({ a: 1, b: "two" });
    const sig = signBody(body, SECRET);
    expect(verifyBodySignature(body, sig, SECRET)).toBe(true);
  });

  it("rejects a tampered body", () => {
    const sig = signBody("{\"a\":1}", SECRET);
    expect(verifyBodySignature("{\"a\":2}", sig, SECRET)).toBe(false);
  });

  it("rejects a wrong secret", () => {
    const body = "{\"a\":1}";
    const sig = signBody(body, SECRET);
    expect(verifyBodySignature(body, sig, "other-secret")).toBe(false);
  });
});

describe("approvalWebhook — decision token", () => {
  it("round-trips a valid deny token", () => {
    const token = mintDecisionToken("run-123", "deny", SECRET, NOW);
    const v = verifyDecisionToken(token, SECRET, NOW);
    expect(v.ok).toBe(true);
    expect(v.claims?.graphRunId).toBe("run-123");
    expect(v.claims?.action).toBe("deny");
  });

  it("rejects a tampered claims segment", () => {
    const token = mintDecisionToken("run-123", "deny", SECRET, NOW);
    const [, sig] = token.split(".");
    const forgedClaims = Buffer.from(
      JSON.stringify({ graphRunId: "run-999", action: "deny", exp: NOW + 1000 }),
    ).toString("base64url");
    const v = verifyDecisionToken(`${forgedClaims}.${sig}`, SECRET, NOW);
    expect(v.ok).toBe(false);
    expect(v.reason).toBe("bad_signature");
  });

  it("rejects a token signed with a different secret", () => {
    const token = mintDecisionToken("run-123", "deny", "attacker-secret", NOW);
    const v = verifyDecisionToken(token, SECRET, NOW);
    expect(v.ok).toBe(false);
    expect(v.reason).toBe("bad_signature");
  });

  it("rejects an expired token", () => {
    const token = mintDecisionToken("run-123", "deny", SECRET, NOW);
    // 4 days later — TTL is 3 days
    const v = verifyDecisionToken(token, SECRET, NOW + 60 * 60 * 24 * 4);
    expect(v.ok).toBe(false);
    expect(v.reason).toBe("expired");
  });

  it("rejects a malformed token", () => {
    expect(verifyDecisionToken("not-a-token", SECRET, NOW).reason).toBe("malformed");
  });
});

describe("approvalWebhook — gate taxonomy", () => {
  it("maps known workflow types to their sensitive action and HIGH tier", () => {
    expect(gateMetaFor("employer_verification").sensitiveAction).toBe("approve_high_risk_employer");
    expect(gateMetaFor("blog_automation").sensitiveAction).toBe("publish_blog");
    expect(gateMetaFor("employer_verification").riskTier).toBe("HIGH");
  });

  it("falls back safely for an unknown workflow type", () => {
    const meta = gateMetaFor("something_new");
    expect(meta.riskTier).toBe("HIGH");
    expect(meta.consolePath).toBe("/admin");
  });
});

describe("approvalWebhook — emitter", () => {
  const OLD_ENV = { ...process.env };
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200 });
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    process.env = { ...OLD_ENV };
  });

  it("no-ops when unconfigured (no fetch)", async () => {
    delete process.env.N8N_APPROVAL_WEBHOOK_URL;
    delete process.env.N8N_APPROVAL_HMAC_SECRET;
    await emitApprovalRequested({ graphRunId: "r1", workflowType: "blog_automation" }, NOW);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("posts a signed, PII-free payload when configured", async () => {
    process.env.N8N_APPROVAL_WEBHOOK_URL = "https://n8n.example/webhook/approval";
    process.env.N8N_APPROVAL_HMAC_SECRET = SECRET;
    process.env.APP_ADMIN_URL = "https://admin.example";

    await emitApprovalRequested(
      { graphRunId: "run-abc", workflowType: "employer_verification", employerId: "emp-1" },
      NOW,
    );

    expect(fetchMock).toHaveBeenCalledOnce();
    const [url, opts] = fetchMock.mock.calls[0];
    expect(url).toBe("https://n8n.example/webhook/approval");
    const headers = opts.headers as Record<string, string>;
    const rawBody = opts.body as string;
    // Signature header must verify against the exact body sent.
    expect(verifyBodySignature(rawBody, headers["x-afritalent-signature"], SECRET)).toBe(true);

    const parsed = JSON.parse(rawBody);
    expect(parsed.sensitiveAction).toBe("approve_high_risk_employer");
    expect(parsed.approveDeepLink).toContain("https://admin.example/admin/trust/employers");
    // Deny token must be a valid deny token for this run.
    const v = verifyDecisionToken(parsed.denyToken, SECRET, NOW);
    expect(v.ok).toBe(true);
    expect(v.claims?.graphRunId).toBe("run-abc");
    // No raw PII — only ids.
    expect(rawBody).not.toContain("@");
  });

  it("never throws when fetch fails (best-effort)", async () => {
    process.env.N8N_APPROVAL_WEBHOOK_URL = "https://n8n.example/webhook/approval";
    process.env.N8N_APPROVAL_HMAC_SECRET = SECRET;
    fetchMock.mockRejectedValue(new Error("network down"));
    await expect(
      emitApprovalRequested({ graphRunId: "r2", workflowType: "blog_automation" }, NOW),
    ).resolves.toBeUndefined();
  });
});
