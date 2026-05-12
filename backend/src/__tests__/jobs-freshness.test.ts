// §4.4 — freshness bands + 3-strike stale-check decision.

import { describe, expect, it } from "vitest";
import {
  computeValidThrough,
  freshnessBand,
  FRESH_MAX_DAYS,
  ACTIVE_MAX_DAYS,
  AGING_MAX_DAYS,
  VALID_THROUGH_DEFAULT_DAYS,
} from "../lib/jobs/freshness.js";
import {
  decideStaleAction,
  STALE_CHECK_FAILURE_THRESHOLD,
} from "../workers/job-stale-check.js";

const NOW = new Date("2026-05-12T00:00:00Z");

function daysAgo(days: number): Date {
  return new Date(NOW.getTime() - days * 86400000);
}

describe("§4.4 — freshnessBand", () => {
  it("returns FRESH for jobs ≤ 7 days old", () => {
    expect(freshnessBand({ publishedAt: daysAgo(0) }, NOW).band).toBe("FRESH");
    expect(freshnessBand({ publishedAt: daysAgo(FRESH_MAX_DAYS) }, NOW).band).toBe("FRESH");
  });

  it("returns ACTIVE for jobs 8–30 days old", () => {
    expect(freshnessBand({ publishedAt: daysAgo(FRESH_MAX_DAYS + 1) }, NOW).band).toBe("ACTIVE");
    expect(freshnessBand({ publishedAt: daysAgo(ACTIVE_MAX_DAYS) }, NOW).band).toBe("ACTIVE");
  });

  it("returns AGING for jobs 31–60 days old", () => {
    expect(freshnessBand({ publishedAt: daysAgo(ACTIVE_MAX_DAYS + 1) }, NOW).band).toBe("AGING");
    expect(freshnessBand({ publishedAt: daysAgo(AGING_MAX_DAYS) }, NOW).band).toBe("AGING");
  });

  it("returns STALE for jobs > 60 days old", () => {
    expect(freshnessBand({ publishedAt: daysAgo(AGING_MAX_DAYS + 1) }, NOW).band).toBe("STALE");
    expect(freshnessBand({ publishedAt: daysAgo(180) }, NOW).band).toBe("STALE");
  });

  it("returns EXPIRED when isExpired=true regardless of age", () => {
    expect(freshnessBand({ publishedAt: daysAgo(1), isExpired: true }, NOW).band).toBe("EXPIRED");
  });

  it("returns EXPIRED when expiresAt is in the past", () => {
    expect(freshnessBand({ publishedAt: daysAgo(10), expiresAt: daysAgo(1) }, NOW).band).toBe("EXPIRED");
  });

  it("uses sourceLastSeenAt over publishedAt when both are present", () => {
    // sourceLastSeenAt is newer → FRESH despite the older publishedAt.
    const result = freshnessBand(
      { publishedAt: daysAgo(90), sourceLastSeenAt: daysAgo(2) },
      NOW,
    );
    expect(result.band).toBe("FRESH");
  });

  it("flags AGING + STALE as needsReCheck", () => {
    expect(freshnessBand({ publishedAt: daysAgo(45) }, NOW).needsReCheck).toBe(true);
    expect(freshnessBand({ publishedAt: daysAgo(120) }, NOW).needsReCheck).toBe(true);
  });

  it("does NOT flag FRESH or ACTIVE as needsReCheck", () => {
    expect(freshnessBand({ publishedAt: daysAgo(3) }, NOW).needsReCheck).toBe(false);
    expect(freshnessBand({ publishedAt: daysAgo(20) }, NOW).needsReCheck).toBe(false);
  });

  it("treats a missing reference timestamp as AGING (forces a re-check)", () => {
    const result = freshnessBand({}, NOW);
    expect(result.band).toBe("AGING");
    expect(result.needsReCheck).toBe(true);
  });
});

describe("§4.4 — computeValidThrough (JSON-LD)", () => {
  it("returns datePosted + 60 days when expiresAt is missing", () => {
    const posted = daysAgo(10);
    const expected = new Date(posted.getTime() + VALID_THROUGH_DEFAULT_DAYS * 86400000);
    expect(computeValidThrough(null, posted)?.toISOString()).toBe(expected.toISOString());
  });

  it("returns expiresAt when it is earlier than the 60-day cap", () => {
    const posted = daysAgo(10);
    const explicit = daysAgo(5); // 5 days ago — well before posted+60
    expect(computeValidThrough(explicit, posted)?.toISOString()).toBe(explicit.toISOString());
  });

  it("caps at datePosted + 60 days when expiresAt is later", () => {
    const posted = daysAgo(10);
    const farFuture = new Date(NOW.getTime() + 365 * 86400000);
    const expected = new Date(posted.getTime() + VALID_THROUGH_DEFAULT_DAYS * 86400000);
    expect(computeValidThrough(farFuture, posted)?.toISOString()).toBe(expected.toISOString());
  });

  it("returns expiresAt when datePosted is missing", () => {
    const explicit = daysAgo(2);
    expect(computeValidThrough(explicit, null)?.toISOString()).toBe(explicit.toISOString());
  });

  it("returns null when both are missing", () => {
    expect(computeValidThrough(null, null)).toBeNull();
  });
});

describe("§4.4 — decideStaleAction (3-strike rule)", () => {
  it("resets the counter on a live URL", () => {
    expect(decideStaleAction({ staleCheckFailures: 2 }, { status: "alive" }))
      .toEqual({ nextFailures: 0, expire: false });
  });

  it("increments without expiring below the threshold", () => {
    expect(decideStaleAction({ staleCheckFailures: 0 }, { status: "gone" }))
      .toEqual({ nextFailures: 1, expire: false });
    expect(decideStaleAction({ staleCheckFailures: 1 }, { status: "transient" }))
      .toEqual({ nextFailures: 2, expire: false });
  });

  it("expires after exactly the threshold (3) failures", () => {
    expect(decideStaleAction({ staleCheckFailures: 2 }, { status: "gone" }))
      .toEqual({ nextFailures: 3, expire: true });
    expect(STALE_CHECK_FAILURE_THRESHOLD).toBe(3);
  });

  it("treats transient failures the same as gone for the threshold", () => {
    let failures = 0;
    for (let i = 0; i < STALE_CHECK_FAILURE_THRESHOLD; i++) {
      const decision = decideStaleAction({ staleCheckFailures: failures }, { status: "transient" });
      failures = decision.nextFailures;
      if (i < STALE_CHECK_FAILURE_THRESHOLD - 1) expect(decision.expire).toBe(false);
      else expect(decision.expire).toBe(true);
    }
  });
});
