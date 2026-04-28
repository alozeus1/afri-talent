// ─────────────────────────────────────────────────────────────────────────────
// Chat Context Builder
//
// Assembles live user data (profile, applications, saved searches, alerts,
// calendar events) into a structured system prompt so Claude "knows" the user
// without fine-tuning.
// ─────────────────────────────────────────────────────────────────────────────

import prisma from "../prisma.js";

const MAX_APPLICATIONS = 15;
const MAX_ALERTS = 10;
const MAX_EVENTS = 5;

interface UserContext {
  systemPrompt: string;
  tokenEstimate: number;
}

export async function buildChatContext(userId: string): Promise<UserContext> {
  const [user, profile, recentApps, savedSearches, recentAlerts, upcomingEvents, subscription, trustProfile] =
    await Promise.all([
      prisma.user.findUnique({ where: { id: userId }, select: { name: true, email: true, role: true, createdAt: true } }),
      prisma.candidateProfile.findUnique({ where: { userId }, select: { headline: true, skills: true, targetRoles: true, targetCountries: true, yearsExperience: true, visaStatus: true, openToWork: true, profileCompleteness: true, bio: true } }),
      prisma.application.findMany({ where: { candidateId: userId }, orderBy: { updatedAt: "desc" }, take: MAX_APPLICATIONS, include: { job: { select: { title: true, location: true, type: true, sourceName: true } } } }),
      prisma.savedSearch.findMany({ where: { userId }, take: 5, select: { name: true, keywords: true, locations: true, jobTypes: true, remoteOnly: true } }),
      prisma.jobAlert.findMany({ where: { userId, sentAt: { not: null } }, orderBy: { createdAt: "desc" }, take: MAX_ALERTS, include: { job: { select: { title: true, location: true, sourceName: true } } } }),
      prisma.calendarEvent.findMany({ where: { userId, startTime: { gte: new Date() } }, orderBy: { startTime: "asc" }, take: MAX_EVENTS, select: { title: true, eventType: true, startTime: true, location: true, meetingUrl: true } }),
      prisma.subscription.findUnique({ where: { userId }, select: { plan: true, status: true } }),
      prisma.candidateTrustProfile.findUnique({ where: { userId }, select: { verificationLevel: true, authenticityScore: true } }),
    ]);

  if (!user) return { systemPrompt: "", tokenEstimate: 0 };

  const sections: string[] = [];

  sections.push(`You are Mara, the AfriTalent AI Job Assistant — a warm, knowledgeable career coach built for African tech professionals seeking global opportunities. You speak with encouragement and practical specificity. Today is ${new Date().toISOString().split("T")[0]}.

AFRITALENT PLATFORM CONTEXT:
- Trust Center & Verification: AfriTalent relies on an 'authenticity score' and 'verification level' (e.g. UNVERIFIED, VERIFIED_BASIC, VERIFIED_STRONG). Candidates verify identity, skills, and links (GitHub, LinkedIn) to boost their score and stand out to global employers.
- AI Job Matches: Candidates can use the 'AI Matches' feature on their dashboard to match their embedded resume against global job descriptions.
- AI Assistant (Orchestrator): Candidates can generate tailored resumes and cover letters for specific job matches right here in the AI assistant.

IMPORTANT RULES:
- You have access to this user's real data below. Reference it naturally.
- Give specific, actionable advice based on AfriTalent workflows. Encourage users to use the Trust Center and AI Matches.
- When discussing applications, reference actual job titles and statuses.
- If the user asks about something you don't have data for, say so honestly.
- Keep responses concise (2-4 paragraphs max unless they ask for detail).
- For visa/immigration questions, give general guidance but recommend consulting an immigration lawyer for specifics.
- Never fabricate job listings, company details, or application statuses.`);

  sections.push(`\n--- USER PROFILE ---
Name: ${user.name}
Member since: ${user.createdAt.toISOString().split("T")[0]}
Plan: ${subscription?.plan || "FREE"} (${subscription?.status || "INACTIVE"})`);

  if (trustProfile) {
    sections.push(`Trust Center Status: ${trustProfile.verificationLevel}
Authenticity Score: ${trustProfile.authenticityScore}`);
  } else {
    sections.push(`Trust Center Status: UNVERIFIED
Authenticity Score: 0`);
  }

  if (profile) {
    sections.push(`Headline: ${profile.headline || "Not set"}
Skills: ${profile.skills.length > 0 ? profile.skills.join(", ") : "None listed"}
Target roles: ${profile.targetRoles.length > 0 ? profile.targetRoles.join(", ") : "None set"}
Target countries: ${profile.targetCountries.length > 0 ? profile.targetCountries.join(", ") : "None set"}
Experience: ${profile.yearsExperience != null ? `${profile.yearsExperience} years` : "Not specified"}
Visa status: ${profile.visaStatus || "Not specified"}
Open to work: ${profile.openToWork ? "Yes" : "No"}
Profile completeness: ${profile.profileCompleteness}%`);

    if (profile.profileCompleteness < 70) {
      sections.push(`NOTE: Profile is incomplete (${profile.profileCompleteness}%). Encourage them to fill in missing fields for better job matches.`);
    }
  } else {
    sections.push("NOTE: User has not created a candidate profile yet. Encourage them to set one up.");
  }

  if (recentApps.length > 0) {
    sections.push("\n--- APPLICATIONS ---");
    for (const app of recentApps) {
      const company = app.job.sourceName || "Direct posting";
      sections.push(`- "${app.job.title}" at ${company} (${app.job.location}) — Status: ${app.status} — Applied: ${app.createdAt.toISOString().split("T")[0]}`);
    }
    const statusCounts: Record<string, number> = {};
    for (const app of recentApps) {
      statusCounts[app.status] = (statusCounts[app.status] || 0) + 1;
    }
    sections.push(`Summary: ${Object.entries(statusCounts).map(([s, c]) => `${c} ${s.toLowerCase()}`).join(", ")}`);
  } else {
    sections.push("\n--- APPLICATIONS ---\nNo applications yet. Encourage them to start applying.");
  }

  if (savedSearches.length > 0) {
    sections.push("\n--- SAVED SEARCHES ---");
    for (const s of savedSearches) {
      sections.push(`- "${s.name}": keywords=[${s.keywords.join(", ")}] locations=[${s.locations.join(", ")}] types=[${s.jobTypes.join(", ")}]${s.remoteOnly ? " (remote only)" : ""}`);
    }
  }

  if (recentAlerts.length > 0) {
    sections.push("\n--- RECENT JOB ALERTS ---");
    for (const a of recentAlerts) {
      sections.push(`- "${a.job.title}" (${a.job.location}) — Match: ${a.matchScore ?? "N/A"}% — ${a.createdAt.toISOString().split("T")[0]}`);
    }
  }

  if (upcomingEvents.length > 0) {
    sections.push("\n--- UPCOMING EVENTS ---");
    for (const e of upcomingEvents) {
      sections.push(`- ${e.eventType}: "${e.title}" — ${e.startTime.toISOString().split("T")[0]} at ${e.startTime.toISOString().split("T")[1].slice(0, 5)}${e.location ? ` — ${e.location}` : ""}${e.meetingUrl ? ` — Link: ${e.meetingUrl}` : ""}`);
    }
  }

  const systemPrompt = sections.join("\n");
  const tokenEstimate = Math.ceil(systemPrompt.length / 4);

  return { systemPrompt, tokenEstimate };
}
