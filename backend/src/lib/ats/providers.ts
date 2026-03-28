import { ATSProvider } from "@prisma/client";

export interface NormalizedATSJob {
  externalId: string;
  title: string;
  description: string;
  location: string;
  type: string;
  seniority: string;
  salaryMin?: number;
  salaryMax?: number;
  currency?: string;
  tags: string[];
  visaSponsorship: "YES" | "NO" | "UNKNOWN";
  relocationAssistance: boolean;
  eligibleCountries: string[];
  sourceUrl: string;
  postedAt?: Date;
  expiresAt?: Date;
  rawData?: Record<string, unknown>;
}

function normalizeLocation(location?: string): string {
  if (!location) return "Remote";
  return location.trim() || "Remote";
}

function stripHtml(input: string): string {
  return input.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
}

function extractSkills(text: string): string[] {
  const patterns = [
    /\b(javascript|typescript|python|java|go|rust|php|ruby|kotlin|swift)\b/gi,
    /\b(react|next\.js|node\.js|express|nestjs|django|flask|spring|rails)\b/gi,
    /\b(aws|azure|gcp|docker|kubernetes|terraform|postgresql|mysql|mongodb|redis)\b/gi,
  ];

  const set = new Set<string>();
  for (const pattern of patterns) {
    const matches = text.match(pattern) || [];
    for (const match of matches) set.add(match.toLowerCase());
  }
  return Array.from(set);
}

function detectVisaSponsorship(text: string): "YES" | "NO" | "UNKNOWN" {
  const lower = text.toLowerCase();
  if (/visa sponsorship|sponsor visa|work permit support/.test(lower)) return "YES";
  if (/no visa sponsorship|cannot sponsor|must be authorized to work/.test(lower)) return "NO";
  return "UNKNOWN";
}

function detectSeniority(title: string, description: string): string {
  const bag = `${title} ${description}`.toLowerCase();
  if (/staff|principal|lead/.test(bag)) return "Lead";
  if (/senior|sr\.?/.test(bag)) return "Senior";
  if (/junior|jr\.?|entry/.test(bag)) return "Junior";
  if (/director|vp|head of|chief/.test(bag)) return "Executive";
  return "Mid-level";
}

async function fetchGreenhouse(boardToken: string): Promise<NormalizedATSJob[]> {
  const response = await fetch(
    `https://boards-api.greenhouse.io/v1/boards/${encodeURIComponent(boardToken)}/jobs?content=true`,
    {
      headers: {
        Accept: "application/json",
        "User-Agent": "AfriTalent/1.0",
      },
    },
  );

  if (!response.ok) {
    throw new Error(`Greenhouse request failed: HTTP ${response.status}`);
  }

  const payload = (await response.json()) as {
    jobs: Array<{
      id: number;
      title: string;
      content?: string;
      absolute_url: string;
      updated_at: string;
      location?: { name?: string };
      metadata?: Array<{ name: string; value: string }>;
    }>;
  };

  return payload.jobs.map((job) => {
    const description = stripHtml(job.content || "");
    const employmentMeta = job.metadata?.find((item) => /employment|type/i.test(item.name));
    const commitment = (employmentMeta?.value || "").toLowerCase();

    return {
      externalId: `greenhouse-${boardToken}-${job.id}`,
      title: job.title,
      description,
      location: normalizeLocation(job.location?.name),
      type: commitment.includes("part")
        ? "PART_TIME"
        : commitment.includes("contract")
          ? "CONTRACT"
          : commitment.includes("intern")
            ? "INTERNSHIP"
            : "FULL_TIME",
      seniority: detectSeniority(job.title, description),
      tags: extractSkills(description),
      visaSponsorship: detectVisaSponsorship(description),
      relocationAssistance: /relocat/i.test(description),
      eligibleCountries: [],
      sourceUrl: job.absolute_url,
      postedAt: new Date(job.updated_at),
      rawData: { provider: "GREENHOUSE", boardToken },
    };
  });
}

async function fetchLever(siteToken: string): Promise<NormalizedATSJob[]> {
  const response = await fetch(
    `https://api.lever.co/v0/postings/${encodeURIComponent(siteToken)}?mode=json`,
    {
      headers: {
        Accept: "application/json",
        "User-Agent": "AfriTalent/1.0",
      },
    },
  );

  if (!response.ok) {
    throw new Error(`Lever request failed: HTTP ${response.status}`);
  }

  const payload = (await response.json()) as Array<{
    id: string;
    text: string;
    description?: string;
    descriptionPlain?: string;
    hostedUrl?: string;
    applyUrl?: string;
    createdAt?: number;
    categories?: {
      location?: string;
      commitment?: string;
      team?: string;
    };
  }>;

  return payload.map((job) => {
    const description = stripHtml(job.descriptionPlain || job.description || "");
    const commitment = (job.categories?.commitment || "").toLowerCase();
    const sourceUrl = job.hostedUrl || job.applyUrl || `https://jobs.lever.co/${siteToken}`;

    return {
      externalId: `lever-${siteToken}-${job.id}`,
      title: job.text,
      description,
      location: normalizeLocation(job.categories?.location),
      type: commitment.includes("part")
        ? "PART_TIME"
        : commitment.includes("contract")
          ? "CONTRACT"
          : commitment.includes("intern")
            ? "INTERNSHIP"
            : "FULL_TIME",
      seniority: detectSeniority(job.text, description),
      tags: extractSkills(description),
      visaSponsorship: detectVisaSponsorship(description),
      relocationAssistance: /relocat/i.test(description),
      eligibleCountries: [],
      sourceUrl,
      postedAt: job.createdAt ? new Date(job.createdAt) : undefined,
      rawData: { provider: "LEVER", siteToken, team: job.categories?.team },
    };
  });
}

async function fetchWorkable(accountSlug: string, accessToken?: string | null): Promise<NormalizedATSJob[]> {
  if (!accessToken) {
    throw new Error("Workable requires an access token");
  }

  const response = await fetch(`https://${accountSlug}.workable.com/spi/v3/jobs?state=published&limit=100`, {
    headers: {
      Accept: "application/json",
      Authorization: `Bearer ${accessToken}`,
      "User-Agent": "AfriTalent/1.0",
    },
  });

  if (!response.ok) {
    throw new Error(`Workable request failed: HTTP ${response.status}`);
  }

  const payload = (await response.json()) as {
    jobs: Array<{
      shortcode: string;
      title: string;
      description?: string;
      code?: string;
      location?: { location_str?: string };
      employment_type?: string;
      account?: { subdomain?: string };
      url?: string;
      created_at?: string;
      updated_at?: string;
    }>;
  };

  return payload.jobs.map((job) => {
    const description = stripHtml(job.description || "");

    return {
      externalId: `workable-${accountSlug}-${job.shortcode || job.code || job.title}`,
      title: job.title,
      description,
      location: normalizeLocation(job.location?.location_str),
      type: (job.employment_type || "FULL_TIME").toUpperCase(),
      seniority: detectSeniority(job.title, description),
      tags: extractSkills(description),
      visaSponsorship: detectVisaSponsorship(description),
      relocationAssistance: /relocat/i.test(description),
      eligibleCountries: [],
      sourceUrl: job.url || `https://${accountSlug}.workable.com`,
      postedAt: job.updated_at ? new Date(job.updated_at) : job.created_at ? new Date(job.created_at) : undefined,
      rawData: { provider: "WORKABLE", accountSlug, account: job.account?.subdomain },
    };
  });
}

export async function fetchAtsJobs(params: {
  provider: ATSProvider;
  externalOrgId: string;
  accessToken?: string | null;
}): Promise<NormalizedATSJob[]> {
  switch (params.provider) {
    case "GREENHOUSE":
      return fetchGreenhouse(params.externalOrgId);
    case "LEVER":
      return fetchLever(params.externalOrgId);
    case "WORKABLE":
      return fetchWorkable(params.externalOrgId, params.accessToken);
    default:
      return [];
  }
}
