// §5.7 — apply consent-gate state machine unit tests.

import { SubmissionStatus } from "@prisma/client";
import { describe, expect, it } from "vitest";
import {
  REQUIRED_ACKNOWLEDGEMENTS,
  canTransition,
  gateSubmit,
  transition,
  validateAcknowledgements,
} from "../lib/apply/state-machine.js";
import { dispatchApply } from "../lib/apply/dispatch.js";

describe("§5.7 — validateAcknowledgements", () => {
  it("rejects an empty array", () => {
    const r = validateAcknowledgements([]);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.missing).toEqual([...REQUIRED_ACKNOWLEDGEMENTS]);
  });

  it("rejects partial acknowledgements", () => {
    const r = validateAcknowledgements([REQUIRED_ACKNOWLEDGEMENTS[0]]);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.missing).toEqual([REQUIRED_ACKNOWLEDGEMENTS[1]]);
  });

  it("accepts the full required set", () => {
    expect(validateAcknowledgements([...REQUIRED_ACKNOWLEDGEMENTS]).ok).toBe(true);
  });

  it("accepts extras for forward-compat", () => {
    const r = validateAcknowledgements([...REQUIRED_ACKNOWLEDGEMENTS, "future-acknowledgement"]);
    expect(r.ok).toBe(true);
  });

  it("rejects undefined / null inputs", () => {
    expect(validateAcknowledgements(undefined).ok).toBe(false);
    expect(validateAcknowledgements(null).ok).toBe(false);
  });
});

describe("§5.7 — transition + canTransition", () => {
  it("permits NOT_SUBMITTED → DRAFTING", () => {
    expect(canTransition(SubmissionStatus.NOT_SUBMITTED, SubmissionStatus.DRAFTING)).toBe(true);
  });

  it("permits DRAFTING → SUBMITTING and DRAFTING → AWAITING_USER_CONFIRMATION", () => {
    expect(canTransition(SubmissionStatus.DRAFTING, SubmissionStatus.SUBMITTING)).toBe(true);
    expect(canTransition(SubmissionStatus.DRAFTING, SubmissionStatus.AWAITING_USER_CONFIRMATION)).toBe(true);
  });

  it("permits SUBMITTING → SUBMITTED and SUBMITTING → FAILED", () => {
    expect(canTransition(SubmissionStatus.SUBMITTING, SubmissionStatus.SUBMITTED)).toBe(true);
    expect(canTransition(SubmissionStatus.SUBMITTING, SubmissionStatus.FAILED)).toBe(true);
  });

  it("forbids SUBMITTED → anything (terminal)", () => {
    expect(transition(SubmissionStatus.SUBMITTED, SubmissionStatus.DRAFTING).ok).toBe(false);
    expect(transition(SubmissionStatus.SUBMITTED, SubmissionStatus.FAILED).ok).toBe(false);
    const r = transition(SubmissionStatus.SUBMITTED, SubmissionStatus.DRAFTING);
    if (!r.ok) expect(r.reason).toBe("TERMINAL_STATE");
  });

  it("permits FAILED → DRAFTING for retry", () => {
    expect(canTransition(SubmissionStatus.FAILED, SubmissionStatus.DRAFTING)).toBe(true);
  });

  // §5.6 — Track D edges.
  it("permits SUBMITTING → AWAITING_USER_CONFIRMATION (Track D parks here)", () => {
    expect(canTransition(SubmissionStatus.SUBMITTING, SubmissionStatus.AWAITING_USER_CONFIRMATION)).toBe(true);
  });

  it("permits AWAITING_USER_CONFIRMATION → SUBMITTED (clickout-confirm)", () => {
    expect(canTransition(SubmissionStatus.AWAITING_USER_CONFIRMATION, SubmissionStatus.SUBMITTED)).toBe(true);
  });

  it("permits AWAITING_USER_CONFIRMATION → FAILED (clickout-deny / 7d timeout)", () => {
    expect(canTransition(SubmissionStatus.AWAITING_USER_CONFIRMATION, SubmissionStatus.FAILED)).toBe(true);
  });

  it("rejects illegal jumps like NOT_SUBMITTED → SUBMITTED", () => {
    const r = transition(SubmissionStatus.NOT_SUBMITTED, SubmissionStatus.SUBMITTED);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("ILLEGAL_TRANSITION");
  });
});

describe("§5.7 — gateSubmit", () => {
  it("permits submit from DRAFTING", () => {
    expect(gateSubmit(SubmissionStatus.DRAFTING)).toEqual({ ok: true, nextStatus: SubmissionStatus.SUBMITTING });
  });

  it("permits submit from AWAITING_USER_CONFIRMATION", () => {
    expect(gateSubmit(SubmissionStatus.AWAITING_USER_CONFIRMATION)).toEqual({ ok: true, nextStatus: SubmissionStatus.SUBMITTING });
  });

  it("rejects submit from SUBMITTED with ALREADY_SUBMITTED", () => {
    const r = gateSubmit(SubmissionStatus.SUBMITTED);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("ALREADY_SUBMITTED");
  });

  it("rejects submit from NOT_SUBMITTED with NOT_DRAFTED", () => {
    const r = gateSubmit(SubmissionStatus.NOT_SUBMITTED);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("NOT_DRAFTED");
  });

  it("rejects submit from SUBMITTING (already in flight)", () => {
    const r = gateSubmit(SubmissionStatus.SUBMITTING);
    expect(r.ok).toBe(false);
  });
});

describe("§5.7 — dispatchApply", () => {
  const base = {
    applicationId: "app-1",
    applyEmailDetected: null,
    applyFormDomain: null,
    sourceUrl: null,
    applicationUrl: null,
  };

  it("ASSISTED_REDIRECT records a CLICKOUT_TIMESTAMP with the apply URL and parks the application", async () => {
    const result = await dispatchApply({
      ...base,
      applyStrategy: "ASSISTED_REDIRECT",
      applicationUrl: "https://example.com/apply/abc",
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.proofKind).toBe("CLICKOUT_TIMESTAMP");
      expect(result.proofRef.endsWith("|https://example.com/apply/abc")).toBe(true);
      expect(result.provider).toBe("clickout");
      // §5.6 — Track D parks the application in AWAITING_USER_CONFIRMATION
      // and asks the route to create an ApplyAttempt row for the nudge worker.
      expect(result.nextStatus).toBe("AWAITING_USER_CONFIRMATION");
      expect(result.createApplyAttempt).toBe(true);
    }
  });

  it("ASSISTED_REDIRECT falls back to sourceUrl when applicationUrl is null", async () => {
    const result = await dispatchApply({ ...base, applyStrategy: "ASSISTED_REDIRECT", sourceUrl: "https://board/123" });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.proofRef.endsWith("|https://board/123")).toBe(true);
  });

  it("ATS_API_GREENHOUSE stub-fails with a forward-pointer to PR S", async () => {
    const result = await dispatchApply({ ...base, applyStrategy: "ATS_API_GREENHOUSE" });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain("PR S");
  });

  // PR Q implemented the EMAIL_DRAFT track; full send/queue/opt-out behaviour
  // is covered in apply-email-draft.test.ts. Here we only assert the guard
  // that applies regardless of transport: no detected apply email → clean fail.
  it("EMAIL_DRAFT fails cleanly when the job has no detected apply email", async () => {
    const result = await dispatchApply({ ...base, applyStrategy: "EMAIL_DRAFT" });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/no detected apply email/i);
  });

  it("OPERATOR_HANDOFF stub-fails with a forward-pointer to PR T", async () => {
    const result = await dispatchApply({ ...base, applyStrategy: "OPERATOR_HANDOFF" });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain("PR T");
  });
});
