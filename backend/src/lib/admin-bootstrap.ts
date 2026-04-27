import bcrypt from "bcrypt";
import { Role } from "@prisma/client";
import prisma from "./prisma.js";
import logger from "./logger.js";

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
    await prisma.user.create({
      data: {
        email,
        password: nextPasswordHash!,
        role: Role.ADMIN,
        name: desiredName,
        emailVerified: true,
        emailVerifiedAt,
      },
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

  if (Object.keys(updates).length === 0) {
    logger.info({ email }, "Bootstrap admin already up to date");
    return;
  }

  await prisma.user.update({
    where: { id: existingUser.id },
    data: updates,
  });
  logger.info({ email }, "Bootstrap admin updated");
}
