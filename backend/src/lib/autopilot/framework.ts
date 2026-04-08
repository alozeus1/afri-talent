import {
  CandidateAgentTaskStatus,
  CandidateAgentTaskType,
  CandidateAutomationLevel,
  Prisma,
  ResumeVersionSource,
  ResumeVersionStatus,
  SubscriptionPlan,
  type Application,
  type CandidateAutopilotProfile,
  type CandidateProfile,
  type Job,
  type User,
} from "@prisma/client";
import prisma from "../prisma.js";
import { getUserEntitlements } from "../billing/entitlements.js";

type JsonRecord = Record<string, unknown>;

type StructuredWorkHistoryItem = {
  company?: string | null;
  title?: string | null;
  period?: string | null;
  description?: string | null;
};

type StructuredEducationItem = {
  institution?: string | null;
  degree?: string | null;
  period?: string | null;
};

type StructuredCertificationItem = {
  name?: string | null;
  issuer?: string | null;
  credentialUrl?: string | null;
};

export interface ResumeBuildInput {
  user: Pick<User, "id" | "name" | "email">;
  profile: CandidateProfile;
  job?: Pick<Job, "id" | "title" | "description" | "tags" | "sourceName"> | null;
  source?: ResumeVersionSource;
  aiRunId?: string | null;
  autopilotProfileId?: string | null;
}

export interface FollowUpDraft {
  taskId: string;
  cadenceDays: number;
  subject: string;
  body: string;
  timingGuidance: string;
  needsHumanReview: boolean;
}

export interface InterviewPrepPack {
  taskId: string;
  focusAreas: string[];
  likelyQuestions: string[];
  candidateStories: string[];
  recruiterReplyDraft: string;
  schedulingNotes: string[];
}

export interface CandidatePipelineSnapshot {
  settings: CandidateAutopilotProfile;
  latestResumeVersion: {
    id: string;
    title: string;
    status: ResumeVersionStatus;
    targetRole: string | null;
    updatedAt: Date;
  } | null;
  taskSummary: {
    queued: number;
    needsReview: number;
    ready: number;
    completed: number;
  };
}

const DEFAULT_FOLLOW_UP_CADENCE = [3, 7, 14];
const ATS_SOURCE_HOST_FRAGMENTS = [
  "greenhouse.io",
  "lever.co",
  "workable.com",
  "jobvite.com",
  "ashbyhq.com",
];

function asArray<T>(value: unknown): T[] {
  return Array.isArray(value) ? (value as T[]) : [];
}

function compactText(value?: string | null): string | null {
  const normalized = value?.trim();
  return normalized ? normalized : null;
}

function unique(values: Array<string | null | undefined>): string[] {
  return Array.from(new Set(values.map((value) => compactText(value)).filter(Boolean) as string[]));
}

function truncate(value: string, max: number): string {
  return value.length > max ? `${value.slice(0, max - 1)}…` : value;
}

function readWorkHistory(profile: CandidateProfile): StructuredWorkHistoryItem[] {
  return asArray<StructuredWorkHistoryItem>(profile.workHistory);
}

function readEducationHistory(profile: CandidateProfile): StructuredEducationItem[] {
  return asArray<StructuredEducationItem>(profile.educationHistory);
}

function readCertifications(profile: CandidateProfile): StructuredCertificationItem[] {
  return asArray<StructuredCertificationItem>(profile.certifications);
}

function extractKeywordsFromJob(job?: Pick<Job, "title" | "description" | "tags"> | null): string[] {
  if (!job) return [];

  const bag = `${job.title}\n${job.description}\n${(job.tags || []).join(" ")}`.toLowerCase();
  const candidates = [
    "typescript",
    "javascript",
    "react",
    "node",
    "python",
    "java",
    "go",
    "kubernetes",
    "terraform",
    "aws",
    "gcp",
    "azure",
    "postgres",
    "machine learning",
    "data engineering",
    "product management",
    "system design",
    "microservices",
    "security",
    "devops",
    "site reliability",
  ];

  return candidates.filter((candidate) => bag.includes(candidate)).slice(0, 12);
}

function buildProfessionalSummary(input: ResumeBuildInput, highlightedKeywords: string[]): string {
  const parts: string[] = [];
  if (input.profile.headline) parts.push(input.profile.headline);
  if (input.profile.bio) parts.push(input.profile.bio);

  const experienceText =
    input.profile.yearsExperience != null
      ? `${input.profile.yearsExperience}+ years of experience`
      : null;
  if (experienceText) parts.push(experienceText);

  if (highlightedKeywords.length > 0) {
    parts.push(`Recent focus: ${highlightedKeywords.slice(0, 5).join(", ")}`);
  }

  return truncate(parts.filter(Boolean).join(". "), 900);
}

function buildPlainTextResume(input: ResumeBuildInput, highlightedKeywords: string[]): string {
  const workHistory = readWorkHistory(input.profile);
  const educationHistory = readEducationHistory(input.profile);
  const certifications = readCertifications(input.profile);
  const lines: string[] = [];

  lines.push(input.user.name);
  if (input.profile.headline) lines.push(input.profile.headline);
  lines.push(
    unique([
      input.profile.linkedinUrl,
      input.profile.githubUrl,
      input.profile.portfolioUrl,
      input.user.email,
    ]).join(" | "),
  );
  lines.push("");
  lines.push("PROFESSIONAL SUMMARY");
  lines.push(buildProfessionalSummary(input, highlightedKeywords));
  lines.push("");

  if (input.profile.skills.length > 0) {
    lines.push("CORE SKILLS");
    lines.push(unique([...highlightedKeywords, ...input.profile.skills]).join(" • "));
    lines.push("");
  }

  if (workHistory.length > 0) {
    lines.push("EXPERIENCE");
    for (const item of workHistory) {
      lines.push(
        [item.title, item.company].filter(Boolean).join(" | ") || "Experience",
      );
      if (item.period) lines.push(item.period);
      if (item.description) lines.push(item.description);
      lines.push("");
    }
  }

  if (educationHistory.length > 0) {
    lines.push("EDUCATION");
    for (const item of educationHistory) {
      lines.push(
        [item.institution, item.degree, item.period].filter(Boolean).join(" | "),
      );
    }
    lines.push("");
  }

  if (certifications.length > 0) {
    lines.push("CERTIFICATIONS");
    for (const item of certifications) {
      lines.push([item.name, item.issuer].filter(Boolean).join(" | "));
    }
    lines.push("");
  }

  return lines.join("\n").trim();
}

function buildStructuredResumeContent(input: ResumeBuildInput, highlightedKeywords: string[]): JsonRecord {
  const workHistory = readWorkHistory(input.profile);
  const educationHistory = readEducationHistory(input.profile);
  const certifications = readCertifications(input.profile);

  return {
    identity: {
      name: input.user.name,
      headline: input.profile.headline,
      email: input.user.email,
      linkedinUrl: input.profile.linkedinUrl,
      githubUrl: input.profile.githubUrl,
      portfolioUrl: input.profile.portfolioUrl,
      location: input.profile.targetCountries[0] ?? null,
    },
    summary: buildProfessionalSummary(input, highlightedKeywords),
    highlightedKeywords,
    skills: unique([...highlightedKeywords, ...input.profile.skills]),
    workHistory,
    educationHistory,
    certifications,
    targetRole: input.job?.title ?? input.profile.targetRoles[0] ?? null,
  };
}

export function buildTaskTitle(type: CandidateAgentTaskType, jobTitle?: string | null): string {
  switch (type) {
    case CandidateAgentTaskType.RESUME_REFRESH:
      return "Refresh autonomous resume";
    case CandidateAgentTaskType.APPLY_PACK:
      return jobTitle ? `Prepare apply pack for ${jobTitle}` : "Prepare apply pack";
    case CandidateAgentTaskType.FOLLOW_UP:
      return jobTitle ? `Draft follow-up for ${jobTitle}` : "Draft follow-up";
    case CandidateAgentTaskType.INTERVIEW_PREP:
      return jobTitle ? `Build interview prep for ${jobTitle}` : "Build interview prep";
    case CandidateAgentTaskType.SCHEDULING:
      return jobTitle ? `Prepare scheduling response for ${jobTitle}` : "Prepare scheduling response";
    default:
      return "Candidate agent task";
  }
}

function normalizeCadence(value: number[] | null | undefined): number[] {
  const source = Array.isArray(value) && value.length > 0 ? value : DEFAULT_FOLLOW_UP_CADENCE;
  return Array.from(new Set(source.map((item) => Math.max(1, Math.min(30, Math.round(item)))))).sort((a, b) => a - b);
}

function describeApplicationPath(job: Pick<Job, "applicationUrl" | "sourceUrl">): string {
  const url = job.applicationUrl || job.sourceUrl || "";
  const normalized = url.toLowerCase();
  if (ATS_SOURCE_HOST_FRAGMENTS.some((fragment) => normalized.includes(fragment))) {
    return "direct ATS";
  }
  if (normalized.includes("mailto:")) {
    return "direct recruiter email";
  }
  return "external application path";
}

function hasResumeBuilderAccess(plan: SubscriptionPlan): boolean {
  return plan === SubscriptionPlan.BASIC || plan === SubscriptionPlan.PROFESSIONAL;
}

function hasInterviewPrepAccess(plan: SubscriptionPlan, videoMockInterviews: number | null): boolean {
  return plan !== SubscriptionPlan.FREE && (videoMockInterviews ?? 0) !== 0;
}

export async function ensureCandidateAutopilotProfile(userId: string): Promise<CandidateAutopilotProfile> {
  const entitlements = await getUserEntitlements(userId);
  return prisma.candidateAutopilotProfile.upsert({
    where: { userId },
    create: {
      userId,
      enabled: entitlements.autopilot,
      automationLevel: entitlements.autopilot ? CandidateAutomationLevel.AUTONOMOUS : CandidateAutomationLevel.ASSISTED,
      autoApplyEnabled: entitlements.autopilot,
      followUpCadenceDays: DEFAULT_FOLLOW_UP_CADENCE,
      resumeBuilderEnabled: hasResumeBuilderAccess(entitlements.plan),
      followUpEnabled: entitlements.autopilot,
      interviewPrepEnabled: hasInterviewPrepAccess(entitlements.plan, entitlements.videoMockInterviews),
      schedulingEnabled: entitlements.autopilot,
      preferredTone: "professional",
      searchStrategy: {
        prioritizeTrustedSources: true,
        prioritizeRemoteRoles: true,
      } as Prisma.InputJsonValue,
    },
    update: {},
  });
}

export async function buildResumeVersion(input: ResumeBuildInput) {
  const highlightedKeywords = extractKeywordsFromJob(input.job);
  const profile = await ensureCandidateAutopilotProfile(input.user.id);
  const content = buildStructuredResumeContent(input, highlightedKeywords);
  const plainText = buildPlainTextResume(input, highlightedKeywords);
  const targetRole = input.job?.title ?? input.profile.targetRoles[0] ?? null;
  const title = targetRole ? `Autonomous resume · ${targetRole}` : "Autonomous master resume";
  const score = Math.min(
    100,
    48 +
      Math.min(20, input.profile.profileCompleteness / 2) +
      Math.min(12, input.profile.skills.length) +
      Math.min(10, highlightedKeywords.length * 2),
  );

  return prisma.candidateResumeVersion.create({
    data: {
      userId: input.user.id,
      autopilotProfileId: profile.id,
      profileId: input.profile.id,
      jobId: input.job?.id ?? null,
      aiRunId: input.aiRunId ?? null,
      source: input.source ?? ResumeVersionSource.PROFILE_SYNTHESIS,
      status: highlightedKeywords.length > 0 ? ResumeVersionStatus.READY : ResumeVersionStatus.NEEDS_REVIEW,
      title,
      targetRole,
      summary: buildProfessionalSummary(input, highlightedKeywords),
      content: content as Prisma.InputJsonValue,
      plainText,
      keywords: unique([...highlightedKeywords, ...input.profile.skills]).slice(0, 20),
      score,
      notes: highlightedKeywords.length > 0
        ? [`Prioritized for ${targetRole}`, `Focused on keywords: ${highlightedKeywords.slice(0, 6).join(", ")}`]
        : ["Generated from candidate profile data", "Add a target job to tailor this resume automatically"],
    },
  });
}

export async function queueCandidateAgentTask(input: {
  userId: string;
  type: CandidateAgentTaskType;
  jobId?: string | null;
  applicationId?: string | null;
  aiRunId?: string | null;
  resumeVersionId?: string | null;
  priority?: number;
  title?: string;
  summary?: string | null;
  inputSnapshot?: JsonRecord | null;
  outputSummary?: JsonRecord | null;
  outputPayload?: JsonRecord | null;
  status?: CandidateAgentTaskStatus;
  scheduledFor?: Date | null;
}) {
  const profile = await ensureCandidateAutopilotProfile(input.userId);

  return prisma.candidateAgentTask.create({
    data: {
      userId: input.userId,
      autopilotProfileId: profile.id,
      jobId: input.jobId ?? null,
      applicationId: input.applicationId ?? null,
      aiRunId: input.aiRunId ?? null,
      resumeVersionId: input.resumeVersionId ?? null,
      type: input.type,
      status: input.status ?? CandidateAgentTaskStatus.READY,
      priority: input.priority ?? 50,
      title: input.title ?? buildTaskTitle(input.type),
      summary: input.summary ?? null,
      inputSnapshot: input.inputSnapshot ? (input.inputSnapshot as Prisma.InputJsonValue) : undefined,
      outputSummary: input.outputSummary ? (input.outputSummary as Prisma.InputJsonValue) : undefined,
      outputPayload: input.outputPayload ? (input.outputPayload as Prisma.InputJsonValue) : undefined,
      scheduledFor: input.scheduledFor ?? null,
      completedAt:
        input.status === CandidateAgentTaskStatus.READY ||
        input.status === CandidateAgentTaskStatus.SENT ||
        input.status === CandidateAgentTaskStatus.COMPLETED
          ? new Date()
          : null,
    },
  });
}

export async function buildFollowUpDraft(input: {
  user: Pick<User, "id" | "name">;
  application: Pick<Application, "id" | "createdAt" | "status">;
  job: Pick<Job, "id" | "title" | "sourceName" | "applicationUrl" | "sourceUrl">;
}): Promise<FollowUpDraft[]> {
  const profile = await ensureCandidateAutopilotProfile(input.user.id);
  const cadence = normalizeCadence(profile.followUpCadenceDays);
  const applicationPath = describeApplicationPath(input.job);

  const drafts: FollowUpDraft[] = [];
  for (const cadenceDays of cadence) {
    const subject = `${input.user.name} · follow-up on ${input.job.title}`;
    const body = [
      `Hello ${input.job.sourceName || "hiring team"},`,
      "",
      `I wanted to follow up on my application for ${input.job.title}. I remain strongly interested in the role and wanted to reiterate my fit for the position.`,
      "",
      `If helpful, I can share a refreshed resume, clarify relevant experience, or provide availability for the next step.`,
      "",
      `Thank you for your time,`,
      input.user.name,
    ].join("\n");

    const task = await queueCandidateAgentTask({
      userId: input.user.id,
      type: CandidateAgentTaskType.FOLLOW_UP,
      jobId: input.job.id,
      applicationId: input.application.id,
      priority: 55,
      title: buildTaskTitle(CandidateAgentTaskType.FOLLOW_UP, input.job.title),
      summary: `Follow up ${cadenceDays} day${cadenceDays === 1 ? "" : "s"} after applying via ${applicationPath}.`,
      status: CandidateAgentTaskStatus.READY,
      scheduledFor: new Date(input.application.createdAt.getTime() + cadenceDays * 86400000),
      outputSummary: {
        cadenceDays,
        channel: applicationPath,
      },
      outputPayload: {
        subject,
        body,
        cadenceDays,
      },
    });

    drafts.push({
      taskId: task.id,
      cadenceDays,
      subject,
      body,
      timingGuidance: `Send around day ${cadenceDays} if the employer has not replied yet.`,
      needsHumanReview: true,
    });
  }

  return drafts;
}

export async function buildInterviewPrepPack(input: {
  user: Pick<User, "id" | "name">;
  profile: CandidateProfile;
  application: Pick<Application, "id" | "status">;
  job: Pick<Job, "id" | "title" | "description" | "tags" | "sourceName">;
}): Promise<InterviewPrepPack> {
  const highlightedKeywords = extractKeywordsFromJob(input.job);
  const workHistory = readWorkHistory(input.profile);
  const focusAreas = unique([
    input.job.title,
    ...highlightedKeywords,
    ...(input.job.tags || []).slice(0, 6),
  ]).slice(0, 6);

  const likelyQuestions = [
    `What makes you a strong fit for ${input.job.title}?`,
    `Tell us about a project where you applied ${focusAreas[1] || "your core skills"} in production.`,
    `How do you prioritize quality, delivery speed, and communication in remote teams?`,
    `What would your first 90 days look like in this role?`,
  ];

  const candidateStories = workHistory
    .slice(0, 3)
    .map((item) => [item.title, item.company, item.description].filter(Boolean).join(" — "))
    .filter(Boolean);

  const recruiterReplyDraft = [
    `Hello ${input.job.sourceName || "team"},`,
    "",
    `Thank you for moving my application for ${input.job.title} forward.`,
    `I’m available for interview conversations and can adjust to your preferred schedule.`,
    "",
    `Best,`,
    input.user.name,
  ].join("\n");

  const schedulingNotes = [
    "Share 3 concrete time windows in your local timezone.",
    "Confirm whether the interview is live coding, behavioral, or case-based.",
    "Ask for the interview format and names of interviewers if not already provided.",
  ];

  const task = await queueCandidateAgentTask({
    userId: input.user.id,
    type: CandidateAgentTaskType.INTERVIEW_PREP,
    jobId: input.job.id,
    applicationId: input.application.id,
    priority: 70,
    title: buildTaskTitle(CandidateAgentTaskType.INTERVIEW_PREP, input.job.title),
    summary: `Interview prep pack for ${input.job.title}.`,
    status: CandidateAgentTaskStatus.READY,
    outputSummary: {
      focusAreas,
      likelyQuestionsCount: likelyQuestions.length,
    },
    outputPayload: {
      focusAreas,
      likelyQuestions,
      candidateStories,
      recruiterReplyDraft,
      schedulingNotes,
    },
  });

  return {
    taskId: task.id,
    focusAreas,
    likelyQuestions,
    candidateStories,
    recruiterReplyDraft,
    schedulingNotes,
  };
}

export async function getCandidatePipelineSnapshot(userId: string): Promise<CandidatePipelineSnapshot> {
  const settings = await ensureCandidateAutopilotProfile(userId);
  const [latestResumeVersion, taskCounts] = await Promise.all([
    prisma.candidateResumeVersion.findFirst({
      where: { userId },
      orderBy: [{ isPrimary: "desc" }, { updatedAt: "desc" }],
      select: {
        id: true,
        title: true,
        status: true,
        targetRole: true,
        updatedAt: true,
      },
    }),
    prisma.candidateAgentTask.groupBy({
      by: ["status"],
      where: { userId },
      _count: { _all: true },
    }),
  ]);

  const statusMap = new Map(taskCounts.map((entry) => [entry.status, entry._count._all]));
  return {
    settings,
    latestResumeVersion,
    taskSummary: {
      queued: statusMap.get(CandidateAgentTaskStatus.QUEUED) || 0,
      needsReview: statusMap.get(CandidateAgentTaskStatus.NEEDS_REVIEW) || 0,
      ready: statusMap.get(CandidateAgentTaskStatus.READY) || 0,
      completed:
        (statusMap.get(CandidateAgentTaskStatus.COMPLETED) || 0) +
        (statusMap.get(CandidateAgentTaskStatus.SENT) || 0),
    },
  };
}
