// ─────────────────────────────────────────────────────────────────────────────
// Builds the feed list for a run.
//
// Env:
//   AGGREGATOR_DISABLED_FEEDS            comma list of FeedSourceIds to skip
//   AGGREGATOR_INCLUDE_DEFAULT_BOARD_CATALOG=0  only env/DB-configured ATS boards
//   AGGREGATOR_COMPANIES_JSON            extra ATS boards (see catalog/companies.ts)
//   ADZUNA_APP_ID / ADZUNA_API_KEY / ADZUNA_COUNTRIES (default "za")
// Legacy GREENHOUSE_BOARD_TOKENS / LEVER_SITE_TOKENS / WORKABLE_COMPANY_TOKENS
// are still honoured (folded into the ATS catalog).
// ─────────────────────────────────────────────────────────────────────────────

import { ATS_FEED_FACTORIES } from "./feeds/ats.js";
import { adzunaFeed } from "./feeds/adzuna.js";
import {
  arbeitnowFeed,
  himalayasFeed,
  jobicyFeed,
  remoteOkFeed,
  remotiveFeed,
  weWorkRemotelyFeed,
  workingNomadsFeed,
} from "./feeds/public-boards.js";
import { ATS_PROVIDERS, resolveAtsCompanies, type AtsCompany, type CareerSourceRow } from "./catalog/companies.js";
import type { FeedSource } from "./types.js";

function legacyTokens(raw: string | undefined, provider: AtsCompany["provider"]): AtsCompany[] {
  return (raw || "")
    .split(",")
    .map((token) => token.trim().split(":")[0]?.trim() ?? "")
    .filter(Boolean)
    .map((token) => ({ provider, token, name: token }));
}

export interface RegistryInput {
  env?: NodeJS.ProcessEnv;
  careerSourceRows?: CareerSourceRow[];
}

export function buildFeedSources(input: RegistryInput = {}): { feeds: FeedSource[]; companies: AtsCompany[] } {
  const env = input.env ?? process.env;
  const disabled = new Set(
    (env.AGGREGATOR_DISABLED_FEEDS || "")
      .split(",")
      .map((id) => id.trim().toLowerCase())
      .filter(Boolean),
  );

  const legacy = [
    ...legacyTokens(env.GREENHOUSE_BOARD_TOKENS, "GREENHOUSE"),
    ...legacyTokens(env.LEVER_SITE_TOKENS, "LEVER"),
    ...legacyTokens(env.WORKABLE_COMPANY_TOKENS, "WORKABLE"),
  ];
  const companies = resolveAtsCompanies({
    includeDefaults: env.AGGREGATOR_INCLUDE_DEFAULT_BOARD_CATALOG !== "0",
    envJson: JSON.stringify([
      ...legacy,
      ...(() => {
        try {
          const parsed = JSON.parse(env.AGGREGATOR_COMPANIES_JSON || "[]") as unknown;
          return Array.isArray(parsed) ? parsed : [];
        } catch {
          return [];
        }
      })(),
    ]),
    dbRows: input.careerSourceRows,
  });

  const feeds: FeedSource[] = [
    remotiveFeed(),
    remoteOkFeed(),
    himalayasFeed(),
    weWorkRemotelyFeed(),
    arbeitnowFeed(),
    jobicyFeed(),
    workingNomadsFeed(),
  ];

  for (const provider of ATS_PROVIDERS) {
    if (companies.some((company) => company.provider === provider)) {
      feeds.push(ATS_FEED_FACTORIES[provider](companies));
    }
  }

  const adzunaId = env.ADZUNA_APP_ID?.trim();
  const adzunaKey = env.ADZUNA_API_KEY?.trim();
  if (adzunaId && adzunaKey) {
    const countries = (env.ADZUNA_COUNTRIES || "za")
      .split(",")
      .map((country) => country.trim().toLowerCase())
      .filter(Boolean);
    feeds.push(adzunaFeed(adzunaId, adzunaKey, countries));
  }

  return { feeds: feeds.filter((feed) => !disabled.has(feed.id)), companies };
}
