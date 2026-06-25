// ─────────────────────────────────────────────────────────────────────────────
// LangGraph — candidate autopilot adapter (rollout wiring)
//
// Runs the candidateAutopilot graph in GATE-ONLY mode as a per-user preflight for
// the auto-apply worker: it evaluates the safety gates (opt-in, entitlement +
// billing, profile completeness, trust/risk tier, capacity) and returns whether
// automation may proceed for that user. Generation stays in the worker; this only
// decides allow/skip. Used only when LANGGRAPH_CANDIDATE_AUTOPILOT is on.
//
// Gate-only is achieved by feeding the graph no matches (findStrongMatches → []),
// so it runs the gates and generates nothing: COMPLETE = allowed, BLOCKED = a gate
// failed (with a typed reason).
// ─────────────────────────────────────────────────────────────────────────────

import prisma from "../../../prisma.js";
import { getUserEntitlements } from "../../../billing/entitlements.js";
import { ensureCandidateAutopilotProfile } from "../../../autopilot/framework.js";
import {
  runCandidateAutopilot,
  type AutopilotDeps,
  type AutopilotBlockReason,
} from "../graphs/candidateAutopilot.graph.js";

/** Deterministic profile-completeness proxy (0–100). */
export function profileCompletenessFrom(profile: unknown): number {
  const p = (profile ?? {}) as {
    headline?: unknown;
    bio?: unknown;
    skills?: unknown[];
    yearsExperience?: unknown;
    resumes?: unknown[];
  };
  const signals = [
    Boolean(p.headline),
    Boolean(p.bio),
    Array.isArray(p.skills) && p.skills.length > 0,
    p.yearsExperience != null,
    Array.isArray(p.resumes) && p.resumes.length > 0,
  ];
  return Math.round((signals.filter(Boolean).length / signals.length) * 100);
}

// Generation deps are inert in gate-only mode (no matches → nothing generated).
const INERT_GENERATION = {
  findStrongMatches: async () => [],
  generateApplyPack: async () => ({ packRef: "" }),
  notifyCandidate: async () => "",
  scheduleFollowUps: async () => {},
};

/**
 * Build gate-only deps from real platform functions. `billingValid` is true here
 * because the worker only considers ACTIVE subscriptions; per-job apply caps stay
 * enforced downstream at submit/dispatch, so `getRemainingCapacity` returns a
 * positive sentinel (this gate decides eligibility, not per-job throttling).
 */
export async function buildAutopilotGateDeps(candidateId: string): Promise<AutopilotDeps> {
  return {
    getOptIn: async () => {
      const profile = await ensureCandidateAutopilotProfile(candidateId);
      return { enabled: Boolean(profile.enabled), userId: candidateId };
    },
    getEntitlements: async (userId) => {
      const e = await getUserEntitlements(userId);
      return { autopilot: Boolean(e.autopilot), billingValid: true, applyPacksRemaining: e.aiApplyPacks ?? 999 };
    },
    getProfileCompleteness: async (cid) => {
      const profile = await prisma.candidateProfile.findUnique({
        where: { userId: cid },
        include: { resumes: { where: { isActive: true }, take: 1 } },
      });
      return profileCompletenessFrom(profile);
    },
    getCandidateRisk: async (cid) => {
      const trust = await prisma.candidateTrustProfile.findFirst({ where: { userId: cid }, select: { riskScore: true } });
      return trust?.riskScore ?? 0;
    },
    getRemainingCapacity: async () => 1,
    ...INERT_GENERATION,
  };
}

export interface AutopilotGateResult {
  allowed: boolean;
  reason?: AutopilotBlockReason;
}

/**
 * Evaluate whether autopilot may proceed for a candidate. `depsOverride` is for
 * tests; production builds deps from real platform functions.
 */
export async function evaluateAutopilotGate(candidateId: string, depsOverride?: AutopilotDeps): Promise<AutopilotGateResult> {
  const deps = depsOverride ?? (await buildAutopilotGateDeps(candidateId));
  const result = await runCandidateAutopilot(candidateId, deps, {
    graphRunId: `autopilot-gate:${candidateId}:${Date.now()}`,
  });
  return { allowed: result.status === "COMPLETE", reason: result.blockedReason };
}
