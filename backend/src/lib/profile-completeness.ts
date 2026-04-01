export interface ProfileCompletenessInput {
  headline?: string | null;
  bio?: string | null;
  skills: string[];
  targetRoles: string[];
  targetCountries: string[];
  yearsExperience?: number | null;
  visaStatus?: string | null;
  linkedinUrl?: string | null;
  githubUrl?: string | null;
  portfolioUrl?: string | null;
  workHistory?: unknown;
  educationHistory?: unknown;
  certifications?: unknown;
  resumes?: { id: string }[];
}

function hasItems(value: unknown): boolean {
  return Array.isArray(value) && value.length > 0;
}

export function computeProfileCompleteness(profile: ProfileCompletenessInput): number {
  let score = 0;
  if (profile.headline) score += 10;
  if (profile.bio) score += 12;
  if (profile.skills.length > 0) score += 15;
  if (profile.targetRoles.length > 0) score += 8;
  if (profile.targetCountries.length > 0) score += 6;
  if (profile.yearsExperience != null) score += 8;
  if (profile.visaStatus) score += 5;
  if (profile.linkedinUrl || profile.githubUrl || profile.portfolioUrl) score += 8;
  if (hasItems(profile.workHistory)) score += 12;
  if (hasItems(profile.educationHistory)) score += 8;
  if (hasItems(profile.certifications)) score += 4;
  if (profile.resumes && profile.resumes.length > 0) score += 4;
  return score;
}
