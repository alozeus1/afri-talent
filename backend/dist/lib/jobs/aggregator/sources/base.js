// ─────────────────────────────────────────────────────────────────────────────
// Base Job Source Adapter - Abstract class for all job board integrations
// ─────────────────────────────────────────────────────────────────────────────
import logger from "../../../logger.js";
const HTML_ENTITY_MAP = {
    amp: "&",
    lt: "<",
    gt: ">",
    quot: '"',
    apos: "'",
    nbsp: " ",
    ensp: " ",
    emsp: " ",
    ndash: "-",
    mdash: "-",
    rsquo: "'",
    lsquo: "'",
    rdquo: '"',
    ldquo: '"',
    hellip: "...",
};
function decodeHtmlEntities(value) {
    return value.replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (entity, token) => {
        const normalizedToken = token.toLowerCase();
        if (normalizedToken.startsWith("#x")) {
            const codePoint = Number.parseInt(normalizedToken.slice(2), 16);
            return Number.isNaN(codePoint) ? entity : String.fromCodePoint(codePoint);
        }
        if (normalizedToken.startsWith("#")) {
            const codePoint = Number.parseInt(normalizedToken.slice(1), 10);
            return Number.isNaN(codePoint) ? entity : String.fromCodePoint(codePoint);
        }
        return HTML_ENTITY_MAP[normalizedToken] ?? entity;
    });
}
function decodeHtmlEntitiesDeep(value, passes = 3) {
    let decoded = value;
    for (let index = 0; index < passes; index += 1) {
        const next = decodeHtmlEntities(decoded);
        if (next === decoded)
            break;
        decoded = next;
    }
    return decoded;
}
export class BaseJobSource {
    config;
    requestCount = 0;
    lastRequestTime = 0;
    constructor(config) {
        this.config = config;
    }
    get source() {
        return this.config.source;
    }
    get isEnabled() {
        return this.config.enabled;
    }
    async rateLimit() {
        const now = Date.now();
        const minInterval = 60000 / this.config.rateLimit.requestsPerMinute;
        const elapsed = now - this.lastRequestTime;
        if (elapsed < minInterval) {
            const waitTime = minInterval - elapsed;
            await new Promise((resolve) => setTimeout(resolve, waitTime));
        }
        this.lastRequestTime = Date.now();
        this.requestCount++;
    }
    log(message, meta) {
        logger.info({ source: this.config.source, ...meta }, `[aggregator:${this.config.source}] ${message}`);
    }
    logError(message, error) {
        logger.error({ source: this.config.source, error: String(error) }, `[aggregator:${this.config.source}] ${message}`);
    }
    normalizeDescription(value) {
        const decoded = decodeHtmlEntitiesDeep(value);
        const withStructure = decoded
            .replace(/\r\n?/g, "\n")
            .replace(/<br\s*\/?>/gi, "\n")
            .replace(/<\/(p|div|section|article|header|footer|h[1-6]|blockquote|table|tr)>/gi, "\n\n")
            .replace(/<li\b[^>]*>/gi, "\n- ")
            .replace(/<\/(ul|ol)>/gi, "\n")
            .replace(/<[^>]*>/g, " ");
        const lines = withStructure
            .replace(/\u00a0/g, " ")
            .split("\n")
            .map((line) => line.replace(/[ \t]+/g, " ").trim());
        const normalizedLines = [];
        for (const line of lines) {
            if (line.length === 0) {
                if (normalizedLines.length > 0 && normalizedLines[normalizedLines.length - 1] !== "") {
                    normalizedLines.push("");
                }
                continue;
            }
            normalizedLines.push(line);
        }
        while (normalizedLines[normalizedLines.length - 1] === "") {
            normalizedLines.pop();
        }
        return normalizedLines.join("\n").trim();
    }
    normalizeLocation(location) {
        const lower = location.toLowerCase();
        if (lower.includes("remote") || lower.includes("work from home") || lower.includes("anywhere")) {
            return { city: "Remote", country: "GLOBAL", locationType: "remote" };
        }
        if (lower.includes("hybrid")) {
            return { city: location.replace(/hybrid/i, "").trim(), country: "", locationType: "hybrid" };
        }
        return { city: location, country: "", locationType: "onsite" };
    }
    extractSkills(text) {
        const skillPatterns = [
            // Programming languages
            /\b(javascript|typescript|python|java|c\+\+|c#|ruby|go|golang|rust|php|swift|kotlin|scala)\b/gi,
            // Frameworks
            /\b(react|angular|vue|node\.?js|express|django|flask|spring|rails|laravel|nextjs|next\.js)\b/gi,
            // Databases
            /\b(postgresql|mysql|mongodb|redis|elasticsearch|dynamodb|cassandra|oracle)\b/gi,
            // Cloud
            /\b(aws|azure|gcp|google cloud|kubernetes|k8s|docker|terraform|ansible)\b/gi,
            // Tools
            /\b(git|jenkins|circleci|github actions|jira|figma|sketch|adobe xd)\b/gi,
        ];
        const skills = new Set();
        for (const pattern of skillPatterns) {
            const matches = text.match(pattern);
            if (matches) {
                matches.forEach((m) => skills.add(m.toLowerCase()));
            }
        }
        return Array.from(skills);
    }
    detectVisaSponsorship(text) {
        const lower = text.toLowerCase();
        const positivePatterns = [
            "visa sponsorship available",
            "visa sponsorship provided",
            "will sponsor visa",
            "sponsor your visa",
            "sponsorship available",
            "we sponsor visas",
            "visa support"
        ];
        const negativePatterns = [
            "no visa sponsorship",
            "not sponsor visa",
            "cannot sponsor",
            "will not sponsor",
            "must be authorized",
            "must have work authorization",
            "no sponsorship"
        ];
        for (const pattern of positivePatterns) {
            if (lower.includes(pattern))
                return "YES";
        }
        for (const pattern of negativePatterns) {
            if (lower.includes(pattern))
                return "NO";
        }
        return "UNKNOWN";
    }
    detectSeniority(title, description) {
        const text = `${title} ${description}`.toLowerCase();
        if (text.includes("executive") || text.includes("director") || text.includes("vp ") || text.includes("chief")) {
            return "Executive";
        }
        if (text.includes("lead") || text.includes("principal") || text.includes("staff")) {
            return "Lead";
        }
        if (text.includes("senior") || text.includes("sr.") || text.includes("sr ")) {
            return "Senior";
        }
        if (text.includes("junior") || text.includes("jr.") || text.includes("jr ") || text.includes("entry")) {
            return "Junior";
        }
        if (text.includes("mid") || text.includes("intermediate")) {
            return "Mid-level";
        }
        return null;
    }
}
//# sourceMappingURL=base.js.map