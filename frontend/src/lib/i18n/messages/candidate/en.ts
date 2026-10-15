// Source of truth for the "candidate" namespace. Add keys here first; every
// other locale file must then define the same keys (enforced by tsc and
// src/lib/i18n/__tests__/namespaces.test.ts).
export default {
  "candidate.dashboard": "Dashboard",
  "candidate.myApplications": "My Applications",
  "candidate.savedJobs": "Saved Jobs",
  "candidate.myProfile": "My Profile",
  "candidate.myResumes": "My Resumes",
  "candidate.aiAssistant": "AI Assistant",
} satisfies Record<string, string>;
