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
// Minimum overlap score (0-100) to consider a job a match worth alerting on
const ALERT_SCORE_THRESHOLD = parseInt(process.env.ALERT_SCORE_THRESHOLD || "40", 10);
const MAX_ALERTS_PER_CYCLE = parseInt(process.env.MAX_ALERTS_PER_CYCLE || "500", 10);
export async function runJobMatcherCycle() {
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
        if (totalAlerts >= MAX_ALERTS_PER_CYCLE)
            break;
        try {
            const sinceDate = search.lastAlertAt ?? search.createdAt;
            const matchingJobs = await findNewMatchingJobs(search, sinceDate);
            for (const job of matchingJobs) {
                if (totalAlerts >= MAX_ALERTS_PER_CYCLE)
                    break;
                // Skip if alert already exists for this user+job pair
                const exists = await prisma.jobAlert.findUnique({
                    where: { userId_jobId: { userId: search.userId, jobId: job.id } },
                });
                if (exists)
                    continue;
                const score = computeMatchScore(search, job);
                if (score < ALERT_SCORE_THRESHOLD)
                    continue;
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
        }
        catch (err) {
            logger.error({ searchId: search.id, userId: search.userId.slice(0, 8), err }, "[job-matcher] failed processing saved search");
        }
    }
    // 2. Process profile-based matching for candidates without saved searches
    const profileAlerts = await matchCandidateProfiles();
    totalAlerts += profileAlerts;
    logger.info({ totalSearches, totalAlerts }, "[job-matcher] cycle complete");
}
// Find jobs published since a given date matching search criteria
async function findNewMatchingJobs(search, sinceDate) {
    const conditions = [
        { status: "PUBLISHED" },
        { publishedAt: { gt: sinceDate } },
    ];
    if (search.keywords.length > 0) {
        conditions.push({
            OR: search.keywords.flatMap((kw) => [
                { title: { contains: kw, mode: "insensitive" } },
                { description: { contains: kw, mode: "insensitive" } },
                { tags: { has: kw.toLowerCase() } },
            ]),
        });
    }
    if (search.locations.length > 0) {
        conditions.push({
            OR: search.locations.map((loc) => ({
                location: { contains: loc, mode: "insensitive" },
            })),
        });
    }
    if (search.jobTypes.length > 0) {
        conditions.push({ type: { in: search.jobTypes } });
    }
    if (search.seniorities.length > 0) {
        conditions.push({ seniority: { in: search.seniorities } });
    }
    if (search.remoteOnly) {
        conditions.push({
            OR: [
                { location: { contains: "remote", mode: "insensitive" } },
                { type: { contains: "remote", mode: "insensitive" } },
            ],
        });
    }
    if (search.visaSponsorship) {
        conditions.push({ visaSponsorship: "YES" });
    }
    return prisma.job.findMany({
        where: { AND: conditions },
        orderBy: { publishedAt: "desc" },
        take: 50,
        select: {
            id: true,
            title: true,
            slug: true,
            location: true,
            type: true,
            seniority: true,
            tags: true,
            salaryMin: true,
            salaryMax: true,
            visaSponsorship: true,
            relocationAssistance: true,
            sourceName: true,
            employerId: true,
            employer: { select: { companyName: true } },
        },
    });
}
// Lightweight skill-overlap scoring (no AI API call)
function computeMatchScore(search, job) {
    let score = 0;
    const maxScore = 100;
    const jobText = `${job.title} ${job.tags.join(" ")}`.toLowerCase();
    const jobLoc = job.location.toLowerCase();
    // Keyword match (up to 50 points)
    if (search.keywords.length > 0) {
        const matched = search.keywords.filter((kw) => jobText.includes(kw.toLowerCase())).length;
        score += Math.round((matched / search.keywords.length) * 50);
    }
    else {
        score += 25; // no keywords = generic match
    }
    // Location match (up to 20 points)
    if (search.locations.length > 0) {
        const locMatch = search.locations.some((loc) => jobLoc.includes(loc.toLowerCase()));
        if (locMatch)
            score += 20;
    }
    else {
        score += 10;
    }
    // Remote bonus (10 points)
    if (search.remoteOnly && jobLoc.includes("remote")) {
        score += 10;
    }
    // Visa sponsorship bonus (20 points)
    if (search.visaSponsorship && job.visaSponsorship === "YES") {
        score += 20;
    }
    else if (!search.visaSponsorship) {
        score += 10;
    }
    return Math.min(score, maxScore);
}
// Match candidate profiles that don't have saved searches
async function matchCandidateProfiles() {
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
    const usersWithSearches = new Set((await prisma.savedSearch.findMany({
        where: { alertEnabled: true },
        select: { userId: true },
        distinct: ["userId"],
    })).map((s) => s.userId));
    const orphanProfiles = profiles.filter((p) => !usersWithSearches.has(p.userId));
    // Jobs published in the last 24 hours
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const recentJobs = await prisma.job.findMany({
        where: {
            status: "PUBLISHED",
            publishedAt: { gt: since },
        },
        select: {
            id: true,
            title: true,
            tags: true,
            location: true,
            visaSponsorship: true,
            eligibleCountries: true,
        },
        take: 200,
    });
    for (const profile of orphanProfiles) {
        for (const job of recentJobs) {
            const score = computeProfileJobScore(profile, job);
            if (score < ALERT_SCORE_THRESHOLD)
                continue;
            const exists = await prisma.jobAlert.findUnique({
                where: { userId_jobId: { userId: profile.userId, jobId: job.id } },
            });
            if (exists)
                continue;
            try {
                await prisma.jobAlert.create({
                    data: {
                        userId: profile.userId,
                        jobId: job.id,
                        matchScore: score,
                    },
                });
                alerts++;
            }
            catch {
                // unique constraint race — ignore
            }
        }
    }
    return alerts;
}
function computeProfileJobScore(profile, job) {
    let score = 0;
    const jobText = `${job.title} ${job.tags.join(" ")}`.toLowerCase();
    // Skills overlap (up to 40 points)
    if (profile.skills.length > 0) {
        const matched = profile.skills.filter((s) => jobText.includes(s.toLowerCase())).length;
        score += Math.round((matched / profile.skills.length) * 40);
    }
    // Target role match (up to 30 points)
    if (profile.targetRoles.length > 0) {
        const titleLower = job.title.toLowerCase();
        const roleMatch = profile.targetRoles.some((r) => titleLower.includes(r.toLowerCase()));
        if (roleMatch)
            score += 30;
    }
    // Country/location match (up to 15 points)
    if (profile.targetCountries.length > 0) {
        const locLower = job.location.toLowerCase();
        const countryMatch = profile.targetCountries.some((c) => locLower.includes(c.toLowerCase())) ||
            job.eligibleCountries.some((c) => profile.targetCountries.includes(c));
        if (countryMatch)
            score += 15;
    }
    // Visa sponsorship bonus (15 points)
    if (job.visaSponsorship === "YES")
        score += 15;
    return Math.min(score, 100);
}
//# sourceMappingURL=job-matcher.js.map