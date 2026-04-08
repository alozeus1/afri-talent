import { BaseJobSource } from "./base.js";
export class GreenhouseSource extends BaseJobSource {
    boardTokens;
    constructor(boardTokens) {
        super({
            source: "GREENHOUSE",
            name: "Greenhouse",
            region: "REMOTE_GLOBAL",
            baseUrl: "https://boards-api.greenhouse.io/v1/boards",
            rateLimit: { requestsPerMinute: 20, requestsPerDay: 2000 },
            enabled: boardTokens.length > 0,
            supportsAfricanCandidates: true,
            visaSponsorshipCommon: true,
        });
        this.boardTokens = boardTokens;
    }
    async fetchJobs(query) {
        const jobs = [];
        const errors = [];
        for (const boardToken of this.boardTokens.slice(0, 20)) {
            try {
                const startedAt = Date.now();
                await this.rateLimit();
                const response = await fetch(`${this.config.baseUrl}/${encodeURIComponent(boardToken)}/jobs?content=true`, {
                    headers: { Accept: "application/json", "User-Agent": "AfriTalent/1.0" },
                });
                if (!response.ok) {
                    errors.push(`${boardToken}: HTTP ${response.status}`);
                    continue;
                }
                const payload = (await response.json());
                const normalizedJobs = payload.jobs.map((job) => this.transformJob(job, boardToken));
                const matchedJobs = normalizedJobs.filter((job) => this.matchesQuery(job, query));
                const filterStats = this.buildFilterStats(normalizedJobs, query);
                this.log("Board fetch complete", {
                    boardToken,
                    upstreamCount: payload.jobs.length,
                    normalizedCount: normalizedJobs.length,
                    matchedCount: matchedJobs.length,
                    staleFiltered: filterStats.staleFiltered,
                    remoteFiltered: filterStats.remoteFiltered,
                    keywordFiltered: filterStats.keywordFiltered,
                    sampleTitles: matchedJobs.slice(0, 3).map((job) => job.title),
                    durationMs: Date.now() - startedAt,
                });
                jobs.push(...matchedJobs);
            }
            catch (error) {
                errors.push(`${boardToken}: ${String(error)}`);
                this.logError(`Failed to fetch board ${boardToken}`, error);
            }
        }
        return {
            source: this.source,
            jobs: jobs.slice(0, query.limit || 100),
            totalFound: jobs.length,
            fetchedAt: new Date(),
            errors: errors.length ? errors : undefined,
        };
    }
    matchesQuery(job, query) {
        if (query.postedWithinDays) {
            const cutoff = new Date();
            cutoff.setDate(cutoff.getDate() - query.postedWithinDays);
            if (job.postedAt < cutoff)
                return false;
        }
        if (query.remote && job.locationType !== "remote")
            return false;
        if (query.keywords.length > 0) {
            const bag = `${job.title} ${job.description} ${job.skills.join(" ")}`.toLowerCase();
            const match = query.keywords.some((keyword) => bag.includes(keyword.toLowerCase()));
            if (!match)
                return false;
        }
        return true;
    }
    buildFilterStats(jobs, query) {
        let staleFiltered = 0;
        let remoteFiltered = 0;
        let keywordFiltered = 0;
        for (const job of jobs) {
            if (query.postedWithinDays) {
                const cutoff = new Date();
                cutoff.setDate(cutoff.getDate() - query.postedWithinDays);
                if (job.postedAt < cutoff) {
                    staleFiltered++;
                    continue;
                }
            }
            if (query.remote && job.locationType !== "remote") {
                remoteFiltered++;
                continue;
            }
            if (query.keywords.length > 0) {
                const bag = `${job.title} ${job.description} ${job.skills.join(" ")}`.toLowerCase();
                const match = query.keywords.some((keyword) => bag.includes(keyword.toLowerCase()));
                if (!match) {
                    keywordFiltered++;
                }
            }
        }
        return {
            staleFiltered,
            remoteFiltered,
            keywordFiltered,
        };
    }
    transformJob(job, boardToken) {
        const description = this.normalizeDescription(job.content || "");
        const location = job.location?.name || "Remote";
        const normalized = this.normalizeLocation(location);
        const employmentMeta = job.metadata?.find((item) => /employment|type/i.test(item.name));
        const commitment = (employmentMeta?.value || "").toLowerCase();
        return {
            externalId: `greenhouse-${boardToken}-${job.id}`,
            source: this.source,
            sourceUrl: job.absolute_url,
            title: job.title,
            company: boardToken,
            location,
            locationType: normalized.locationType,
            country: normalized.country || "GLOBAL",
            region: normalized.locationType === "remote" ? "REMOTE_GLOBAL" : "OTHER",
            description,
            requirements: [],
            visaSponsorship: this.detectVisaSponsorship(description),
            relocationAssistance: /relocat/i.test(description),
            eligibleCountries: [],
            skills: this.extractSkills(description),
            seniority: this.detectSeniority(job.title, description),
            jobType: commitment.includes("part")
                ? "Part-time"
                : commitment.includes("contract")
                    ? "Contract"
                    : commitment.includes("intern")
                        ? "Internship"
                        : "Full-time",
            postedAt: new Date(job.updated_at),
            applicationUrl: job.absolute_url,
            rawData: { boardToken },
        };
    }
}
//# sourceMappingURL=greenhouse.js.map