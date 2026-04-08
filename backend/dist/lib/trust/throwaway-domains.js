const THROWAWAY_DOMAINS = new Set([
    "gmail.com",
    "googlemail.com",
    "yahoo.com",
    "yahoo.co.uk",
    "outlook.com",
    "hotmail.com",
    "live.com",
    "icloud.com",
    "aol.com",
    "proton.me",
    "protonmail.com",
    "gmx.com",
    "mail.com",
    "yandex.com",
    "zoho.com",
    "fastmail.com",
]);
export function normalizeDomain(value) {
    if (!value)
        return null;
    const candidate = value.trim().toLowerCase();
    if (!candidate)
        return null;
    try {
        const withProtocol = candidate.includes("://") ? candidate : `https://${candidate}`;
        const hostname = new URL(withProtocol).hostname.toLowerCase();
        return hostname.replace(/^www\./, "");
    }
    catch {
        return candidate.replace(/^www\./, "");
    }
}
export function domainFromEmail(email) {
    if (!email)
        return null;
    const parts = email.trim().toLowerCase().split("@");
    if (parts.length !== 2)
        return null;
    return normalizeDomain(parts[1]);
}
export function isThrowawayDomain(domain) {
    if (!domain)
        return false;
    const normalized = normalizeDomain(domain);
    return normalized ? THROWAWAY_DOMAINS.has(normalized) : false;
}
//# sourceMappingURL=throwaway-domains.js.map