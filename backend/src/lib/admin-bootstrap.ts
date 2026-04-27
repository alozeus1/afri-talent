import bcrypt from "bcrypt";
import { AccountRestrictionStatus, AdminAction, AdminPermission, Prisma, Role } from "@prisma/client";
import prisma from "./prisma.js";
import logger from "./logger.js";

const FULL_ADMIN_PERMISSIONS = Object.values(AdminPermission);
const BOOTSTRAP_ADMIN_ROLE_TITLE = "Bootstrap Administrator";
const BOOTSTRAP_ADMIN_ROLE_DESCRIPTION =
  "System-managed bootstrap administrator with full control-plane permissions.";

function getConfiguredAdminEmail(): string | null {
  const value = process.env.ADMIN_BOOTSTRAP_EMAIL?.trim().toLowerCase();
  return value ? value : null;
}

function getConfiguredAdminPassword(): string | null {
  const value = process.env.ADMIN_BOOTSTRAP_PASSWORD?.trim();
  return value ? value : null;
}

function getAdminDisplayName(email: string): string {
  const localPart = email.split("@")[0] || "Admin";
  return localPart;
}

function normalizePermissions(permissions: AdminPermission[]): AdminPermission[] {
  return [...permissions].sort();
}

function hasFullAdminPermissions(permissions: AdminPermission[]): boolean {
  const current = normalizePermissions(permissions);
  const expected = normalizePermissions(FULL_ADMIN_PERMISSIONS);

  return (
    current.length === expected.length &&
    current.every((permission, index) => permission === expected[index])
  );
}

function toAuditJson<T>(value: T): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

function buildBootstrapAuditLog(args: {
  adminRoleId: string;
  targetId: string;
  targetName: string;
  changes: Prisma.InputJsonObject;
}): Prisma.AuditLogUncheckedCreateInput {
  return {
    adminId: args.adminRoleId,
    action: AdminAction.SYSTEM_CONFIGURATION_CHANGED,
    targetType: "ADMIN_ROLE",
    targetId: args.targetId,
    targetName: args.targetName,
    resourceType: "BOOTSTRAP_ADMIN",
    resourceId: args.adminRoleId,
    changes: args.changes,
    reason: "Bootstrap admin control-plane sync",
    metadata: {
      bootstrap: true,
      source: "ADMIN_BOOTSTRAP_EMAIL",
    },
    status: "SUCCESS",
  } as const;
}

export async function ensureBootstrapAdmin(): Promise<void> {
  const email = getConfiguredAdminEmail();
  const password = getConfiguredAdminPassword();

  if (!email || !password) {
    logger.info("Bootstrap admin skipped: credentials not configured");
    return;
  }

  if (!email.includes("@")) {
    logger.warn({ email }, "Bootstrap admin skipped: invalid email");
    return;
  }

  if (password.length < 8) {
    logger.warn("Bootstrap admin skipped: password too short");
    return;
  }

  const existingUser = await prisma.user.findUnique({
    where: { email },
    include: { adminRole: true },
  });

  let nextPasswordHash: string | undefined;
  let passwordMatches = false;

  if (existingUser?.password) {
    passwordMatches = await bcrypt.compare(password, existingUser.password);
  }

  if (!existingUser || !passwordMatches) {
    nextPasswordHash = await bcrypt.hash(password, 10);
  }

  const emailVerifiedAt = existingUser?.emailVerifiedAt ?? new Date();
  const desiredName = existingUser?.name?.trim() || getAdminDisplayName(email);

  if (!existingUser) {
    await prisma.$transaction(async (tx) => {
      const createdUser = await tx.user.create({
        data: {
          email,
          password: nextPasswordHash!,
          role: Role.ADMIN,
          name: desiredName,
          emailVerified: true,
          emailVerifiedAt,
          accountRestrictionStatus: AccountRestrictionStatus.ACTIVE,
        },
      });

      const adminRole = await tx.adminRole.create({
        data: {
          adminId: createdUser.id,
          title: BOOTSTRAP_ADMIN_ROLE_TITLE,
          description: BOOTSTRAP_ADMIN_ROLE_DESCRIPTION,
          permissions: FULL_ADMIN_PERMISSIONS,
          isActive: true,
        },
      });

      await tx.auditLog.create({
        data: buildBootstrapAuditLog({
          adminRoleId: adminRole.id,
          targetId: createdUser.id,
          targetName: createdUser.email,
          changes: {
            userCreated: true,
            role: Role.ADMIN,
            adminRoleCreated: true,
            permissions: FULL_ADMIN_PERMISSIONS,
          },
        }),
      });
    });
    logger.info({ email }, "Bootstrap admin created");
    return;
  }

  const updates: {
    password?: string;
    role?: Role;
    name?: string;
    emailVerified?: boolean;
    emailVerifiedAt?: Date;
    accountRestrictionStatus?: AccountRestrictionStatus;
    accountRestrictionReason?: null;
    accountRestrictedAt?: null;
  } = {};

  if (nextPasswordHash) {
    updates.password = nextPasswordHash;
  }
  if (existingUser.role !== Role.ADMIN) {
    updates.role = Role.ADMIN;
  }
  if (existingUser.name !== desiredName) {
    updates.name = desiredName;
  }
  if (!existingUser.emailVerified) {
    updates.emailVerified = true;
  }
  if (!existingUser.emailVerifiedAt) {
    updates.emailVerifiedAt = emailVerifiedAt;
  }
  if (existingUser.accountRestrictionStatus !== AccountRestrictionStatus.ACTIVE) {
    updates.accountRestrictionStatus = AccountRestrictionStatus.ACTIVE;
    updates.accountRestrictionReason = null;
    updates.accountRestrictedAt = null;
  }

  const adminRoleChanges: {
    title?: string;
    description?: string;
    permissions?: AdminPermission[];
    isActive?: boolean;
  } = {};
  const existingAdminRole = existingUser.adminRole;

  if (existingAdminRole) {
    if (!existingAdminRole.title.trim()) {
      adminRoleChanges.title = BOOTSTRAP_ADMIN_ROLE_TITLE;
    }
    if (!existingAdminRole.description?.trim()) {
      adminRoleChanges.description = BOOTSTRAP_ADMIN_ROLE_DESCRIPTION;
    }
    if (!hasFullAdminPermissions(existingAdminRole.permissions)) {
      adminRoleChanges.permissions = FULL_ADMIN_PERMISSIONS;
    }
    if (!existingAdminRole.isActive) {
      adminRoleChanges.isActive = true;
    }
  }

  const needsAdminRoleCreate = !existingAdminRole;
  const needsAdminRoleUpdate = Object.keys(adminRoleChanges).length > 0;

  if (Object.keys(updates).length === 0 && !needsAdminRoleCreate && !needsAdminRoleUpdate) {
    logger.info({ email }, "Bootstrap admin already up to date");
    return;
  }

  await prisma.$transaction(async (tx) => {
    const auditChanges: Record<string, Prisma.InputJsonValue> = {};

    const user =
      Object.keys(updates).length > 0
        ? await tx.user.update({
            where: { id: existingUser.id },
            data: updates,
          })
        : existingUser;

    const adminRole = needsAdminRoleCreate
      ? await tx.adminRole.create({
          data: {
            adminId: existingUser.id,
            title: BOOTSTRAP_ADMIN_ROLE_TITLE,
            description: BOOTSTRAP_ADMIN_ROLE_DESCRIPTION,
            permissions: FULL_ADMIN_PERMISSIONS,
            isActive: true,
          },
        })
      : needsAdminRoleUpdate
        ? await tx.adminRole.update({
            where: { adminId: existingUser.id },
            data: adminRoleChanges,
          })
        : existingAdminRole!;

    if (Object.keys(updates).length > 0) {
      auditChanges.user = toAuditJson(updates);
    }

    auditChanges.adminRole = needsAdminRoleCreate
      ? toAuditJson({
          created: true,
          title: BOOTSTRAP_ADMIN_ROLE_TITLE,
          description: BOOTSTRAP_ADMIN_ROLE_DESCRIPTION,
          permissions: FULL_ADMIN_PERMISSIONS,
          isActive: true,
        })
      : toAuditJson(adminRoleChanges);

    await tx.auditLog.create({
      data: buildBootstrapAuditLog({
        adminRoleId: adminRole.id,
        targetId: existingUser.id,
        targetName: user.email,
        changes: auditChanges as Prisma.InputJsonObject,
      }),
    });
  });
  logger.info({ email }, "Bootstrap admin updated");
}
