// §5.6 — Track D clickout-nudge decision rules.

import { describe, expect, it } from "vitest";
import {
  decideNudgeAction,
  NUDGE_AFTER_HOURS,
  TIMEOUT_AFTER_DAYS,
} from "../workers/apply-clickout-nudge.js";

const NOW = new Date("2026-05-13T12:00:00Z");

function hoursAgo(h: number): Date {
  return new Date(NOW.getTime() - h * 3_600_000);
}

describe("§5.6 — decideNudgeAction (test seam for the 24h/7d worker)", () => {
  it("skips PENDING attempts younger than 24h", () => {
    const r = decideNudgeAction(
      { clickedAt: hoursAgo(NUDGE_AFTER_HOURS - 1), nudgeSentAt: null, candidateResponse: "PENDING" },
      NOW,
    );
    expect(r.action).toBe("skip");
  });

  it("sends nudge when attempt is past 24h and no nudge yet", () => {
    const r = decideNudgeAction(
      { clickedAt: hoursAgo(NUDGE_AFTER_HOURS + 1), nudgeSentAt: null, candidateResponse: "PENDING" },
      NOW,
    );
    expect(r.action).toBe("send_nudge");
  });

  it("skips when nudge was already sent (no double-pinging)", () => {
    const r = decideNudgeAction(
      {
        clickedAt: hoursAgo(NUDGE_AFTER_HOURS + 5),
        nudgeSentAt: hoursAgo(NUDGE_AFTER_HOURS + 3),
        candidateResponse: "PENDING",
      },
      NOW,
    );
    expect(r.action).toBe("skip");
  });

  it("returns timeout once the attempt is older than 7 days", () => {
    const r = decideNudgeAction(
      { clickedAt: hoursAgo(TIMEOUT_AFTER_DAYS * 24 + 1), nudgeSentAt: null, candidateResponse: "PENDING" },
      NOW,
    );
    expect(r.action).toBe("timeout");
  });

  it("returns timeout even if a nudge was already sent", () => {
    const r = decideNudgeAction(
      {
        clickedAt: hoursAgo(TIMEOUT_AFTER_DAYS * 24 + 5),
        nudgeSentAt: hoursAgo(TIMEOUT_AFTER_DAYS * 24 - 12),
        candidateResponse: "PENDING",
      },
      NOW,
    );
    expect(r.action).toBe("timeout");
  });

  it("skips any non-PENDING attempt", () => {
    for (const response of ["CONFIRMED_COMPLETED", "DENIED_COMPLETED", "NO_RESPONSE_TIMEOUT"] as const) {
      const r = decideNudgeAction(
        { clickedAt: hoursAgo(48), nudgeSentAt: null, candidateResponse: response },
        NOW,
      );
      expect(r.action).toBe("skip");
    }
  });

  it("honours per-call config overrides", () => {
    const r = decideNudgeAction(
      { clickedAt: hoursAgo(2), nudgeSentAt: null, candidateResponse: "PENDING" },
      NOW,
      { nudgeAfterHours: 1 },
    );
    expect(r.action).toBe("send_nudge");
  });

  it("timeout overrides nudge when both windows have elapsed", () => {
    // clickedAt is past the timeout cutoff → timeout, never nudge.
    const r = decideNudgeAction(
      { clickedAt: hoursAgo(TIMEOUT_AFTER_DAYS * 24 + 24), nudgeSentAt: null, candidateResponse: "PENDING" },
      NOW,
    );
    expect(r.action).toBe("timeout");
  });
});
