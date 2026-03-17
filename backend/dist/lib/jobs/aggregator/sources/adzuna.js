// ─────────────────────────────────────────────────────────────────────────────
// Adzuna Job Source - API covering US, UK, EU, CA, AU with Africa-friendly jobs
// Free tier: 250 requests/day
// ─────────────────────────────────────────────────────────────────────────────
import { BaseJobSource } from "./base.js";
const COUNTRY_CONFIG = {
    us: { region: "NORTH_AMERICA", currency: "USD" },
    gb: { region: "EUROPE", currency: "GBP" },
    ca: { region: "NORTH_AMERICA", currency: "CAD" },
    de: { region: "EUROPE", currency: "EUR" },
    fr: { region: "EUROPE", currency: "EUR" },
    nl: { region: "EUROPE", currency: "EUR" },
    au: { region: "OTHER", currency: "AUD" },
};
export class AdzunaSource extends BaseJobSource {
    appId;
    apiKey;
    constructor(appId, apiKey) {
        super({
            source: "INDEED_EU", // Adzuna aggregates Indeed and other sources
            name: "Adzuna (Multi-Region)",
            region: "EUROPE",
            baseUrl: "https://api.adzuna.com/v1/api/jobs",
            apiKey,
            rateLimit: { requestsPerMinute: 10, requestsPerDay: 250 },
            enabled: true,
            supportsAfricanCandidates: true,
            visaSponsorshipCommon: true,
        });
        this.appId = appId;
        this.apiKey = apiKey;
    }
    async fetchJobs(query) {
        this.log("Fetching jobs from multiple regions", { keywords: query.keywords });
        const countries = ["us", "gb", "ca", "de", "nl"];
        const allJobs = [];
        const errors = [];
        for (const country of countries) {
            try {
                await this.rateLimit();
                const jobs = await this.fetchCountry(country, query);
                allJobs.push(...jobs);
            }
            catch (error) {
                errors.push(`${country}: ${String(error)}`);
                this.logError(`Failed to fetch from ${country}`, error);
            }
        }
        this.log("Fetched jobs from all regions", { total: allJobs.length });
        return {
            source: this.source,
            jobs: allJobs.slice(0, query.limit || 100),
            totalFound: allJobs.length,
            fetchedAt: new Date(),
            errors: errors.length > 0 ? errors : undefined,
        };
    }
    async fetchCountry(country, query) {
        const keywords = query.keywords.join(" ");
        const params = new URLSearchParams({
            app_id: this.appId,
            app_key: this.apiKey,
            results_per_page: "50",
            what: keywords,
            what_or: "remote visa sponsorship relocation",
            content_type: "application/json",
        });
        if (query.postedWithinDays) {
            params.set("max_days_old", String(query.postedWithinDays));
        }
        const url = `${this.config.baseUrl}/${country}/search/1?${params}`;
        const response = await fetch(url);
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
        }
        const data = (await response.json());
        const config = COUNTRY_CONFIG[country];
        return data.results
            .filter((job) => this.isAfricaFriendly(job))
            .map((job) => this.transformJob(job, country, config));
    }
    isAfricaFriendly(job) {
        const text = `${job.title} ${job.description}`.toLowerCase();
        // Jobs explicitly mentioning remote/global
        if (text.includes("remote") && (text.includes("anywhere") || text.includes("global") || text.includes("worldwide"))) {
            return true;
        }
        // Jobs with visa sponsorship
        if (text.includes("visa sponsor") || text.includes("sponsorship")) {
            return true;
        }
        // Jobs mentioning relocation
        if (text.includes("relocation")) {
            return true;
        }
        // Jobs in Africa-friendly categories
        if (text.includes("emea") || text.includes("africa")) {
            return true;
        }
        return false;
    }
    transformJob(job, country, config) {
        const locationText = job.location.display_name || "";
        const isRemote = job.title.toLowerCase().includes("remote") || locationText.toLowerCase().includes("remote");
        return {
            externalId: job.id,
            source: this.source,
            sourceUrl: job.redirect_url,
            title: job.title,
            company: job.company.display_name,
            location: locationText,
            locationType: isRemote ? "remote" : "onsite",
            country: country.toUpperCase(),
            region: isRemote ? "REMOTE_GLOBAL" : config.region,
            description: job.description,
            requirements: [],
            salary: job.salary_min || job.salary_max ? {
                min: job.salary_min,
                max: job.salary_max,
                currency: config.currency,
                period: "yearly",
            } : undefined,
            visaSponsorship: this.detectVisaSponsorship(job.description),
            relocationAssistance: job.description.toLowerCase().includes("relocation"),
            eligibleCountries: [],
            skills: this.extractSkills(job.description),
            seniority: this.detectSeniority(job.title, job.description),
            jobType: this.mapContractType(job.contract_type, job.contract_time),
            postedAt: new Date(job.created),
            applicationUrl: job.redirect_url,
            rawData: job,
        };
    }
    mapContractType(contractType, contractTime) {
        if (contractType === "contract")
            return "Contract";
        if (contractTime === "part_time")
            return "Part-time";
        return "Full-time";
    }
}
export const adzunaConfig = {
    source: "INDEED_EU",
    name: "Adzuna (Multi-Region)",
    region: "EUROPE",
    baseUrl: "https://api.adzuna.com/v1/api/jobs",
    rateLimit: { requestsPerMinute: 10, requestsPerDay: 250 },
    enabled: true,
    supportsAfricanCandidates: true,
    visaSponsorshipCommon: true,
};
//# sourceMappingURL=adzuna.js.map