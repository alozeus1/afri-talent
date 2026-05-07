import { beforeEach, describe, expect, it, vi } from "vitest";
import { AccountRestrictionStatus, AdminAction, AdminPermission, Role } from "@prisma/client";

const mocks = vi.hoisted(() => ({
  findUnique: vi.fn(),
  userCreate: vi.fn(),
  userUpdate: vi.fn(),
  adminRoleCreate: vi.fn(),
  adminRoleUpdate: vi.fn(),
  auditLogCreate: vi.fn(),
  transaction: vi.fn(),
  compare: vi.fn(),
  hash: vi.fn(),
  info: vi.fn(),
  warn: vi.fn(),
}));

vi.mock("./prisma.js", () => ({
  default: {
    user: {
      findUnique: mocks.findUnique,
      create: mocks.userCreate,
      update: mocks.userUpdate,
    },
    adminRole: {
      create: mocks.adminRoleCreate,
      update: mocks.adminRoleUpdate,
    },
    auditLog: {
      create: mocks.auditLogCreate,
    },
    $transaction: mocks.transaction,
  },
}));

vi.mock("bcrypt", () => ({
  default: {
    compare: mocks.compare,
    hash: mocks.hash,
  },
}));

vi.mock("./logger.js", () => ({
  default: {
    info: mocks.info,
    warn: mocks.warn,
  },
}));

describe("ensureBootstrapAdmin", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    delete process.env.ADMIN_BOOTSTRAP_EMAIL;
    delete process.env.ADMIN_BOOTSTRAP_PASSWORD;

    mocks.transaction.mockImplementation(async (callback) =>
      callback({
        user: {
          create: mocks.userCreate,
          update: mocks.userUpdate,
        },
        adminRole: {
          create: mocks.adminRoleCreate,
          update: mocks.adminRoleUpdate,
        },
        auditLog: {
          create: mocks.auditLogCreate,
        },
      })
    );
  });

  it("creates the bootstrap admin when missing", async () => {
    process.env.ADMIN_BOOTSTRAP_EMAIL = "alozeus1@gmail.com";
    process.env.ADMIN_BOOTSTRAP_PASSWORD = "goldgate617@";
    mocks.findUnique.mockResolvedValue(null);
    mocks.hash.mockResolvedValue("hashed-password");
    mocks.userCreate.mockResolvedValue({
      id: "user-1",
      email: "alozeus1@gmail.com",
    });
    mocks.adminRoleCreate.mockResolvedValue({
      id: "admin-role-1",
    });

    const { ensureBootstrapAdmin } = await import("./admin-bootstrap.js");
    await ensureBootstrapAdmin();

    expect(mocks.userCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        email: "alozeus1@gmail.com",
        password: "hashed-password",
        role: Role.ADMIN,
        emailVerified: true,
        accountRestrictionStatus: AccountRestrictionStatus.ACTIVE,
      }),
    });
    expect(mocks.adminRoleCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        adminId: "user-1",
        isActive: true,
        permissions: Object.values(AdminPermission),
      }),
    });
    expect(mocks.auditLogCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        adminId: "admin-role-1",
        action: AdminAction.SYSTEM_CONFIGURATION_CHANGED,
        targetType: "ADMIN_ROLE",
      }),
    });
    expect(mocks.userUpdate).not.toHaveBeenCalled();
  });

  it("updates an existing user to admin, reactivates the control-plane role, and resets the password when needed", async () => {
    process.env.ADMIN_BOOTSTRAP_EMAIL = "alozeus1@gmail.com";
    process.env.ADMIN_BOOTSTRAP_PASSWORD = "goldgate617@";
    mocks.findUnique.mockResolvedValue({
      id: "user-1",
      email: "alozeus1@gmail.com",
      password: "old-hash",
      role: Role.CANDIDATE,
      name: "",
      emailVerified: false,
      emailVerifiedAt: null,
      accountRestrictionStatus: AccountRestrictionStatus.SUSPENDED,
      accountRestrictionReason: "manual_review",
      accountRestrictedAt: new Date("2026-04-01T00:00:00.000Z"),
      adminRole: {
        id: "admin-role-1",
        adminId: "user-1",
        title: "Legacy Admin",
        description: null,
        permissions: [AdminPermission.VIEW_USERS],
        isActive: false,
      },
    });
    mocks.compare.mockResolvedValue(false);
    mocks.hash.mockResolvedValue("new-hash");
    mocks.userUpdate.mockResolvedValue({
      id: "user-1",
      email: "alozeus1@gmail.com",
    });
    mocks.adminRoleUpdate.mockResolvedValue({
      id: "admin-role-1",
    });

    const { ensureBootstrapAdmin } = await import("./admin-bootstrap.js");
    await ensureBootstrapAdmin();

    expect(mocks.userUpdate).toHaveBeenCalledWith({
      where: { id: "user-1" },
      data: expect.objectContaining({
        password: "new-hash",
        role: Role.ADMIN,
        name: "alozeus1",
        emailVerified: true,
        accountRestrictionStatus: AccountRestrictionStatus.ACTIVE,
        accountRestrictionReason: null,
        accountRestrictedAt: null,
      }),
    });
    expect(mocks.adminRoleUpdate).toHaveBeenCalledWith({
      where: { adminId: "user-1" },
      data: expect.objectContaining({
        description: expect.any(String),
        permissions: Object.values(AdminPermission),
        isActive: true,
      }),
    });
    expect(mocks.auditLogCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        adminId: "admin-role-1",
        action: AdminAction.SYSTEM_CONFIGURATION_CHANGED,
      }),
    });
  });

  it("does nothing when the bootstrap admin is already fully synchronized", async () => {
    process.env.ADMIN_BOOTSTRAP_EMAIL = "alozeus1@gmail.com";
    process.env.ADMIN_BOOTSTRAP_PASSWORD = "goldgate617@";
    mocks.findUnique.mockResolvedValue({
      id: "user-1",
      email: "alozeus1@gmail.com",
      password: "current-hash",
      role: Role.ADMIN,
      name: "Bootstrap Admin",
      emailVerified: true,
      emailVerifiedAt: new Date("2026-04-01T00:00:00.000Z"),
      accountRestrictionStatus: AccountRestrictionStatus.ACTIVE,
      accountRestrictionReason: null,
      accountRestrictedAt: null,
      adminRole: {
        id: "admin-role-1",
        adminId: "user-1",
        title: "Bootstrap Administrator",
        description: "System-managed bootstrap administrator with full control-plane permissions.",
        permissions: Object.values(AdminPermission),
        isActive: true,
      },
    });
    mocks.compare.mockResolvedValue(true);

    const { ensureBootstrapAdmin } = await import("./admin-bootstrap.js");
    await ensureBootstrapAdmin();

    expect(mocks.userUpdate).not.toHaveBeenCalled();
    expect(mocks.adminRoleCreate).not.toHaveBeenCalled();
    expect(mocks.adminRoleUpdate).not.toHaveBeenCalled();
    expect(mocks.auditLogCreate).not.toHaveBeenCalled();
  });
});
