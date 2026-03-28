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
  resumes?: { id: string }[];
}

export function computeProfileCompleteness(profile: ProfileCompletenessInput): number {
  let score = 0;
  if (profile.headline) score += 15;
  if (profile.bio) score += 15;
  if (profile.skills.length > 0) score += 15;
  if (profile.targetRoles.length > 0) score += 10;
  if (profile.targetCountries.length > 0) score += 10;
  if (profile.yearsExperience != null) score += 10;
  if (profile.visaStatus) score += 10;
  if (profile.linkedinUrl || profile.githubUrl || profile.portfolioUrl) score += 10;
  if (profile.resumes && profile.resumes.length > 0) score += 5;
  return score;
}
