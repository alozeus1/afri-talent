export interface SmartSearchUserProfile {
  userId?: string;
  resumeSkills?: string[];
  preferredLocations?: string[];
  remotePreference?: "REMOTE_ONLY" | "HYBRID_OK" | "ONSITE_OK";
  experienceLevel?: string;
  targetRoles?: string[];
  savedJobIds?: string[];
  rejectedJobIds?: string[];
  appliedJobIds?: string[];
}

export interface PersonalizedSearchContext {
  profile?: SmartSearchUserProfile;
  query?: string;
  expandedKeywords?: string[];
}

export function buildPersonalizedSearchContext(input: PersonalizedSearchContext): PersonalizedSearchContext {
  // Extension point for resume embeddings, saved/rejected job feedback, and applied-job downranking.
  return input;
}
