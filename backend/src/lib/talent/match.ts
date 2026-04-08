import { semanticTextScore } from "../rag/embedding.js";

type CandidateWorkHistoryLike = {
  company?: string | null;
  title?: string | null;
  description?: string | null;
  period?: string | null;
};

type ImmigrationProcessLike = {
  targetCountry: string;
  visaType: string;
  status: string;
};

export interface CandidateMatchProfile {
  userId: string;
  headline?: string | null;
  bio?: string | null;
  skills: string[];
  targetRoles: string[];
  targetCountries: string[];
  yearsExperience?: number | null;
  visaStatus?: string | null;
  profileCompleteness: number;
  workHistory?: CandidateWorkHistoryLike[] | null;
}

export interface CandidateTrustSignals {
  authenticityScore: number;
  verifiedSkillCount: number;
  partnerSignalCount: number;
  assessmentBacked: boolean;
  premiumFilterEligible: boolean;
  fullyCompletedProfile: boolean;
  riskScore: number;
}

export interface TalentMatchInput {
  query?: string | null;
  desiredSkills?: string[];
  targetLocation?: string | null;
  minExperience?: number | null;
  candidate: CandidateMatchProfile;
  trust?: CandidateTrustSignals | null;
  immigrationProcesses?: ImmigrationProcessLike[];
}

export interface TalentMobilitySummary {
  score: number;
  label: "READY" | "PROMISING" | "EARLY";
  factors: string[];
  activeProcess: {
    visaType: string;
    targetCountry: string;
    status: string;
  } | null;
}

export interface TalentMatchSummary {
  score: number;
  semanticScore: number;
  skillScore: number;
  experienceScore: number;
  trustScore: number;
  mobilityScore: number;
  reasons: string[];
  mobility: TalentMobilitySummary;
}

function clampScore(value: number): number {
  return Math.max(0, Math.min(100, Math.round(value)));
}

function normalizeToken(value: string): string {
  return value.trim().toLowerCase();
}

function normalizeList(values: string[]): string[] {
  return values
    .map((value) => normalizeToken(value))
    .filter(Boolean);
}

function overlapScore(left: string[], right: string[]): number {
  const a = new Set(normalizeList(left));
  const b = new Set(normalizeList(right));

  if (a.size === 0 || b.size === 0) {
    return 0;
  }

  let hits = 0;
  a.forEach((value) => {
    if (b.has(value)) {
      hits += 1;
    }
  });

  return clampScore((hits / Math.max(a.size, b.size)) * 100);
}

function buildCandidateNarrative(candidate: CandidateMatchProfile): string {
  return [
    candidate.headline,
    candidate.bio,
    candidate.skills.join(" "),
    candidate.targetRoles.join(" "),
    candidate.targetCountries.join(" "),
    candidate.workHistory?.map((item) => [item.company, item.title, item.description, item.period].filter(Boolean).join(" ")).join(" "),
    candidate.yearsExperience != null ? `${candidate.yearsExperience} years experience` : null,
    candidate.visaStatus,
  ]
    .filter((value): value is string => typeof value === "string" && value.trim().length > 0)
    .join("\n");
}

function scoreExperience(yearsExperience: number | null | undefined, minExperience?: number | null): number {
  if (yearsExperience == null) {
    return minExperience ? 35 : 55;
  }

  if (!minExperience || minExperience <= 0) {
    return clampScore(55 + Math.min(yearsExperience, 10) * 4);
  }

  const ratio = yearsExperience / minExperience;
  if (ratio >= 1.35) return 100;
  if (ratio >= 1.1) return 92;
  if (ratio >= 1) return 84;
  return clampScore(ratio * 78);
}

function scoreTrust(trust?: CandidateTrustSignals | null): number {
  if (!trust) {
    return 38;
  }

  let score = 28;
  score += Math.min(40, trust.authenticityScore * 0.4);
  score += Math.min(10, trust.verifiedSkillCount * 5);
  score += Math.min(8, trust.partnerSignalCount * 4);
  if (trust.assessmentBacked) score += 8;
  if (trust.premiumFilterEligible) score += 4;
  if (trust.fullyCompletedProfile) score += 6;
  score -= Math.min(16, trust.riskScore * 0.2);

  return clampScore(score);
}

function scoreMobility(input: TalentMatchInput): TalentMobilitySummary {
  const factors: string[] = [];
  const targetLocation = normalizeToken(input.targetLocation || "");
  const targetCountries = normalizeList(input.candidate.targetCountries || []);
  const visaStatus = (input.candidate.visaStatus || "").trim();
  const immigrationProcesses = input.immigrationProcesses || [];
  const matchingProcess = targetLocation
    ? immigrationProcesses.find((process) => normalizeToken(process.targetCountry) === targetLocation)
    : immigrationProcesses[0];

  let score = 0;

  if (targetCountries.length > 0) {
    score += 18;
    factors.push(`Open to ${targetCountries.slice(0, 3).join(", ")}.`);
  }

  if (targetLocation && targetCountries.includes(targetLocation)) {
    score += 35;
    factors.push(`Target geography already includes ${input.targetLocation}.`);
  }

  if (visaStatus) {
    score += 16;
    factors.push(`Visa note supplied: ${visaStatus}.`);

    if (/citizen|resident|authorized|no sponsorship/i.test(visaStatus)) {
      score += 12;
    }

    if (/sponsorship|requires|need/i.test(visaStatus)) {
      score -= 4;
    }
  }

  if (matchingProcess) {
    const status = matchingProcess.status.toUpperCase();
    if (status === "APPROVED") score += 28;
    else if (status === "SUBMITTED") score += 22;
    else if (status === "IN_PROGRESS") score += 16;
    else if (status === "NOT_STARTED") score += 6;

    factors.push(`${matchingProcess.visaType} process is ${matchingProcess.status.toLowerCase().replace(/_/g, " ")}.`);
  }

  if (input.candidate.profileCompleteness >= 80) {
    score += 8;
  }

  const normalized = clampScore(score);

  return {
    score: normalized,
    label: normalized >= 75 ? "READY" : normalized >= 50 ? "PROMISING" : "EARLY",
    factors: factors.slice(0, 4),
    activeProcess: matchingProcess
      ? {
        visaType: matchingProcess.visaType,
        targetCountry: matchingProcess.targetCountry,
        status: matchingProcess.status,
      }
      : null,
  };
}

export function buildTalentMatch(input: TalentMatchInput): TalentMatchSummary {
  const semanticScore = input.query?.trim()
    ? clampScore(semanticTextScore(input.query, buildCandidateNarrative(input.candidate)) * 100)
    : 0;

  const querySkills = input.query
    ? input.query.split(/[,/]/).map((token) => token.trim()).filter((token) => token.length > 2)
    : [];
  const desiredSkills = Array.from(new Set([...(input.desiredSkills || []), ...querySkills]));
  const skillScore = desiredSkills.length > 0
    ? overlapScore(desiredSkills, input.candidate.skills)
    : overlapScore(input.candidate.targetRoles, input.candidate.skills);
  const experienceScore = scoreExperience(input.candidate.yearsExperience, input.minExperience);
  const trustScore = scoreTrust(input.trust);
  const mobility = scoreMobility(input);

  const score = clampScore(
    (semanticScore * (input.query?.trim() ? 0.34 : 0.12))
      + (skillScore * 0.24)
      + (experienceScore * 0.14)
      + (trustScore * 0.16)
      + (mobility.score * 0.12),
  );

  const reasons: string[] = [];
  if (semanticScore >= 65) reasons.push(`Strong role-intent match (${semanticScore}/100).`);
  if (skillScore >= 65) reasons.push(`Skills overlap is high (${skillScore}/100).`);
  if (experienceScore >= 75) reasons.push("Experience aligns with the target level.");
  if (trustScore >= 70) reasons.push("Trust signals are employer-ready.");
  if (mobility.score >= 65) reasons.push("Mobility and visa readiness look clear.");

  if (reasons.length === 0) {
    reasons.push("Profile has some alignment, but still needs human review for final fit.");
  }

  return {
    score,
    semanticScore,
    skillScore,
    experienceScore,
    trustScore,
    mobilityScore: mobility.score,
    reasons: reasons.slice(0, 4),
    mobility,
  };
}
