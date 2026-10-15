// ─────────────────────────────────────────────────────────────────────────────
// Curated ATS boards of companies that hire in Africa or hire remotely across
// EMEA/worldwide. Every token below was verified live against the provider's
// public job-board API on 2026-10-14 (see engine/README.md for the probe).
//
// Extending the catalog (no code change needed for the last two):
//   1. add an entry here (provider + board token + display name), or
//   2. set AGGREGATOR_COMPANIES_JSON='[{"provider":"ASHBY","token":"acme","name":"Acme"}]', or
//   3. add a CompanyCareerSource row via POST /api/aggregator/company-sources
//      (provider GREENHOUSE|LEVER|ASHBY|SMARTRECRUITERS|RECRUITEE|WORKABLE).
// Set AGGREGATOR_INCLUDE_DEFAULT_BOARD_CATALOG=0 to use only 2 and 3.
// Non-Africa-specific employers are fine: the eligibility rules drop their
// US-only/on-site roles and keep remote-worldwide/EMEA/sponsored ones.
// ─────────────────────────────────────────────────────────────────────────────

/** GENERIC = a company careers page publishing schema.org JobPosting JSON-LD (token = page URL). */
export type AtsProvider = "GREENHOUSE" | "LEVER" | "ASHBY" | "SMARTRECRUITERS" | "RECRUITEE" | "WORKABLE" | "GENERIC";

export const ATS_PROVIDERS: readonly AtsProvider[] = ["GREENHOUSE", "LEVER", "ASHBY", "SMARTRECRUITERS", "RECRUITEE", "WORKABLE", "GENERIC"];

export interface AtsCompany {
  provider: AtsProvider;
  /** Board token / site slug / account id exactly as the provider API expects it. */
  token: string;
  name: string;
  /** Why it is in the catalog — Africa HQ/office, or remote-first hiring across EMEA/worldwide. */
  tag?: "africa" | "remote-global" | "emea";
  careerSourceId?: string;
}

export const DEFAULT_ATS_COMPANIES: readonly AtsCompany[] = [
  // Africa-headquartered or Africa-office employers
  { provider: "GREENHOUSE", token: "moniepoint", name: "Moniepoint", tag: "africa" },
  { provider: "GREENHOUSE", token: "jumia", name: "Jumia", tag: "africa" },
  { provider: "ASHBY", token: "andela", name: "Andela", tag: "africa" },
  { provider: "ASHBY", token: "lemfi", name: "LemFi", tag: "africa" },
  { provider: "ASHBY", token: "paymentology", name: "Paymentology", tag: "africa" },
  { provider: "WORKABLE", token: "kuda", name: "Kuda", tag: "africa" },
  { provider: "WORKABLE", token: "carry1st", name: "Carry1st", tag: "africa" },
  { provider: "WORKABLE", token: "helium-health", name: "Helium Health", tag: "africa" },
  { provider: "LEVER", token: "copia", name: "Copia Global", tag: "africa" },
  { provider: "LEVER", token: "dlocal", name: "dLocal", tag: "emea" },
  // Remote-first / distributed employers hiring across EMEA or worldwide
  { provider: "GREENHOUSE", token: "gitlab", name: "GitLab", tag: "remote-global" },
  { provider: "GREENHOUSE", token: "canonical", name: "Canonical", tag: "remote-global" },
  { provider: "GREENHOUSE", token: "elastic", name: "Elastic", tag: "remote-global" },
  { provider: "GREENHOUSE", token: "grafanalabs", name: "Grafana Labs", tag: "remote-global" },
  { provider: "GREENHOUSE", token: "mozilla", name: "Mozilla", tag: "remote-global" },
  { provider: "GREENHOUSE", token: "wikimedia", name: "Wikimedia Foundation", tag: "remote-global" },
  { provider: "GREENHOUSE", token: "binance", name: "Binance", tag: "remote-global" },
  { provider: "GREENHOUSE", token: "okx", name: "OKX", tag: "remote-global" },
  { provider: "GREENHOUSE", token: "cloudflare", name: "Cloudflare", tag: "emea" },
  { provider: "GREENHOUSE", token: "datadog", name: "Datadog", tag: "emea" },
  { provider: "GREENHOUSE", token: "mongodb", name: "MongoDB", tag: "emea" },
  { provider: "GREENHOUSE", token: "twilio", name: "Twilio", tag: "remote-global" },
  { provider: "GREENHOUSE", token: "coinbase", name: "Coinbase", tag: "remote-global" },
  { provider: "GREENHOUSE", token: "stripe", name: "Stripe", tag: "emea" },
  { provider: "GREENHOUSE", token: "wise", name: "Wise", tag: "emea" },
  { provider: "ASHBY", token: "zapier", name: "Zapier", tag: "remote-global" },
  { provider: "ASHBY", token: "oyster", name: "Oyster HR", tag: "remote-global" },
  { provider: "ASHBY", token: "kraken.com", name: "Kraken", tag: "remote-global" },
  { provider: "ASHBY", token: "posthog", name: "PostHog", tag: "remote-global" },
  { provider: "ASHBY", token: "supabase", name: "Supabase", tag: "remote-global" },
  { provider: "ASHBY", token: "sentry", name: "Sentry", tag: "remote-global" },
  { provider: "ASHBY", token: "clickhouse", name: "ClickHouse", tag: "remote-global" },
  { provider: "ASHBY", token: "linear", name: "Linear", tag: "remote-global" },
  { provider: "ASHBY", token: "vanta", name: "Vanta", tag: "remote-global" },
  { provider: "LEVER", token: "toptal", name: "Toptal", tag: "remote-global" },
  { provider: "LEVER", token: "spotify", name: "Spotify", tag: "emea" },
  // SmartRecruiters boards (skipped while the API host's robots.txt disallows us)
  { provider: "SMARTRECRUITERS", token: "Canva", name: "Canva", tag: "remote-global" },
  { provider: "SMARTRECRUITERS", token: "DeliveryHero", name: "Delivery Hero", tag: "emea" },
  { provider: "SMARTRECRUITERS", token: "Devoteam", name: "Devoteam", tag: "emea" },
];

function isAtsProvider(value: string): value is AtsProvider {
  return (ATS_PROVIDERS as readonly string[]).includes(value);
}

/** Parses AGGREGATOR_COMPANIES_JSON; invalid entries are ignored. */
export function parseCompaniesJson(raw: string | undefined): AtsCompany[] {
  if (!raw?.trim()) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.flatMap((entry): AtsCompany[] => {
      if (!entry || typeof entry !== "object") return [];
      const record = entry as Record<string, unknown>;
      const provider = String(record.provider ?? "").toUpperCase();
      const token = String(record.token ?? record.providerKey ?? "").trim();
      if (!isAtsProvider(provider) || !token) return [];
      return [{ provider, token, name: String(record.name ?? record.companyName ?? token).trim() || token }];
    });
  } catch {
    return [];
  }
}

export interface CareerSourceRow {
  id: string;
  provider: string;
  providerKey: string | null;
  companyName: string;
  careersUrl?: string | null;
}

/** Merge order: defaults < env JSON < DB rows (later wins on provider+token). */
export function resolveAtsCompanies(input: {
  includeDefaults: boolean;
  envJson?: string;
  dbRows?: CareerSourceRow[];
}): AtsCompany[] {
  const merged = new Map<string, AtsCompany>();
  const put = (company: AtsCompany) => merged.set(`${company.provider}:${company.token.toLowerCase()}`, company);
  if (input.includeDefaults) DEFAULT_ATS_COMPANIES.forEach((company) => put({ ...company }));
  parseCompaniesJson(input.envJson).forEach(put);
  for (const row of input.dbRows ?? []) {
    const provider = row.provider.toUpperCase();
    if (!isAtsProvider(provider)) continue;
    const token = provider === "GENERIC" ? row.careersUrl || row.providerKey : row.providerKey;
    if (!token) continue;
    put({ provider, token, name: row.companyName, careerSourceId: row.id });
  }
  return Array.from(merged.values());
}
