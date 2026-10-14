import { Role, SubscriptionPlan } from "@prisma/client";

/**
 * FREE_MODE — launch-time switch that makes every user fully entitled at
 * read time. It never rewrites Subscription rows, so setting FREE_MODE to
 * anything other than "true" restores normal billing behaviour exactly.
 *
 * Read on every call (not cached) so tests and ops can toggle it.
 */
export function isFreeMode(): boolean {
  return process.env.FREE_MODE === "true";
}

/**
 * The plan a user is treated as holding while free mode is on.
 * Employers get the top employer tier; candidates (and admins, who have no
 * dedicated plan and are otherwise role-gated) get the top candidate tier.
 */
export function topTierPlanForRole(role: Role | string | null | undefined): SubscriptionPlan {
  return role === Role.EMPLOYER ? SubscriptionPlan.EMPLOYER_PREMIUM : SubscriptionPlan.PROFESSIONAL;
}

function positiveIntFromEnv(name: string, fallback: number): number {
  const parsed = parseInt(process.env[name] ?? "", 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

/** Per-user monthly cap on capped AI skills (career gap, salary negotiation) in free mode. */
export function freeModeMonthlySkillLimit(): number {
  return positiveIntFromEnv("FREE_MODE_MONTHLY_SKILL_LIMIT", 30);
}

/** Per-user daily Mara chat message cap in free mode. */
export function freeModeChatDailyLimit(): number {
  return positiveIntFromEnv("FREE_MODE_CHAT_DAILY_LIMIT", 50);
}
