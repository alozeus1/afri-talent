import crypto from "crypto";
import { ATSProvider, ApplicationStatus } from "@prisma/client";

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

export interface AtsProviderCapabilities {
  provider: ATSProvider;
  label: string;
  jobImportSupported: boolean;
  jobImportReady: boolean;
  webhookSupported: boolean;
  webhookReady: boolean;
  stageWritebackSupported: boolean;
  stageWritebackReady: boolean;
  notes: string[];
}

export interface NormalizedAtsWebhookEvent {
  eventKey: string | null;
  eventType: string;
  externalApplicationId: string | null;
  externalCandidateId: string | null;
  externalJobId: string | null;
  stageId: string | null;
  stageName: string | null;
  shouldTriggerJobSync: boolean;
  isStageChangeEvent: boolean;
}

export interface AtsStageUpdateParams {
  provider: ATSProvider;
  externalOrgId: string;
  accessToken?: string | null;
  externalApplicationId?: string | null;
  externalCandidateId?: string | null;
  currentStageId?: string | null;
  targetStageId?: string | null;
  targetStageName?: string | null;
  metadata?: Record<string, unknown> | null;
}

export interface AtsStageUpdateResult {
  ok: boolean;
  mode: "api" | "manual";
  provider: ATSProvider;
  externalStageId?: string | null;
  externalStageName?: string | null;
  message: string;
  responseBody?: Record<string, unknown> | null;
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
    for (const match of matches) {
      set.add(match.toLowerCase());
    }
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

function providerAuthHeader(token: string): string {
  return `Basic ${Buffer.from(`${token}:`).toString("base64")}`;
}

function bearerOrBasicLeverAuthHeader(token: string): string {
  if (token.startsWith("Bearer ")) {
    return token;
  }

  const looksLikeJwt = token.split(".").length === 3 || token.startsWith("eyJ");
  if (looksLikeJwt) {
    return `Bearer ${token}`;
  }

  return providerAuthHeader(token);
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function getNestedValue(source: unknown, path: string[]): unknown {
  let cursor = source;
  for (const segment of path) {
    if (Array.isArray(cursor)) {
      const index = Number(segment);
      if (!Number.isInteger(index)) {
        return undefined;
      }
      cursor = cursor[index];
      continue;
    }

    if (!cursor || typeof cursor !== "object") {
      return undefined;
    }
    cursor = (cursor as Record<string, unknown>)[segment];
  }
  return cursor;
}

function getNestedString(source: unknown, candidatePaths: string[][]): string | null {
  for (const path of candidatePaths) {
    const value = getNestedValue(source, path);
    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
    if (typeof value === "number") {
      return value.toString();
    }
  }
  return null;
}

function hasStageMappings(metadata?: Record<string, unknown> | null): boolean {
  const mappings = asRecord(metadata?.stageMappings);
  return Object.keys(mappings).length > 0;
}

function requiresServiceUser(provider: ATSProvider): boolean {
  return provider === "GREENHOUSE" || provider === "WORKABLE";
}

function hasServiceUser(metadata?: Record<string, unknown> | null): boolean {
  return typeof metadata?.performAsUserId === "string" && metadata.performAsUserId.trim().length > 0;
}

export function providerLabel(provider: ATSProvider): string {
  switch (provider) {
    case "GREENHOUSE":
      return "Greenhouse";
    case "LEVER":
      return "Lever";
    case "WORKABLE":
      return "Workable";
    default:
      return provider;
  }
}

export function getAtsProviderCapabilities(params: {
  provider: ATSProvider;
  accessTokenPresent: boolean;
  webhookSecretPresent: boolean;
  metadata?: Record<string, unknown> | null;
  twoWaySyncEnabled?: boolean;
  webhookSyncEnabled?: boolean;
}): AtsProviderCapabilities {
  const metadata = params.metadata ?? null;
  const notes: string[] = [];
  const stageMappingsReady = hasStageMappings(metadata);
  const serviceUserReady = !requiresServiceUser(params.provider) || hasServiceUser(metadata);
  const stageWritebackSupported = true;
  const stageWritebackReady =
    Boolean(params.twoWaySyncEnabled)
    && params.accessTokenPresent
    && stageMappingsReady
    && serviceUserReady;
  const jobImportSupported = true;
  const jobImportReady = params.provider === "WORKABLE" ? params.accessTokenPresent : true;
  const webhookSupported = true;
  const webhookReady = Boolean(params.webhookSyncEnabled) && params.webhookSecretPresent;

  if (!jobImportReady) {
    notes.push("Add an API token to enable job import for this provider.");
  }
  if (Boolean(params.webhookSyncEnabled) && !params.webhookSecretPresent) {
    notes.push("Store a webhook secret so inbound events can be verified.");
  }
  if (Boolean(params.twoWaySyncEnabled) && !params.accessTokenPresent) {
    notes.push("Add an API token with write access before enabling stage writeback.");
  }
  if (Boolean(params.twoWaySyncEnabled) && !stageMappingsReady) {
    notes.push("Add stage mappings so AfriTalent statuses can be translated into ATS stages.");
  }
  if (Boolean(params.twoWaySyncEnabled) && !serviceUserReady) {
    notes.push("Add a service user / member ID so provider APIs can perform stage changes on behalf of your team.");
  }

  return {
    provider: params.provider,
    label: providerLabel(params.provider),
    jobImportSupported,
    jobImportReady,
    webhookSupported,
    webhookReady,
    stageWritebackSupported,
    stageWritebackReady,
    notes,
  };
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
      externalId: job.id.toString(),
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
      externalId: job.id,
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
      externalId: job.shortcode || job.code || job.title,
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

export function verifyAtsWebhookSignature(params: {
  provider: ATSProvider;
  secret: string;
  rawBody: string;
  headers: Record<string, string | string[] | undefined>;
}): boolean {
  if (params.provider !== "GREENHOUSE") {
    return false;
  }

  const signatureHeader = params.headers.signature;
  const rawSignature = Array.isArray(signatureHeader) ? signatureHeader[0] : signatureHeader;
  if (!rawSignature) {
    return false;
  }

  const [algorithm, signature] = rawSignature.split(" ");
  if (algorithm !== "sha256" || !signature) {
    return false;
  }

  const computed = crypto
    .createHmac("sha256", params.secret)
    .update(params.rawBody)
    .digest("hex");

  return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(computed));
}

export function normalizeAtsWebhookPayload(params: {
  provider: ATSProvider;
  headers: Record<string, string | string[] | undefined>;
  body: unknown;
}): NormalizedAtsWebhookEvent {
  const body = asRecord(params.body);
  const payload = asRecord(body.payload);
  const headerEvent = params.headers["x-event-type"];
  const rawHeaderEvent = Array.isArray(headerEvent) ? headerEvent[0] : headerEvent;
  const eventType = (
    rawHeaderEvent
    || getNestedString(body, [["action"], ["type"], ["event"], ["trigger"], ["event_type"]])
    || "unknown"
  ).trim();
  const eventKey =
    (Array.isArray(params.headers["greenhouse-event-id"]) ? params.headers["greenhouse-event-id"][0] : params.headers["greenhouse-event-id"])
    || getNestedString(body, [["id"], ["event_id"], ["request_id"], ["delivery_id"]])
    || null;
  const combined = { ...body, payload };
  const stageName = getNestedString(combined, [
    ["payload", "application", "current_stage", "name"],
    ["payload", "stage", "name"],
    ["payload", "stage", "text"],
    ["payload", "toStageName"],
    ["payload", "to_stage"],
    ["payload", "target_stage"],
    ["payload", "stage"],
    ["application", "current_stage", "name"],
    ["stage", "name"],
    ["stage"],
  ]);
  const stageId = getNestedString(combined, [
    ["payload", "application", "current_stage", "id"],
    ["payload", "stage", "id"],
    ["payload", "toStageId"],
    ["payload", "to_stage_id"],
    ["payload", "stageId"],
    ["application", "current_stage", "id"],
    ["stage", "id"],
  ]);
  const externalApplicationId = getNestedString(combined, [
    ["payload", "application", "id"],
    ["payload", "opportunityId"],
    ["payload", "opportunity", "id"],
    ["payload", "candidate", "application_id"],
    ["payload", "candidate", "application", "id"],
    ["application", "id"],
    ["opportunityId"],
    ["opportunity", "id"],
    ["candidate", "application_id"],
  ]);
  const externalCandidateId = getNestedString(combined, [
    ["payload", "application", "candidate", "id"],
    ["payload", "candidate", "id"],
    ["payload", "candidateId"],
    ["candidate", "id"],
    ["candidateId"],
  ]);
  const externalJobId = getNestedString(combined, [
    ["payload", "application", "jobs", "0", "id"],
    ["payload", "job", "id"],
    ["payload", "jobId"],
    ["job", "id"],
    ["jobId"],
  ]);
  const lowerEvent = eventType.toLowerCase();
  const isStageChangeEvent =
    /stage/i.test(eventType)
    || /candidate_stage_change|application_updated|candidate_moved/i.test(lowerEvent)
    || stageName !== null;
  const shouldTriggerJobSync =
    /job/i.test(lowerEvent)
    || /posting/i.test(lowerEvent)
    || /requisition/i.test(lowerEvent);

  return {
    eventKey,
    eventType,
    externalApplicationId,
    externalCandidateId,
    externalJobId,
    stageId,
    stageName,
    shouldTriggerJobSync,
    isStageChangeEvent,
  };
}

export function mapExternalStageToApplicationStatus(stageName?: string | null): ApplicationStatus | null {
  if (!stageName) {
    return null;
  }

  const normalized = stageName.trim().toLowerCase();
  if (!normalized) {
    return null;
  }

  if (
    normalized.includes("shortlist")
    || normalized.includes("onsite")
    || normalized.includes("panel")
    || normalized.includes("final")
    || normalized.includes("offer")
  ) {
    return ApplicationStatus.SHORTLISTED;
  }

  if (
    normalized.includes("screen")
    || normalized.includes("review")
    || normalized.includes("interview")
    || normalized.includes("assessment")
  ) {
    return ApplicationStatus.REVIEWING;
  }

  if (
    normalized.includes("hire")
    || normalized.includes("accepted")
    || normalized.includes("won")
  ) {
    return ApplicationStatus.ACCEPTED;
  }

  if (
    normalized.includes("reject")
    || normalized.includes("declin")
    || normalized.includes("archive")
    || normalized.includes("disqual")
  ) {
    return ApplicationStatus.REJECTED;
  }

  return null;
}

export function defaultStageLabelForApplicationStatus(status: ApplicationStatus): string {
  switch (status) {
    case ApplicationStatus.REVIEWING:
      return "Review";
    case ApplicationStatus.SHORTLISTED:
      return "Shortlisted";
    case ApplicationStatus.ACCEPTED:
      return "Accepted";
    case ApplicationStatus.REJECTED:
      return "Rejected";
    default:
      return "Applied";
  }
}

async function pushGreenhouseStageUpdate(params: AtsStageUpdateParams): Promise<AtsStageUpdateResult> {
  if (!params.accessToken) {
    return {
      ok: false,
      mode: "manual",
      provider: "GREENHOUSE",
      message: "Greenhouse writeback requires a Harvest API key.",
    };
  }
  if (!params.externalApplicationId || !params.currentStageId || !params.targetStageId) {
    return {
      ok: false,
      mode: "manual",
      provider: "GREENHOUSE",
      message: "Greenhouse writeback requires an external application ID, current stage ID, and target stage ID.",
    };
  }

  const metadata = params.metadata ?? {};
  const performAsUserId =
    typeof metadata.performAsUserId === "string" && metadata.performAsUserId.trim().length > 0
      ? metadata.performAsUserId.trim()
      : null;

  if (!performAsUserId) {
    return {
      ok: false,
      mode: "manual",
      provider: "GREENHOUSE",
      message: "Greenhouse writeback requires a performAsUserId in the integration settings.",
    };
  }

  const response = await fetch(
    `https://harvest.greenhouse.io/v1/applications/${encodeURIComponent(params.externalApplicationId)}/move`,
    {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        Authorization: providerAuthHeader(params.accessToken),
        "On-Behalf-Of": performAsUserId,
        "User-Agent": "AfriTalent/1.0",
      },
      body: JSON.stringify({
        from_stage_id: Number(params.currentStageId),
        to_stage_id: Number(params.targetStageId),
      }),
    },
  );

  const payload = (await response.json().catch(() => null)) as Record<string, unknown> | null;
  if (!response.ok) {
    throw new Error(`Greenhouse stage move failed: HTTP ${response.status}`);
  }

  return {
    ok: true,
    mode: "api",
    provider: "GREENHOUSE",
    externalStageId: getNestedString(payload, [["current_stage", "id"]]) ?? params.targetStageId,
    externalStageName: getNestedString(payload, [["current_stage", "name"]]) ?? params.targetStageName,
    message: "Greenhouse application stage updated.",
    responseBody: payload,
  };
}

async function pushLeverStageUpdate(params: AtsStageUpdateParams): Promise<AtsStageUpdateResult> {
  if (!params.accessToken) {
    return {
      ok: false,
      mode: "manual",
      provider: "LEVER",
      message: "Lever writeback requires an API key or OAuth access token.",
    };
  }
  if (!params.externalApplicationId || !params.targetStageId) {
    return {
      ok: false,
      mode: "manual",
      provider: "LEVER",
      message: "Lever writeback requires an opportunity ID and target stage ID.",
    };
  }

  const response = await fetch(
    `https://api.lever.co/v1/opportunities/${encodeURIComponent(params.externalApplicationId)}/stage`,
    {
      method: "PUT",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        Authorization: bearerOrBasicLeverAuthHeader(params.accessToken),
        "User-Agent": "AfriTalent/1.0",
      },
      body: JSON.stringify({
        stage: params.targetStageId,
      }),
    },
  );

  const payload = (await response.json().catch(() => null)) as Record<string, unknown> | null;
  if (!response.ok) {
    throw new Error(`Lever stage update failed: HTTP ${response.status}`);
  }

  return {
    ok: true,
    mode: "api",
    provider: "LEVER",
    externalStageId: getNestedString(payload, [["data", "stage"]]) ?? params.targetStageId,
    externalStageName: params.targetStageName,
    message: "Lever opportunity stage updated.",
    responseBody: payload,
  };
}

async function pushWorkableStageUpdate(params: AtsStageUpdateParams): Promise<AtsStageUpdateResult> {
  if (!params.accessToken) {
    return {
      ok: false,
      mode: "manual",
      provider: "WORKABLE",
      message: "Workable writeback requires an access token with w_candidates scope.",
    };
  }
  if (!params.externalCandidateId || !params.targetStageId) {
    return {
      ok: false,
      mode: "manual",
      provider: "WORKABLE",
      message: "Workable writeback requires a candidate ID and a target stage slug.",
    };
  }

  const metadata = params.metadata ?? {};
  const memberId =
    typeof metadata.performAsUserId === "string" && metadata.performAsUserId.trim().length > 0
      ? metadata.performAsUserId.trim()
      : null;

  if (!memberId) {
    return {
      ok: false,
      mode: "manual",
      provider: "WORKABLE",
      message: "Workable writeback requires a member_id in the integration settings.",
    };
  }

  const response = await fetch(
    `https://${params.externalOrgId}.workable.com/spi/v3/candidates/${encodeURIComponent(params.externalCandidateId)}/move`,
    {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        Authorization: `Bearer ${params.accessToken}`,
        "User-Agent": "AfriTalent/1.0",
      },
      body: JSON.stringify({
        member_id: memberId,
        target_stage: params.targetStageId,
      }),
    },
  );

  const payload = (await response.json().catch(() => null)) as Record<string, unknown> | null;
  if (!response.ok) {
    throw new Error(`Workable candidate move failed: HTTP ${response.status}`);
  }

  return {
    ok: true,
    mode: "api",
    provider: "WORKABLE",
    externalStageId: params.targetStageId,
    externalStageName: params.targetStageName,
    message: "Workable candidate moved to the target stage.",
    responseBody: payload,
  };
}

export async function pushAtsCandidateStageUpdate(params: AtsStageUpdateParams): Promise<AtsStageUpdateResult> {
  switch (params.provider) {
    case "GREENHOUSE":
      return pushGreenhouseStageUpdate(params);
    case "LEVER":
      return pushLeverStageUpdate(params);
    case "WORKABLE":
      return pushWorkableStageUpdate(params);
    default:
      return {
        ok: false,
        mode: "manual",
        provider: params.provider,
        message: "This provider is not supported for stage writeback.",
      };
  }
}
