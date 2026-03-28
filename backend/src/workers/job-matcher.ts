// ─────────────────────────────────────────────────────────────────────────────
// Proactive Job Matcher
//
// Runs on a schedule. For every active SavedSearch with alertEnabled=true,
// finds newly published jobs since the last alert, scores them with a
// lightweight skill-overlap algorithm (no Claude API call — free), creates
// JobAlert records, and queues them for the alert-sender.
//
// For users with a CandidateProfile, also does profile-based matching
// (skills, target roles, target countries, visa status).
// ─────────────────────────────────────────────────────────────────────────────

import prisma from "../lib/prisma.js";
import logger from "../lib/logger.js";
import { buildJobSearchWhere, buildPreferenceContext, publicJobInclude } from "../lib/jobs/search.js";
import { collapseDuplicateRankedJobs, scoreJobForSearch } from "../lib/jobs/discovery.js";

// Minimum overlap score (0-100) to consider a job a match worth alerting on
const ALERT_SCORE_THRESHOLD = parseInt(process.env.ALERT_SCORE_THRESHOLD || "40", 10);
const MAX_ALERTS_PER_CYCLE = parseInt(process.env.MAX_ALERTS_PER_CYCLE || "500", 10);

export async function runJobMatcherCycle(): Promise<void> {
  let totalAlerts = 0;
  let totalSearches = 0;

  // 1. Process saved-search based matching
  const searches = await prisma.savedSearch.findMany({
    where: { alertEnabled: true },
    include: {
      user: {
        select: { id: true, name: true, email: true, role: true },
      },
    },
  });

  totalSearches = searches.length;

  for (const search of searches) {
    if (totalAlerts >= MAX_ALERTS_PER_CYCLE) break;

    try {
      const sinceDate = search.lastAlertAt ?? search.createdAt;
      const matchingJobs = await findNewMatchingJobs(search, sinceDate);

      for (const job of matchingJobs) {
        if (totalAlerts >= MAX_ALERTS_PER_CYCLE) break;

        // Skip if alert already exists for this user+job pair
        const exists = await prisma.jobAlert.findUnique({
          where: { userId_jobId: { userId: search.userId, jobId: job.id } },
        });
        if (exists) continue;

        const score = job.rankingScore;
        if (score < ALERT_SCORE_THRESHOLD) continue;

        await prisma.jobAlert.create({
          data: {
            userId: search.userId,
            jobId: job.id,
            searchId: search.id,
            matchScore: score,
          },
        });

        totalAlerts++;
      }

      // Update lastAlertAt on the saved search
      await prisma.savedSearch.update({
        where: { id: search.id },
        data: { lastAlertAt: new Date() },
      });
    } catch (err) {
      logger.error(
        { searchId: search.id, userId: search.userId.slice(0, 8), err },
        "[job-matcher] failed processing saved search"
      );
    }
  }

  // 2. Process profile-based matching for candidates without saved searches
  const profileAlerts = await matchCandidateProfiles();
  totalAlerts += profileAlerts;

  logger.info(
    { totalSearches, totalAlerts },
    "[job-matcher] cycle complete"
  );
}

// Find jobs published since a given date matching search criteria
async function findNewMatchingJobs(
  search: {
    keywords: string[];
    locations: string[];
    jobTypes: string[];
    seniorities: string[];
    salaryMin: number | null;
    salaryMax: number | null;
    remoteOnly: boolean;
    visaSponsorship: boolean;
  },
  sinceDate: Date
) {
  const filters = {
    search: search.keywords.join(" ").trim() || undefined,
    location: search.locations[0] || undefined,
    type: search.jobTypes[0] || undefined,
    seniority: search.seniorities[0] || undefined,
    salaryMin: search.salaryMin ?? null,
    salaryMax: search.salaryMax ?? null,
    remote: search.remoteOnly,
    visaSponsorship: search.visaSponsorship ? "YES" : undefined,
  };

  const jobs = await prisma.job.findMany({
    where: {
      AND: [
        buildJobSearchWhere(filters),
        { publishedAt: { gt: sinceDate } },
      ],
    },
    include: publicJobInclude,
    orderBy: [
      { publishedAt: "desc" },
      { updatedAt: "desc" },
    ],
    take: 150,
  });

  return collapseDuplicateRankedJobs(
    jobs.map((job) => scoreJobForSearch(job, buildPreferenceContext(filters))),
  ).map((result) => ({
    ...result.job,
    rankingScore: result.score,
  }));
}

// Match candidate profiles that don't have saved searches
async function matchCandidateProfiles(): Promise<number> {
  let alerts = 0;

  const profiles = await prisma.candidateProfile.findMany({
    where: {
      openToWork: true,
      skills: { isEmpty: false },
    },
    select: {
      userId: true,
      skills: true,
      targetRoles: true,
      targetCountries: true,
      visaStatus: true,
    },
  });

  // Only process profiles that DON'T already have active saved searches
  const usersWithSearches = new Set(
    (
      await prisma.savedSearch.findMany({
        where: { alertEnabled: true },
        select: { userId: true },
        distinct: ["userId"],
      })
    ).map((s) => s.userId)
  );

  const orphanProfiles = profiles.filter((p) => !usersWithSearches.has(p.userId));

  // Jobs published in the last 24 hours
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000);

  const recentJobs = await prisma.job.findMany({
    where: {
      status: "PUBLISHED",
      publishedAt: { gt: since },
    },
    include: publicJobInclude,
    take: 200,
  });

  for (const profile of orphanProfiles) {
    const rankedJobs = collapseDuplicateRankedJobs(
      recentJobs.map((job) => scoreJobForSearch(job, {
        skills: profile.skills,
        targetRoles: profile.targetRoles,
        targetCountries: profile.targetCountries,
        requiresVisaSponsorship: Boolean(profile.visaStatus && profile.visaStatus.toLowerCase() !== "citizen"),
      })),
    );

    for (const rankedJob of rankedJobs) {
      const score = rankedJob.score;
      if (score < ALERT_SCORE_THRESHOLD) continue;

      const exists = await prisma.jobAlert.findUnique({
        where: { userId_jobId: { userId: profile.userId, jobId: rankedJob.job.id } },
      });
      if (exists) continue;

      try {
        await prisma.jobAlert.create({
          data: {
            userId: profile.userId,
            jobId: rankedJob.job.id,
            matchScore: score,
          },
        });
        alerts++;
      } catch {
        // unique constraint race — ignore
      }
    }
  }

  return alerts;
}
