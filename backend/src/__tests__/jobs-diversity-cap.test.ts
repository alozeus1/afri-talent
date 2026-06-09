// §4.3 — employer-diversity cap + verified-employer boost.
//
// Two guarantees PR L ships:
//   1. In the top 30 of a relevance-sorted page, no employer occupies more
//      than 3 slots unless the user's query explicitly names that employer.
//      (The "Bosch-domination" failure mode from the audit.)
//   2. Employers past UNVERIFIED get +12 added to their score so the cap
//      doesn't push verified rows out of the top 30 when an unverified
//      employer floods the candidate set.

import { EmployerVerificationLevel } from "@prisma/client";
import { describe, expect, it } from "vitest";
import {
  applyEmployerDiversityCap,
  applyVerifiedEmployerBoost,
  DIVERSITY_CAP_MAX_PER_EMPLOYER,
  DIVERSITY_CAP_TOP_N,
  VERIFIED_EMPLOYER_BOOST,
} from "../lib/jobs/search.js";

// Constructs the minimum shape applyEmployerDiversityCap /
// applyVerifiedEmployerBoost read. Anything not on this fixture path is left
// undefined — the functions don't touch it.
function makeResult(opts: {
  id: string;
  companyName: string | null;
  sourceName?: string | null;
  score: number;
  verificationLevel?: EmployerVerificationLevel | null;
}) {
  return {
    job: {
      id: opts.id,
      sourceName: opts.sourceName ?? opts.companyName,
      employer: opts.companyName
        ? {
            companyName: opts.companyName,
            trustProfile: opts.verificationLevel
              ? { verificationLevel: opts.verificationLevel }
              : null,
          }
        : null,
    },
    score: opts.score,
    explanation: {
      score: opts.score,
      summary: "",
      reasons: [],
      components: { relevance: opts.score, freshness: 0, employerTrust: 0, salaryTransparency: 0 },
    },
  } as unknown as Parameters<typeof applyEmployerDiversityCap>[0][number];
}

describe("§4.3 — applyEmployerDiversityCap (Bosch-domination case)", () => {
  // Build a sorted page large enough that the 30-slot top can actually push
  // overflow Bosch into the tail. 10 Bosch at the highest scores + 30 unique
  // other employers below = 40 total. Without the cap, the top 30 would be
  // 10 Bosch + 20 others. With the cap, the top 30 should be 3 Bosch + 27
  // others, and the 7 overflow Bosch slip to ranks 31-37.
  const buildBoschFlood = () => {
    const results = [];
    for (let i = 0; i < 10; i++) {
      results.push(makeResult({ id: `bosch-${i}`, companyName: "Bosch Group", score: 90 + (10 - i) }));
    }
    for (let i = 0; i < 30; i++) {
      results.push(makeResult({ id: `other-${i}`, companyName: `OtherCo ${i}`, score: 80 - i }));
    }
    results.sort((a, b) => b.score - a.score);
    return results;
  };

  it("caps Bosch at ≤ 3 in the top 30 when the query doesn't name Bosch", () => {
    const sorted = buildBoschFlood();
    const capped = applyEmployerDiversityCap(sorted, "engineer");

    const top = capped.slice(0, DIVERSITY_CAP_TOP_N);
    const boschInTop = top.filter((r) => r.job.employer?.companyName === "Bosch Group").length;
    expect(boschInTop).toBeLessThanOrEqual(DIVERSITY_CAP_MAX_PER_EMPLOYER);

    // The non-Bosch employers should now occupy the slots Bosch lost. With
    // 10 Bosch capped to 3, the remaining 27 top-30 slots go to OtherCo rows.
    const nonBoschInTop = top.length - boschInTop;
    expect(nonBoschInTop).toBeGreaterThanOrEqual(25);
  });

  it("preserves every result — overflow demoted, not dropped", () => {
    const sorted = buildBoschFlood();
    const capped = applyEmployerDiversityCap(sorted, "engineer");
    expect(capped.length).toBe(sorted.length);
    const ids = new Set(capped.map((r) => r.job.id));
    for (const r of sorted) {
      expect(ids.has(r.job.id)).toBe(true);
    }
  });

  it("bypasses the cap when the query explicitly names the employer", () => {
    const sorted = buildBoschFlood();
    const capped = applyEmployerDiversityCap(sorted, "bosch engineer");

    const top = capped.slice(0, DIVERSITY_CAP_TOP_N);
    const boschInTop = top.filter((r) => r.job.employer?.companyName === "Bosch Group").length;
    // All 10 Bosch listings should now sit in the top 30 alongside the others.
    expect(boschInTop).toBe(10);
  });

  it("treats undefined query as 'no employer named' (cap applies)", () => {
    const sorted = buildBoschFlood();
    const capped = applyEmployerDiversityCap(sorted, undefined);
    const boschInTop = capped
      .slice(0, DIVERSITY_CAP_TOP_N)
      .filter((r) => r.job.employer?.companyName === "Bosch Group").length;
    expect(boschInTop).toBeLessThanOrEqual(DIVERSITY_CAP_MAX_PER_EMPLOYER);
  });

  it("does not cap a single employer with fewer than max-per-employer listings", () => {
    const sorted = [
      makeResult({ id: "stripe-1", companyName: "Stripe", score: 80 }),
      makeResult({ id: "stripe-2", companyName: "Stripe", score: 79 }),
      makeResult({ id: "stripe-3", companyName: "Stripe", score: 78 }),
      makeResult({ id: "paystack-1", companyName: "Paystack", score: 77 }),
    ];
    const capped = applyEmployerDiversityCap(sorted, "engineer");
    const stripeInTop = capped
      .slice(0, DIVERSITY_CAP_TOP_N)
      .filter((r) => r.job.employer?.companyName === "Stripe").length;
    expect(stripeInTop).toBe(3); // exactly at the cap, all kept
  });
});

describe("§4.3 — applyVerifiedEmployerBoost (+12 for verified)", () => {
  it("adds +12 to the score for BUSINESS_DOC_VERIFIED employers", () => {
    const base = makeResult({
      id: "j1",
      companyName: "Verified Co",
      score: 50,
      verificationLevel: EmployerVerificationLevel.BUSINESS_DOC_VERIFIED,
    });
    const boosted = applyVerifiedEmployerBoost([base]);
    expect(boosted[0].score).toBe(50 + VERIFIED_EMPLOYER_BOOST);
    expect(boosted[0].explanation.reasons).toContain(`verified employer (+${VERIFIED_EMPLOYER_BOOST})`);
  });

  it("adds +12 for EMAIL_DOMAIN_VERIFIED, MANUAL_REVIEW_APPROVED, and PREMIUM_TRUSTED", () => {
    for (const level of [
      EmployerVerificationLevel.EMAIL_DOMAIN_VERIFIED,
      EmployerVerificationLevel.MANUAL_REVIEW_APPROVED,
      EmployerVerificationLevel.PREMIUM_TRUSTED,
    ]) {
      const base = makeResult({ id: `j-${level}`, companyName: "Co", score: 40, verificationLevel: level });
      const boosted = applyVerifiedEmployerBoost([base]);
      expect(boosted[0].score).toBe(40 + VERIFIED_EMPLOYER_BOOST);
    }
  });

  it("does not boost UNVERIFIED employers", () => {
    const base = makeResult({
      id: "j2",
      companyName: "Unverified Co",
      score: 50,
      verificationLevel: EmployerVerificationLevel.UNVERIFIED,
    });
    const boosted = applyVerifiedEmployerBoost([base]);
    expect(boosted[0].score).toBe(50);
    expect(boosted[0].explanation.reasons).not.toContain(`verified employer (+${VERIFIED_EMPLOYER_BOOST})`);
  });

  it("does not boost employers with no trust profile", () => {
    const base = makeResult({ id: "j3", companyName: "No Trust", score: 50 });
    const boosted = applyVerifiedEmployerBoost([base]);
    expect(boosted[0].score).toBe(50);
  });

  it("clamps the boosted score at 100", () => {
    const base = makeResult({
      id: "j4",
      companyName: "Premium",
      score: 95,
      verificationLevel: EmployerVerificationLevel.PREMIUM_TRUSTED,
    });
    const boosted = applyVerifiedEmployerBoost([base]);
    expect(boosted[0].score).toBeLessThanOrEqual(100);
  });
});
