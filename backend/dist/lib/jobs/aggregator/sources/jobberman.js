// ─────────────────────────────────────────────────────────────────────────────
// Jobberman Job Source - Leading African job board (Nigeria, Ghana, Kenya)
// Uses web scraping since no public API available
// ─────────────────────────────────────────────────────────────────────────────
import { BaseJobSource } from "./base.js";
import * as cheerio from "cheerio";
const JOBBERMAN_COUNTRIES = [
    { code: "NG", name: "Nigeria", baseUrl: "https://www.jobberman.com" },
    { code: "GH", name: "Ghana", baseUrl: "https://www.jobberman.com.gh" },
    { code: "KE", name: "Kenya", baseUrl: "https://www.brightermonday.co.ke" }, // Same parent company
];
export class JobbermanSource extends BaseJobSource {
    constructor() {
        super({
            source: "JOBBERMAN",
            name: "Jobberman",
            region: "AFRICA",
            baseUrl: "https://www.jobberman.com",
            rateLimit: { requestsPerMinute: 5, requestsPerDay: 200 },
            enabled: true,
            supportsAfricanCandidates: true,
            visaSponsorshipCommon: false,
        });
    }
    async fetchJobs(query) {
        this.log("Fetching jobs from Jobberman network", { keywords: query.keywords });
        const allJobs = [];
        const errors = [];
        for (const country of JOBBERMAN_COUNTRIES) {
            try {
                await this.rateLimit();
                const jobs = await this.fetchCountry(country, query);
                allJobs.push(...jobs);
            }
            catch (error) {
                errors.push(`${country.name}: ${String(error)}`);
                this.logError(`Failed to fetch from ${country.name}`, error);
            }
        }
        this.log("Fetched jobs", { total: allJobs.length });
        return {
            source: this.source,
            jobs: allJobs.slice(0, query.limit || 100),
            totalFound: allJobs.length,
            fetchedAt: new Date(),
            errors: errors.length > 0 ? errors : undefined,
        };
    }
    async fetchCountry(country, query) {
        const keyword = query.keywords.join("+");
        const url = `${country.baseUrl}/jobs?q=${encodeURIComponent(keyword)}`;
        const response = await fetch(url, {
            headers: {
                "User-Agent": "Mozilla/5.0 (compatible; AfriTalent/1.0; +https://afri-talent.com)",
                "Accept": "text/html",
            },
        });
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
        }
        const html = await response.text();
        return this.parseJobListings(html, country);
    }
    parseJobListings(html, country) {
        const $ = cheerio.load(html);
        const jobs = [];
        // Jobberman uses different selectors, try multiple patterns
        const selectors = [
            ".job-card",
            ".listing-card",
            "[data-job-id]",
            ".search-result-item",
        ];
        for (const selector of selectors) {
            $(selector).each((_, el) => {
                try {
                    const job = this.parseJobCard($, el, country);
                    if (job)
                        jobs.push(job);
                }
                catch {
                    // Skip malformed cards
                }
            });
            if (jobs.length > 0)
                break;
        }
        return jobs;
    }
    parseJobCard($, el, country) {
        const $el = $(el);
        // Try different selectors for each field
        const title = $el.find("h2, .job-title, [data-title]").first().text().trim() ||
            $el.find("a").first().text().trim();
        if (!title)
            return null;
        const company = $el.find(".company-name, .employer, [data-company]").text().trim() || "Unknown";
        const location = $el.find(".location, .job-location, [data-location]").text().trim() || country.name;
        const link = $el.find("a").first().attr("href") || "";
        const fullUrl = link.startsWith("http") ? link : `${country.baseUrl}${link}`;
        const description = $el.find(".description, .job-snippet, p").text().trim();
        // Extract salary if present
        const salaryText = $el.find(".salary, .compensation, [data-salary]").text().trim();
        const salary = this.parseSalary(salaryText, country.code);
        return {
            externalId: `jobberman-${country.code}-${Buffer.from(fullUrl).toString("base64").slice(0, 16)}`,
            source: this.source,
            sourceUrl: fullUrl,
            title,
            company,
            location,
            locationType: location.toLowerCase().includes("remote") ? "remote" : "onsite",
            country: country.code,
            region: "AFRICA",
            description,
            requirements: [],
            salary,
            visaSponsorship: "UNKNOWN",
            relocationAssistance: false,
            eligibleCountries: [country.code],
            skills: this.extractSkills(description),
            seniority: this.detectSeniority(title, description),
            jobType: "Full-time",
            postedAt: new Date(),
            applicationUrl: fullUrl,
        };
    }
    parseSalary(text, countryCode) {
        if (!text)
            return undefined;
        const currencyMap = {
            NG: "NGN",
            GH: "GHS",
            KE: "KES",
        };
        const numbers = text.match(/[\d,]+/g);
        if (!numbers || numbers.length === 0)
            return undefined;
        const min = parseInt(numbers[0].replace(/,/g, ""), 10);
        const max = numbers.length > 1 ? parseInt(numbers[1].replace(/,/g, ""), 10) : undefined;
        return {
            min,
            max,
            currency: currencyMap[countryCode] || "USD",
            period: text.toLowerCase().includes("month") ? "monthly" : "yearly",
        };
    }
}
export const jobbermanConfig = {
    source: "JOBBERMAN",
    name: "Jobberman",
    region: "AFRICA",
    baseUrl: "https://www.jobberman.com",
    rateLimit: { requestsPerMinute: 5, requestsPerDay: 200 },
    enabled: true,
    supportsAfricanCandidates: true,
    visaSponsorshipCommon: false,
};
//# sourceMappingURL=jobberman.js.map