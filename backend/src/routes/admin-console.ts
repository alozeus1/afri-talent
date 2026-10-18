import { Router, Request, Response, NextFunction } from "express";
import { z } from "zod/v4";
import {
  AbuseReportStatus,
  AccountRestrictionStatus,
  AdminAction,
  AdminPermission,
  EmployerVerificationLevel,
  JobSource,
  JobStatus,
  NotificationType,
  Prisma,
  ReviewStatus,
  ReviewTargetType,
  Role,
  SupportTicketStatus,
  VerificationArtifactStatus,
} from "@prisma/client";
import prisma from "../lib/prisma.js";
import logger from "../lib/logger.js";
import { authenticate, authorize } from "../middleware/auth.js";
import { checkPermission, enforceAdminRbac } from "../middleware/admin-rbac.js";
import { adminMessageEmail, isEmailDeliveryConfigured } from "../lib/email.js";
import { issueEmailVerification } from "./email-verification.js";

// Admin console — premium operator surface for user, company and job
// management. Mounted at /api/admin/console, behind the /api/admin TOTP gate.
// Every endpoint requires: valid JWT (+ account access gate), ADMIN role,
// an active AdminRole, and the per-endpoint AdminPermission. Every mutation
// requires a reason and writes an AuditLog row in the same transaction.

const router = Router();

router.use(authenticate, authorize(Role.ADMIN), enforceAdminRbac);

// ── Shared helpers ──────────────────────────────────────────────────────────

const reasonSchema = z.string().trim().min(3, "A reason of at least 3 characters is required").max(500);

const BROADCAST_MAX_RECIPIENTS = 5_000;
const appUrl = () => process.env.APP_URL || process.env.FRONTEND_URL || "https://afritalent.com";

type Tx = Prisma.TransactionClient;

async function writeAudit(
  tx: Tx,
  req: Request,
  action: AdminAction,
  targetType: string,
  targetId: string,
  data: {
    targetName?: string | null;
    reason?: string | null;
    changes?: Prisma.InputJsonValue;
    extra?: Prisma.InputJsonValue;
  } = {},
) {
  return tx.auditLog.create({
    data: {
      adminId: req.adminRole?.id,
      action,
      targetType,
      targetId,
      targetName: data.targetName?.slice(0, 200) ?? null,
      reason: data.reason ?? null,
      changes: data.changes ?? Prisma.JsonNull,
      metadata: data.extra ?? Prisma.JsonNull,
      ipAddress: req.ip?.slice(0, 50),
      userAgent: req.get("user-agent")?.slice(0, 500),
      status: "SUCCESS",
    },
  });
}

function handleError(res: Response, error: unknown, context: string) {
  if (error instanceof z.ZodError) {
    res.status(400).json({ error: "Validation failed", details: error.issues });
    return;
  }
  logger.error({ err: error instanceof Error ? error.message : error }, `[admin-console] ${context} failed`);
  res.status(500).json({ error: "Internal server error" });
}

function hasPermission(req: Request, permission: AdminPermission): boolean {
  return Boolean(req.adminPermissions?.includes(permission));
}

function requirePermission(req: Request, res: Response, permission: AdminPermission): boolean {
  if (hasPermission(req, permission)) return true;
  res.status(403).json({ error: `Permission required: ${permission}` });
  return false;
}

const asyncRoute =
  (fn: (req: Request, res: Response) => Promise<void>, context: string) =>
  (req: Request, res: Response, _next: NextFunction) =>
    fn(req, res).catch((error) => handleError(res, error, context));

function paginate(page: number, limit: number, total: number) {
  return { page, limit, total, totalPages: Math.max(1, Math.ceil(total / limit)) };
}

// ── Overview KPIs ───────────────────────────────────────────────────────────

router.get(
  "/overview",
  asyncRoute(async (_req, res) => {
    // 14 calendar days (UTC) ending today, inclusive.
    const since14d = new Date();
    since14d.setUTCHours(0, 0, 0, 0);
    since14d.setUTCDate(since14d.getUTCDate() - 13);
    const since7d = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

    const [
      usersByRole,
      usersByStatus,
      jobsByStatus,
      newUsers7d,
      featuredJobs,
      reviewsPending,
      verificationBacklog,
      openAbuseReports,
      unverifiedEmployers,
      applicationRows,
      supportTicketsOpen,
    ] = await Promise.all([
      prisma.user.groupBy({ by: ["role"], where: { deletedAt: null }, _count: { _all: true } }),
      prisma.user.groupBy({ by: ["accountRestrictionStatus"], where: { deletedAt: null }, _count: { _all: true } }),
      prisma.job.groupBy({ by: ["status"], _count: { _all: true } }),
      prisma.user.count({ where: { createdAt: { gte: since7d }, deletedAt: null } }),
      prisma.job.count({ where: { isFeatured: true, status: JobStatus.PUBLISHED } }),
      // Pending = not approved and not rejected (see CompanyReview moderation trail).
      prisma.companyReview.count({ where: { isApproved: false, rejectedAt: null } }),
      prisma.verificationArtifact.count({
        where: { status: { in: [VerificationArtifactStatus.PENDING, VerificationArtifactStatus.NEEDS_MORE_INFO] } },
      }),
      prisma.abuseReport.count({ where: { status: { in: [AbuseReportStatus.OPEN, AbuseReportStatus.TRIAGED] } } }),
      prisma.employer.count({
        where: {
          OR: [{ trustProfile: null }, { trustProfile: { verificationLevel: EmployerVerificationLevel.UNVERIFIED } }],
        },
      }),
      prisma.$queryRaw<Array<{ day: Date; count: number }>>`
        SELECT date_trunc('day', "createdAt") AS day, COUNT(*)::int AS count
        FROM "Application"
        WHERE "createdAt" >= ${since14d}
        GROUP BY 1
        ORDER BY 1`,
      // OPEN = awaiting a first staff response (PENDING waits on the customer).
      prisma.supportTicket.count({ where: { status: SupportTicketStatus.OPEN } }),
    ]);

    const countBy = <K extends string>(rows: Array<Record<string, unknown> & { _count: { _all: number } }>, key: string) =>
      rows.reduce<Record<K, number>>((acc, row) => {
        acc[String(row[key]) as K] = row._count._all;
        return acc;
      }, {} as Record<K, number>);

    const byDay = new Map<string, number>();
    for (const row of applicationRows ?? []) {
      byDay.set(new Date(row.day).toISOString().slice(0, 10), Number(row.count));
    }
    const applicationsPerDay: Array<{ date: string; count: number }> = [];
    for (let i = 0; i < 14; i += 1) {
      const d = new Date(since14d.getTime() + i * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
      applicationsPerDay.push({ date: d, count: byDay.get(d) ?? 0 });
    }

    const roles = countBy<Role>(usersByRole as never, "role");
    const statuses = countBy<AccountRestrictionStatus>(usersByStatus as never, "accountRestrictionStatus");
    const jobs = countBy<JobStatus>(jobsByStatus as never, "status");

    res.json({
      users: {
        total: Object.values(roles).reduce((a, b) => a + b, 0),
        byRole: roles,
        byStatus: statuses,
        newLast7d: newUsers7d,
      },
      jobs: {
        total: Object.values(jobs).reduce((a, b) => a + b, 0),
        byStatus: jobs,
        featured: featuredJobs,
      },
      applications: {
        last14d: applicationsPerDay.reduce((a, b) => a + b.count, 0),
        perDay: applicationsPerDay,
      },
      queues: {
        pendingJobs: jobs[JobStatus.PENDING_REVIEW] ?? 0,
        reviewsPending,
        verificationBacklog,
        openAbuseReports,
        unverifiedEmployers,
        supportTicketsOpen: supportTicketsOpen as number | null,
      },
      emailDeliveryConfigured: isEmailDeliveryConfigured(),
      generatedAt: new Date().toISOString(),
    });
  }, "overview"),
);

// ── Users ───────────────────────────────────────────────────────────────────

const booleanQuery = z
  .enum(["true", "false"])
  .optional()
  .transform((v) => (v === undefined ? undefined : v === "true"));

const userListQuery = z.object({
  role: z.enum(Role).optional(),
  status: z.enum(AccountRestrictionStatus).optional(),
  emailVerified: booleanQuery,
  search: z.string().trim().max(120).optional(),
  sort: z.enum(["newest", "oldest", "name"]).default("newest"),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(25),
});

function buildUserWhere(filters: {
  role?: Role;
  status?: AccountRestrictionStatus;
  emailVerified?: boolean;
  search?: string;
  userIds?: string[];
}): Prisma.UserWhereInput {
  const where: Prisma.UserWhereInput = { deletedAt: null };
  if (filters.role) where.role = filters.role;
  if (filters.status) where.accountRestrictionStatus = filters.status;
  if (filters.emailVerified !== undefined) where.emailVerified = filters.emailVerified;
  if (filters.userIds?.length) where.id = { in: filters.userIds };
  if (filters.search) {
    where.OR = [
      { name: { contains: filters.search, mode: "insensitive" } },
      { email: { contains: filters.search, mode: "insensitive" } },
      { employer: { companyName: { contains: filters.search, mode: "insensitive" } } },
    ];
  }
  return where;
}

const USER_LIST_SELECT = {
  id: true,
  email: true,
  name: true,
  role: true,
  avatarUrl: true,
  emailVerified: true,
  phoneVerifiedAt: true,
  accountRestrictionStatus: true,
  accountRestrictionReason: true,
  accountRestrictedAt: true,
  accountRestrictedUntil: true,
  sessionsRevokedAt: true,
  createdAt: true,
  updatedAt: true,
  employer: {
    select: {
      id: true,
      companyName: true,
      trustProfile: { select: { verificationLevel: true, riskLevel: true } },
    },
  },
  candidateTrustProfile: { select: { verificationLevel: true, riskLevel: true } },
  _count: { select: { applications: true, sentMessages: true } },
} satisfies Prisma.UserSelect;

router.get(
  "/users",
  checkPermission(AdminPermission.VIEW_USERS),
  asyncRoute(async (req, res) => {
    const q = userListQuery.parse(req.query);
    const where = buildUserWhere(q);
    const orderBy: Prisma.UserOrderByWithRelationInput =
      q.sort === "oldest" ? { createdAt: "asc" } : q.sort === "name" ? { name: "asc" } : { createdAt: "desc" };

    const [users, total] = await Promise.all([
      prisma.user.findMany({
        where,
        select: USER_LIST_SELECT,
        orderBy,
        skip: (q.page - 1) * q.limit,
        take: q.limit,
      }),
      prisma.user.count({ where }),
    ]);

    res.json({ users, pagination: paginate(q.page, q.limit, total) });
  }, "list users"),
);

router.get(
  "/users/:id",
  checkPermission(AdminPermission.VIEW_USERS),
  asyncRoute(async (req, res) => {
    const id = String(req.params.id);
    const user = await prisma.user.findUnique({
      where: { id },
      select: {
        ...USER_LIST_SELECT,
        preferredLocale: true,
        emailVerifiedAt: true,
        phoneNumber: true,
        deletionRequestedAt: true,
        totpEnrolledAt: true,
        candidateProfile: {
          select: {
            headline: true,
            skills: true,
            targetRoles: true,
            targetCountries: true,
            yearsExperience: true,
            openToWork: true,
            profileCompleteness: true,
          },
        },
        candidateTrustProfile: {
          select: {
            verificationLevel: true,
            authenticityScore: true,
            riskScore: true,
            riskLevel: true,
            phoneVerifiedAt: true,
            identityVerifiedAt: true,
            linkedinVerified: true,
            githubVerified: true,
          },
        },
        employer: {
          select: {
            id: true,
            companyName: true,
            website: true,
            location: true,
            createdAt: true,
            trustProfile: {
              select: {
                verificationLevel: true,
                authenticityScore: true,
                riskScore: true,
                riskLevel: true,
                postingEligibility: true,
                verifiedDomain: true,
                manualApprovedAt: true,
              },
            },
            _count: { select: { jobs: true } },
          },
        },
        subscription: { select: { plan: true, status: true, currentPeriodEnd: true } },
        adminRole: { select: { title: true, permissions: true, isActive: true } },
        _count: {
          select: {
            applications: true,
            sentMessages: true,
            companyReviews: true,
            savedSearches: true,
            notifications: true,
            abuseReportsAgainst: true,
          },
        },
      },
    });

    if (!user) {
      res.status(404).json({ error: "User not found" });
      return;
    }

    const auditTargetIds = [user.id, ...(user.employer ? [user.employer.id] : [])];

    const [applications, jobs, openReportsAgainst, auditTrail, lastMessage] = await Promise.all([
      prisma.application.findMany({
        where: { candidateId: user.id },
        orderBy: { createdAt: "desc" },
        take: 10,
        select: {
          id: true,
          status: true,
          createdAt: true,
          job: { select: { id: true, title: true, slug: true, sourceName: true, employer: { select: { companyName: true } } } },
        },
      }),
      user.employer
        ? prisma.job.findMany({
            where: { employerId: user.employer.id },
            orderBy: { createdAt: "desc" },
            take: 10,
            select: {
              id: true,
              title: true,
              slug: true,
              status: true,
              isFeatured: true,
              createdAt: true,
              _count: { select: { applications: true } },
            },
          })
        : Promise.resolve([]),
      prisma.abuseReport.count({
        where: {
          OR: [{ reportedUserId: user.id }, ...(user.employer ? [{ employerId: user.employer.id }] : [])],
          status: { in: [AbuseReportStatus.OPEN, AbuseReportStatus.TRIAGED] },
        },
      }),
      prisma.auditLog.findMany({
        where: { targetId: { in: auditTargetIds } },
        orderBy: { createdAt: "desc" },
        take: 50,
        select: {
          id: true,
          action: true,
          targetType: true,
          reason: true,
          changes: true,
          metadata: true,
          status: true,
          createdAt: true,
          admin: { select: { title: true, admin: { select: { id: true, name: true, email: true } } } },
        },
      }),
      prisma.message.findFirst({
        where: { senderId: user.id },
        orderBy: { createdAt: "desc" },
        select: { createdAt: true },
      }),
    ]);

    type ActivityItem = { at: Date; kind: string; label: string };
    const activity: ActivityItem[] = [
      { at: user.createdAt, kind: "ACCOUNT_CREATED", label: "Account created" },
      ...(user.emailVerifiedAt ? [{ at: user.emailVerifiedAt, kind: "EMAIL_VERIFIED", label: "Email verified" }] : []),
      ...(lastMessage ? [{ at: lastMessage.createdAt, kind: "MESSAGE_SENT", label: "Last message sent" }] : []),
      ...applications.map((a) => ({
        at: a.createdAt,
        kind: "APPLICATION",
        label: `Applied to ${a.job.title}`,
      })),
      ...jobs.map((j) => ({ at: j.createdAt, kind: "JOB_POSTED", label: `Posted ${j.title}` })),
    ];
    activity.sort((a, b) => b.at.getTime() - a.at.getTime());

    res.json({
      user,
      applications,
      jobs,
      trust: {
        openReportsAgainst,
        candidate: user.candidateTrustProfile,
        employer: user.employer?.trustProfile ?? null,
      },
      activity: activity.slice(0, 30),
      auditTrail,
    });
  }, "user detail"),
);

// ── Account lifecycle ───────────────────────────────────────────────────────

const lifecycleSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("suspend"),
    reason: reasonSchema,
    until: z.iso.datetime({ offset: true }).optional().nullable(),
  }),
  z.object({ action: z.literal("ban"), reason: reasonSchema }),
  z.object({ action: z.literal("reactivate"), reason: reasonSchema }),
  z.object({ action: z.literal("revoke_sessions"), reason: reasonSchema }),
  z.object({ action: z.literal("force_reverify"), reason: reasonSchema }),
]);

const LIFECYCLE_PERMISSION: Record<z.infer<typeof lifecycleSchema>["action"], AdminPermission> = {
  suspend: AdminPermission.RESTRICT_USER_ACCOUNT,
  ban: AdminPermission.RESTRICT_USER_ACCOUNT,
  reactivate: AdminPermission.RESTRICT_USER_ACCOUNT,
  revoke_sessions: AdminPermission.MANAGE_USER_ACCOUNTS,
  force_reverify: AdminPermission.MANAGE_USER_ACCOUNTS,
};

router.post(
  "/users/:id/lifecycle",
  asyncRoute(async (req, res) => {
    const data = lifecycleSchema.parse(req.body);
    if (!requirePermission(req, res, LIFECYCLE_PERMISSION[data.action])) return;

    const id = String(req.params.id);
    if (id === req.user?.userId) {
      res.status(400).json({ error: "You cannot change the lifecycle of your own account." });
      return;
    }

    const target = await prisma.user.findUnique({
      where: { id },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        emailVerified: true,
        accountRestrictionStatus: true,
        accountRestrictionReason: true,
        accountRestrictedUntil: true,
        deletedAt: true,
      },
    });
    if (!target || target.deletedAt) {
      res.status(404).json({ error: "User not found" });
      return;
    }

    if ((data.action === "suspend" || data.action === "ban") && target.role === Role.ADMIN) {
      res.status(400).json({ error: "Remove admin access before suspending or banning an administrator." });
      return;
    }

    const now = new Date();
    const storedReason = data.reason.slice(0, 160);
    let update: Prisma.UserUpdateInput;
    let action: AdminAction;

    switch (data.action) {
      case "suspend": {
        const until = data.until ? new Date(data.until) : null;
        if (until && until.getTime() <= now.getTime()) {
          res.status(400).json({ error: "Suspension end date must be in the future." });
          return;
        }
        if (target.accountRestrictionStatus === AccountRestrictionStatus.BANNED) {
          res.status(409).json({ error: "Account is banned. Reactivate it before applying a suspension." });
          return;
        }
        update = {
          accountRestrictionStatus: AccountRestrictionStatus.SUSPENDED,
          accountRestrictionReason: storedReason,
          accountRestrictedAt: now,
          accountRestrictedUntil: until,
        };
        action = AdminAction.USER_SUSPENDED;
        break;
      }
      case "ban":
        if (target.accountRestrictionStatus === AccountRestrictionStatus.BANNED) {
          res.status(409).json({ error: "Account is already banned." });
          return;
        }
        update = {
          accountRestrictionStatus: AccountRestrictionStatus.BANNED,
          accountRestrictionReason: storedReason,
          accountRestrictedAt: now,
          accountRestrictedUntil: null,
          sessionsRevokedAt: now,
        };
        action = AdminAction.USER_BANNED;
        break;
      case "reactivate":
        if (target.accountRestrictionStatus === AccountRestrictionStatus.ACTIVE) {
          res.status(409).json({ error: "Account is already active." });
          return;
        }
        update = {
          accountRestrictionStatus: AccountRestrictionStatus.ACTIVE,
          accountRestrictionReason: null,
          accountRestrictedAt: null,
          accountRestrictedUntil: null,
        };
        action = AdminAction.USER_REACTIVATED;
        break;
      case "revoke_sessions":
        update = { sessionsRevokedAt: now };
        action = AdminAction.USER_SESSIONS_REVOKED;
        break;
      case "force_reverify":
        update = { emailVerified: false, emailVerifiedAt: null };
        action = AdminAction.USER_EMAIL_REVERIFICATION_FORCED;
        break;
    }

    const updated = await prisma.$transaction(async (tx) => {
      const result = await tx.user.update({ where: { id: target.id }, data: update, select: USER_LIST_SELECT });
      await writeAudit(tx, req, action, "USER", target.id, {
        targetName: target.email,
        reason: data.reason,
        changes: {
          accountRestrictionStatus: { from: target.accountRestrictionStatus, to: result.accountRestrictionStatus },
          emailVerified: { from: target.emailVerified, to: result.emailVerified },
          accountRestrictedUntil: {
            from: target.accountRestrictedUntil?.toISOString() ?? null,
            to: result.accountRestrictedUntil?.toISOString() ?? null,
          },
        },
        extra: { lifecycleAction: data.action },
      });
      return result;
    });

    if (data.action === "force_reverify") {
      void issueEmailVerification({
        userId: target.id,
        email: target.email,
        name: target.name,
        invalidateExisting: true,
      }).catch((error: unknown) => {
        logger.warn(
          { userId: target.id.slice(0, 8), err: error instanceof Error ? error.message : "unknown" },
          "[admin-console] re-verification email dispatch failed",
        );
      });
    }

    res.json({ user: updated, action: data.action });
  }, "user lifecycle"),
);

// ── Messaging ───────────────────────────────────────────────────────────────

const messageSchema = z.object({
  subject: z.string().trim().min(3).max(140),
  body: z.string().trim().min(1).max(4000),
  sendEmail: z.boolean().default(true),
});

type EmailOutcome = "queued" | "skipped_not_configured" | "not_requested";

function dispatchAdminEmail(
  recipients: Array<{ id: string; email: string; name: string }>,
  subject: string,
  body: string,
  sendEmail: boolean,
): EmailOutcome {
  if (!sendEmail) return "not_requested";
  if (!isEmailDeliveryConfigured()) {
    logger.warn(
      { recipients: recipients.length },
      "[admin-console] SES not configured — admin message delivered in-app only",
    );
    return "skipped_not_configured";
  }
  void (async () => {
    for (const r of recipients) {
      try {
        await adminMessageEmail({ to: r.email, userName: r.name, subject, body, appUrl: appUrl() });
      } catch (error) {
        logger.warn(
          { userId: r.id.slice(0, 8), err: error instanceof Error ? error.message : "unknown" },
          "[admin-console] admin message email failed",
        );
      }
    }
  })();
  return "queued";
}

router.post(
  "/users/:id/message",
  checkPermission(AdminPermission.MANAGE_USER_ACCOUNTS),
  asyncRoute(async (req, res) => {
    const data = messageSchema.parse(req.body);
    const id = String(req.params.id);
    const adminUserId = req.user!.userId;

    if (id === adminUserId) {
      res.status(400).json({ error: "You cannot message yourself." });
      return;
    }

    const target = await prisma.user.findUnique({
      where: { id },
      select: { id: true, email: true, name: true, deletedAt: true },
    });
    if (!target || target.deletedAt) {
      res.status(404).json({ error: "User not found" });
      return;
    }

    const { threadId, notificationId } = await prisma.$transaction(async (tx) => {
      const thread = await tx.messageThread.create({
        data: {
          participants: { create: [{ userId: adminUserId }, { userId: target.id }] },
          messages: { create: { senderId: adminUserId, body: `${data.subject}\n\n${data.body}` } },
        },
        select: { id: true },
      });
      const notification = await tx.notification.create({
        data: {
          userId: target.id,
          type: NotificationType.ADMIN_MESSAGE,
          title: data.subject,
          body: data.body.slice(0, 1000),
          metadata: { threadId: thread.id, source: "admin_console" },
        },
        select: { id: true },
      });
      await writeAudit(tx, req, AdminAction.USER_MESSAGED, "USER", target.id, {
        targetName: target.email,
        reason: data.subject,
        extra: { threadId: thread.id, sendEmail: data.sendEmail },
      });
      return { threadId: thread.id, notificationId: notification.id };
    });

    const email = dispatchAdminEmail([target], data.subject, data.body, data.sendEmail);
    res.status(201).json({ threadId, notificationId, email });
  }, "message user"),
);

const broadcastSchema = messageSchema.extend({
  segment: z
    .object({
      role: z.enum(Role).optional(),
      status: z.enum(AccountRestrictionStatus).optional(),
      emailVerified: z.boolean().optional(),
      userIds: z.array(z.string().uuid()).max(500).optional(),
    })
    .default({}),
  dryRun: z.boolean().default(false),
});

router.post(
  "/messages/broadcast",
  checkPermission(AdminPermission.MANAGE_USER_ACCOUNTS),
  asyncRoute(async (req, res) => {
    const data = broadcastSchema.parse(req.body);
    const where = buildUserWhere(data.segment);
    // Never broadcast to banned accounts or to the sender.
    where.NOT = [{ accountRestrictionStatus: AccountRestrictionStatus.BANNED }, { id: req.user!.userId }];

    const total = await prisma.user.count({ where });
    if (data.dryRun) {
      res.json({ dryRun: true, recipients: total });
      return;
    }
    if (total === 0) {
      res.status(400).json({ error: "No users match this segment." });
      return;
    }
    if (total > BROADCAST_MAX_RECIPIENTS) {
      res.status(400).json({
        error: `Segment has ${total} recipients; narrow it to ${BROADCAST_MAX_RECIPIENTS} or fewer.`,
      });
      return;
    }

    const recipients = await prisma.user.findMany({
      where,
      select: { id: true, email: true, name: true },
      take: BROADCAST_MAX_RECIPIENTS,
    });

    const auditTargetId = req.adminRole?.id ?? req.user!.userId;
    await prisma.$transaction(async (tx) => {
      await tx.notification.createMany({
        data: recipients.map((r) => ({
          userId: r.id,
          type: NotificationType.ADMIN_MESSAGE,
          title: data.subject,
          body: data.body.slice(0, 1000),
          metadata: { source: "admin_broadcast" },
        })),
      });
      await writeAudit(tx, req, AdminAction.USERS_BROADCAST_SENT, "USER_SEGMENT", auditTargetId, {
        targetName: `${recipients.length} users`,
        reason: data.subject,
        extra: { segment: data.segment as Prisma.InputJsonValue, recipients: recipients.length, sendEmail: data.sendEmail },
      });
    });

    const email = dispatchAdminEmail(recipients, data.subject, data.body, data.sendEmail);
    res.status(201).json({ recipients: recipients.length, email });
  }, "broadcast"),
);

// ── Companies / employers ───────────────────────────────────────────────────

const companyListQuery = z.object({
  search: z.string().trim().max(120).optional(),
  verificationLevel: z.enum(EmployerVerificationLevel).optional(),
  status: z.enum(AccountRestrictionStatus).optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(25),
});

router.get(
  "/companies",
  checkPermission(AdminPermission.VIEW_USERS),
  asyncRoute(async (req, res) => {
    const q = companyListQuery.parse(req.query);
    const where: Prisma.EmployerWhereInput = {};
    const and: Prisma.EmployerWhereInput[] = [];
    if (q.search) {
      and.push({
        OR: [
          { companyName: { contains: q.search, mode: "insensitive" } },
          { user: { email: { contains: q.search, mode: "insensitive" } } },
          { website: { contains: q.search, mode: "insensitive" } },
        ],
      });
    }
    if (q.verificationLevel) {
      and.push(
        q.verificationLevel === EmployerVerificationLevel.UNVERIFIED
          ? { OR: [{ trustProfile: null }, { trustProfile: { verificationLevel: q.verificationLevel } }] }
          : { trustProfile: { verificationLevel: q.verificationLevel } },
      );
    }
    if (q.status) and.push({ user: { accountRestrictionStatus: q.status } });
    if (and.length) where.AND = and;

    const [companies, total] = await Promise.all([
      prisma.employer.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip: (q.page - 1) * q.limit,
        take: q.limit,
        select: {
          id: true,
          companyName: true,
          website: true,
          location: true,
          logoUrl: true,
          createdAt: true,
          user: {
            select: { id: true, email: true, name: true, emailVerified: true, accountRestrictionStatus: true },
          },
          trustProfile: {
            select: {
              verificationLevel: true,
              riskLevel: true,
              riskScore: true,
              postingEligibility: true,
              verifiedDomain: true,
            },
          },
          _count: { select: { jobs: true } },
        },
      }),
      prisma.employer.count({ where }),
    ]);

    res.json({ companies, pagination: paginate(q.page, q.limit, total) });
  }, "list companies"),
);

const verificationSchema = z.object({
  level: z.enum(EmployerVerificationLevel),
  reason: reasonSchema,
});

const STRONG_LEVELS: EmployerVerificationLevel[] = [
  EmployerVerificationLevel.BUSINESS_DOC_VERIFIED,
  EmployerVerificationLevel.MANUAL_REVIEW_APPROVED,
  EmployerVerificationLevel.PREMIUM_TRUSTED,
];

router.post(
  "/companies/:id/verification",
  checkPermission(AdminPermission.APPROVE_VERIFICATION),
  asyncRoute(async (req, res) => {
    const data = verificationSchema.parse(req.body);
    const id = String(req.params.id);
    const employer = await prisma.employer.findUnique({
      where: { id },
      select: {
        id: true,
        companyName: true,
        trustProfile: {
          select: { verificationLevel: true, riskScore: true, requiresEnhancedVerification: true, postingEligibility: true },
        },
      },
    });
    if (!employer) {
      res.status(404).json({ error: "Company not found" });
      return;
    }

    const level = data.level;
    const riskScore = employer.trustProfile?.riskScore ?? 0;
    const requiresEnhanced = employer.trustProfile?.requiresEnhancedVerification ?? false;
    const adminApproved =
      level === EmployerVerificationLevel.MANUAL_REVIEW_APPROVED || level === EmployerVerificationLevel.PREMIUM_TRUSTED;
    const postingEligibility =
      level === EmployerVerificationLevel.UNVERIFIED
        ? false
        : adminApproved
          ? true
          : riskScore < 55 && (requiresEnhanced ? STRONG_LEVELS.includes(level) : true);

    const now = new Date();
    const stamp = {
      verificationLevel: level,
      postingEligibility,
      ...(adminApproved ? { manualApprovedAt: now } : {}),
      ...(level === EmployerVerificationLevel.PREMIUM_TRUSTED ? { premiumTrustedAt: now } : {}),
    };

    const trustProfile = await prisma.$transaction(async (tx) => {
      const profile = await tx.employerTrustProfile.upsert({
        where: { employerId: employer.id },
        create: { employerId: employer.id, ...stamp },
        update: stamp,
        select: { verificationLevel: true, postingEligibility: true, manualApprovedAt: true, riskLevel: true },
      });
      await writeAudit(tx, req, AdminAction.EMPLOYER_VERIFICATION_UPDATED, "EMPLOYER", employer.id, {
        targetName: employer.companyName,
        reason: data.reason,
        changes: {
          verificationLevel: { from: employer.trustProfile?.verificationLevel ?? null, to: level },
          postingEligibility: { from: employer.trustProfile?.postingEligibility ?? null, to: postingEligibility },
        },
      });
      return profile;
    });

    res.json({ employerId: employer.id, trustProfile });
  }, "company verification"),
);

// ── Jobs ────────────────────────────────────────────────────────────────────

const jobListQuery = z.object({
  search: z.string().trim().max(120).optional(),
  status: z.enum(JobStatus).optional(),
  source: z.enum(JobSource).optional(),
  featured: booleanQuery,
  employerId: z.string().uuid().optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(25),
});

const JOB_SELECT = {
  id: true,
  title: true,
  slug: true,
  location: true,
  type: true,
  status: true,
  jobSource: true,
  sourceName: true,
  sourceUrl: true,
  isFeatured: true,
  featuredAt: true,
  closedAt: true,
  moderationReason: true,
  publishedAt: true,
  isExpired: true,
  riskLevel: true,
  riskScore: true,
  createdAt: true,
  updatedAt: true,
  employer: { select: { id: true, companyName: true, userId: true } },
  _count: { select: { applications: true } },
} satisfies Prisma.JobSelect;

router.get(
  "/jobs",
  checkPermission(AdminPermission.REVIEW_JOBS),
  asyncRoute(async (req, res) => {
    const q = jobListQuery.parse(req.query);
    const where: Prisma.JobWhereInput = {};
    if (q.status) where.status = q.status;
    if (q.source) where.jobSource = q.source;
    if (q.featured !== undefined) where.isFeatured = q.featured;
    if (q.employerId) where.employerId = q.employerId;
    if (q.search) {
      where.OR = [
        { title: { contains: q.search, mode: "insensitive" } },
        { sourceName: { contains: q.search, mode: "insensitive" } },
        { location: { contains: q.search, mode: "insensitive" } },
        { employer: { companyName: { contains: q.search, mode: "insensitive" } } },
      ];
    }

    const [jobs, total] = await Promise.all([
      prisma.job.findMany({
        where,
        select: JOB_SELECT,
        orderBy: [{ createdAt: "desc" }],
        skip: (q.page - 1) * q.limit,
        take: q.limit,
      }),
      prisma.job.count({ where }),
    ]);

    res.json({ jobs, pagination: paginate(q.page, q.limit, total) });
  }, "list jobs"),
);

const jobActionSchema = z.object({
  action: z.enum(["approve", "reject", "close", "reopen", "feature", "unfeature", "remove"]),
  reason: reasonSchema,
});

const JOB_ACTION_AUDIT: Record<z.infer<typeof jobActionSchema>["action"], AdminAction> = {
  approve: AdminAction.JOB_APPROVED,
  reject: AdminAction.JOB_REJECTED,
  close: AdminAction.JOB_CLOSED,
  reopen: AdminAction.JOB_REOPENED,
  feature: AdminAction.JOB_FEATURED,
  unfeature: AdminAction.JOB_UNFEATURED,
  remove: AdminAction.JOB_REMOVED,
};

router.post(
  "/jobs/:id/action",
  checkPermission(AdminPermission.REVIEW_JOBS),
  asyncRoute(async (req, res) => {
    const data = jobActionSchema.parse(req.body);
    const id = String(req.params.id);
    const job = await prisma.job.findUnique({
      where: { id },
      select: { id: true, title: true, status: true, isFeatured: true, publishedAt: true },
    });
    if (!job) {
      res.status(404).json({ error: "Job not found" });
      return;
    }

    const now = new Date();
    const reason = data.reason;
    let update: Prisma.JobUpdateInput;

    switch (data.action) {
      case "approve":
        update = { status: JobStatus.PUBLISHED, publishedAt: job.publishedAt ?? now, moderationReason: null, closedAt: null };
        break;
      case "reject":
        update = { status: JobStatus.REJECTED, isFeatured: false, moderationReason: reason };
        break;
      case "close":
        if (job.status !== JobStatus.PUBLISHED) {
          res.status(409).json({ error: "Only published jobs can be closed." });
          return;
        }
        update = { status: JobStatus.CLOSED, closedAt: now, isFeatured: false, moderationReason: reason };
        break;
      case "reopen":
        if (job.status === JobStatus.PUBLISHED) {
          res.status(409).json({ error: "Job is already live." });
          return;
        }
        update = {
          status: JobStatus.PUBLISHED,
          publishedAt: job.publishedAt ?? now,
          closedAt: null,
          isExpired: false,
          staleCheckFailures: 0,
          moderationReason: null,
        };
        break;
      case "feature":
        if (job.status !== JobStatus.PUBLISHED) {
          res.status(409).json({ error: "Only published jobs can be featured." });
          return;
        }
        update = { isFeatured: true, featuredAt: now };
        break;
      case "unfeature":
        update = { isFeatured: false, featuredAt: null };
        break;
      case "remove":
        update = { status: JobStatus.REMOVED, isFeatured: false, featuredAt: null, moderationReason: reason };
        break;
    }

    const updated = await prisma.$transaction(async (tx) => {
      const result = await tx.job.update({ where: { id: job.id }, data: update, select: JOB_SELECT });
      if (data.action === "approve" || data.action === "reject") {
        await tx.adminReview.create({
          data: {
            reviewerId: req.user!.userId,
            targetType: ReviewTargetType.JOB,
            targetJobId: job.id,
            status: data.action === "approve" ? ReviewStatus.APPROVED : ReviewStatus.REJECTED,
            notes: reason,
          },
        });
      }
      await writeAudit(tx, req, JOB_ACTION_AUDIT[data.action], "JOB", job.id, {
        targetName: job.title,
        reason,
        changes: {
          status: { from: job.status, to: result.status },
          isFeatured: { from: job.isFeatured, to: result.isFeatured },
        },
      });
      return result;
    });

    res.json({ job: updated, action: data.action });
  }, "job action"),
);

// ── Audit trail for any target ─────────────────────────────────────────────

router.get(
  "/audit/:targetId",
  checkPermission(AdminPermission.VIEW_AUDIT_LOGS),
  asyncRoute(async (req, res) => {
    const entries = await prisma.auditLog.findMany({
      where: { targetId: String(req.params.targetId) },
      orderBy: { createdAt: "desc" },
      take: 100,
      select: {
        id: true,
        action: true,
        targetType: true,
        targetName: true,
        reason: true,
        changes: true,
        metadata: true,
        status: true,
        createdAt: true,
        admin: { select: { title: true, admin: { select: { id: true, name: true, email: true } } } },
      },
    });
    res.json({ entries });
  }, "audit trail"),
);

export default router;
